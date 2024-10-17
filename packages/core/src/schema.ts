import {
  parse,
  buildSchema,
  extendSchema,
  GraphQLSchema,
  GraphQLObjectType,
  parseType,
} from 'graphql'
import type { DocumentNode, GraphQLFieldResolver } from 'graphql'
import type { GeneContext } from 'graphql-gene/context'
import { type GeneConfig, type GeneConfigTypes, type GeneDirectiveConfig } from './defineConfig'
import type { AnyObject, Mutable } from './types/typeUtils'
import {
  getGraphqlType,
  lookDeepInSchema,
  parseSchemaOption,
  printSchemaWithDirectives,
  isUsingDefaultResolver,
  normalizeFieldConfig,
  isListType,
  findTypeNameFromTypeNode,
  isArrayFieldConfig,
  isObjectFieldConfig,
  getDefaultTypeDefLinesObject,
  getDefaultFieldLinesObject,
  getGeneConfigFromOptions,
  isFieldIncluded,
  isObject,
  getGloballyExtendedTypes,
} from './utils'
import { addResolversToSchema } from './resolvers'
import SCHEMA_TEMPLATE_HTML from './schema.html?raw'
import type {
  BasicGraphqlType,
  DirectiveDefs,
  FieldLines,
  GenePlugin,
  GenerateSchemaOptions,
  GraphQLFieldName,
  GraphQLTypeName,
  GraphQLVarType,
  TypeDefLines,
} from './types'
import {
  AND_OR_OPERATORS,
  BASIC_GRAPHQL_TYPE_VALUES,
  PAGE_ARG_DEFAULT,
  PER_PAGE_ARG_DEFAULT,
  QUERY_ORDER_VALUES,
} from './constants'

const VALID_RETURN_TYPES_FOR_WHERE = [
  'String',
  'Int',
  'Float',
  'Boolean',
  'Date',
  'DateTime',
] as const

export function generateSchema<
  SchemaTypes extends AnyObject,
  DataTypes extends AnyObject,
>(options: {
  schema?: GraphQLSchema | DocumentNode | string
  plugins?: GenePlugin[]
  types: SchemaTypes
  hasDateScalars?: boolean
  dataTypeMap?: DataTypes
}) {
  // We duplicate the type definition to have a better DX on hover of `generateSchema`
  // but we make sure that it stays in sync with its type.
  const _options: GenerateSchemaOptions<SchemaTypes, DataTypes> = options

  const initialSchema = parseSchemaOption(options.schema)
  const geneTypeDefs = generateGeneTypeDefs(options)

  const schema = initialSchema
    ? extendSchema(initialSchema, parse(geneTypeDefs))
    : buildSchema(geneTypeDefs)

  const queryType = schema.getType('Query')
  const mutationType = schema.getType('Mutation')

  if (!queryType) {
    throw new Error('Query root type must be provided.')
  }
  if (!(queryType instanceof GraphQLObjectType)) {
    throw new Error('Query type is not a GraphQLObjectType.')
  }
  const schemaOptions: Mutable<ConstructorParameters<typeof GraphQLSchema>[0]> = {
    query: queryType,
  }

  if (mutationType) {
    if (!(mutationType instanceof GraphQLObjectType)) {
      throw new Error('Mutation type is not a GraphQLObjectType.')
    }
    schemaOptions.mutation = mutationType
  }
  let executableSchema = new GraphQLSchema({ ...schema.toConfig(), ...schemaOptions })

  executableSchema = addResolversToSchema({
    schema: executableSchema,
    plugins: options.plugins || [],
    types: options.types,
  })

  return {
    schema: executableSchema,

    get schemaString() {
      return printSchemaWithDirectives(executableSchema)
    },
    get typeDefs() {
      return parse(this.schemaString)
    },
    get resolvers() {
      const resolvers: Record<
        GraphQLTypeName,
        Record<
          GraphQLFieldName,
          GraphQLFieldResolver<Record<string, unknown> | undefined, GeneContext>
        >
      > = {}

      lookDeepInSchema({
        schema: executableSchema,
        each({ field, fieldDef, parentType }) {
          if (!fieldDef.resolve) return

          resolvers[parentType] = resolvers[parentType] || {}
          resolvers[parentType][field] = fieldDef.resolve
        },
      })
      return resolvers
    },
    get schemaHtml() {
      return SCHEMA_TEMPLATE_HTML.replace('<%= code %>', this.schemaString)
    },
  }
}

