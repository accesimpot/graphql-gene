import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Sequelize } from 'sequelize-typescript'
import * as models from './models'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const sequelize = new Sequelize('database', '', '', {
  dialect: 'sqlite',
  models: Object.values(models),
  storage: path.resolve(__dirname, '../../database.sqlite'),
  logging: false,
})
