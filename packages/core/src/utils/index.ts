import {
  buildASTSchema,
  buildSchema,
  GraphQLDirective,
  GraphQLInterfaceType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  isSpecifiedDirective,
  isSpecifiedScalarType,
  parseType,
  print,
  type DocumentNode,
  type GraphQLField,
  type GraphQLNamedType,
  type GraphQLOutputType,
} from 'graphql'
import type { GeneContext } from 'graphql-gene/context'
import type { AnyObject, FieldLines, GraphQLVarType, TypeDefLines } from '../types'
import type { GeneConfig, GeneTypeConfig } from '../defineConfig'

export * from './extend'
export * from './operators'

type GraphQLOutputObjectType = GraphQLObjectType | GraphQLInterfaceType

export function parseSchemaOption(
  schema?: GraphQLSchema | DocumentNode | string
): GraphQLSchema | undefined {
  if (!schema) return undefined

  return typeof schema === 'string'
    ? buildSchema(schema)
    : schema instanceof GraphQLSchema
      ? schema
      : buildASTSchema(schema)
}

export function lookDeepInSchema<TState>(options: {
  each: (details: {
    field: string
    fieldDef: GraphQLField<
      Record<string, unknown> | undefined,
      GeneContext,
      Record<string, unknown> | undefined
    >
    isList: boolean
    isNonNullable: boolean
    parentType: string
    parentTypeDef: GraphQLOutputObjectType
    state: TState
    type: string
    typeDef: GraphQLNamedType
  }) => TState | undefined
  schema: GraphQLSchema
  state?: TState
}) {
  const queryType = options.schema.getQueryType()
  const mutationType = options.schema.getMutationType()
  if (!queryType && !mutationType) return

  const typesChecked = new Set<string>([])

  const lookDeeper = (parentTypeDef: GraphQLOutputObjectType, state: TState) => {
    if (typesChecked.has(parentTypeDef.name)) return

    typesChecked.add(parentTypeDef.name)
    const childFields = parentTypeDef.getFields()

    Object.entries(childFields).forEach(([field, fieldDefinition]) => {
      const fieldDef = fieldDefinition
      const typeDefWrap = fieldDefinition.type
      if (!fieldDef || !typeDefWrap) return

      const typeDef = findAccurateTypeDef(typeDefWrap)
      if (!typeDef) return

      const newState = options.each({
        field,
        fieldDef,

        get isList(): boolean {
          return (
            fieldDef instanceof GraphQLList ||
            ('ofType' in typeDefWrap && typeDefWrap.ofType instanceof GraphQLList)
          )
        },
        get isNonNullable(): boolean {
          return fieldDef instanceof GraphQLNonNull
        },
        parentType: parentTypeDef.name,
        parentTypeDef,
        state,
        type: typeDef.name,

        get typeDef() {
          const type = options.schema.getType(typeDef.name)
          return type as NonNullable<typeof type>
        },
      })

      // Look deeper if the type has child fields
      if ('getFields' in typeDef) lookDeeper(typeDef, newState || state)
    })
  }
  if (queryType) lookDeeper(queryType, options.state || ({} as TState))
  if (mutationType) lookDeeper(mutationType, options.state || ({} as TState))
}

export function findAccurateTypeDef(type: GraphQLOutputType) {
  const typeDefinition = ('ofType' in type ? findAccurateTypeDef(type.ofType) : type) as
    | GraphQLOutputType
    | undefined

  if (typeDefinition && 'name' in typeDefinition) return typeDefinition
}

export function getGraphqlType(variable: string | number | boolean) {
  const typeMap: Record<string, 'String' | 'Int' | 'Boolean'> = {
    string: 'String',
    number: 'Int',
    boolean: 'Boolean',
  }
  return typeMap[typeof variable]
}

/**
 * Inspired by
 * @see https://github.com/graphql/graphql-js/issues/869#issuecomment-374351118
 */
