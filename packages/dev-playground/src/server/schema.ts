import {
  DateTypeDefinition,
  DateTimeTypeDefinition,
  DateResolver,
  DateTimeResolver,
} from 'graphql-scalars'
import { generateSchema } from 'graphql-gene'
import { pluginSequelize } from '@graphql-gene/plugin-sequelize'
import * as graphqlTypes from '../models/graphqlTypes'

const { schema, schemaString, schemaHtml } = generateSchema({
  schema: [DateTypeDefinition, DateTimeTypeDefinition].join('\n'),
  resolvers: {
    Date: DateResolver,
    DateTime: DateTimeResolver,
  },
  plugins: [pluginSequelize()],
  types: graphqlTypes,
  dataTypeMap: {
    BIGINT: 'Float',
  },
})

export { schema, schemaString, schemaHtml }
