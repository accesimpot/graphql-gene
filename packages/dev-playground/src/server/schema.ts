import { DateResolver, DateTimeResolver } from 'graphql-scalars'
import { generateSchema } from 'graphql-gene'
import { pluginSequelize } from '@graphql-gene/plugin-sequelize'
import { sequelize } from '../models/sequelize'
import * as graphqlTypes from '../models/graphqlTypes'

const { schema, schemaString, schemaHtml, typeDefs, resolvers } = generateSchema({
  resolvers: {
    Date: DateResolver,
    DateTime: DateTimeResolver,
  },
  plugins: [pluginSequelize({ sequelize })],
  types: graphqlTypes,
  dataTypeMap: {
    BIGINT: 'Float',
  },
})

export { schema, schemaString, schemaHtml, typeDefs, resolvers }
