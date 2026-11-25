import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from './response.js';

// An identity issued for one MySQL database must never authenticate to another.
const { host, port, database } = env.db;
const databaseIdentity = createHash('sha256').update(JSON.stringify([host, port, database])).digest('base64url');
const audience = `campus-marketplace:${databaseIdentity}`;

/** 签发 token，账号权限由数据库检查。 */
export function signToken(user) {
  return jwt.sign({ id: user.id, tokenVersion: user.tokenVersion }, env.jwtSecret, {
    algorithm: 'HS256',
    audience,
    expiresIn: env.jwtExpiresIn,
  });
}

/** 校验 token，失败抛 401 业务错误 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], audience });
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? '登录已过期，请重新登录' : '登录凭证无效');
  }
}
