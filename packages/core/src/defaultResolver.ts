import {
  AND_OR_OPERATORS,
  BASIC_GRAPHQL_TYPE_VALUES,
  LIMIT_ARG_DEFAULT,
  QUERY_ORDER_VALUES,
  SKIP_ARG_DEFAULT,
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
          skip: 'Int',
          limit: 'Int',
        }
      : { id: 'String' }),
    locale: 'String',
    where: whereOptionsInputName,
    order: `[${orderEnumName}!]`,
  }
  Object.entries(argsDef).forEach(([argKey, argDef]) => {
    options.fieldLineConfig.argsDef[argKey] =
      options.fieldLineConfig.argsDef[argKey] || new Set<string>([])

    let def = argDef
    if (argKey === 'skip') def += ` = ${SKIP_ARG_DEFAULT}`
    if (argKey === 'limit') def += ` = ${LIMIT_ARG_DEFAULT}`

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
    lines[key] = { ...getDefaultFieldLinesObject(), ...lines[key], typeDef }
  })
  return lines
}

export type GenerateDefaultQueryFilterTypeDefsOptions = {
  typeDefLines: TypeDefLines
  /** GraphQL type that owns the field being filtered (e.g. `Order` for `items`). */
  graphqlType: string
  /** GraphQL field name that accepts the `where` argument (e.g. `items`). */
  fieldKey: string
  /** GraphQL type of the filtered records (e.g. `OrderItem`). */
  fieldType: string
  /**
   * When set, association fields on `fieldType` can use nested where inputs (one level per
   * decrement). Pass `1` on parent association list filters; nested inputs are generated at `0`
   * (scalars only).
   */
  associationFilterDepth?: 0 | 1
  /** Return true when `fieldType.fieldName` is a Sequelize association exposed in GraphQL. */
  isAssociationField?: (ownerGraphqlType: string, fieldName: string) => boolean
}

export function generateDefaultQueryFilterTypeDefs(
  options: GenerateDefaultQueryFilterTypeDefsOptions
) {
  const whereOptionsInputName = getWhereOptionsInputName(options.graphqlType, options.fieldKey)
  const orderEnumName = getQueryOrderEnumName(options.graphqlType, options.fieldKey)

  const hasWhereInputDefined = whereOptionsInputName in options.typeDefLines
  const hasOrderEnumDefined = orderEnumName in options.typeDefLines

  if (hasWhereInputDefined && hasOrderEnumDefined) return

  if (!hasWhereInputDefined) {
    createTypeDefLines(options.typeDefLines, 'input', whereOptionsInputName)

    // Add "and" and "or" operators
    AND_OR_OPERATORS.forEach(operator => {
      options.typeDefLines[whereOptionsInputName].lines[operator] = {
        ...getDefaultFieldLinesObject(),
        ...options.typeDefLines[whereOptionsInputName].lines[operator],
      }
      options.typeDefLines[whereOptionsInputName].lines[operator].typeDef =
        `[${whereOptionsInputName}!]`
    })
  }
  if (!hasOrderEnumDefined) {
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

  const associationFilterDepth = options.associationFilterDepth ?? 0

  Object.entries(options.typeDefLines[options.fieldType].lines).forEach(
    ([returnFieldKey, returnFieldConfig]) => {
      // Where Options Input
      options.typeDefLines[whereOptionsInputName].lines[returnFieldKey] = {
        ...getDefaultFieldLinesObject(),
        ...options.typeDefLines[whereOptionsInputName].lines[returnFieldKey],
      }

      const returnFieldType = { ...getDefaultFieldLinesObject(), ...returnFieldConfig }

      const validInputType = findValidInputType(returnFieldType.typeDef)
      let whereTypeDef = ''
      const isAssociation =
        options.isAssociationField?.(options.fieldType, returnFieldKey) ?? false
      const relatedGraphqlType = getReturnTypeName(returnFieldType.typeDef)

      if (validInputType) {
        const operatorInputName = getOperatorInputName(validInputType)
        operatorInputsToGenerate.add([operatorInputName, validInputType])
        whereTypeDef = operatorInputName
      } else if (isAssociation && associationFilterDepth > 0) {
        const nestedWhereInputName = getWhereOptionsInputName(options.fieldType, returnFieldKey)

        generateDefaultQueryFilterTypeDefs({
          typeDefLines: options.typeDefLines,
          graphqlType: options.fieldType,
          fieldKey: returnFieldKey,
          fieldType: relatedGraphqlType,
          associationFilterDepth: 0,
          isAssociationField: options.isAssociationField,
        })

        whereTypeDef = nestedWhereInputName
      } else if (isAssociation && associationFilterDepth === 0) {
        whereTypeDef = ''
      }
      // Non-association object fields (e.g. FK id filters on legacy paths)
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
      QUERY_ORDER_VALUES.forEach(orderValue => {
        const key = `${returnFieldKey}_${orderValue}`
        options.typeDefLines[orderEnumName].lines[key] = getDefaultFieldLinesObject()
      })
    }
  )
}