function generateGeneTypeDefs<SchemaTypes extends AnyObject, DataTypes extends AnyObject>(options: {
  schema?: GraphQLSchema | DocumentNode | string
  plugins?: GenePlugin[]
  types: SchemaTypes
  hasDateScalars?: boolean
  dataTypeMap?: DataTypes
}) {
  const directiveDefs: DirectiveDefs = {}
  const typeDefLines: TypeDefLines = {}

  console.dir(options.types, { depth: 10 })

  Object.entries(options.types).forEach(([graphqlType, fieldConfigs]) => {
    let hasUsedPlugin = false

    for (const plugin of options.plugins || []) {
      const isMatching = plugin.isMatching(fieldConfigs)
      if (!isMatching) continue

      forEachModel({
        directiveDefs,
        typeDefLines,
        types: options.types,
        schema: options.schema,
        plugin,
        modelKey: graphqlType,
        model: fieldConfigs,
        hasDateScalars: options.hasDateScalars,
        dataTypeMap: options.dataTypeMap,
      })
      forEachModelOnTypeDefCompleted({
        typeDefLines,
        modelKey: graphqlType,
        model: fieldConfigs,
      })

      hasUsedPlugin = true
      break
    }

    if (!hasUsedPlugin && (isArrayFieldConfig(fieldConfigs) || isObjectFieldConfig(fieldConfigs))) {
      generateTypeDefLines({
        directiveDefs,
        typeDefLines,
        graphqlType,
        fieldConfigs: fieldConfigs,
      })
    }
  })
  const globallyExtendedTypes = getGloballyExtendedTypes()

  Object.entries(globallyExtendedTypes).forEach(([graphqlType, fieldConfigs]) => {
    generateTypeDefLines({
      directiveDefs,
      typeDefLines,
      graphqlType,
      fieldConfigs,
    })

    Object.entries(fieldConfigs).forEach(([fieldKey, fieldConfig]) => {
      const model =
        isObject(options.types) && graphqlType in options.types
          ? options.types[graphqlType]
          : undefined

      generateDefaultQueryFilterTypeDefs({
        typeDefLines,
        model,
        graphqlType,
        fieldKey,
        fieldConfig,
      })
    })
  })

  const typeDefs: string[] = []
  let sortedTypeDefLines = typeDefLines

  // Put type Query at the top
  if ('Query' in typeDefLines) {
    const { Query, ...restTypeDefLines } = typeDefLines
    sortedTypeDefLines = { Query, ...restTypeDefLines }
  }

  Object.entries(sortedTypeDefLines).forEach(([type, fieldLines]) => {
    const line = stringifyFieldLines(type, fieldLines)
    if (line) typeDefs.push(line)
  })
  let typeDefsString = typeDefs.join('\n\n')

  Object.entries(directiveDefs).forEach(([directiveName, directiveConfig]) => {
    let directiveDef = `directive @${directiveName}`

    const rawArgsDefEntries = Object.entries(directiveConfig.argsDef)
    const argsDefEntries = rawArgsDefEntries.filter(([, types]) => [...types].some(t => t !== null))

    const printTypes = (types: Set<string | null>) =>
      [
        [...types].filter(t => t !== null).map(t => getGraphqlType(t)),
        types.has(null) ? '' : '!',
      ].join('')

    if (argsDefEntries.length) {
      directiveDef += '(\n'
      directiveDef += argsDefEntries.map(([k, types]) => `  ${k}: ${printTypes(types)}`).join('\n')
      directiveDef += '\n)'
    }
    directiveDef += ' on OBJECT | FIELD_DEFINITION'

    typeDefsString = `${directiveDef}\n\n${typeDefsString}`
  })

  return typeDefsString
}

