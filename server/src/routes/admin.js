import { Router } from 'express';
import { query, queryOne, withTransaction } from '../config/db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../services/admin-audit.js';
import { ITEM_BOOK_FIELDS, ITEM_COVER_FIELD, ITEM_LIST_FIELDS } from '../services/item-list-fields.js';
import { cancelOrder, getOrder, listOrders } from '../services/order-service.js';
import { badRequest, conflict, forbidden, notFound, ok, parsePage } from '../utils/response.js';
import { parseFilters, positiveId, requiredText } from '../utils/validation.js';

const router = Router();
const adminOnly = [requireAuth, requireAdmin];

const mutableItemStatuses = ['on_sale', 'off_shelf'];
const userStatuses = ['active', 'disabled'];

function searchConditions(statusField, status, keyword, fields) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push(`${statusField}=?`);
    params.push(status);
  }
  if (keyword) {
    conditions.push(`(${fields.map(field => `${field} LIKE ?`).join(' OR ')})`);
    params.push(...fields.map(() => `%${keyword}%`));
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

router.get('/overview', adminOnly, async (req, res, next) => {
  try {
    const [counts, recent] = await Promise.all([
      queryOne(`SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM items) AS items,
        (SELECT COUNT(*) FROM items WHERE status='on_sale') AS onSale,
        COUNT(*) AS orders, COUNT(IF(status='pending', 1, NULL)) AS pending,
        COUNT(IF(status='shipped', 1, NULL)) AS shipped, COUNT(IF(status='completed', 1, NULL)) AS completed,
        COUNT(IF(status='cancelled', 1, NULL)) AS cancelled
        FROM orders`),
      listOrders({ pageSize: 5 }),
    ]);
    ok(res, { ...counts, recentOrders: recent.list });
  } catch (err) {
    next(err);
  }
});

router.get('/orders', adminOnly, async (req, res, next) => {
  try {
    ok(res, await listOrders(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:id', adminOnly, async (req, res, next) => {
  try {
    ok(res, await getOrder(positiveId(req.params.id, '订单')));
  } catch (err) {
    next(err);
  }
});

router.put('/orders/:id/cancel', adminOnly, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '订单');
    const reason = requiredText(req.body?.reason, '操作原因', 200);
    await cancelOrder(id, req.user, reason);
    ok(res, null, '订单已取消');
  } catch (err) {
    next(err);
  }
});

router.get('/items', adminOnly, async (req, res, next) => {
  try {
    const { status, keyword } = parseFilters(req.query, [...mutableItemStatuses, 'reserved', 'sold']);
    const { page, pageSize, offset } = parsePage(req.query, { defaultSize: 10 });
    const { where, params } = searchConditions('i.status', status, keyword, ['i.title', 'u.nickname']);
    const from = `FROM items i JOIN categories c ON c.id=i.category_id
      JOIN users u ON u.id=i.seller_id LEFT JOIN item_books b ON b.item_id=i.id`;
    const [count, list] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS total ${from} ${where}`, params),
      query(
        `SELECT ${ITEM_LIST_FIELDS}, ${ITEM_BOOK_FIELDS}, ${ITEM_COVER_FIELD} ${from} ${where}
         ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ),
    ]);
    ok(res, { list, total: count.total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.put('/items/:id/status', adminOnly, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '商品');
    const { status, reason } = req.body ?? {};
    if (!mutableItemStatuses.includes(status)) throw badRequest('请选择在售或下架状态');
    const detail = requiredText(reason, '操作原因', 200);
    await withTransaction(async conn => {
      const [[item]] = await conn.execute('SELECT status FROM items WHERE id=? FOR UPDATE', [id]);
      if (!item) throw notFound('商品不存在');
      if (!mutableItemStatuses.includes(item.status)) throw conflict('已预定或售出的商品无法调整上下架状态');
      if (item.status === status) return;
      await conn.execute('UPDATE items SET status=? WHERE id=?', [status, id]);
      const action = status === 'on_sale' ? 'restore_item' : 'remove_item';
      await recordAudit(conn, req.user, action, 'item', id, detail);
    });
    ok(res, null, '商品状态已更新');
  } catch (err) {
    next(err);
  }
});

router.get('/users', adminOnly, async (req, res, next) => {
  try {
    const { status, keyword } = parseFilters(req.query, userStatuses);
    const { page, pageSize, offset } = parsePage(req.query, { defaultSize: 10 });
    const { where, params } = searchConditions('status', status, keyword, ['username', 'nickname']);
    const [count, list] = await Promise.all([
      queryOne(`SELECT COUNT(*) AS total FROM users ${where}`, params),
      query(
        `SELECT id, username, nickname, role, status, created_at AS createdAt FROM users ${where}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ),
    ]);
    ok(res, { list, total: count.total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id/status', adminOnly, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '用户');
    const { status, reason } = req.body ?? {};
    if (!userStatuses.includes(status)) throw badRequest('请选择启用或禁用状态');
    const detail = requiredText(reason, '操作原因', 200);
    if (id === req.user.id && status === 'disabled') throw forbidden('管理员不能禁用自己的账号');

    await withTransaction(async conn => {
      const [[user]] = await conn.execute('SELECT status FROM users WHERE id=? FOR UPDATE', [id]);
      if (!user) throw notFound('用户不存在');
      if (user.status === status) return;
      await conn.execute('UPDATE users SET status=?, token_version=token_version+1 WHERE id=?', [status, id]);
      const action = status === 'active' ? 'enable_user' : 'disable_user';
      await recordAudit(conn, req.user, action, 'user', id, detail);
    });
    ok(res, null, '账号状态已更新');
  } catch (err) {
    next(err);
  }
});

router.get('/audit', adminOnly, async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePage(req.query, { defaultSize: 10 });
    const [count, list] = await Promise.all([
      queryOne('SELECT COUNT(*) AS total FROM admin_audit'),
      query(
        `SELECT id, actor_name AS actorName, action, target_type AS targetType, target_id AS targetId, detail,
           created_at AS createdAt FROM admin_audit ORDER BY id DESC LIMIT ? OFFSET ?`,
        [pageSize, offset],
      ),
    ]);
    ok(res, { list, total: count.total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

export default router;
