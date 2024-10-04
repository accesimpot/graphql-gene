// import { defaultFieldResolver, GraphQLError, parseType } from 'graphql'
// import { GraphQLSchema, type GraphQLResolveInfo } from 'graphql'
// import type { FindOptions, OrderItem, WhereAttributeHash, WhereOptions } from 'sequelize'
// import type { GeneDefaultResolverArgs, GeneModel, GeneTypeConfig } from './defineConfig'
// import type { AnyObject, ValueOf } from './types/typeUtils'
// import {
//   lookDeepInSchema,
//   isListType,
//   isUsingDefaultResolver,
//   normalizeFieldConfig,
//   getQueryInclude,
//   isArrayFieldConfig,
// } from './utils'
// import {
//   GENE_TO_SEQUELIZE_OPERATORS,
//   PAGE_ARG_DEFAULT,
//   PER_PAGE_ARG_DEFAULT,
//   QUERY_ORDER_VALUES,
//   AND_OR_OPERATORS,
// } from '../../plugin-sequelize/src/constants'
// import type { GeneGraphqlContext } from '@/gene'

// type GeneWhereOptions = {
//   [k in keyof WhereAttributeHash<AnyObject> | symbol]: k extends symbol
//     ? WhereAttributeHash<AnyObject>[]
//     : WhereAttributeHash<AnyObject>[k extends symbol ? never : k]
// }

// export function addResolversToSchema<SchemaTypes extends AnyObject>(options: {
//   schema: GraphQLSchema
//   types: SchemaTypes
// }) {
//   let schema = options.schema

//   Object.entries(options.types).forEach(([modelKey, model]) => {
//     const modifiedSchema = forEachModel({ schema, modelKey, model, geneConfig: model.geneConfig })
//     if (modifiedSchema) schema = modifiedSchema

//     Object.entries(model.geneConfig?.aliases || {}).forEach(([aliasKey, geneConfig]) => {
//       const modifiedSchema = forEachModel({ schema, modelKey: aliasKey, model, geneConfig })
//       if (modifiedSchema) schema = modifiedSchema
//     })
//   })
//   return schema
// }

// function forEachModel<M extends typeof GeneModel>(options: {
//   geneConfig: M['geneConfig']
//   schema: GraphQLSchema
//   modelKey: string
//   model: M
// }): GraphQLSchema | undefined {
//   if (!options.geneConfig) return

//   const typeConfig = options.geneConfig.types || {}
//   const typeLevelDirectiveConfigs = options.geneConfig.directives

//   lookDeepInSchema({
//     schema: options.schema,
//     each({ type, field, fieldDef, parentType }) {
//       const isFieldInTypeConfig = () =>
//         parentType in typeConfig &&
//         typeConfig[parentType as 'Query'] &&
//         field in typeConfig[parentType as 'Query']!

//       if (type !== options.modelKey && !isFieldInTypeConfig()) return

//       const directiveConfigs: typeof typeLevelDirectiveConfigs = []

//       if (type === options.modelKey && typeLevelDirectiveConfigs) {
//         directiveConfigs.push(...typeLevelDirectiveConfigs)
//       }

//       resolverDefinition: {
//         if (!isFieldInTypeConfig()) break resolverDefinition

//         const currentTypeConfig = typeConfig[parentType as keyof typeof typeConfig]
//         if (!currentTypeConfig || isArrayFieldConfig(currentTypeConfig)) break resolverDefinition

//         const config = (
//           currentTypeConfig as Record<string, Parameters<typeof normalizeFieldConfig>[0]>
//         )[field]
//         const normalizedConfig = normalizeFieldConfig(config)

//         if (normalizedConfig.resolver) {
//           fieldDef.resolve = async (source, args, context, info) => {
//             if (normalizedConfig.resolver && typeof normalizedConfig.resolver !== 'string') {
//               return normalizedConfig.resolver({
//                 source,
//                 args: args as object,
//                 context,
//                 info,
//               })
//             }

//             if (isUsingDefaultResolver(normalizedConfig)) {
//               return await runDefaultResolver({
//                 model: options.model,
//                 config: normalizedConfig,
//                 args: args as GeneDefaultResolverArgs<typeof GeneModel>,
//                 info,
//               })
//             }
//           }
//         }
//         if (normalizedConfig.directives) directiveConfigs.push(...normalizedConfig.directives)
//       }

//       // Register directives at the type or field level
//       if (directiveConfigs.length) {
//         // Reverse the order so that the first directive you defined will be executed first
//         // (middleware pattern).
//         const reversedConfigs = [...directiveConfigs].reverse()

