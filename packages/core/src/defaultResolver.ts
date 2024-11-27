import {
  AND_OR_OPERATORS,
  BASIC_GRAPHQL_TYPE_VALUES,
  PAGE_ARG_DEFAULT,
  PER_PAGE_ARG_DEFAULT,
  QUERY_ORDER_VALUES,
} from './constants'
import type { FieldLines, TypeDefLines } from './types'
import { createTypeDefLines, getDefaultFieldLinesObject, getReturnTypeName } from './utils'

export const VALID_RETURN_TYPES_FOR_WHERE = [
  'String',
  'Int',
  'Float',
  'Boolean',
  'Date',
  'DateTime',
] as const

export function populateArgsDefForDefaultResolver(options: {
  fieldLineConfig: FieldLines[string]
  graphqlType: string
  fieldKey: string
  isList: boolean
}) {
  const whereOptionsInputName = getWhereOptionsInputName(options.graphqlType, options.fieldKey)
  const orderEnumName = getQueryOrderEnumName(options.graphqlType, options.fieldKey)

  const argsDef = {
    ...(options.isList
      ? {
          page: 'Int',
          perPage: 'Int',
        }
      : { id: 'String' }),
    locale: 'String',
    where: whereOptionsInputName,

    ...(options.isList ? { order: `[${orderEnumName}!]` } : {}),
  }
  Object.entries(argsDef).forEach(([argKey, argDef]) => {
    options.fieldLineConfig.argsDef[argKey] =
      options.fieldLineConfig.argsDef[argKey] || new Set<string>([])

    let def = argDef
    // Set default values
    if (argKey === 'page') def += ` = ${PAGE_ARG_DEFAULT}`
    if (argKey === 'perPage') def += ` = ${PER_PAGE_ARG_DEFAULT}`

    options.fieldLineConfig.argsDef[argKey].add(def)
  })
}

export function getWhereOptionsInputName<TType extends string, TField extends string>(
  typeName: TType,
  fieldName: TField
) {
  return generateGraphqlTypeName(typeName, fieldName, 'WhereOptions')
}

export function getQueryOrderEnumName<TType extends string, TField extends string>(
  typeName: TType,
  fieldName: TField
) {
  return generateGraphqlTypeName(typeName, fieldName, 'SelectOrder')
}

export function generateGraphqlTypeName<
  TType extends string,
  TField extends string,
  TSuffix extends string,
>(typeName: string, fieldName: string, suffix: TSuffix) {
  const pascal = (name: string) => `${name[0].toUpperCase()}${name.substring(1)}`
  return [typeName, suffix, fieldName]
    .map(pascal)
    .join('') as `${Capitalize<TType>}${Capitalize<TSuffix>}${Capitalize<TField>}`
}

export function getOperatorInputName(
  graphqlType: (typeof VALID_RETURN_TYPES_FOR_WHERE)[number]
): `GeneOperator${string}Input` {
  return `GeneOperator${graphqlType}Input`
}

export function generateOperatorInputLines(
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

export function generateDefaultQueryFilterTypeDefs(options: {
  typeDefLines: TypeDefLines
  graphqlType: string
  fieldKey: string
  fieldType: string
  isList: boolean
}) {
  const whereOptionsInputName = getWhereOptionsInputName(options.graphqlType, options.fieldKey)
  const orderEnumName = getQueryOrderEnumName(options.graphqlType, options.fieldKey)

  const hasWhereInputDefined = whereOptionsInputName in options.typeDefLines
  const hasOrderEnumDefined = orderEnumName in options.typeDefLines
  const hasOrderEnum = options.isList

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

  if (options.fieldType && BASIC_GRAPHQL_TYPE_VALUES.includes(options.fieldType as 'ID')) return

  if (!(options.fieldType in options.typeDefLines)) {
    throw new Error(`Cannot find "${options.fieldType}" definition used as "returnType".`)
  }

  const findValidInputType = (type: string) => {
    return VALID_RETURN_TYPES_FOR_WHERE.find(validType => validType === getReturnTypeName(type))
  }
  const operatorInputsToGenerate = new Set<
    [string, NonNullable<ReturnType<typeof findValidInputType>>]
  >([])

  Object.entries(options.typeDefLines[options.fieldType].lines).forEach(
    ([returnFieldKey, returnFieldType]) => {
      // Where Options Input
      options.typeDefLines[whereOptionsInputName].lines[returnFieldKey] =
        options.typeDefLines[whereOptionsInputName].lines[returnFieldKey] ||
        getDefaultFieldLinesObject()

      const validInputType = findValidInputType(returnFieldType.typeDef)
      let whereTypeDef = ''

      if (validInputType) {
        const operatorInputName = getOperatorInputName(validInputType)
        operatorInputsToGenerate.add([operatorInputName, validInputType])
        whereTypeDef = operatorInputName
      }
      // If the return type is another Graphql Type because the field is an association
      else if (returnFieldType.typeDef in options.typeDefLines) {
        for (const key in options.typeDefLines[returnFieldType.typeDef].lines) {
          if (key === 'id') {
            const validInputType = findValidInputType(
              options.typeDefLines[returnFieldType.typeDef].lines[key].typeDef
            )
            if (validInputType) {
              const operatorInputName = getOperatorInputName(validInputType)
              operatorInputsToGenerate.add([operatorInputName, validInputType])
              whereTypeDef = operatorInputName
            }
            break
          }
        }
      }

      operatorInputsToGenerate.forEach(([operatorInputName, validInputType]) => {
        if (!(operatorInputName in options.typeDefLines)) {
          createTypeDefLines(options.typeDefLines, 'input', operatorInputName)

          options.typeDefLines[operatorInputName].lines = generateOperatorInputLines(validInputType)
        }
      })

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