function forEachModel<M, SchemaTypes extends AnyObject>(options: {
  directiveDefs: DirectiveDefs
  typeDefLines: TypeDefLines
  types: SchemaTypes
  schema?: GraphQLSchema | DocumentNode | string
  plugin: GenePlugin<M>
  modelKey: string
  model: M
  hasDateScalars?: boolean
  dataTypeMap?: { [k: string | symbol]: BasicGraphqlType }
}) {
  generateTypeDefs(options)
  generateAdditionalTypeDefs(options)

  const geneConfig = getGeneConfigFromOptions(options)

  Object.entries(geneConfig?.aliases || {}).forEach(([aliasKey, geneConfig]) => {
    generateTypeDefs({ ...options, geneConfig, modelKey: aliasKey })
    generateAdditionalTypeDefs({ ...options, geneConfig })
  })
}

function forEachModelOnTypeDefCompleted<M>(options: {
  typeDefLines: TypeDefLines
  modelKey: string
  model: M
}) {
  generateQueryFilterTypeDefs(options)

  const geneConfig = getGeneConfigFromOptions(options)
  if (!geneConfig?.types) return

  Object.entries(geneConfig?.aliases || {}).forEach(([, geneConfig]) => {
    generateQueryFilterTypeDefs({ ...options, geneConfig })
  })
}

function generateTypeDefs<M, SchemaTypes extends AnyObject>(options: {
  directiveDefs: DirectiveDefs
  typeDefLines: TypeDefLines
  types: SchemaTypes
  schema?: GraphQLSchema | DocumentNode | string
  modelKey: string
  model: M
  plugin: GenePlugin<M>
  hasDateScalars?: boolean
  geneConfig?: GeneConfig<M>
  dataTypeMap?: { [k: string | symbol]: BasicGraphqlType }
}) {
  const geneConfig = getGeneConfigFromOptions(options)

  const typeDef = options.plugin.getTypeDef({
    model: options.model,
    typeName: options.modelKey,
    isFieldIncluded: (fieldKey: string) => isFieldIncluded(geneConfig, fieldKey),
    schemaOptions: options,
  })
  if (!typeDef) return

  options.typeDefLines[options.modelKey] = { ...getDefaultTypeDefLinesObject(), ...typeDef }

  registerDirectives({
    configs: geneConfig?.directives,
    defs: options.directiveDefs,
    each: ({ directiveDef }) => {
      options.typeDefLines[options.modelKey].directives.add(directiveDef)
    },
  })
}

/**
 * Generate type definition object from `geneConfig.types`
 */
function generateAdditionalTypeDefs<M>(options: {
  directiveDefs: DirectiveDefs
  typeDefLines: TypeDefLines
  modelKey: string
  model: M
  geneConfig?: GeneConfig<M>
}) {
  const geneConfig = getGeneConfigFromOptions(options)
  if (!geneConfig?.types) return

  Object.entries(geneConfig.types).forEach(([graphqlType, fieldConfigs]) => {
    generateTypeDefLines({ ...options, graphqlType, fieldConfigs })
  })
}

