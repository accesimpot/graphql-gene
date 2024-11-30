import { Sequelize } from 'sequelize-typescript'
import * as models from './models'

export * from './models'

export const sequelize = new Sequelize('database', '', '', {
  dialect: 'sqlite',
  models: Object.values(models),
  storage: 'database.sqlite',
  logging: false,
})
