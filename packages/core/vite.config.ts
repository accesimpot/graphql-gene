import path from 'node:path'
import { generateViteConfig } from 'dev-utils'

export default generateViteConfig({
  absoluteRootDir: __dirname,
  pluginCategories: ['dts'],
  tsconfigPathForDts: path.resolve(__dirname, './tsconfig.vite-plugin-dts.json'),
})