function generateTypeDefLines(options: {
  directiveDefs: DirectiveDefs
  typeDefLines: TypeDefLines
  graphqlType: string
  fieldConfigs: GeneConfigTypes
}) {
  let objFieldConfigs = options.fieldConfigs

  options.typeDefLines[options.graphqlType] =
    options.typeDefLines[options.graphqlType] || getDefaultTypeDefLinesObject()

  if (
    isObject(objFieldConfigs) &&
    'geneConfig' in objFieldConfigs &&
    objFieldConfigs.geneConfig?.varType
  ) {
    const varType = objFieldConfigs.geneConfig.varType
    options.typeDefLines[options.graphqlType].varType = varType

    if (varType === 'union') {
      const objConfigs: Record<string, ''> = {}

      Object.keys(objFieldConfigs)
        .filter(field => field !== 'geneConfig')
        .forEach(field => (objConfigs[field] = ''))

      objFieldConfigs = objConfigs
    }
  }

  // If options.fieldConfigs is an array, we should treat it as an enum
  if (isArrayFieldConfig(options.fieldConfigs)) {
    options.typeDefLines[options.graphqlType].varType = 'enum'

    const objConfigs: Record<string, ''> = {}
    options.fieldConfigs.forEach(field => (objConfigs[field] = ''))

    objFieldConfigs = objConfigs
  } else {
    const geneConfig = options.fieldConfigs.geneConfig
    if (geneConfig?.varType) options.typeDefLines[options.graphqlType].varType = geneConfig.varType
  }

  Object.entries(objFieldConfigs).forEach(([fieldKey, fieldConfig]) => {
    const normalizedFieldConfig = normalizeFieldConfig(fieldConfig)

    options.typeDefLines[options.graphqlType].lines[fieldKey] =
      options.typeDefLines[options.graphqlType].lines[fieldKey] || getDefaultFieldLinesObject()

    const fieldLineConfig = options.typeDefLines[options.graphqlType].lines[fieldKey]
    fieldLineConfig.typeDef = normalizedFieldConfig.returnType

    if (isUsingDefaultResolver(normalizedFieldConfig)) {
      const whereOptionsInputName = getWhereOptionsInputName(options.graphqlType, fieldKey)
      const orderEnumName = getQueryOrderEnumName(options.graphqlType, fieldKey)

      const isList = isListType(parseType(normalizedFieldConfig.returnType))

      const argsDef = {
        ...(isList
          ? {
              page: 'Int',
              perPage: 'Int',
            }
          : { id: 'String' }),
        locale: 'String',
        where: whereOptionsInputName,

        ...(isList ? { order: `[${orderEnumName}!]` } : {}),
      }
      Object.entries(argsDef).forEach(([argKey, argDef]) => {
        fieldLineConfig.argsDef[argKey] = fieldLineConfig.argsDef[argKey] || new Set<string>([])

        let def = argDef
        // Set default values
        if (argKey === 'page') def += ` = ${PAGE_ARG_DEFAULT}`
        if (argKey === 'perPage') def += ` = ${PER_PAGE_ARG_DEFAULT}`

        fieldLineConfig.argsDef[argKey].add(def)
      })
    } else if (normalizedFieldConfig.args) {
      Object.entries(normalizedFieldConfig.args).forEach(([argKey, argDef]) => {
        if (typeof argDef !== 'string') return

        fieldLineConfig.argsDef[argKey] = fieldLineConfig.argsDef[argKey] || new Set<string>([])
        fieldLineConfig.argsDef[argKey].add(argDef)
      })
    }
    if (normalizedFieldConfig.directives) {
      registerDirectives({
        configs: normalizedFieldConfig.directives,
        defs: options.directiveDefs,
        each: ({ directiveDef }) => {
          options.typeDefLines[options.graphqlType].lines[fieldKey].directives.add(directiveDef)
        },
      })
    }
  })
}

function generateQueryFilterTypeDefs<M>(options: {
  typeDefLines: TypeDefLines
  // modelKey: string
  model?: M
  geneConfig?: GeneConfig<M>
  extendedTypes?: GeneConfigTypes
}) {
  const model = options.model
  const geneConfig = model ? getGeneConfigFromOptions({ model, ...options }) : undefined
  if (!geneConfig?.types) return

  Object.entries(geneConfig.types).forEach(([graphqlType, fieldConfigs]) => {
    Object.entries(fieldConfigs).forEach(([fieldKey, fieldConfig]) => {
      generateDefaultQueryFilterTypeDefs({
        typeDefLines: options.typeDefLines,
        model: options.model,
        graphqlType,
        fieldKey,
        fieldConfig,
      })
    })
  })
}

