import path from 'path'

const config = {
  host: 'localhost',
  username: '',
  password: '',
  storage: path.resolve(__dirname, '../../database.sqlite'),
  dialect: 'sqlite',
  logging: false,
}

export default {
  development: config,
  test: config,
}
