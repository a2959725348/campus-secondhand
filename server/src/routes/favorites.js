import { Router } from 'express';
import { query, queryOne } from '../config/db.js';
import { ok, badRequest, notFound, parsePage } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/** GET /api/favorites 我的收藏 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePage(req.query, { defaultSize: 12 });
    const totalRow = await queryOne(
      'SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?', [req.user.id],
    );
    const rows = await query(
      `SELECT f.item_id AS itemId, f.created_at AS favoritedAt,
              i.title, i.price, i.status, i.item_condition AS \`condition\`,
              (SELECT url FROM item_images im WHERE im.item_id = i.id ORDER BY im.sort LIMIT 1) AS cover,
              u.nickname AS sellerNickname
       FROM favorites f
       JOIN items i ON i.id = f.item_id
       JOIN users u ON u.id = i.seller_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, pageSize, offset],
    );
    ok(res, { list: rows, total: totalRow.total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

/** POST /api/favorites/:itemId 收藏 */
router.post('/:itemId', requireAuth, async (req, res, next) => {
  try {
    const itemId = Number.parseInt(req.params.itemId, 10);
    if (Number.isNaN(itemId)) throw badRequest('商品 ID 不合法');
    const item = await queryOne('SELECT id FROM items WHERE id = ?', [itemId]);
    if (!item) throw notFound('商品不存在');

    const exists = await queryOne(
      'SELECT id FROM favorites WHERE user_id = ? AND item_id = ?', [req.user.id, itemId],
    );
    // 幂等：重复收藏直接返回成功，前端不用特殊处理
    if (exists) return ok(res, { favorited: true }, '已收藏');

    await query('INSERT INTO favorites (user_id, item_id) VALUES (?, ?)', [req.user.id, itemId]);
    ok(res, { favorited: true }, '收藏成功');
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/favorites/:itemId 取消收藏 */
router.delete('/:itemId', requireAuth, async (req, res, next) => {
  try {
    const itemId = Number.parseInt(req.params.itemId, 10);
    if (Number.isNaN(itemId)) throw badRequest('商品 ID 不合法');
    await query('DELETE FROM favorites WHERE user_id = ? AND item_id = ?', [req.user.id, itemId]);
    ok(res, { favorited: false }, '已取消收藏');
  } catch (err) {
    next(err);
  }
});

export default router;
