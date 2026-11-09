import {
  GraphQLError,
  Kind,
  getNamedType,
  type GraphQLResolveInfo,
  type SelectionSetNode,
} from 'graphql'
import {
  getDirectiveConfigsOfField,
  getGloballyExtendedTypes,
  isObject,
  isRegisteredPolymorphicAbstractType,
  normalizeFieldConfig,
  LIMIT_ARG_DEFAULT,
  QUERY_ORDER_VALUES,
  SKIP_ARG_DEFAULT,
  type FindOptionsHandler,
  type ValidGraphqlType,
} from 'graphql-gene'
import {
  lookDeeperAndThrow,
  type UntilHandlerDetails,
  type NextHandlerDetails,
  type NextFragmentHandlerDetails,
} from 'graphql-lookahead'
import type { OrderItem } from 'sequelize'
import type { Model } from 'sequelize-typescript'
import type { DefaultResolverIncludeOptions, GeneSequelizeWhereOptions } from '../types'
import { populateWhereOptions, type PopulateWhereOptionsContext } from './internal'
import {
  GENE_ASSOCIATION_LIST_ITEMS_FIELD,
  getGeneAssociationListWrapperMeta,
} from './associationListRegistry'
import {
  isAssociationListWrapperOutputType,
  scanAssociationWrapperFacets,
} from './associationListWrapperShape'
import { isMarkedAsAssociation } from './associationMap'
import { markGeneHydrationInclude } from './includePostProcess'
import { getAttributeByModelName } from './polymorphic'
import { isModelStatic, isSafeArray } from './guards'
import { addSelectedInclude, flushPendingRootIncludes } from './ensureInclude'
import {
  IncludeCollector,
  createChildFrame,
  createScratchFrame,
  bindOccurrenceFrame,
  getBoundOccurrenceFrame,
  getOccurrenceFrame,
  rememberOccurrenceFrame,
  setFindOptionsHookContext,
  type CollectorFrame,
} from './includeCollector'

export * from './polymorphic'
export { markFieldAsAssociation, isMarkedAsAssociation } from './associationMap'

const QUERY_TYPE = 'Query'
const MUTATION_TYPE = 'Mutation'

/**
 * True for sequelize-typescript model classes, whether or not they are registered
 * with a Sequelize instance yet. Registration is validated in `populateTypeDefs`.
 */
export function isSequelizeFieldConfig<T>(
  fieldConfigs: T
): fieldConfigs is T extends typeof Model ? T & Model : T {
  return isModelStatic(fieldConfigs)
}

function getTypeConfig(type: string) {
  const extendedTypes = getGloballyExtendedTypes()
  if (!(type in extendedTypes.geneConfig)) return

  return extendedTypes.geneConfig[type as keyof typeof extendedTypes.geneConfig]
}

function getFieldConfig(sourceType: string, field: string) {
  const extendedTypes = getGloballyExtendedTypes()
  if (!(sourceType in extendedTypes.config)) return

  const fieldConfigs = extendedTypes.config[sourceType as keyof typeof extendedTypes.config]
  if (!fieldConfigs) return

  if (field in fieldConfigs) return normalizeFieldConfig(fieldConfigs[field])
}

type IncludeHook = FindOptionsHandler<DefaultResolverIncludeOptions>

const isIncludeHook = (hook: IncludeHook | undefined): hook is IncludeHook => !!hook

function isItemsFacet(sourceType: string, field: string) {
  return (
    !!getGeneAssociationListWrapperMeta(sourceType) && field === GENE_ASSOCIATION_LIST_ITEMS_FIELD
  )
}

function collectFindOptionsHooks(details: UntilHandlerDetails<CollectorFrame>) {
  const { sourceType, type, field } = details
  const { typeDirectives, fieldDirectives } = getDirectiveConfigsOfField({
    type,
    parentType: sourceType,
    field,
  })
  return {
    typeHooks: [
      getTypeConfig(type)?.findOptions,
      ...typeDirectives.map(directive => directive.findOptions),
    ].filter(isIncludeHook),
    fieldHooks: [
      getFieldConfig(sourceType, field)?.findOptions,
      ...fieldDirectives.map(directive => directive.findOptions),
    ].filter(isIncludeHook),
  }
}

/** Frame holding the include of the rows the returned type's hooks edit. */
function getTypeHookFrame(
  details: UntilHandlerDetails<CollectorFrame>,
  parent: CollectorFrame,
  occurrence: CollectorFrame | undefined
): CollectorFrame {
  if (isItemsFacet(details.sourceType, details.field)) return parent

  return (
    occurrence ?? createChildFrame(parent, { type: details.type, include: {}, isScratch: true })
  )
}

function runFindOptionsHook(
  hook: IncludeHook,
  details: UntilHandlerDetails<CollectorFrame>,
  frame: CollectorFrame,
  ancestryStart: CollectorFrame
) {
  setFindOptionsHookContext(details, {
    frame,
    ancestryStart,
    label: `${details.sourceType}.${details.field}`,
    schema: details.info.schema,
  })
  hook(Object.assign(details, { state: frame.include, findOptions: frame.include }))
}