function generateDefaultQueryFilterTypeDefs<M, TFieldConfig>(options: {
  typeDefLines: TypeDefLines
  // modelKey: string
  model?: M
  graphqlType: string
  fieldKey: string
  fieldConfig: TFieldConfig
}) {
  const normalizedFieldConfig = normalizeFieldConfig(options.fieldConfig as '')
  if (!isUsingDefaultResolver(normalizedFieldConfig)) return

  const whereOptionsInputName = getWhereOptionsInputName(options.graphqlType, options.fieldKey)
  const orderEnumName = getQueryOrderEnumName(options.graphqlType, options.fieldKey)

  const hasWhereInputDefined = whereOptionsInputName in options.typeDefLines
  const hasOrderEnumDefined = orderEnumName in options.typeDefLines
  const hasOrderEnum = isListType(parseType(normalizedFieldConfig.returnType))

  if (hasWhereInputDefined && hasOrderEnumDefined) return

  if (!hasWhereInputDefined) {
    createTypeDefLines(options.typeDefLines, 'input', whereOptionsInputName)

    // Add "and" and "or" operators
    AND_OR_OPERATORS.forEach(operator => {
      options.typeDefLines[whereOptionsInputName].lines[operator] = getDefaultFieldLinesObject()
      options.typeDefLines[whereOptionsInputName].lines[operator].typeDef =
        `[${whereOptionsInputName}!]`
    })
  }
  if (hasOrderEnum && !hasOrderEnumDefined) {
    createTypeDefLines(options.typeDefLines, 'enum', orderEnumName)
  }

  const returnTypeName = findTypeNameFromTypeNode(parseType(normalizedFieldConfig.returnType))

  if (returnTypeName && BASIC_GRAPHQL_TYPE_VALUES.includes(returnTypeName as 'ID')) return

  if (!(returnTypeName in options.typeDefLines)) {
    throw new Error(`Cannot find "${returnTypeName}" definition used as "returnType".`)
  }

  Object.entries(options.typeDefLines[returnTypeName].lines).forEach(
    ([returnFieldKey, returnFieldType]) => {
      // Where Options Input
      options.typeDefLines[whereOptionsInputName].lines[returnFieldKey] =
        options.typeDefLines[whereOptionsInputName].lines[returnFieldKey] ||
        getDefaultFieldLinesObject()

      const validInputType = VALID_RETURN_TYPES_FOR_WHERE.find(type =>
        returnFieldType.typeDef.startsWith(type)
      )
      let whereTypeDef = ''

      if (validInputType) {
        const operatorInputName = getOperatorInputName(validInputType)
        whereTypeDef = operatorInputName

        if (!(operatorInputName in options.typeDefLines)) {
          createTypeDefLines(options.typeDefLines, 'input', operatorInputName)

          options.typeDefLines[operatorInputName].lines = generateOperatorInputLines(validInputType)
        }
      } else if (returnFieldType.typeDef in options.typeDefLines) {
        for (const key in options.typeDefLines[returnFieldType.typeDef].lines) {
          if (key === 'id') {
            whereTypeDef = options.typeDefLines[returnFieldType.typeDef].lines[key].typeDef
            break
          }
        }
      }
      if (!whereTypeDef) {
        delete options.typeDefLines[whereOptionsInputName].lines[returnFieldKey]
      } else {
        options.typeDefLines[whereOptionsInputName].lines[returnFieldKey].typeDef = whereTypeDef
      }

      // Query Order Enum
      if (hasOrderEnum) {
        QUERY_ORDER_VALUES.forEach(orderValue => {
          const key = `${returnFieldKey}_${orderValue}`
          options.typeDefLines[orderEnumName].lines[key] = getDefaultFieldLinesObject()
        })
      }
    }
  )
}

function registerDirectives(options: {
  defs: DirectiveDefs
  configs: GeneDirectiveConfig[] | undefined
  each: (details: { directiveDef: string; directive: GeneDirectiveConfig }) => void
}) {
  options.configs?.forEach(directive => {
    // Define or extend the directive in the schema
    options.defs[directive.name] = options.defs[directive.name] || { argsDef: {} }

    if (directive.args) {
      Object.entries(directive.args).forEach(([key, value]) => {
        options.defs[directive.name].argsDef = options.defs[directive.name].argsDef || {}

        options.defs[directive.name].argsDef[key] =
          options.defs[directive.name].argsDef[key] || new Set([])

        options.defs[directive.name].argsDef[key].add(value === null ? null : getGraphqlType(value))
      })
    }

    const directiveDef = stringifyDirectiveConfig(directive)
    options.each({ directiveDef, directive })
  })
}

