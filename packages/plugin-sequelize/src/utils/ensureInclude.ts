import type { GraphqlTypes } from 'graphql-gene'
import type { DefaultResolverIncludeOptions } from '../types'
import type { AssociationPathOf } from '../toGqlSource'
import {
  getFindOptionsHookContext,
  type CollectorFrame,
  type FindOptionsHookContext,
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
  /** Sequelize INNER JOIN on the leaf only. Never reset to `false` once requested. */
  required?: boolean
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

  let parent = root
  segments.forEach((segment, index) => {
    parent.include = parent.include || []
    const existing = parent.include.find(include => include.association === segment)

    if (existing && hasRowFilter(existing)) {
      throw createRowFilterConflictError(segment, path, label)
    }
    const include = existing || { association: segment }
    if (!existing) {
      parent.include.push(include)
      if (options.hydrate !== false) markGeneHydrationInclude(include)
    }
    // Every segment is marked so hydration shallowing keeps the whole path.
    markGeneEnsuredInclude(include)

    if (index === segments.length - 1 && options.required) include.required = true
    parent = include
  })
  return parent
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

function findAnchorFrame(
  context: FindOptionsHookContext,
  ancestorType: string,
  at: 'nearest' | 'root'
): CollectorFrame | undefined {
  const { collector } = context.frame
  const rootMatches = collector.targetType === ancestorType

  if (at === 'root') return rootMatches ? collector.root : undefined

  for (let frame: CollectorFrame | undefined = context.ancestryStart; frame; frame = frame.parent) {
    if (frame.type === ancestorType) return frame.isScratch ? undefined : frame
  }
  return rootMatches ? collector.root : undefined
}

/**
 * Ensures `path` under an ancestor include of `ancestorType`. Returns `undefined` when the active
 * collector does not load that ancestor (another collector owns the dependency).
 */
export function ensureIncludeBehind<TType extends string>(
  details: object,
  path: TType extends keyof GraphqlTypes ? AssociationPathOf<GraphqlTypes[TType]> : string,
  ancestorType: TType,
  options: EnsureIncludeBehindOptions = {}
): DefaultResolverIncludeOptions | undefined {
  const context = requireFindOptionsHookContext(details, 'ensureIncludeBehind')
  const anchor = findAnchorFrame(context, ancestorType, options.at ?? 'nearest')
  if (!anchor) return undefined
  return ensureIncludePath(anchor.include, path, options, context.label)
}
