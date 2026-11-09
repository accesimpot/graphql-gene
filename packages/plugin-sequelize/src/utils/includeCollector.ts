import type { DefaultResolverIncludeOptions } from '../types'

export type IncludeCollector = {
  root: CollectorFrame
  /** GraphQL type loaded with `root.include`. Unknown for unbound function targets. */
  targetType?: string
  isBound: boolean
}

export type CollectorFrame = {
  collector: IncludeCollector
  /** GraphQL type of the rows loaded by `include`. */
  type: string
  include: DefaultResolverIncludeOptions
  /** Set when `include` is attached to `parent.include.include`. */
  association?: string
  /** Writes to scratch frames are never returned by the collector. */
  isScratch: boolean
  /** Schema field names (alias-free), for error messages. */
  path: string
  depth: number
  parent?: CollectorFrame
}

export type FindOptionsHookContext = {
  /** Frame whose include is `details.findOptions` for this hook call. */
  frame: CollectorFrame
  /** Innermost frame of the selected occurrence; ancestry walks start here. */
  ancestryStart: CollectorFrame
  label: string
}

const FIND_OPTIONS_HOOK_CONTEXT = Symbol('geneFindOptionsHookContext')
const OCCURRENCE_FRAME = Symbol('geneOccurrenceFrame')
const BOUND_TARGET_OCCURRENCE = Symbol('geneBoundTargetOccurrence')

export function createIncludeCollector(rootType: string, targetType?: string): IncludeCollector {
  const collector = { targetType, isBound: false } as IncludeCollector
  collector.root = {
    collector,
    type: rootType,
    include: {},
    isScratch: false,
    path: rootType,
    depth: 0,
  }
  return collector
}

export function createScratchFrame(collector: IncludeCollector, type: string): CollectorFrame {
  return { collector, type, include: {}, isScratch: true, path: type, depth: 0 }
}

export function createChildFrame(
  parent: CollectorFrame,
  options: {
    type: string
    field: string
    include: DefaultResolverIncludeOptions
    association?: string
    isScratch?: boolean
  }
): CollectorFrame {
  return {
    collector: parent.collector,
    type: options.type,
    include: options.include,
    association: options.association,
    isScratch: options.isScratch ?? parent.isScratch,
    path: `${parent.path}.${options.field}`,
    depth: parent.depth + 1,
    parent,
  }
}

export function setFindOptionsHookContext(details: object, context: FindOptionsHookContext) {
  Reflect.set(details, FIND_OPTIONS_HOOK_CONTEXT, context)
}

export function getFindOptionsHookContext(details: object): FindOptionsHookContext | undefined {
  return Reflect.get(details, FIND_OPTIONS_HOOK_CONTEXT) as FindOptionsHookContext | undefined
}

/**
 * graphql-lookahead passes the same details object to `until`, `next` and `afterAllSelections`
 * for one selection; the include created in `next` is read back in `afterAllSelections`.
 */
export function rememberOccurrenceFrame(details: object, frame: CollectorFrame) {
  Reflect.set(details, OCCURRENCE_FRAME, frame)
}

export function getOccurrenceFrame(details: object): CollectorFrame | undefined {
  return Reflect.get(details, OCCURRENCE_FRAME) as CollectorFrame | undefined
}

export function markBoundTargetOccurrence(details: object) {
  Reflect.set(details, BOUND_TARGET_OCCURRENCE, true)
}

export function isBoundTargetOccurrence(details: object): boolean {
  return Reflect.get(details, BOUND_TARGET_OCCURRENCE) === true
}
