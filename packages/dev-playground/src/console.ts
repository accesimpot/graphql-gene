/**
 * Inspired by
 * @see https://medium.com/@vemarav/build-rails-like-console-in-nodejs-repl-2459fb5d387b
 */
import repl from 'node:repl'
import * as models from './models'
import { sequelize } from './models/sequelize'

Object.keys(models).forEach(modelName => {
  // @ts-expect-error Types are not important in console
  globalThis[modelName] = models[modelName]
  // @ts-expect-error Types are not important in console
  globalThis.sequelize = sequelize
})

const replServer = repl.start({ prompt: 'playground > ' })

replServer.context.db = models