export function printSchemaWithDirectives(schema: GraphQLSchema) {
  let schemaString = ''

  const printAst = (type: GraphQLDirective | GraphQLNamedType) => {
    if (type && 'astNode' in type && type.astNode) schemaString += `${print(type.astNode)}\n\n`
  }

  schema.getDirectives().forEach(type => {
    if (!isSpecifiedDirective(type)) printAst(type)
  })

  const typeEntries = Object.entries(schema.getTypeMap())

  // Print Query and Mutation types before the other types that are alphabetically sorted
  typeEntries.sort(([aTypeName], [bTypeName]) => {
    if (aTypeName === 'Query') return -1
    if (aTypeName === 'Mutation') return bTypeName === 'Query' ? 1 : -1

    if (bTypeName === 'Query') return 1
    if (bTypeName === 'Mutation') return aTypeName === 'Query' ? -1 : 1

    return aTypeName.localeCompare(bTypeName)
  })

  typeEntries
    // Filter out internal type definition like __Directive, __Field, __InputValue
    .filter(([typeName]) => !/^__/.test(typeName))
    .forEach(([, type]) => {
      if (!isSpecifiedScalarType(type)) printAst(type)
    })

  return schemaString.replace(/\n$/, '')
}

/** is using default Gene resolver if none was provided */
export function isUsingDefaultResolver(fieldConfig: AnyObject): boolean {
  return (['resolver', 'args'] as const).some(
    prop => prop in fieldConfig && fieldConfig[prop] === 'default'
  )
}

export function getDefaultTypeDefLinesObject(): TypeDefLines[0] {
  return { varType: 'type', directives: new Set<string>([]), lines: {} }
}

export function getDefaultFieldLinesObject(): FieldLines[0] {
  return { directives: new Set<string>([]), typeDef: '', argsDef: {} }
}

export function isObject<T>(variable: T) {
  return variable !== null && typeof variable === 'object'
}

export function isArrayFieldConfig<T>(
  fieldConfigs: T
): fieldConfigs is Extract<T, readonly string[]> {
  return Array.isArray(fieldConfigs)
}

export function isObjectFieldConfig<T>(
  fieldConfigs: T
): fieldConfigs is Exclude<T, readonly string[]> {
  return isObject(fieldConfigs)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeFieldConfig<TConfig extends string | GeneTypeConfig<any, any, any, any>>(
  fieldConfig: TConfig
): GeneTypeConfig {
  return typeof fieldConfig === 'string'
    ? ({ returnType: fieldConfig } as GeneTypeConfig)
    : fieldConfig
}

export function isListType(type: ReturnType<typeof parseType>) {
  const typeToCheck = type.kind === 'NonNullType' ? type.type : type
  return typeToCheck.kind === 'ListType'
}

export function findTypeNameFromTypeNode(type: ReturnType<typeof parseType>): string {
  return 'type' in type ? findTypeNameFromTypeNode(type.type) : type.name.value
}

/**
 * Receives the full GraphQL return type and returns the type name as string.
 *
 * @example
 * const returnTypeName = getReturnTypeName('[Foo!]!') // => 'Foo'
 */
export function getReturnTypeName(returnType: string) {
  return findTypeNameFromTypeNode(parseType(returnType))
}

export function getGeneConfigFromOptions<M>(options: {
  model: M
  geneConfig?: GeneConfig<M>
}): GeneConfig<M> | undefined {
  return (
    options.geneConfig ||
    (options.model &&
      (typeof options.model === 'object' || typeof options.model === 'function') &&
      'geneConfig' in options.model &&
      options.model.geneConfig) ||
    undefined
  )
}

export function isFieldIncluded<M>(
  geneConfig: GeneConfig<M> | undefined,
  fieldKey: string
): boolean {
  const config = geneConfig || {}

  const check = (filters: unknown[]) => {
    for (const keyOrRegex of filters) {
      if (typeof keyOrRegex === 'string' && keyOrRegex === fieldKey) return true
      if (keyOrRegex instanceof RegExp && keyOrRegex.test(fieldKey)) return true
    }
  }
  if (config.include && !check(config.include)) return false

  let extraExclude = new Set(['createdAt' as const, 'updatedAt' as const])

  if (Array.isArray(config.includeTimestamps)) {
    config.includeTimestamps.forEach(timestamp => extraExclude.delete(timestamp))
  } else if (config.includeTimestamps === true) {
    extraExclude = new Set([])
  }

  const exclude = [...(config.exclude || []), ...extraExclude]
  if (check(exclude)) return false

  return true
}

export function createTypeDefLines(
  typeDefLines: TypeDefLines,
  varType: GraphQLVarType,
  varName: string
) {
  typeDefLines[varName] = typeDefLines[varName] || getDefaultTypeDefLinesObject()
  typeDefLines[varName].varType = varType
}
