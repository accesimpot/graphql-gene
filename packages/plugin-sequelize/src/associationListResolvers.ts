import {
  GraphQLError,
  GraphQLObjectType,
  defaultFieldResolver,
  getNamedType,
  type GraphQLResolveInfo,
  type GraphQLSchema,
} from 'graphql'
import type { Association, Model, ModelStatic } from 'sequelize'
import { isObject, type AnyObject, LIMIT_ARG_DEFAULT, SKIP_ARG_DEFAULT } from 'graphql-gene'
import { getFieldIncludeOptions, getQueryInclude } from './utils/public'
import { resolvePolymorphicHubLoadedRows } from './utils/polymorphic'
import { getGeneAssociationListWrapperMeta } from './utils/associationListRegistry'
import {
  hasAssociationJoinColumns,
  isModel,
  isPlainRecord,
  isSafeArray,
  isSequelizeModelStatic,
  type AssociationJoinColumns,
  type ModelInstanceWithClass,
} from './utils/guards'
import { isMarkedAsAssociation } from './utils/associationMap'

export type GeneAssociationListWeakPayload = {
  parent: ModelInstanceWithClass
  associationField: string
  facetArgs: Record<string, unknown>
}

export const geneAssociationListPayloadByWrapperRoot = new WeakMap<
  Record<string, unknown>,
  GeneAssociationListWeakPayload
>()

/**
 * When true, a bare Sequelize preload of the association cannot satisfy the request; we must
 * query with `getFieldIncludeOptions` (pagination, filters, order).
 *
 * GraphQL may supply default `limit`/`skip` values; we only reload when pagination differs from
 * those defaults or when `where` / `order` are set, so preloaded rows (built with the same
 * includes and hooks as the parent query) stay valid when the client did not narrow the facet.
 */
function isAssociationFacetRequiringFreshQuery(facetArgs: Record<string, unknown>): boolean {
  if (isObject(facetArgs.where) && facetArgs.where !== null) return true
  if (Array.isArray(facetArgs.order)) return true

  const limit = typeof facetArgs.limit === 'number' ? facetArgs.limit : LIMIT_ARG_DEFAULT
  const skip = typeof facetArgs.skip === 'number' ? facetArgs.skip : SKIP_ARG_DEFAULT

  return limit !== LIMIT_ARG_DEFAULT || skip !== SKIP_ARG_DEFAULT
}

function assertAssociationJoinColumns(assoc: Association): AssociationJoinColumns {
  if (!hasAssociationJoinColumns(assoc)) {
    throw new GraphQLError(
      'Association is missing string foreignKey/sourceKey needed for association list filters.'
    )
  }
  return assoc
}

function expectModelInstance(parent: unknown): ModelInstanceWithClass {
  if (!isModel(parent)) {
    throw new GraphQLError('Parent is not a Sequelize model.')
  }
  return parent
}

function getAssociationOrThrow(
  parent: ModelInstanceWithClass,
  associationField: string
): Association {
  const ctor = parent.constructor
  const assoc = ctor.associations[associationField]
  if (!assoc) {
    throw new GraphQLError(
      `Sequelize association "${associationField}" not found on "${ctor.name}".`
    )
  }
  return assoc
}

function assertAssociation(parent: unknown, associationField: string): Association {
  return getAssociationOrThrow(expectModelInstance(parent), associationField)
}

function foreignKeyWhere(parent: unknown, associationField: string): Record<string, unknown> {
  const modelParent = expectModelInstance(parent)
  const assoc = assertAssociationJoinColumns(getAssociationOrThrow(modelParent, associationField))
  const pkVal = Reflect.get(modelParent, assoc.sourceKey)

  return { [assoc.foreignKey]: pkVal }
}

function targetModelFromAssociation(parent: unknown, associationField: string): ModelStatic<Model> {
  const assoc = assertAssociation(parent, associationField)
  const target = Reflect.get(assoc, 'target')

  if (!isSequelizeModelStatic(target)) {
    throw new GraphQLError('Association target is not a Sequelize model class.')
  }
  return target
}

