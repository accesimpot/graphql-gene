import type { DefaultResolverIncludeOptions } from '../types'

export type CollectorFrame = {
  collector: IncludeCollector
  /** GraphQL type of the rows loaded by `include`. */
  type: string
  include: DefaultResolverIncludeOptions
  /** Set when `include` is attached to `parent.include.include`. */
  association?: string
  /** Writes to scratch frames are never returned by the collector. */
  isScratch: boolean
  /** Number of selection levels between the scan start and this frame. */
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

export class IncludeCollector {
  readonly root: CollectorFrame
  /** GraphQL type loaded with `root.include`. Unknown for unbound function targets. */
  targetType?: string
  isBound = false

  constructor(rootType: string, targetType?: string, include: DefaultResolverIncludeOptions = {}) {
    this.targetType = targetType
    this.root = {
      collector: this,
      type: rootType,
      include,
      isScratch: false,
      depth: 0,
    }
  }
}

export function createScratchFrame(collector: IncludeCollector, type: string): CollectorFrame {
  return { collector, type, include: {}, isScratch: true, depth: 0 }
}

export function createChildFrame(
  parent: CollectorFrame,
  options: {
    type: string
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
    depth: parent.depth + 1,
    parent,
  }
}

/**
 * graphql-lookahead passes the same details object to `until`, `next` and `afterAllSelections`
 * for one selection, and hooks hand it back to `ensureInclude`, so it keys the per-selection data.
 */
const hookContexts = new WeakMap<object, FindOptionsHookContext>()
const occurrenceFrames = new WeakMap<object, CollectorFrame>()
const boundTargetOccurrences = new WeakSet<object>()

export const setFindOptionsHookContext = (details: object, context: FindOptionsHookContext) =>
  hookContexts.set(details, context)

export const getFindOptionsHookContext = (details: object) => hookContexts.get(details)

export const rememberOccurrenceFrame = (details: object, frame: CollectorFrame) =>
  occurrenceFrames.set(details, frame)

export const getOccurrenceFrame = (details: object) => occurrenceFrames.get(details)

export const markBoundTargetOccurrence = (details: object) => boundTargetOccurrences.add(details)

export const isBoundTargetOccurrence = (details: object) => boundTargetOccurrences.has(details)

/**
 * Context for hooks that run outside a collection (e.g. a type's `findOptions` applied to an
 * association facet), where `include` is the root of the load.
 */
export function createRootHookContext(
  type: string,
  include: DefaultResolverIncludeOptions
): FindOptionsHookContext {
  const { root } = new IncludeCollector(type, type, include)
  return { frame: root, ancestryStart: root, label: `${type}.findOptions` }
}
