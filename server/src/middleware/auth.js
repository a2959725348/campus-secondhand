import { verifyToken } from '../utils/token.js';
import { forbidden, unauthorized } from '../utils/response.js';
import { queryOne } from '../config/db.js';

/**
 * 解析 Authorization: Bearer <token>。
 * 这里只做"能解析就挂到 req.user"，不做拦截；
 * 是否必须登录由 requireAuth 决定，这样同一个接口可以支持
 * 游客访问（能看到收藏数，但看不到"我是否已收藏"）。
 */
export async function attachUser(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    req.authError = err;
    return next();
  }
  if (!Number.isSafeInteger(claims?.id) || claims.id <= 0
    || !Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0) return next();
  try {
    const user = await queryOne(
      'SELECT id, username, role, status, token_version AS tokenVersion FROM users WHERE id=?',
      [claims.id],
    );
    if (user?.status === 'disabled') req.authError = forbidden('账号已被禁用');
    else if (user && user.tokenVersion === claims.tokenVersion) req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** 必须登录的接口加这个中间件 */
export function requireAuth(req, res, next) {
  if (!req.user) return next(req.authError ?? unauthorized());
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return next(forbidden('需要管理员权限'));
  next();
}
