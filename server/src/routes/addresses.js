import { Router } from 'express';
import { query, withTransaction } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { ADDRESS_FIELDS } from '../services/address-service.js';
import { badRequest, notFound, ok } from '../utils/response.js';
import { positiveId, requiredText } from '../utils/validation.js';

const router = Router();

const fields = `id, ${ADDRESS_FIELDS}, is_default AS isDefault`;
const serialize = row => ({ ...row, isDefault: Boolean(row.isDefault) });

function parseAddress(body = {}) {
  const { receiverName, phone, province, city, district, detail, label = '', isDefault } = body ?? {};
  const phoneText = typeof phone === 'string' ? phone.trim() : '';
  if (!/^1[3-9]\d{9}$/.test(phoneText)) throw badRequest('手机号格式不正确');
  if (typeof label !== 'string' || label.trim().length > 20) throw badRequest('地址标签最多 20 字');
  if (isDefault !== undefined && typeof isDefault !== 'boolean') throw badRequest('默认地址参数不正确');
  return {
    isDefault,
    values: [
      requiredText(receiverName, '收件人', 30), phoneText,
      requiredText(province, '省份', 30), requiredText(city, '城市', 30),
      requiredText(district, '区县', 30), requiredText(detail, '详细地址', 200),
      label.trim(),
    ],
  };
}

async function getAddress(conn, userId, id) {
  const [[row]] = await conn.execute(`SELECT ${fields} FROM addresses WHERE id=? AND user_id=?`, [id, userId]);
  if (!row) throw notFound('收货地址不存在');
  return serialize(row);
}

async function setDefault(conn, userId, id) {
  await conn.execute('UPDATE addresses SET is_default=FALSE WHERE user_id=? AND is_default=TRUE', [userId]);
  await conn.execute('UPDATE addresses SET is_default=TRUE WHERE user_id=? AND id=?', [userId, id]);
}

async function pickDefault(conn, userId, lastChoice) {
  const [[row]] = await conn.execute(
    'SELECT id FROM addresses WHERE user_id=? ORDER BY (id=?) ASC, id ASC LIMIT 1', [userId, lastChoice],
  );
  if (row) await setDefault(conn, userId, row.id);
}

// The user row serializes changes even before a user has their first address.
function updateAddresses(userId, operation) {
  return withTransaction(async conn => {
    const [[owner]] = await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    if (!owner) throw notFound('用户不存在');
    return operation(conn);
  });
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT ${fields} FROM addresses WHERE user_id=? ORDER BY is_default DESC, id DESC`,
      [req.user.id],
    );
    ok(res, rows.map(serialize));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { values, isDefault } = parseAddress(req.body);
    const userId = req.user.id;
    const address = await updateAddresses(userId, async conn => {
      const [result] = await conn.execute(
        'INSERT INTO addresses (user_id, receiver_name, phone, province, city, district, detail, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, ...values],
      );
      const [[current]] = await conn.execute('SELECT id FROM addresses WHERE default_user_id=?', [userId]);
      if (isDefault || !current) await setDefault(conn, userId, result.insertId);
      return getAddress(conn, userId, result.insertId);
    });
    ok(res, address, '地址已添加');
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '地址');
    const { values, isDefault } = parseAddress(req.body);
    const userId = req.user.id;
    const address = await updateAddresses(userId, async conn => {
      const current = await getAddress(conn, userId, id);
      await conn.execute(
        `UPDATE addresses SET receiver_name=?, phone=?, province=?, city=?, district=?, detail=?, label=?
         WHERE user_id=? AND id=?`,
        [...values, userId, id],
      );
      if (isDefault === true && !current.isDefault) await setDefault(conn, userId, id);
      if (isDefault === false && current.isDefault) await pickDefault(conn, userId, id);
      return getAddress(conn, userId, id);
    });
    ok(res, address, '地址已更新');
  } catch (err) {
    next(err);
  }
});

router.put('/:id/default', requireAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '地址');
    const userId = req.user.id;
    const address = await updateAddresses(userId, async conn => {
      const row = await getAddress(conn, userId, id);
      if (!row.isDefault) await setDefault(conn, userId, id);
      return { ...row, isDefault: true };
    });
    ok(res, address, '已设为默认地址');
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '地址');
    const userId = req.user.id;
    await updateAddresses(userId, async conn => {
      const row = await getAddress(conn, userId, id);
      await conn.execute('DELETE FROM addresses WHERE user_id=? AND id=?', [userId, id]);
      if (row.isDefault) await pickDefault(conn, userId, id);
    });
    ok(res, null, '地址已删除');
  } catch (err) {
    next(err);
  }
});

export default router;
