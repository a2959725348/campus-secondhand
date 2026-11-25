import bcrypt from 'bcryptjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readAdminConfig({
  username = process.env.ADMIN_USERNAME ?? 'moya',
  password = process.env.ADMIN_PASSWORD ?? '123456',
} = {}) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{4,20}$/.test(username)) {
    throw Error('管理员账号需为 4-20 位字母、数字或下划线');
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 20 || Buffer.byteLength(password) > 72) {
    throw Error('管理员密码需为 6-20 位且不超过 72 字节');
  }
  return { username, password };
}

export async function bootstrapAdmin(conn, options) {
  const { username, password } = readAdminConfig(options);
  try {
    await conn.execute(
      "INSERT INTO users (username, password, nickname, role) VALUES (?, ?, '管理员', 'admin')",
      [username, await bcrypt.hash(password, 10)],
    );
    return true;
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  }
  const [[account]] = await conn.execute('SELECT role FROM users WHERE username=? FOR SHARE', [username]);
  if (account?.role !== 'admin') throw Error('同名账号已是普通用户，无法创建管理员');
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pool, withTransaction } = await import('./db.js');
  try {
    const created = await withTransaction(conn => bootstrapAdmin(conn));
    console.log(created ? '管理员已创建' : '管理员已存在');
  } finally {
    await pool.end();
  }
}
