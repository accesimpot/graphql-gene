import { generateViteConfig } from 'dev-utils'

export default generateViteConfig({
  absoluteRootDir: __dirname,
  formats: ['es', 'cjs'], // support both formats
  pluginCategories: ['dts'],
  isLibrary: true,
})
