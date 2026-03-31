const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const config = require('./env');

function createSessionMiddleware() {
  const MySQLStore = MySQLStoreFactory(session);

  const store = new MySQLStore({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 7 * 24 * 60 * 60 * 1000
  });

  return session({
    key: 'tm.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction
    }
  });
}

module.exports = createSessionMiddleware;
