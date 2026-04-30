import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const RAW_SUFFIX = '?raw'
const RESOLVED_PREFIX = 'raw-inline/'

/**
 * Handles `?raw` imports like Vite, but emits plain sibling chunks (no `?` in import paths) so Node's
 * ESM resolver matches generated filenames when this library is executed from `dist/`.
 *
 * Reads the resolved file as UTF-8 text (same limitation as typical string `?raw` usage).
 *
 * Virtual ids use base64url over the absolute path so Rolldown does not infer asset types from the id.
 */
export function rawInlinePlugin(): Plugin {
  return {
    name: 'raw-inline',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer) return undefined

      const pathWithoutQuery = stripRawSuffix(id)
      if (pathWithoutQuery === undefined) return undefined

      const resolvedPath = path.isAbsolute(pathWithoutQuery)
        ? pathWithoutQuery
        : path.resolve(path.dirname(importer), pathWithoutQuery)

      // Paths ending in .html may still trigger HTML asset detection, so we use base64url.
      const token = Buffer.from(resolvedPath, 'utf8').toString('base64url')
      return `${RESOLVED_PREFIX}${token}`
    },

    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return undefined

      const token = id.slice(RESOLVED_PREFIX.length)
      const resolvedPath = Buffer.from(token, 'base64url').toString('utf8')
      const text = fs.readFileSync(resolvedPath, 'utf8')

      return `export default ${JSON.stringify(text)}`
    },
  }
}

function stripRawSuffix(id: string): string | undefined {
  return id.endsWith(RAW_SUFFIX) ? id.slice(0, -RAW_SUFFIX.length) : undefined
}
