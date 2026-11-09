import type { GraphqlTypes, ValidGraphqlType } from 'graphql-gene'
import type { DefaultResolverIncludeOptions } from '../types'
import type { AssociationPathOf } from '../toGqlSource'
import {
  getFindOptionsHookContext,
  type CollectorFrame,
  type FindOptionsHookContext,
  type IncludeCollector,
} from './includeCollector'
import {
  isGeneEnsuredInclude,
  markGeneEnsuredInclude,
  markGeneHydrationInclude,
} from './includePostProcess'

const ERROR_PREFIX = '[graphql-gene]'

export type EnsureIncludeOptions = {
  /** Default `true`: keep list-wrapper associations on parent fetches. */
  hydrate?: boolean
  /** Sequelize INNER JOIN on the leaf only. Omit it to leave `required` unchanged. */
  required?: true
}

function hasRowFilter(include: DefaultResolverIncludeOptions) {
  return include.where !== undefined || include.limit !== undefined || include.offset !== undefined
}

function createRowFilterConflictError(association: string, path: string, label: string) {
  return new Error(
    `${ERROR_PREFIX} Cannot ensure include "${path}" in ${label}: ` +
      `"${association}" is already included with where/limit/offset.`
  )
}

/**
 * An ensured include is shared and unfiltered, so a selection that filters the same association
 * has to fail whichever of the two is collected first.
 */
export function assertNoEnsuredRowFilterConflict(
  siblings: DefaultResolverIncludeOptions[],
  association: string,
  include: DefaultResolverIncludeOptions,
  label: string
) {
  if (
    hasRowFilter(include) &&
    siblings.some(sibling => sibling.association === association && isGeneEnsuredInclude(sibling))
  ) {
    throw createRowFilterConflictError(association, association, label)
  }
}

export function ensureIncludePath(
  root: DefaultResolverIncludeOptions,
  path: string,
  options: EnsureIncludeOptions,
  label: string
): DefaultResolverIncludeOptions {
  const segments = path.split('.')
  if (segments.some(segment => !segment)) {
    throw new Error(`${ERROR_PREFIX} Invalid include path "${path}" in ${label}.`)
  }

  return applyPath(root, segments, 0, options, path, label)
}

/**
 * The same association can be selected more than once (aliases, fragments). Each of those includes
 * is loaded separately, so the path has to be added to every one of them.
 */
function applyPath(
  parent: DefaultResolverIncludeOptions,
  segments: string[],
  index: number,
  options: EnsureIncludeOptions,
  path: string,
  label: string
): DefaultResolverIncludeOptions {
  const segment = segments[index]
  const isLeaf = index === segments.length - 1
  parent.include = parent.include || []
  const matches = parent.include.filter(include => include.association === segment)

  if (matches.some(hasRowFilter)) throw createRowFilterConflictError(segment, path, label)

  if (!matches.length) {
    const created = { association: segment }
    parent.include.push(created)
    if (options.hydrate !== false) markGeneHydrationInclude(created)
    matches.push(created)
  }

  let firstLeaf: DefaultResolverIncludeOptions | undefined
  for (const include of matches) {
    // Every segment is marked so hydration shallowing keeps the whole path.
    markGeneEnsuredInclude(include, options.hydrate !== false)
    const leaf = isLeaf ? include : applyPath(include, segments, index + 1, options, path, label)
    if (isLeaf && options.required) include.required = true
    firstLeaf ??= leaf
  }
  return firstLeaf!
}

function requireFindOptionsHookContext(details: object, helper: string): FindOptionsHookContext {
  const context = getFindOptionsHookContext(details)
  if (!context) {
    throw new Error(
      `${ERROR_PREFIX} ${helper} must be called from a findOptions hook during include collection.`
    )
  }
  return context
}

/** Ensures `path` (dot-separated associations) under the include this hook received. */
export function ensureInclude(
  details: object,
  path: string,
  options: EnsureIncludeOptions = {}
): DefaultResolverIncludeOptions {
  const context = requireFindOptionsHookContext(details, 'ensureInclude')
  return ensureIncludePath(context.frame.include, path, options, context.label)
}

export type EnsureIncludeBehindOptions = EnsureIncludeOptions & {
  /**
   * `'nearest'` (default): closest selected ancestor of `ancestorType`, else the collector root
   * when it targets `ancestorType`. `'root'`: only the collector root.
   */
  at?: 'nearest' | 'root'
}

const UNBOUND_TARGET = Symbol('unboundIncludeTarget')

/**
 * Not finding an ancestor is a valid no-op when another collector owns the dependency, but a type
 * that does not exist can never be found and would silently drop the dependency.
 */
function assertAncestorTypeExists(context: FindOptionsHookContext, ancestorType: string) {
  if (!context.schema || context.schema.getType(ancestorType)) return

  const ancestry: string[] = []
  for (let frame: CollectorFrame | undefined = context.ancestryStart; frame; frame = frame.parent) {
    ancestry.push(frame.type || '(unbound target)')
  }
  const { targetType } = context.frame.collector
  throw new Error(
    `${ERROR_PREFIX} ensureIncludeBehind in ${context.label}: ancestor type "${ancestorType}" ` +
      `is not in the schema (collector target: ${targetType ?? 'unbound'}, ` +
      `ancestry: ${ancestry.join(' < ')}).`
  )
}

function findAnchorFrame(
  context: FindOptionsHookContext,
  ancestorType: string,
  at: 'nearest' | 'root'
): CollectorFrame | typeof UNBOUND_TARGET | undefined {
  const { collector } = context.frame
  const rootMatches = collector.targetType === ancestorType
  const targetStillUnknown = !collector.isBound && collector.targetType == null
  const unboundRoot = () => (targetStillUnknown ? UNBOUND_TARGET : undefined)

  if (at === 'root') return rootMatches ? collector.root : unboundRoot()

  for (let frame: CollectorFrame | undefined = context.ancestryStart; frame; frame = frame.parent) {
    if (frame.type === ancestorType) return frame.isScratch ? undefined : frame
  }
  return rootMatches ? collector.root : unboundRoot()
}

export function flushPendingRootIncludes(collector: IncludeCollector) {
  const pending = collector.pendingRootIncludes.splice(0)
  for (const item of pending) {
    if (collector.targetType !== item.ancestorType) continue
    ensureIncludePath(collector.root.include, item.path, item.options, item.label)
  }
}

/**
 * Ensures `path` under an ancestor include of `ancestorType`. Returns `undefined` when the active
 * collector does not load that ancestor (another collector owns the dependency).
 */
export function ensureIncludeBehind<TType extends ValidGraphqlType>(
  details: object,
  path: TType extends keyof GraphqlTypes ? AssociationPathOf<GraphqlTypes[TType]> : string,
  ancestorType: TType,
  options: EnsureIncludeBehindOptions = {}
): DefaultResolverIncludeOptions | undefined {
  const context = requireFindOptionsHookContext(details, 'ensureIncludeBehind')
  assertAncestorTypeExists(context, ancestorType)
  const anchor = findAnchorFrame(context, ancestorType, options.at ?? 'nearest')
  if (anchor === UNBOUND_TARGET) {
    context.frame.collector.pendingRootIncludes.push({
      ancestorType,
      path,
      options,
      label: context.label,
    })
    return undefined
  }
  if (!anchor) return undefined
  return ensureIncludePath(anchor.include, path, options, context.label)
}
