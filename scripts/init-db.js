const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');
const { seedDatabase } = require('./seed-db');

async function readSql(fileName) {
  const filePath = path.join(__dirname, '..', 'sql', fileName);
  return fs.readFile(filePath, 'utf8');
}

async function runSql(connection, sql, label) {
  if (!sql.trim()) {
    return;
  }

  await connection.query(sql);
  console.log(`• ${label} 已完成`);
}

async function main() {
  console.log('开始初始化教学管理系统数据库...');

  const rootConnection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined
  });

  try {
    const databaseSql = await readSql('database.sql');
    const resolvedDatabaseSql = databaseSql.replace(/teaching_management/g, config.db.database);
    await runSql(rootConnection, resolvedDatabaseSql, `数据库 ${config.db.database} 创建`);
  } finally {
    await rootConnection.end();
  }

  const appConnection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined
  });

  try {
    const schemaSql = await readSql('schema.sql');

    await runSql(appConnection, schemaSql, '数据表与约束初始化');
    await seedDatabase(appConnection);
    console.log('• 示例数据导入');

    console.log('数据库初始化完成，可以启动项目了。');
  } finally {
    await appConnection.end();
  }
}

main().catch((error) => {
  console.error('数据库初始化失败：', error.message);
  process.exit(1);
});