function stringifyFieldLines(typeKey: string, fieldLines: TypeDefLines[0]) {
  const printDirectives = (directives: Set<string>) =>
    directives.size ? ` ${[...directives].join(' ')}` : ''

  const fieldLinesArray = Object.entries(fieldLines.lines).map(([attr, type]) => {
    let argsDef = ''
    const argsDefEntries = Object.entries(type.argsDef)
    // Add the parentheses if the field has arguments
    if (argsDefEntries.length) {
      argsDef += '('
      argsDef += argsDefEntries.map(([k, v]) => `${k}: ${[...v].join(' | ')}`).join(', ')
      argsDef += ')'
    }
    let line = `${attr}${argsDef}`
    if (type.typeDef) line += `: ${type.typeDef}${printDirectives(type.directives)}`

    return line
  })
  if (!fieldLinesArray.length) return ''

  const getVarDef = (indent = '  ', join = '\n') =>
    fieldLinesArray.map(line => `${indent}${line}`).join(join)

  if (fieldLines.varType === 'union') {
    return `union ${typeKey} = ${getVarDef('', ' | ')}`
  }

  return [
    `${fieldLines.varType} ${typeKey}${printDirectives(fieldLines.directives)} {`,
    getVarDef(),
    `}`,
  ].join('\n')
}

function stringifyDirectiveConfig(directive: GeneDirectiveConfig) {
  let directiveDef = `@${directive.name}`

  if (directive.args) {
    // Null is not valid in GraphQL Language so we remove it from the possible argument types
    const entries = Object.entries(directive.args).filter(([, v]) => v !== null)

    // Add the parentheses only if the directive has possible argument types
    if (entries.length) {
      directiveDef += '('
      directiveDef += Object.entries(directive.args)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ')
      directiveDef += ')'
    }
  }
  return directiveDef
}

function createTypeDefLines(typeDefLines: TypeDefLines, varType: GraphQLVarType, varName: string) {
  typeDefLines[varName] = typeDefLines[varName] || getDefaultTypeDefLinesObject()
  typeDefLines[varName].varType = varType
}

function getWhereOptionsInputName(typeName: string, fieldName: string) {
  return generateGraphqlTypeName(typeName, fieldName, 'WhereOptionsInput')
}

function getQueryOrderEnumName(typeName: string, fieldName: string) {
  return generateGraphqlTypeName(typeName, fieldName, 'SelectOrderEnum')
}

function generateGraphqlTypeName<T extends string>(typeName: string, fieldName: string, suffix: T) {
  const pascal = (name: string) => `${name[0].toUpperCase()}${name.substring(1)}`
  return [typeName, fieldName, suffix].map(pascal).join('') as `${string}${T}`
}

function getOperatorInputName(
  graphqlType: (typeof VALID_RETURN_TYPES_FOR_WHERE)[number]
): `GeneOperator${string}Input` {
  return `GeneOperator${graphqlType}Input`
}

function generateOperatorInputLines(
  graphqlType: (typeof VALID_RETURN_TYPES_FOR_WHERE)[number]
): FieldLines {
  const fieldDefs = {
    eq: graphqlType,
    ne: graphqlType,
    in: `[${graphqlType}]`,
    notIn: `[${graphqlType}]`,
    null: 'Boolean',

    ...(graphqlType === 'String'
      ? {
          like: graphqlType,
          notLike: graphqlType,
        }
      : ['Int', 'Float', 'Date', 'DateTime'].includes(graphqlType)
        ? {
            lt: graphqlType,
            lte: graphqlType,
            gt: graphqlType,
            gte: graphqlType,
          }
        : {}),
  }

  const lines: FieldLines = {}
  Object.entries(fieldDefs).forEach(([key, typeDef]) => {
    lines[key] = { ...getDefaultFieldLinesObject(), typeDef }
  })
  return lines
}
