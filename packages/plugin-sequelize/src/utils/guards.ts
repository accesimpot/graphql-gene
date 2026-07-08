import type { Association, ModelStatic } from 'sequelize'
import { Model } from 'sequelize-typescript'

export type SequelizeModelClass = typeof Model & {
  associations: Record<string, Association>
  name: string
}

export type ModelInstanceWithClass = Model & { constructor: SequelizeModelClass }

export type AssociationJoinColumns = Association & { foreignKey: string; sourceKey: string }

export function isModel(value: unknown): value is ModelInstanceWithClass {
  return value instanceof Model && isModelStaticWithAssociations(value.constructor)
}

export function isModelStaticWithAssociations(value: unknown): value is SequelizeModelClass {
  return isModelStatic(value) && readAssociations(value) !== undefined
}

export function isModelStatic(value: unknown): value is ModelStatic<Model> {
  return typeof value === 'function' && value.prototype instanceof Model
}

/**
 * Reads the first `associations` object on a model constructor or its prototypes.
 * Returns it only when the value is a plain record (not `null` or an array).
 */
function readAssociations(ctor: unknown): Record<string, Association> | undefined {
  let current: unknown = ctor

  while (typeof current === 'function') {
    const desc = Object.getOwnPropertyDescriptor(current, 'associations')
    if (desc !== undefined) {
      return isPlainRecord(desc.value) ? (desc.value as Record<string, Association>) : undefined
    }

    current = Object.getPrototypeOf(current)
  }
  return undefined
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Wrapper around `Array.isArray` to ensure the type returned is `unknown[]` and not `any[]`.
 */
export function isSafeArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function hasAssociationJoinColumns(assoc: Association): assoc is AssociationJoinColumns {
  const foreignKey = Reflect.get(assoc, 'foreignKey')
  const sourceKey = Reflect.get(assoc, 'sourceKey')

  return typeof foreignKey === 'string' && typeof sourceKey === 'string'
}

/** GraphQL introspection types and other schema internals use a `__` name prefix. */
export function isInternalGraphqlType(typeName: string): boolean {
  return typeName.startsWith('__')
}