//         reversedConfigs.forEach(directive => {
//           fieldDef.resolve = fieldDef.resolve || defaultFieldResolver
//           const previousResolve = fieldDef.resolve

//           fieldDef.resolve = async (source, args, context, info) => {
//             let hasCalledResolve = false
//             let result: unknown

//             const resolve = async () => {
//               hasCalledResolve = true
//               result = await previousResolve(source, args, context, info)
//               return result
//             }
//             await directive.handler({
//               source,
//               args,
//               context,
//               info,
//               resolve,
//             })
//             if (!hasCalledResolve) await resolve()

//             return result
//           }
//         })
//       }
//     },
//   })
//   return options.schema
// }

// async function runDefaultResolver<
//   M extends typeof GeneModel,
//   TSource = Record<string, unknown> | undefined,
//   TContext = GeneGraphqlContext,
//   TArgDefs = Record<string, string> | undefined,
// >(options: {
//   model: M
//   config: GeneTypeConfig<TSource, TContext, TArgDefs>
//   args: GeneDefaultResolverArgs<M>
//   info: GraphQLResolveInfo
// }) {
//   const includeOptions = getQueryInclude(options.info)

//   const isList = isListType(parseType(options.config.returnType))
//   const findFn = isList ? 'findAll' : 'findOne'

//   const findOptions: Omit<FindOptions, 'where' | 'order'> & {
//     where?: {
//       [k in keyof WhereAttributeHash<AnyObject> | symbol]: k extends symbol
//         ? WhereAttributeHash<AnyObject>[]
//         : WhereAttributeHash<AnyObject>[k extends symbol ? never : k]
//     }
//     order?: OrderItem[]
//   } = {}
//   const { args } = options

//   if (isList) {
//     const page = (args.page || PAGE_ARG_DEFAULT) - 1
//     const perPage = args.perPage || PER_PAGE_ARG_DEFAULT

//     findOptions.offset = page * perPage
//     findOptions.limit = args.perPage
//   } else if (args.id) {
//     findOptions.where = findOptions.where || {}
//     findOptions.where.id = args.id
//   }

//   if (args.where) {
//     findOptions.where = findOptions.where || {}
//     const whereOptions = findOptions.where
//     populateWhereOptions(args.where, whereOptions)
//   }

//   if (args.order) {
//     findOptions.order = findOptions.order || []
//     const orderOptions = findOptions.order

//     args.order.forEach(fieldOrderValue => {
//       const [, field, orderValue] =
//         fieldOrderValue.match(new RegExp(`^(.+)_(${QUERY_ORDER_VALUES.join('|')})$`)) || []
//       if (field && orderValue) {
//         orderOptions.push([field, orderValue])
//       } else {
//         throw new GraphQLError('Invalid order value.')
//       }
//     })
//   }
//   return await options.model[findFn]({ ...findOptions, ...includeOptions })
// }

// function populateWhereOptions<M extends typeof GeneModel>(
//   whereArgs: GeneDefaultResolverArgs<M>['where'],
//   state: GeneWhereOptions
// ) {
//   for (const attr in whereArgs) {
//     const parseOperators = (
//       operator: string,
//       value:
//         | (typeof whereArgs)[keyof typeof whereArgs]
//         | (typeof whereArgs)[keyof typeof whereArgs][]
//     ) => {
//       if (!(operator in GENE_TO_SEQUELIZE_OPERATORS)) return

//       const findOptionsGetter =
//         GENE_TO_SEQUELIZE_OPERATORS[operator as keyof typeof GENE_TO_SEQUELIZE_OPERATORS]
//       return findOptionsGetter(value as string)
//     }

//     if (AND_OR_OPERATORS.includes(attr)) {
//       const nestedWheres: ValueOf<GeneWhereOptions>[] = []
//       const parsedOperators = parseOperators(attr, nestedWheres)

//       if (parsedOperators) {
//         const [op] = parsedOperators
//         state[op] = nestedWheres as (typeof state)[symbol]

//         if (Array.isArray(state[op]) && Array.isArray(whereArgs[attr])) {
//           whereArgs[attr].forEach((nestedWhereArgs: typeof whereArgs) => {
//             const nextState = {} as GeneWhereOptions
//             state[op].push(nextState)
//             populateWhereOptions(nestedWhereArgs, nextState)
//           })
//         }
//       }
//     } else {
//       state[attr] = state[attr] || {}

//       Object.entries(whereArgs[attr]).forEach(([operator, value]) => {
//         const parsedOperators = parseOperators(operator, value)
//         if (!parsedOperators) return

//         const [op, opValue] = parsedOperators
//         state[attr][op] = opValue
//       })
//     }
//   }
// }
