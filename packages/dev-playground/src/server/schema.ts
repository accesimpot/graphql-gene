import { generateSchema } from 'graphql-gene'
import * as graphqlTypes from '../models/graphqlTypes'

const { schema, schemaString, schemaHtml } = generateSchema({ types: graphqlTypes })

export { schema, schemaString, schemaHtml }
