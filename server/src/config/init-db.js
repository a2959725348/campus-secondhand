import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { applyMigrations } from './migrate.js';
import { bootstrapAdmin, readAdminConfig } from './admin-bootstrap.js';

const name = process.env.DB_NAME;
if (!name || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw Error('DB_NAME 需为合法数据库名称');
const admin = readAdminConfig();
const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  multipleStatements: true,
});
try {
  const [[exists]] = await conn.execute('SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=?', [name]);
  if (exists.count > 0) throw Error('目标库已有数据表，初始化停止。升级请运行 npm run db:migrate，原数据保留。');
  const schema = await readFile(new URL('../../sql/schema.sql', import.meta.url), 'utf8');
  await conn.query(schema.replaceAll('campus_trade', name));
  await applyMigrations(conn);
  await conn.beginTransaction();
  try {
    await conn.query(await readFile(new URL('../../sql/seed.sql', import.meta.url), 'utf8'));
    await bootstrapAdmin(conn, admin);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
  console.log('数据库、分类及管理员初始化完成');
} finally {
  await conn.end();
}
