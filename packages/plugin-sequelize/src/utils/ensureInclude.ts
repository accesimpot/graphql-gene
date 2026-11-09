import type { DefaultResolverIncludeOptions } from '../types'
import { getFindOptionsHookContext, type FindOptionsHookContext } from './includeCollector'
import { markGeneEnsuredInclude, markGeneHydrationInclude } from './includePostProcess'

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
  const hydrate = options.hydrate !== false

  let parent = root
  segments.forEach((segment, index) => {
    parent.include = parent.include || []
    const existing = parent.include.find(include => include.association === segment)

    if (existing && hasRowFilter(existing)) {
      throw new Error(
        `${ERROR_PREFIX} Cannot ensure include "${segment}" (path "${path}") in ${label}: ` +
          `the same association is already included with where/limit/offset.`
      )
    }
    const include = existing || markGeneEnsuredInclude({ association: segment })
    if (!existing) {
      parent.include.push(include)
      if (hydrate) markGeneHydrationInclude(include)
    }

    const isLeaf = index === segments.length - 1
    if (isLeaf) {
      if (existing && hydrate && !existing.include?.length) markGeneHydrationInclude(existing)
      if (options.required) include.required = true
    }
    parent = include
  })
  return parent
}

export function requireFindOptionsHookContext(
  details: object,
  helper: string
): FindOptionsHookContext {
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
