import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function statements(file) {
  const sql = await readFile(new URL(`../../sql/migrations/${file}`, import.meta.url), 'utf8');
  return sql.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function hasProductionChange(db, schema, statement) {
  const alter = /^ALTER TABLE (\w+) (ADD|MODIFY) COLUMN (\w+)/.exec(statement);
  if (!alter) return false;
  const [, table, operation, column] = alter;
  const [[row]] = await db.execute(
    'SELECT COLUMN_TYPE AS columnType FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [schema, table, column],
  );
  return operation === 'ADD' ? Boolean(row) : row?.columnType.includes("'shipped'");
}

export async function applyMigrations(db) {
  const [[{ schema }]] = await db.query('SELECT DATABASE() AS \`schema\`');
  if (!schema) throw Error('迁移前请选定目标数据库');

  for (const statement of await statements('002_community.sql')) {
    if (statement.startsWith('ALTER TABLE orders')) {
      const [indexes] = await db.query("SHOW INDEX FROM orders WHERE Key_name='uk_orders_active_item'");
      if (indexes.length) continue;
    }
    await db.query(statement);
  }

  for (const statement of await statements('003_books.sql')) await db.query(statement);
  for (const statement of await statements('004_production.sql')) {
    if (!(await hasProductionChange(db, schema, statement))) await db.query(statement);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pool } = await import('./db.js');
  try {
    const conn = await pool.getConnection();
    try {
      await applyMigrations(conn);
      console.log('数据库迁移完成，原业务数据保留');
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}
