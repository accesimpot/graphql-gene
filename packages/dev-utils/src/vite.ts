import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import { defineConfig } from 'vite'
import type {
  PluginOption,
  LibraryFormats,
  AliasOptions,
  LibraryOptions,
  RollupCommonJSOptions,
} from 'vite'
import dts from 'vite-plugin-dts'

const SRC_DIR = 'src'
const DIST_DIR = 'dist'

enum PLUGIN_CATEGORIES {
  dts = 'dts',
}

export function generateViteConfig(options: {
  absoluteRootDir: string
  srcDir?: string
  distDir?: string
  alias?: AliasOptions
  pluginCategories?: `${PLUGIN_CATEGORIES}`[]
  formats?: LibraryFormats[]
  commonjsOptions?: RollupCommonJSOptions
  minify?: boolean
  entry?: LibraryOptions['entry']
  isLibrary?: boolean
  tsconfigPath?: string
  tsconfigPathForDts?: string
}) {
  const {
    absoluteRootDir,
    srcDir = SRC_DIR,
    distDir = DIST_DIR,
    alias,
    pluginCategories = [],
    formats = ['es'],
    commonjsOptions,
    minify,
    entry,
  } = options

  const isLibrary = typeof options.isLibrary === 'boolean' ? options.isLibrary : !options.entry

  const absoluteSrcDir = path.resolve(absoluteRootDir, srcDir)
  const absoluteDistDir = path.resolve(absoluteRootDir, distDir)

  const tsconfigPath = options.tsconfigPath || path.resolve(absoluteRootDir, 'tsconfig.compiler.json')

  const plugins: PluginOption[] = []

  const pluginGetters = {
    [`${PLUGIN_CATEGORIES.dts}`]: () =>
      dts({
        /**
         * We want to be able to provide a different tsconfig that excludes the ".ts" files that
         * already have a committed ".d.ts" in the "src" directory. This is making sure that
         * vite-plugin-dts won't override it with an auto-generated ".d.ts" file.
         */
        tsconfigPath: options.tsconfigPathForDts ?? tsconfigPath,
        outDir: absoluteDistDir,
        copyDtsFiles: true,
      }),
  }

  // Add plugins based on the "pluginCategories" option which is mapped to "pluginGetters".
  pluginCategories.forEach(pluginCategory => {
    plugins.push(pluginGetters[pluginCategory]())
  })

  return defineConfig({
    root: absoluteRootDir,
    resolve: {
      alias: { '@': absoluteSrcDir, ...alias },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      preventAssignment: true,
    },

    plugins,

    esbuild: {
      tsconfigRaw: fs.readFileSync(tsconfigPath, 'utf8'),
    },

    build: {
      target: 'ES2022',
      outDir: absoluteDistDir,
      lib: {
        entry: entry || getPreservedInputMapping(absoluteSrcDir),
        formats,
      },
      sourcemap: true,
      emptyOutDir: true,
      dynamicImportVarsOptions: { exclude: '**/*' },

      rollupOptions: {
        external: [...(isLibrary ? getDependenciesFromPackageJson(absoluteRootDir) : []), /^node:/],
      },
      commonjsOptions,

      minify,
    },
  })
}

/**
 * Generate the input object expected by Rollup to preserve the src directory structure in the
 * dist directory.
 * @see https://rollupjs.org/configuration-options/#input
 *
 * @param absoluteSrcDir - absolute path to src directory.
 */
function getPreservedInputMapping(absoluteSrcDir: string) {
  const entries = globSync('**/*.{ts,mts,cts}', { cwd: absoluteSrcDir }).filter(
    // Exclude .d.ts and .spec.ts files
    filePath => !/\.(d|spec)\.ts$/.test(filePath)
  )
  return Object.fromEntries(
    entries.map(filePath => [
      filePath.replace(/\.[mc]?[jt]s$/, ''),
      path.join(absoluteSrcDir, filePath),
    ])
  )
}

function getDependenciesFromPackageJson(absoluteRootDir: string): string[] {
  const pkgJsonFilePath = path.join(absoluteRootDir, 'package.json')
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonFilePath, 'utf-8')) as {
    dependencies: Record<string, string>
    peerDependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
  return Object.entries({
    ...pkgJson.dependencies,
    ...pkgJson.peerDependencies,
    ...pkgJson.devDependencies,
  })
    .filter(([, versionRange]) => /^workspace:/.test(versionRange))
    .map(([pkgName]) => pkgName)
}
