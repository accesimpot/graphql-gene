import { defaultFieldResolver, GraphQLSchema } from 'graphql'
import type { GeneConfig, GeneDefaultResolverArgs, QueryMutationTypes } from './defineConfig'
import {
  lookDeepInSchema,
  isUsingDefaultResolver,
  normalizeFieldConfig,
  isArrayFieldConfig,
  getGeneConfigFromOptions,
} from './utils'
import type { GenePlugin, AnyObject } from './types'
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
        schema,
        plugin,
        modelKey,
        model,
        geneConfig,
      })
      if (modifiedSchema) schema = modifiedSchema
    }
  })
  // const extendedQueryMutationTypes = getExtendedQueryMutationTypes()

  // Object.entries(extendedQueryMutationTypes.types).forEach(([graphqlType, typeConfig]) => {
  //   for (const plugin of options.plugins) {
  //     const modifiedSchema = defineResolvers({
  //       schema,
  //       plugin,
  //       modelKey: graphqlType,
  //       model: extendedQueryMutationTypes.model,
  //       typeConfig,
  //     })
  //     if (modifiedSchema) schema = modifiedSchema
  //   }
  // })
  return schema
}

function forEachModel<M>(options: {
  geneConfig?: GeneConfig<M>
  schema: GraphQLSchema
  plugin: GenePlugin<M>
  modelKey: string
  model: M
}): GraphQLSchema | undefined {
  const geneConfig = getGeneConfigFromOptions(options)
  const { types: typeConfig, directives } = geneConfig || {}

  let modifiedSchema = defineResolvers({ ...options, typeConfig, directives })

  Object.entries(geneConfig?.aliases || {}).forEach(([aliasKey, geneConfig]) => {
    const { types: typeConfig, directives } = geneConfig || {}
    modifiedSchema = defineResolvers({ ...options, typeConfig, directives, modelKey: aliasKey })
  })
  return modifiedSchema
}

function defineResolvers<M>(options: {
  schema: GraphQLSchema
  plugin: Pick<GenePlugin<M>, 'defaultResolver'>
  modelKey: string
  model: M
  typeConfig: QueryMutationTypes | undefined
  directives?: GeneConfig<M>['directives']
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

      if (type !== options.modelKey && !isFieldInTypeConfig()) return

      const directiveConfigs: typeof typeLevelDirectiveConfigs = []

      if (type === options.modelKey && typeLevelDirectiveConfigs) {
        directiveConfigs.push(...typeLevelDirectiveConfigs)
      }

      resolverDefinition: {
        if (!isFieldInTypeConfig()) break resolverDefinition

        const currentTypeConfig = typeConfig[parentType as keyof typeof typeConfig]
        if (!currentTypeConfig || isArrayFieldConfig(currentTypeConfig)) break resolverDefinition

        const config = (
          currentTypeConfig as Record<string, Parameters<typeof normalizeFieldConfig>[0]>
        )[field]
        const normalizedConfig = normalizeFieldConfig(config)

        if (normalizedConfig.resolver) {
          fieldDef.resolve = async (source, args, context, info) => {
            if (normalizedConfig.resolver && typeof normalizedConfig.resolver !== 'string') {
              return normalizedConfig.resolver({ source, args, context, info })
            }

            if (isUsingDefaultResolver(normalizedConfig) && options.plugin.defaultResolver) {
              const providedArgs = args as Partial<GeneDefaultResolverArgs<M>>
              const page = (providedArgs.page || PAGE_ARG_DEFAULT) - 1
              const perPage = providedArgs.perPage || PER_PAGE_ARG_DEFAULT

              return await options.plugin.defaultResolver({
                model: options.model,
                modelKey: options.modelKey,
                config: normalizedConfig,
                args: { ...args, page, perPage } as GeneDefaultResolverArgs<M>,
                info,
              })
            }
          }
        }
        if (normalizedConfig.directives) directiveConfigs.push(...normalizedConfig.directives)
      }

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