function handleUntilFindOptions(details: UntilHandlerDetails<CollectorFrame>) {
  const { typeHooks, fieldHooks } = collectFindOptionsHooks(details)
  if (!typeHooks.length && !fieldHooks.length) return false

  return {
    afterAllSelections() {
      // Hooks receive the plain include as `state`, so the frame is put back afterwards.
      const parent = details.state
      const occurrence = getOccurrenceFrame(details)
      const ancestryStart = occurrence ?? parent

      if (typeHooks.length) {
        const typeFrame = getTypeHookFrame(details, parent, occurrence)
        typeHooks.forEach(hook => runFindOptionsHook(hook, details, typeFrame, ancestryStart))
      }
      fieldHooks.forEach(hook => runFindOptionsHook(hook, details, parent, ancestryStart))
      details.state = parent
    },
  }
}

function resolveNextFrame(details: NextHandlerDetails<CollectorFrame>): CollectorFrame {
  const {
    state: parent,
    sourceType,
    field,
    type,
    args,
    isList,
    nextSelectionSet,
    info,
    fieldDef,
  } = details

  const boundOccurrence = getBoundOccurrenceFrame(details)
  if (boundOccurrence) return boundOccurrence

  if (isItemsFacet(sourceType, field)) {
    return createChildFrame(parent, { type, include: parent.include })
  }
  // Nothing collected below a scratch frame is returned, so skip building includes for it.
  if (parent.isScratch || !isMarkedAsAssociation(sourceType, field)) {
    return createChildFrame(parent, { type, include: {}, isScratch: true })
  }

  if (isAssociationListWrapperOutputType(fieldDef.type)) {
    const namedReturn = getNamedType(fieldDef.type)
    const { hasItems } = scanAssociationWrapperFacets(info, namedReturn.name, nextSelectionSet)
    if (!hasItems) return createChildFrame(parent, { type, include: {}, isScratch: true })

    parent.include.include = parent.include.include || []
    let hydrationInclude = parent.include.include.find(opt => opt.association === field)
    if (!hydrationInclude) {
      hydrationInclude = markGeneHydrationInclude({ association: field })
      parent.include.include.push(hydrationInclude)
    }
    return createChildFrame(parent, { type, include: hydrationInclude, association: field })
  }

  const include = addSelectedInclude(
    parent,
    field,
    getFieldIncludeOptions({ association: field, args, isList }),
    `${sourceType}.${field}`
  )
  return createChildFrame(parent, { type, include, association: field })
}

function handleNextIncludeOptions(details: NextHandlerDetails<CollectorFrame>): CollectorFrame {
  const frame = resolveNextFrame(details)
  rememberOccurrenceFrame(details, frame)
  return frame
}

function handleNextFragmentIncludeOptions(
  details: NextFragmentHandlerDetails<CollectorFrame>
): CollectorFrame {
  const { type, sourceType, state: parent } = details

  // Spreading a fragment on a concrete type stays on the same object, so its fields have to keep
  // filling the state they were spread into.
  if (!isRegisteredPolymorphicAbstractType(sourceType)) return parent

  const association = getAttributeByModelName(type)
  const include: DefaultResolverIncludeOptions = { association }
  parent.include.include = parent.include.include || []
  parent.include.include.push(include)
  return createChildFrame(parent, { type, include, association })
}

function resolveCollectedInclude(collector: IncludeCollector) {
  const resolved = collector.root.include
  return resolved.include?.length
    ? (resolved as Required<Pick<DefaultResolverIncludeOptions, 'include'>>)
    : undefined
}

function getResolverSelectionSet(info: GraphQLResolveInfo): SelectionSetNode | undefined {
  const selectionSets = info.fieldNodes
    .filter(node => node.name.value === info.fieldName)
    .flatMap(node => (node.selectionSet ? [node.selectionSet] : []))
  if (selectionSets.length <= 1) return selectionSets[0]

  // Duplicate response fields are one resolver call, so every field node contributes selections.
  return {
    kind: Kind.SELECTION_SET,
    selections: selectionSets.flatMap(selectionSet => [...selectionSet.selections]),
  }
}

export function getQueryInclude(info: GraphQLResolveInfo) {
  const selectionSet = getResolverSelectionSet(info)
  if (!selectionSet) return undefined

  const rootType = getNamedType(info.returnType).name
  const collector = new IncludeCollector(rootType, rootType)

  // `lookaheadAndThrow` delegates to swallowing `lookDeeper` in graphql-lookahead 1.4.0,
  // so include collection calls `lookDeeperAndThrow` directly.
  lookDeeperAndThrow({
    info,
    selectionSet,
    state: collector.root,
    type: rootType,
    until: handleUntilFindOptions,
    next: handleNextIncludeOptions,
    nextFragment: handleNextFragmentIncludeOptions,
  })
  return resolveCollectedInclude(collector)
}

