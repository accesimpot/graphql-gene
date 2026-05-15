import path from 'path'
import { generateViteConfig } from 'dev-utils'

export default generateViteConfig({
  absoluteRootDir: __dirname,
  distDir: 'cjs',
  formats: ['cjs'],
  entry: {
    'database/sequelize.config': path.resolve(__dirname, './src/database/sequelize.config.ts'),
  },
  tsconfigPath: path.resolve(__dirname, './tsconfig.cjs.json'),
  minify: false,
})
