import { Router } from 'express';
import { query } from '../config/db.js';
import { ok } from '../utils/response.js';

const router = Router();

/** GET /api/categories 分类列表，带每类在售数量 */
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.slug, c.icon, c.sort,
              COUNT(seller.id) AS itemCount
       FROM categories c
       LEFT JOIN items i ON i.category_id = c.id AND i.status = 'on_sale'
       LEFT JOIN users seller ON seller.id=i.seller_id AND seller.status='active'
       GROUP BY c.id
       ORDER BY c.sort ASC`,
    );
    ok(res, rows);
  } catch (err) {
    next(err);
  }
});

export default router;