export function getQueryIncludeOf(
  info: GraphQLResolveInfo,
  target:
    | ValidGraphqlType
    | ((details: UntilHandlerDetails<DefaultResolverIncludeOptions>) => boolean),
  options: { depth?: number; lookFromOperationRoot?: boolean } = {}
) {
  const targetType = typeof target === 'string' ? target : undefined
  const isMatchingTarget: Exclude<typeof target, string> =
    typeof target === 'string' ? ({ type }) => type === target : target
  const collector = new IncludeCollector(targetType ?? '', targetType)

  // Every selection matching the target is merged into one include. Selections nested in a bound
  // one are other records, and the whole operation is still scanned so hooks outside of it can
  // declare dependencies on it.
  const until = (details: UntilHandlerDetails<CollectorFrame>) => {
    const withinDepth = options.depth == null || details.state.depth < options.depth
    if (
      details.state.occurrence === undefined &&
      details.nextSelectionSet &&
      withinDepth &&
      (!collector.isBound || details.type === collector.targetType) &&
      matchesTarget(details, isMatchingTarget)
    ) {
      if (!collector.isBound) {
        collector.isBound = true
        collector.root.type = details.type
        collector.targetType ??= details.type
      }
      bindOccurrenceFrame(details, collector.createOccurrenceFrame())
    }
    return handleUntilFindOptions(details)
  }

  const scanType = options.lookFromOperationRoot
    ? info.operation.operation === 'mutation'
      ? MUTATION_TYPE
      : QUERY_TYPE
    : getNamedType(info.returnType).name
  const scanState = createScratchFrame(collector, scanType)
  const traversal = {
    info,
    state: scanState,
    until,
    next: handleNextIncludeOptions,
    nextFragment: handleNextFragmentIncludeOptions,
  }

  if (options.lookFromOperationRoot) {
    lookDeeperAndThrow({ ...traversal, type: scanType, selectionSet: info.operation.selectionSet })
  } else {
    const selectionSet = getResolverSelectionSet(info)
    if (selectionSet) lookDeeperAndThrow({ ...traversal, type: scanType, selectionSet })
  }

  flushPendingRootIncludes(collector)
  return resolveCollectedInclude(collector)
}

/** Function targets keep receiving the plain include as `details.state`. */
function matchesTarget(
  details: UntilHandlerDetails<CollectorFrame>,
  isMatchingTarget: (details: UntilHandlerDetails<DefaultResolverIncludeOptions>) => boolean
) {
  const frame = details.state
  try {
    return isMatchingTarget(Object.assign(details, { state: frame.include }))
  } finally {
    details.state = frame
  }
}

export function getFieldFindOptions(options: {
  args: { [arg: string]: unknown }
  isList: boolean
  omitAssociation?: boolean
  filterContext?: PopulateWhereOptionsContext
}) {
  return getFieldIncludeOptions(options)
}

export function getFieldIncludeOptions(options: {
  association?: string
  args: { [arg: string]: unknown }
  isList: boolean
  omitAssociation?: boolean
  /** Enables one-level-deep association predicates in `where` (see PLAN §2.7). */
  filterContext?: PopulateWhereOptionsContext
}) {
  const includeOptions: DefaultResolverIncludeOptions = {}
  if (options.association && !options.omitAssociation) {
    includeOptions.association = options.association
  }

  const where: GeneSequelizeWhereOptions = {}
  const deepIncludes: DefaultResolverIncludeOptions[] = []

  if (!options.isList) {
    if (options.association && !options.omitAssociation) return includeOptions

    if (typeof options.args.id === 'string') {
      includeOptions.where = where
      includeOptions.where.id = options.args.id
    }
  }

  if (isObject(options.args.where)) {
    includeOptions.where = where
    populateWhereOptions(
      options.args.where,
      where,
      options.filterContext ? { ...options.filterContext, includes: deepIncludes } : undefined
    )
  }

  if (deepIncludes.length) {
    includeOptions.include = includeOptions.include || []
    includeOptions.include.push(...deepIncludes)
  }

  if (isSafeArray(options.args.order)) {
    const orderOptions: OrderItem[] = []

    options.args.order.forEach(fieldOrderValue => {
      if (typeof fieldOrderValue !== 'string') return

      const [, field, orderValue] =
        fieldOrderValue.match(new RegExp(`^(.+)_(${QUERY_ORDER_VALUES.join('|')})$`)) || []
      if (field && orderValue) {
        orderOptions.push([field, orderValue])
      } else {
        throw new GraphQLError('Invalid order value.')
      }
    })
    includeOptions.order = orderOptions
  }

  if (options.isList) {
    if (options.omitAssociation) {
      const skip = typeof options.args.skip === 'number' ? options.args.skip : SKIP_ARG_DEFAULT
      const limit = typeof options.args.limit === 'number' ? options.args.limit : LIMIT_ARG_DEFAULT

      includeOptions.offset = skip
      includeOptions.limit = limit
    } else {
      if (typeof options.args.skip === 'number') includeOptions.offset = options.args.skip
      if (typeof options.args.limit === 'number') includeOptions.limit = options.args.limit
    }
  }

  return includeOptions
}
