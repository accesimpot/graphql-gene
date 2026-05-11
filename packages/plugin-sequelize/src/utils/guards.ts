import type { Association, ModelStatic } from 'sequelize'
import { Model } from 'sequelize-typescript'

export type SequelizeModelClass = typeof Model & {
  associations: Record<string, Association>
  name: string
}

export type ModelInstanceWithClass = Model & { constructor: SequelizeModelClass }

export type AssociationJoinColumns = Association & { foreignKey: string; sourceKey: string }

function readAssociationsRaw(ctor: unknown): unknown {
  let current: unknown = ctor

  while (typeof current === 'function') {
    const desc = Object.getOwnPropertyDescriptor(current, 'associations')
    if (desc !== undefined) return desc.value

    current = Object.getPrototypeOf(current)
  }
  return undefined
}

export function isAssociationRecord(value: unknown): value is Record<string, Association> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSequelizeModelClass(ctor: unknown): ctor is SequelizeModelClass {
  if (typeof ctor !== 'function') return false

  const raw = readAssociationsRaw(ctor)
  return isAssociationRecord(raw)
}

export function isModel(value: unknown): value is ModelInstanceWithClass {
  return value instanceof Model && isSequelizeModelClass(value.constructor)
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSafeArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function hasAssociationJoinColumns(assoc: Association): assoc is AssociationJoinColumns {
  const foreignKey = Reflect.get(assoc, 'foreignKey')
  const sourceKey = Reflect.get(assoc, 'sourceKey')

  return typeof foreignKey === 'string' && typeof sourceKey === 'string'
}

export function isSequelizeModelStatic(value: unknown): value is ModelStatic<Model> {
  return (
    typeof value === 'function' &&
    typeof Reflect.get(value, 'findAll') === 'function' &&
    typeof Reflect.get(value, 'count') === 'function'
  )
}
