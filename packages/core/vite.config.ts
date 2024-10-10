import { generateViteConfig } from 'dev-utils'

export default generateViteConfig({
  absoluteRootDir: __dirname,
  formats: ['es', 'cjs'],
  pluginCategories: ['dts'],
  isLibrary: true,
})