async function ensureAssociationItemsFacetLoaded(
  wrapperRoot: unknown,
  _args: Record<string, unknown>,
  info: GraphQLResolveInfo
) {
  if (!isPlainRecord(wrapperRoot)) {
    throw new GraphQLError('Internal error resolving association list items.')
  }
  if (isSafeArray(wrapperRoot.items)) return

  const payload = geneAssociationListPayloadByWrapperRoot.get(wrapperRoot)
  if (!payload) {
    throw new GraphQLError('Internal error resolving association list items.')
  }

  const facetArgs = payload.facetArgs ?? {}
  const { parent, associationField } = payload
  const TargetModel = targetModelFromAssociation(parent, associationField)
  const fkWhere = foreignKeyWhere(parent, associationField)

  const columnOpts = getFieldIncludeOptions({
    args: facetArgs,
    isList: true,
    omitAssociation: true,
  })

  const nestedInclude = getQueryInclude(info)

  const rows = await TargetModel.findAll({
    where: { ...fkWhere, ...columnOpts.where },
    order: columnOpts.order,
    offset: columnOpts.offset,
    limit: columnOpts.limit,
    ...(nestedInclude || {}),
  })

  wrapperRoot.items = resolvePolymorphicHubLoadedRows(rows)
}

export function attachAssociationListWrapperResolvers(schema: GraphQLSchema, types: AnyObject) {
  const configuredWrapperTypes = new Set<string>()

  for (const schemaType of Object.values(schema.getTypeMap())) {
    if (!(schemaType instanceof GraphQLObjectType)) continue
    if (schemaType.name.startsWith('__')) continue

    const parentGraphqlTypeName = schemaType.name

    for (const field of Object.values(schemaType.getFields())) {
      const fieldName = field.name

      if (!isMarkedAsAssociation(parentGraphqlTypeName, fieldName)) continue

      const returnNamed = getNamedType(field.type)
      if (!(returnNamed instanceof GraphQLObjectType)) continue

      const wrapperMeta = getGeneAssociationListWrapperMeta(returnNamed.name)
      if (!wrapperMeta) continue

      if (!types[wrapperMeta.targetGraphqlType]) continue

      field.resolve = (
        parent: unknown,
        facetArgs: Record<string, unknown>,
        _ctx: unknown,
        _info: GraphQLResolveInfo
      ) => {
        if (!isModel(parent)) {
          throw new GraphQLError(
            'Association list field parent must be a Sequelize model instance.'
          )
        }
        const wrapperRoot: Record<string, unknown> = {}
        const preload = Reflect.get(parent, fieldName)

        if (isSafeArray(preload) && !isAssociationFacetRequiringFreshQuery(facetArgs)) {
          // Staged copy: type-level directives filter `source[field]` (`items`) in-place before the
          // facet resolver runs; Sequelize's preload array must stay untouched.
          wrapperRoot.items = resolvePolymorphicHubLoadedRows(preload.slice())
        }
        geneAssociationListPayloadByWrapperRoot.set(wrapperRoot, {
          parent,
          associationField: fieldName,
          facetArgs,
        })
        return wrapperRoot
      }

      if (configuredWrapperTypes.has(returnNamed.name)) continue
      configuredWrapperTypes.add(returnNamed.name)

      const wrapperFields = returnNamed.getFields()

      const previousItemsResolve = wrapperFields.items.resolve ?? defaultFieldResolver

      wrapperFields.items.resolve = async (
        wrapperRoot: unknown,
        args: Record<string, unknown>,
        context: unknown,
        info: GraphQLResolveInfo
      ) => {
        await ensureAssociationItemsFacetLoaded(wrapperRoot, args, info)

        return previousItemsResolve(wrapperRoot, args, context, info)
      }

      wrapperFields.count.resolve = async (
        wrapperRoot: unknown,
        _args: Record<string, unknown>,
        _ctx: unknown,
        _info: GraphQLResolveInfo
      ) => {
        if (!isPlainRecord(wrapperRoot)) {
          throw new GraphQLError('Internal error resolving association list count.')
        }

        const payload = geneAssociationListPayloadByWrapperRoot.get(wrapperRoot)
        if (!payload) {
          throw new GraphQLError('Internal error resolving association list count.')
        }

        const facetArgs = payload.facetArgs ?? {}

        const TargetModel = targetModelFromAssociation(payload.parent, payload.associationField)
        const fkWhere = foreignKeyWhere(payload.parent, payload.associationField)
        const filterOpts = getFieldIncludeOptions({
          args: facetArgs,
          isList: false,
          omitAssociation: true,
        })

        return TargetModel.count({
          where: { ...fkWhere, ...filterOpts.where },
          distinct: true,
        })
      }
    }
  }
}
