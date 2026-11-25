import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../config/db.js';
import { ok, badRequest, conflict, forbidden, unauthorized } from '../utils/response.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../services/admin-audit.js';

const router = Router();

const USERNAME_RE = /^[A-Za-z0-9_]{4,20}$/;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 20;
const PROFILE_FIELDS = 'id, username, nickname, avatar, phone, campus, credit, role, status, created_at';

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX || Buffer.byteLength(password) > 72) {
    throw badRequest(`密码需为 ${PASSWORD_MIN}-${PASSWORD_MAX} 位且不超过 72 字节`);
  }
}

function sendSession(res, account, message) {
  const { tokenVersion, password, ...user } = account;
  return ok(res, { token: signToken({ id: user.id, tokenVersion }), user }, message);
}

/** POST /api/auth/register 注册 */
router.post('/register', async (req, res, next) => {
  try {
    const { username = '', password = '', nickname = '' } = req.body || {};

    if (Object.hasOwn(req.body ?? {}, 'role') || Object.hasOwn(req.body ?? {}, 'status')) throw badRequest('注册时不能设置账号权限');
    if (typeof username !== 'string' || !username.trim()) throw badRequest('请输入账号');
    if (!USERNAME_RE.test(username)) throw badRequest('账号需为 4-20 位字母、数字或下划线');
    validatePassword(password);
    if (typeof nickname !== 'string' || !nickname.trim()) throw badRequest('请输入昵称');
    if (nickname.length > 30) throw badRequest('昵称不能超过 30 个字符');

    const hash = await bcrypt.hash(password, 10);
    let result;
    try {
      result = await query('INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)', [username, hash, nickname.trim()]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('该账号已被注册');
      throw err;
    }

    const user = await queryOne(
      `SELECT ${PROFILE_FIELDS}, token_version AS tokenVersion FROM users WHERE id=?`,
      [result.insertId],
    );
    sendSession(res, user, '注册成功');
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/login 登录 */
router.post('/login', async (req, res, next) => {
  try {
    const { username = '', password = '' } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      throw badRequest('请输入账号和密码');
    }

    const user = await queryOne(
      `SELECT ${PROFILE_FIELDS}, password, updated_at, token_version AS tokenVersion FROM users WHERE username=?`,
      [username.trim()],
    );
    // 账号不存在和密码错误返回同一句提示，避免被用来枚举账号
    if (!user || !(await bcrypt.compare(password, user.password))) throw unauthorized('账号或密码错误');
    if (user.status === 'disabled') throw forbidden('账号已被禁用');
    sendSession(res, user, '登录成功');
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me 取当前登录用户 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await queryOne(
      `SELECT ${PROFILE_FIELDS} FROM users WHERE id=?`,
      [req.user.id],
    );
    if (!user) throw unauthorized('用户不存在');
    ok(res, user);
  } catch (err) {
    next(err);
  }
});

/** PUT /api/auth/me 修改资料 */
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { nickname, phone = null, campus = null } = req.body || {};
    if (typeof nickname !== 'string' || !nickname.trim()) throw badRequest('昵称不能为空');
    if (nickname.length > 30) throw badRequest('昵称不能超过 30 个字符');
    if (phone !== null && (typeof phone !== 'string' || (phone && !/^1[3-9]\d{9}$/.test(phone)))) throw badRequest('手机号格式不正确');
    if (campus !== null && (typeof campus !== 'string' || campus.length > 50)) throw badRequest('校区最多 50 字');

    await query('UPDATE users SET nickname = ?, phone = ?, campus = ? WHERE id = ?', [
      nickname.trim(), phone, campus, req.user.id,
    ]);
    const user = await queryOne(
      `SELECT ${PROFILE_FIELDS} FROM users WHERE id=?`,
      [req.user.id],
    );
    ok(res, user, '资料已更新');
  } catch (err) {
    next(err);
  }
});

router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword) > 72) {
      throw badRequest('请输入当前密码');
    }
    validatePassword(newPassword);
    if (newPassword === currentPassword) throw badRequest('新密码需与当前密码不同');

    await withTransaction(async conn => {
      const [[account]] = await conn.execute(
        'SELECT password, role, status, token_version AS tokenVersion FROM users WHERE id=? FOR UPDATE',
        [req.user.id],
      );
      if (account?.status === 'disabled') throw forbidden('账号已被禁用');
      if (!account || account.tokenVersion !== req.user.tokenVersion) throw unauthorized('请重新登录');
      if (!(await bcrypt.compare(currentPassword, account.password))) throw badRequest('当前密码不正确');

      await conn.execute('UPDATE users SET password=?, token_version=token_version+1 WHERE id=?', [
        await bcrypt.hash(newPassword, 10), req.user.id,
      ]);
      if (account.role === 'admin') {
        await recordAudit(conn, req.user, 'change_password', 'user', req.user.id, '管理员修改了本人密码');
      }
    });
    ok(res, null, '密码已修改，请重新登录');
  } catch (err) {
    next(err);
  }
});

export default router;
