import { defaultFieldResolver, GraphQLSchema } from 'graphql'
import type { GeneConfig, GeneDefaultResolverArgs, ExtendedTypes } from './defineConfig'
import {
  lookDeepInSchema,
  isUsingDefaultResolver,
  normalizeFieldConfig,
  isArrayFieldConfig,
  getGeneConfigFromOptions,
  getGloballyExtendedTypes,
  getReturnTypeName,
} from './utils'
import type { GenePlugin, AnyObject, GraphqlTypes } from './types'
import { PAGE_ARG_DEFAULT, PER_PAGE_ARG_DEFAULT } from './constants'

export function addResolversToSchema<SchemaTypes extends AnyObject>(options: {
  schema: GraphQLSchema
  plugins: GenePlugin[]
  types: SchemaTypes
}) {
  let schema = options.schema

  Object.entries(options.types).forEach(([modelKey, model]) => {
    const geneConfig = getGeneConfigFromOptions({ model })

    for (const plugin of options.plugins) {
      const modifiedSchema = forEachModel({
        geneConfig,
        schema,
        types: options.types,
        plugin,
        modelKey,
        model,
      })
      if (modifiedSchema) schema = modifiedSchema
    }
  })
  const globallyExtendedTypes = getGloballyExtendedTypes()

  const modifiedSchema = defineResolvers({
    schema,
    types: options.types,
    typeConfig: globallyExtendedTypes,
  })
  if (modifiedSchema) schema = modifiedSchema

  return schema
}

function forEachModel<M, SchemaTypes extends AnyObject>(options: {
  geneConfig?: GeneConfig<M>
  schema: GraphQLSchema
  types: SchemaTypes
  plugin: GenePlugin<M>
  modelKey: string
  model: M
}): GraphQLSchema | undefined {
  const geneConfig = getGeneConfigFromOptions(options)
  const { types: typeConfig, directives } = geneConfig || {}

  let modifiedSchema = defineResolvers({ ...options, typeConfig, directives })

  Object.entries(geneConfig?.aliases || {}).forEach(([, geneConfig]) => {
    const { types: typeConfig, directives } = geneConfig || {}
    modifiedSchema = defineResolvers({ ...options, typeConfig, directives })
  })
  return modifiedSchema
}

function defineResolvers<M, SchemaTypes extends AnyObject>(options: {
  schema: GraphQLSchema
  types: SchemaTypes
  plugin?: Pick<GenePlugin<M>, 'defaultResolver'>
  typeConfig: ExtendedTypes | undefined
  directives?: GeneConfig['directives']
}): GraphQLSchema | undefined {
  if (!options.typeConfig && !options.directives) return

  const typeConfig = options.typeConfig || {}
  const typeLevelDirectiveConfigs = options.directives

  lookDeepInSchema({
    schema: options.schema,
    each({ type, field, fieldDef, parentType }) {
      const isFieldInTypeConfig = () =>
        parentType in typeConfig &&
        typeConfig[parentType as 'Query'] &&
        field in typeConfig[parentType as 'Query']!

      if (!isFieldInTypeConfig()) return

      const currentTypeConfig = typeConfig[parentType as keyof typeof typeConfig]
      if (!currentTypeConfig || isArrayFieldConfig(currentTypeConfig)) return

      const config = (
        currentTypeConfig as Record<string, Parameters<typeof normalizeFieldConfig>[0]>
      )[field]
      const normalizedConfig = normalizeFieldConfig(config)
      const returnTypeName = getReturnTypeName(normalizedConfig.returnType)
      const model = options.types[returnTypeName] as GraphqlTypes[keyof GraphqlTypes] | undefined

      if (type !== returnTypeName || !model) return

      const directiveConfigs: typeof typeLevelDirectiveConfigs = []
      if (typeLevelDirectiveConfigs) directiveConfigs.push(...typeLevelDirectiveConfigs)

      if (normalizedConfig.resolver) {
        fieldDef.resolve = async (source, args, context, info) => {
          if (normalizedConfig.resolver && typeof normalizedConfig.resolver !== 'string') {
            return normalizedConfig.resolver({ source, args, context, info })
          }

          if (isUsingDefaultResolver(normalizedConfig) && options.plugin?.defaultResolver) {
            const providedArgs = args as Partial<GeneDefaultResolverArgs<typeof model>>
            const page = (providedArgs.page || PAGE_ARG_DEFAULT) - 1
            const perPage = providedArgs.perPage || PER_PAGE_ARG_DEFAULT

            return await options.plugin.defaultResolver({
              model,
              modelKey: returnTypeName,
              config: normalizedConfig,
              args: { ...args, page, perPage } as GeneDefaultResolverArgs<typeof model>,
              info,
            })
          }
        }
      }
      if (normalizedConfig.directives) directiveConfigs.push(...normalizedConfig.directives)

      // Register directives at the type or field level
      if (directiveConfigs.length) {
        // Reverse the order so that the first directive you defined will be executed first
        // (middleware pattern).
        const reversedConfigs = [...directiveConfigs].reverse()

        reversedConfigs.forEach(directive => {
          fieldDef.resolve = fieldDef.resolve || defaultFieldResolver
          const previousResolve = fieldDef.resolve

          fieldDef.resolve = async (source, args, context, info) => {
            let hasCalledResolve = false
            let result: unknown

            const resolve = async () => {
              hasCalledResolve = true
              result = await previousResolve(source, args, context, info)
              return result
            }
            await directive.handler({
              source,
              args,
              context,
              info,
              resolve,
            })
            if (!hasCalledResolve) await resolve()

            return result
          }
        })
      }
    },
  })
  return options.schema
}
