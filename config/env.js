const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env') });

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return {};
  }

  try {
    const parsed = new URL(databaseUrl);

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : undefined
    };
  } catch (error) {
    return {};
  }
}

const parsedDatabaseUrl = parseDatabaseUrl(process.env.DATABASE_URL);
const parsedMysqlUrl = parseDatabaseUrl(process.env.MYSQL_URL);

const config = {
  appName: '教学管理系统',
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'teaching_management_secret',
  db: {
    host: process.env.DB_HOST || process.env.MYSQLHOST || parsedDatabaseUrl.host || parsedMysqlUrl.host || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || parsedDatabaseUrl.port || parsedMysqlUrl.port || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || parsedDatabaseUrl.user || parsedMysqlUrl.user || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || parsedDatabaseUrl.password || parsedMysqlUrl.password || '123456',
    database:
      process.env.DB_NAME || process.env.MYSQLDATABASE || parsedDatabaseUrl.database || parsedMysqlUrl.database || 'teaching_management',
    ssl: (process.env.DB_SSL || 'false').toLowerCase() === 'true'
  }
};

config.isProduction = config.nodeEnv === 'production';

module.exports = config;
