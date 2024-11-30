import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fastify from 'fastify'
import { createYoga } from 'graphql-yoga'
import { sequelize } from '../models'
import { schema, schemaString, schemaHtml } from './schema'
import type { FastifyContext } from './types'

const PORT = 4000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isProduction = process.env.NODE_ENV === 'production'

const app = fastify({ logger: true })

if (!isProduction) {
  // Expose schema as HTML page with graphql syntax highlighting
  app.get('/schema', (_, reply) => reply.type('text/html').send(schemaHtml))

  // Generate a .gql file locally (no need to await)
  fs.promises.writeFile(path.resolve(__dirname, '../../schema.gql'), schemaString)
}

/**
 * @see https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-fastify
 */
const yoga = createYoga<FastifyContext>({
  schema,
  // Integrate Fastify logger
  logging: {
    debug: (...args) => args.forEach(arg => app.log.debug(arg)),
    info: (...args) => args.forEach(arg => app.log.info(arg)),
    warn: (...args) => args.forEach(arg => app.log.warn(arg)),
    error: (...args) => args.forEach(arg => app.log.error(arg)),
  },
  landingPage: !isProduction,
})

app.route({
  // Bind to the Yoga's endpoint to avoid rendering on any path
  url: yoga.graphqlEndpoint,
  method: ['GET', 'POST', 'OPTIONS'],

  handler: async (req, reply) => {
    // Second parameter adds Fastify's `req` and `reply` to the GraphQL Context
    const response = await yoga.handleNodeRequestAndResponse(req, reply, {
      req,
      reply,
    })
    response.headers.forEach((value, key) => reply.header(key, value))

    reply.status(response.status)
    reply.send(response.body)

    return reply
  },
})

// Connect to the database and start the server
await sequelize.authenticate()
console.info('\n🧪 Database connection was successful\n')

app.listen({ port: PORT }).then(() => {
  console.info(`\n🚀 Server is running on http://localhost:${PORT}/graphql\n`)
})
