import {
  parse,
  buildSchema,
  extendSchema,
  GraphQLSchema,
  GraphQLObjectType,
  parseType,
  isScalarType,
} from 'graphql'
import type { DocumentNode } from 'graphql'
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
  isArrayFieldConfig,
  isObjectFieldConfig,
  getDefaultTypeDefLinesObject,
  getDefaultFieldLinesObject,
  getGeneConfigFromOptions,
  isFieldIncluded,
  isObject,
  getGloballyExtendedTypes,
  getReturnTypeName,
  getFieldDefinition,
  setGeneConfigByType,
} from './utils'
import { addResolversToSchema } from './resolvers'
import SCHEMA_TEMPLATE_HTML from './schema.html?raw'
import type {
  BasicGraphqlType,
  DirectiveDefs,
  GenePlugin,
  Resolvers,
  ResolversOrScalars,
  TypeDefLines,
} from './types'
import {
  generateDefaultQueryFilterTypeDefs,
  populateArgsDefForDefaultResolver,
} from './defaultResolver'

export function generateSchema<
  SchemaTypes extends AnyObject,
  DataTypes extends AnyObject,
>(options: {
  schema?: GraphQLSchema | DocumentNode | string
  resolvers?: ResolversOrScalars
  plugins?: GenePlugin[]
  types: SchemaTypes
  dataTypeMap?: DataTypes
}) {
  const providedScalars = options.resolvers
    ? Object.values(options.resolvers)
        .filter(typeConfig => isScalarType(typeConfig))
        .map(({ name }) => name)
    : []

  const initialSchema = parseSchemaOption(options.schema, providedScalars)
  const { typeDefsString, typeDefLines } = generateGeneTypeDefs({
    ...options,
    schema: initialSchema,
  })

  const schema = initialSchema
    ? extendSchema(initialSchema, parse(typeDefsString))
    : buildSchema(typeDefsString)

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
  const schemaTypeMap = schema.getTypeMap()

  if (mutationType) {
    if (!(mutationType instanceof GraphQLObjectType)) {
      throw new Error('Mutation type is not a GraphQLObjectType.')
    }
    schemaOptions.mutation = mutationType
  }

  if (options.resolvers) {
    Object.entries(options.resolvers).forEach(([parentType, typeConfig]) => {
      if (isScalarType(typeConfig)) {
        Object.assign(schemaTypeMap[parentType], typeConfig)
        return
      }
      Object.entries(typeConfig).forEach(([field, resolver]) => {
        const fieldDef = getFieldDefinition({ schema, parent: parentType, field })
        if (fieldDef) fieldDef.resolve = resolver
        else throw new Error(`No field definition found for "${field}" of type "${parentType}.`)
      })
    })
  }

  let executableSchema = new GraphQLSchema({
    ...schema.toConfig(),
    ...schemaOptions,
    types: Object.values(schemaTypeMap),
  })

  executableSchema = addResolversToSchema({
    typeDefLines,
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
      const resolvers: Resolvers = {}

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
  schema?: GraphQLSchema
  resolvers?: ResolversOrScalars
  plugins?: GenePlugin[]
  types: SchemaTypes
  dataTypeMap?: DataTypes
}) {
  const directiveDefs: DirectiveDefs = {}
  const typeDefLines: TypeDefLines = {}
  const afterTypeDefHooks: (() => void)[] = []

  Object.entries(options.types).forEach(([graphqlType, fieldConfigs]) => {
    let hasUsedPlugin = false

    for (const plugin of options.plugins || []) {
      const isMatching = plugin.isMatching(fieldConfigs)
      if (!isMatching) continue

      const { afterTypeDefHooks: hooks } = forEachModel({
        directiveDefs,
        typeDefLines,
        types: options.types,
        schema: options.schema,
        resolvers: options.resolvers,
        plugin,
        modelKey: graphqlType,
        model: fieldConfigs,
        dataTypeMap: options.dataTypeMap,
      })
      afterTypeDefHooks.push(...hooks)

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

  Object.entries(globallyExtendedTypes.config).forEach(([graphqlType, fieldConfigs]) => {
    generateTypeDefLines({
      directiveDefs,
      typeDefLines,
      graphqlType,
      fieldConfigs: fieldConfigs as GeneConfigTypes,
    })

    Object.entries(fieldConfigs).forEach(([fieldKey, fieldConfig]) => {
      const normalizedFieldConfig = normalizeFieldConfig(fieldConfig)
      if (!isUsingDefaultResolver(normalizedFieldConfig)) return

      generateDefaultQueryFilterTypeDefs({
        typeDefLines,
        graphqlType,
        fieldKey,
        fieldType: getReturnTypeName(normalizedFieldConfig.returnType),
      })
    })
  })

  afterTypeDefHooks.forEach(hook => hook())

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

  return { typeDefsString, typeDefLines }
}

function forEachModel<M, SchemaTypes extends AnyObject>(options: {
  directiveDefs: DirectiveDefs
  typeDefLines: TypeDefLines
  types: SchemaTypes
  schema?: GraphQLSchema
  resolvers?: ResolversOrScalars
  plugin: GenePlugin<M>
  modelKey: string
  model: M
  dataTypeMap?: { [k: string | symbol]: BasicGraphqlType }
}) {
  const afterTypeDefHooks: (() => void)[] = []

  const { afterTypeDefHooks: hooks } = generateTypeDefs(options)
  afterTypeDefHooks.push(...hooks)

  generateAdditionalTypeDefs(options)

  const geneConfig = getGeneConfigFromOptions(options)

  Object.entries(geneConfig?.aliases || {}).forEach(([aliasKey, geneConfig]) => {
    const { afterTypeDefHooks: hooks } = generateTypeDefs({
      ...options,
      geneConfig,
      modelKey: aliasKey,
    })
    afterTypeDefHooks.push(...hooks)

    generateAdditionalTypeDefs({ ...options, geneConfig })
  })
  return { afterTypeDefHooks }
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
  schema?: GraphQLSchema
  resolvers?: ResolversOrScalars
  modelKey: string
  model: M
  plugin: GenePlugin<M>
  geneConfig?: GeneConfig<M>
  dataTypeMap?: { [k: string | symbol]: BasicGraphqlType }
}) {
  const geneConfig = getGeneConfigFromOptions(options)
  const afterTypeDefHooks: (() => void)[] = []

  setGeneConfigByType(options.modelKey, geneConfig)

  const optionsForPopulateTypeDefs = {
    typeDefLines: options.typeDefLines,
    model: options.model,
    typeName: options.modelKey,
    isFieldIncluded: (fieldKey: string) => isFieldIncluded(geneConfig, fieldKey),
    schemaOptions: options,
  }

  if (options.plugin.populateTypeDefs) {
    const { afterTypeDefHooks: hooks } = options.plugin.populateTypeDefs(optionsForPopulateTypeDefs)
    afterTypeDefHooks.push(...hooks)
  } else {
    const typeDef = options.plugin.getTypeDef(optionsForPopulateTypeDefs)
    options.typeDefLines[options.modelKey] = typeDef
  }

  registerDirectives({
    // @ts-expect-error Fix type issue raised by incompatible TSource
    configs: geneConfig?.directives,
    defs: options.directiveDefs,
    each: ({ directiveDef }) => {
      options.typeDefLines[options.modelKey].directives.add(directiveDef)
    },
  })
  return { afterTypeDefHooks }
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
    generateTypeDefLines({ ...options, graphqlType, fieldConfigs: fieldConfigs as GeneConfigTypes })
  })
}

function generateTypeDefLines(options: {
  directiveDefs: DirectiveDefs
  typeDefLines: TypeDefLines
  graphqlType: string
  fieldConfigs: GeneConfigTypes
}) {
  let objFieldConfigs = options.fieldConfigs

  options.typeDefLines[options.graphqlType] = {
    ...getDefaultTypeDefLinesObject(),
    ...options.typeDefLines[options.graphqlType],
  }

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
    if (fieldKey === 'geneConfig') return

    const normalizedFieldConfig = normalizeFieldConfig(fieldConfig)

    options.typeDefLines[options.graphqlType].lines[fieldKey] = {
      ...getDefaultFieldLinesObject(),
      ...options.typeDefLines[options.graphqlType].lines[fieldKey],
    }

    const fieldLineConfig = options.typeDefLines[options.graphqlType].lines[fieldKey]

    if (normalizedFieldConfig.returnType) {
      fieldLineConfig.typeDef = normalizedFieldConfig.returnType
    }

    if (isUsingDefaultResolver(normalizedFieldConfig)) {
      populateArgsDefForDefaultResolver({
        fieldLineConfig,
        graphqlType: options.graphqlType,
        fieldKey,
        isList: isListType(parseType(fieldLineConfig.typeDef)),
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
      const normalizedFieldConfig = normalizeFieldConfig(fieldConfig)
      if (!isUsingDefaultResolver(normalizedFieldConfig)) return

      generateDefaultQueryFilterTypeDefs({
        typeDefLines: options.typeDefLines,
        graphqlType,
        fieldKey,
        fieldType: getReturnTypeName(normalizedFieldConfig.returnType),
      })
    })
  })
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
