import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { WORKSPACE_ROOT_PATH } from 'dev-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('README', async () => {
  const [coreReadme, rootReadme] = await Promise.all(
    [__dirname, WORKSPACE_ROOT_PATH].map(dirPath =>
      fs.promises.readFile(path.resolve(dirPath, './README.md'), 'utf-8')
    )
  )

  it('is a copy of the README at the root level of the monorepo', () => {
    expect(coreReadme).toEqual(rootReadme)
  })
})
