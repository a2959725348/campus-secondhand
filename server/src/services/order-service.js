import { randomInt } from 'node:crypto';
import { query, queryOne, withTransaction } from '../config/db.js';
import { badRequest, conflict, forbidden, notFound, parsePage } from '../utils/response.js';
import { parseFilters, positiveId } from '../utils/validation.js';
import { addressSnapshot } from './address-service.js';
import { recordAudit } from './admin-audit.js';

const statuses = ['pending', 'shipped', 'completed', 'cancelled'];
const orderFields = `o.id, o.order_no AS orderNo, o.status, o.price, o.remark, o.created_at AS createdAt,
  o.delivery_mode AS deliveryMode, o.address_snapshot AS addressSnapshot, o.carrier, o.tracking_no AS trackingNo,
  o.shipped_at AS shippedAt, o.completed_at AS completedAt, review.id AS reviewId, review.rating AS reviewRating,
  i.id AS itemId, i.title AS itemTitle,
  (SELECT url FROM item_images im WHERE im.item_id=i.id ORDER BY im.sort, im.id LIMIT 1) AS cover,
  buyer.id AS buyerId, buyer.nickname AS buyerNickname, seller.id AS sellerId, seller.nickname AS sellerNickname`;
const orderJoins = `FROM orders o
  JOIN items i ON i.id=o.item_id
  JOIN users buyer ON buyer.id=o.buyer_id
  JOIN users seller ON seller.id=o.seller_id`;
const reviewJoin = 'LEFT JOIN order_reviews review ON review.order_id=o.id';

function buildOrderNo() {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${date}${String(randomInt(1_000_000_000_000)).padStart(12, '0')}`;
}

function serialize(row) {
  if (typeof row.addressSnapshot !== 'string') return row;
  return { ...row, addressSnapshot: JSON.parse(row.addressSnapshot) };
}

export async function createOrder(buyerId, { itemId, remark = null, deliveryMode = 'pickup', addressId }) {
  const id = positiveId(itemId, '商品');
  if (remark !== null && (typeof remark !== 'string' || remark.length > 100)) throw badRequest('备注最多 100 字');
  if (!['pickup', 'shipping'].includes(deliveryMode)) throw badRequest('请选择有效的交付方式');
  const shipping = deliveryMode === 'shipping';
  const selectedAddressId = shipping ? positiveId(addressId, '收货地址') : null;

  return withTransaction(async conn => {
    const [[item]] = await conn.execute('SELECT id, seller_id, price, status FROM items WHERE id=? FOR UPDATE', [id]);
    if (!item) throw notFound('商品不存在');
    if (item.seller_id === buyerId) throw conflict('不能购买自己发布的商品');
    if (item.status !== 'on_sale') throw conflict('该商品已被预定、售出或下架');
    const [[seller]] = await conn.execute('SELECT status FROM users WHERE id=? FOR SHARE', [item.seller_id]);
    if (seller?.status !== 'active') throw conflict('卖家账号暂不可交易');
    const snapshot = shipping ? JSON.stringify(await addressSnapshot(conn, buyerId, selectedAddressId)) : null;

    const orderNo = buildOrderNo();
    let result;
    try {
      [result] = await conn.execute(
        `INSERT INTO orders (order_no, item_id, buyer_id, seller_id, price, remark, delivery_mode, address_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, id, buyerId, item.seller_id, item.price, remark, deliveryMode, snapshot],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('未能预定商品，请刷新后重试');
      throw err;
    }
    await conn.execute("UPDATE items SET status='reserved' WHERE id=?", [id]);
    return { id: result.insertId, orderNo };
  });
}

export async function listOrders(options, userId) {
  const { status, keyword } = parseFilters(options, statuses);
  const { page, pageSize, offset } = parsePage(options, { defaultSize: 10 });
  const where = [];
  const params = [];
  if (userId !== undefined) {
    const role = options.role === 'seller' ? 'seller' : 'buyer';
    where.push(`o.${role}_id=?`);
    params.push(userId);
  }
  if (status) {
    where.push('o.status=?');
    params.push(status);
  }
  if (keyword) {
    where.push('(o.order_no LIKE ? OR i.title LIKE ? OR buyer.nickname LIKE ? OR seller.nickname LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [total, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*) AS total ${orderJoins} ${whereSql}`, params),
    query(
      `SELECT ${orderFields} ${orderJoins} ${reviewJoin} ${whereSql}
       ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
  ]);
  return { list: rows.map(serialize), total: total.total, page, pageSize };
}

export async function getOrder(id, userId) {
  const row = await queryOne(`SELECT ${orderFields} ${orderJoins} ${reviewJoin} WHERE o.id=?`, [id]);
  if (!row) throw notFound('订单不存在');
  if (userId !== undefined && row.buyerId !== userId && row.sellerId !== userId) {
    throw forbidden('只能查看与自己相关的订单');
  }
  return serialize(row);
}

async function withLockedOrder(id, change) {
  const metadata = await queryOne('SELECT item_id FROM orders WHERE id=?', [id]);
  if (!metadata) throw notFound('订单不存在');
  return withTransaction(async conn => {
    // Purchasing, deleting and admin item changes acquire the item lock first.
    await conn.execute('SELECT id FROM items WHERE id=? FOR UPDATE', [metadata.item_id]);
    const [[order]] = await conn.execute(
      'SELECT id, buyer_id, seller_id, item_id, status, delivery_mode FROM orders WHERE id=? FOR UPDATE',
      [id],
    );
    if (!order) throw notFound('订单不存在');
    return change(conn, order);
  });
}

export function shipOrder(id, sellerId, { carrier, trackingNo }) {
  return withLockedOrder(id, async (conn, order) => {
    if (order.seller_id !== sellerId) throw forbidden('只有卖家可以发货');
    if (order.delivery_mode !== 'shipping' || order.status !== 'pending') {
      throw conflict('只有待发货的邮寄订单可以发货');
    }
    await conn.execute(
      "UPDATE orders SET status='shipped', carrier=?, tracking_no=?, shipped_at=CURRENT_TIMESTAMP WHERE id=?",
      [carrier, trackingNo, id],
    );
  });
}

export function completeOrder(id, buyerId) {
  return withLockedOrder(id, async (conn, order) => {
    if (order.buyer_id !== buyerId) throw forbidden('只有买家可以确认收货');
    const requiredStatus = order.delivery_mode === 'shipping' ? 'shipped' : 'pending';
    if (order.status !== requiredStatus) throw conflict('当前订单状态无法确认收货');
    await conn.execute("UPDATE orders SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?", [id]);
    await conn.execute("UPDATE items SET status='sold' WHERE id=?", [order.item_id]);
  });
}

export function cancelOrder(id, actor, adminReason) {
  return withLockedOrder(id, async (conn, order) => {
    const fromAdmin = adminReason !== undefined;
    if (fromAdmin && actor.role !== 'admin') throw forbidden('需要管理员权限');
    if (!fromAdmin && actor.id !== order.buyer_id && actor.id !== order.seller_id) {
      throw forbidden('只能取消与自己相关的订单');
    }
    if (order.status !== 'pending') throw conflict('只有待交易订单可以取消');
    await conn.execute("UPDATE orders SET status='cancelled' WHERE id=?", [id]);
    await conn.execute("UPDATE items SET status='on_sale' WHERE id=?", [order.item_id]);
    if (fromAdmin) await recordAudit(conn, actor, 'cancel_order', 'order', id, adminReason);
  });
}
