import { GraphQLInterfaceType, GraphQLSchema, GraphQLUnionType } from 'graphql'

declare global {
  var __graphqlGenePolymorphicAbstractTypeNames: Set<string> | undefined
}

function registeredPolymorphicAbstractTypeNames(): Set<string> {
  globalThis.__graphqlGenePolymorphicAbstractTypeNames ??= new Set<string>()
  return globalThis.__graphqlGenePolymorphicAbstractTypeNames
}

/**
 * Called from `@Polymorphic` when the Sequelize plugin defines a polymorphic GraphQL abstract type
 * (typically an `interface`).
 */
export function registerPolymorphicAbstractType(graphqlTypeName: string): void {
  registeredPolymorphicAbstractTypeNames().add(graphqlTypeName)
}

/**
 * True when `graphqlTypeName` was registered via {@link registerPolymorphicAbstractType}
 * (for example by the Sequelize `@Polymorphic` hub decorator).
 */
export function isRegisteredPolymorphicAbstractType(graphqlTypeName: string): boolean {
  return registeredPolymorphicAbstractTypeNames().has(graphqlTypeName)
}

/**
 * For values produced from Sequelize models or plain objects, prefer GraphQL `__typename`;
 * otherwise fall back to `constructor.name`.
 */
export function polymorphicConcreteTypeName(source: unknown): string | undefined {
  if (source === null || source === undefined || typeof source !== 'object') return undefined

  const rec = source as { __typename?: unknown; constructor?: { name?: string } }

  if (typeof rec.__typename === 'string' && rec.__typename.length > 0) return rec.__typename

  const fromCtor = rec.constructor?.name
  if (typeof fromCtor === 'string' && fromCtor.length > 0 && fromCtor !== 'Object') return fromCtor

  return undefined
}

/**
 * Wires graphql-js `resolveType` on interface/union abstract types registered via
 * `registerPolymorphicAbstractType`.
 */
export function attachPolymorphicAbstractResolveTypes(schema: GraphQLSchema): void {
  for (const typeName of registeredPolymorphicAbstractTypeNames()) {
    const gqlType = schema.getType(typeName)

    if (
      !gqlType ||
      (!(gqlType instanceof GraphQLInterfaceType) && !(gqlType instanceof GraphQLUnionType))
    ) {
      continue
    }
    gqlType.resolveType = source => polymorphicConcreteTypeName(source)
  }
}
