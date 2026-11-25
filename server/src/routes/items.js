import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { query, queryOne, withTransaction } from '../config/db.js';
import {
  ok, badRequest, forbidden, notFound, conflict, parsePage,
} from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import {normalizeBook,isBookCategory,saveBook,BOOK_GENRES,BOOK_NOTES} from '../utils/books.js';
import { ITEM_BOOK_FIELDS, ITEM_COVER_FIELD, ITEM_LIST_FIELDS } from '../services/item-list-fields.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// uploads 放在 server 目录下，和 web/public/uploads 通过软链/复制保持一致
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const imageFormats = {
  'image/jpeg': { extension: '.jpg', matches: bytes => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  'image/png': {
    extension: '.png',
    matches: bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: '.webp',
    matches: bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  },
  'image/gif': { extension: '.gif', matches: bytes => ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!Object.hasOwn(imageFormats, file.mimetype)) {
      return cb(badRequest('只支持 jpg / png / webp / gif 格式的图片'));
    }
    cb(null, true);
  },
});

const SORTS = {
  latest: 'i.created_at DESC, i.id DESC',
  priceAsc: 'i.price ASC, i.id DESC',
  priceDesc: 'i.price DESC, i.id DESC',
  popular: 'i.view_count DESC, i.id DESC',
};

/**
 * GET /api/items 商品列表
 * 支持 keyword / categoryId / minPrice / maxPrice / sort / page / pageSize
 */
router.get('/', async (req, res, next) => {
  try {
    const { keyword = '', categoryId, minPrice, maxPrice, sort = 'latest' } = req.query;
    const {kind,course,genre,annotation}=req.query;
    if(typeof keyword!=='string')throw badRequest('搜索词格式不正确');
    const { page, pageSize, offset } = parsePage(req.query);

    const where = [`i.status = 'on_sale'`, `u.status = 'active'`];
    const params = [];

    if (keyword.trim()) {
      // 用 LIKE 而不是 FULLTEXT：本项目数据量在千级，LIKE 够快且不依赖 ngram 插件
      where.push('(i.title LIKE ? OR i.description LIKE ? OR b.isbn LIKE ? OR b.author LIKE ? OR b.course LIKE ?)');
      const like = `%${keyword.trim()}%`;
      const normalizedIsbn=keyword.trim().replace(/[\s-]/g,'').toUpperCase()||keyword.trim();
      params.push(like, like, `%${normalizedIsbn}%`, like, like);
    }
    if(kind!==undefined&&kind!=='book')throw badRequest('商品类型不正确');
    if(kind==='book')where.push("c.slug IN ('book','books')");
    if(course){if(typeof course!=='string'||course.length>80)throw badRequest('课程格式不正确');where.push('b.course LIKE ?');params.push(`%${course.trim()}%`);}
    if(genre){if(!BOOK_GENRES.includes(genre))throw badRequest('书籍类型不正确');where.push('b.genre = ?');params.push(genre);}
    if(annotation){if(!BOOK_NOTES.includes(annotation))throw badRequest('笔记程度不正确');where.push('b.annotation = ?');params.push(annotation);}
    if (categoryId) {
      const cid = Number.parseInt(categoryId, 10);
      if (Number.isNaN(cid)) throw badRequest('分类参数不合法');
      where.push('i.category_id = ?');
      params.push(cid);
    }
    if (minPrice !== undefined && minPrice !== '') {
      const v = Number(minPrice);
      if (Number.isNaN(v) || v < 0) throw badRequest('最低价必须是不小于 0 的数字');
      where.push('i.price >= ?');
      params.push(v);
    }
    if (maxPrice !== undefined && maxPrice !== '') {
      const v = Number(maxPrice);
      if (Number.isNaN(v) || v < 0) throw badRequest('最高价必须是不小于 0 的数字');
      where.push('i.price <= ?');
      params.push(v);
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice !== '' && maxPrice !== ''
      && Number(minPrice) > Number(maxPrice)) {
      throw badRequest('最低价不能高于最高价');
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const orderSql = SORTS[sort] || SORTS.latest;
    const from = `FROM items i
       JOIN categories c ON c.id = i.category_id
       JOIN users u ON u.id = i.seller_id
       LEFT JOIN item_books b ON b.item_id=i.id`;

    const totalRow = await queryOne(
      `SELECT COUNT(*) AS total ${from} ${whereSql}`, params,
    );
    const rows = await query(
      `SELECT ${ITEM_LIST_FIELDS}, ${ITEM_BOOK_FIELDS}, ${ITEM_COVER_FIELD}
       ${from}
       ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    ok(res, { list: rows, total: totalRow.total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

/** GET /api/items/:id 商品详情，顺手 +1 浏览量 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id <= 0) throw badRequest('商品 ID 不合法');

    const item = await queryOne(
      `SELECT i.*, c.name AS categoryName, u.nickname AS sellerNickname,
              u.campus AS sellerCampus, u.credit AS sellerCredit
       FROM items i
       JOIN categories c ON c.id = i.category_id
       JOIN users u ON u.id = i.seller_id
       WHERE i.id = ?`,
      [id],
    );
    if (!item) throw notFound('商品不存在或已下架');

    const images = await query(
      'SELECT id, url, sort FROM item_images WHERE item_id = ? ORDER BY sort', [id],
    );
    await query('UPDATE items SET view_count = view_count + 1 WHERE id = ?', [id]);

    let favorited = false;
    if (req.user) {
      const fav = await queryOne(
        'SELECT id FROM favorites WHERE user_id = ? AND item_id = ?', [req.user.id, id],
      );
      favorited = Boolean(fav);
    }

    const book=await queryOne('SELECT author,publisher,edition,isbn,course,genre,annotation FROM item_books WHERE item_id=?',[id]);
    ok(res, { ...item, book, images, favorited, viewCount: item.view_count + 1 });
  } catch (err) {
    next(err);
  }
});

/** POST /api/items 发布商品 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      title = '', description = '', price, originalPrice = null,
      categoryId, condition = 'good', tradePlace = null, images = [],
    } = req.body || {};

    if (!title.trim()) throw badRequest('请输入商品标题');
    if (title.length > 60) throw badRequest('标题不能超过 60 个字符');
    if (!description.trim()) throw badRequest('请输入商品描述');
    if (description.length < 10) throw badRequest('描述至少写 10 个字，方便买家判断');
    if (price === undefined || price === null || price === '') throw badRequest('请输入价格');
    const priceNum = Number(price);
    if (Number.isNaN(priceNum) || priceNum < 0) throw badRequest('价格必须是不小于 0 的数字');
    if (priceNum > 999999) throw badRequest('价格超出合理范围');
    if (originalPrice !== null && originalPrice !== '' && Number(originalPrice) < priceNum) {
      throw badRequest('原价不能低于售出价');
    }
    if (!['new', 'like_new', 'good', 'fair'].includes(condition)) throw badRequest('成色参数不合法');

    const category = await queryOne('SELECT id,slug FROM categories WHERE id = ?', [Number(categoryId)]);
    if (!category) throw badRequest('请选择有效的商品分类');
    if(req.body.book!==undefined&&!isBookCategory(category.slug))throw badRequest('只有书籍分类可以填写书籍信息');
    const book=isBookCategory(category.slug)?normalizeBook(req.body.book):null;

    const itemId = await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO items
          (title, description, price, original_price, category_id, seller_id,
           item_condition, trade_place)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [title.trim(), description.trim(), priceNum,
          originalPrice === null || originalPrice === '' ? null : Number(originalPrice),
          Number(categoryId), req.user.id, condition, tradePlace],
      );
      const newId = result.insertId;
      if(book)await saveBook(conn,newId,book);
      // 最多 6 张图，前端也限制，这里再兜一次
      const urls = Array.isArray(images) ? images.slice(0, 6) : [];
      for (let i = 0; i < urls.length; i += 1) {
        await conn.execute('INSERT INTO item_images (item_id, url, sort) VALUES (?, ?, ?)',
          [newId, urls[i], i]);
      }
      return newId;
    });

    ok(res, { id: itemId }, '发布成功');
  } catch (err) {
    next(err);
  }
});

/** PUT /api/items/:id 编辑商品，仅本人可改 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const item = await queryOne('SELECT id, seller_id, status FROM items WHERE id = ?', [id]);
    if (!item) throw notFound('商品不存在');
    if (item.seller_id !== req.user.id) throw forbidden('只能编辑自己发布的商品');
    if (['sold','reserved'].includes(item.status)) throw conflict('已预定或售出的商品不能修改，请先处理订单');

    const { title, description, price, originalPrice, categoryId, condition, tradePlace, status } =
      req.body || {};
    const fields = [];
    const params = [];

    if (title !== undefined) {
      if (!title.trim()) throw badRequest('标题不能为空');
      if (title.length > 60) throw badRequest('标题不能超过 60 个字符');
      fields.push('title = ?'); params.push(title.trim());
    }
    if (description !== undefined) {
      if (!description.trim()) throw badRequest('描述不能为空');
      fields.push('description = ?'); params.push(description.trim());
    }
    if (price !== undefined) {
      const v = Number(price);
      if (Number.isNaN(v) || v < 0) throw badRequest('价格必须是不小于 0 的数字');
      fields.push('price = ?'); params.push(v);
    }
    if (originalPrice !== undefined) {
      fields.push('original_price = ?');
      params.push(originalPrice === null || originalPrice === '' ? null : Number(originalPrice));
    }
    if (categoryId !== undefined) {
      const cid = Number(categoryId);
      const c = await queryOne('SELECT id FROM categories WHERE id = ?', [cid]);
      if (!c) throw badRequest('分类不存在');
      fields.push('category_id = ?'); params.push(cid);
    }
    if (condition !== undefined) {
      if (!['new', 'like_new', 'good', 'fair'].includes(condition)) throw badRequest('成色参数不合法');
      fields.push('item_condition = ?'); params.push(condition);
    }
    if (tradePlace !== undefined) { fields.push('trade_place = ?'); params.push(tradePlace); }
    if (status !== undefined) {
      if (!['on_sale', 'off_shelf'].includes(status)) throw badRequest('状态只能是在售或下架');
      fields.push('status = ?'); params.push(status);
    }

    const bookInput=req.body.book;
    if (fields.length === 0 && bookInput===undefined) throw badRequest('没有需要更新的字段');
    params.push(id);
    await withTransaction(async conn=>{
      const [[current]]=await conn.execute('SELECT category_id,status FROM items WHERE id=? FOR UPDATE',[id]);
      if(!current)throw notFound('商品不存在');
      if(['reserved','sold'].includes(current.status))throw conflict('已预定或售出的商品不能修改');
      const [[category]]=await conn.execute('SELECT slug FROM categories WHERE id=?',[categoryId===undefined?current.category_id:Number(categoryId)]);
      if(!category)throw badRequest('分类不存在');
      if(bookInput!==undefined&&!isBookCategory(category.slug))throw badRequest('只有书籍分类可以填写书籍信息');
      const book=bookInput===undefined?null:normalizeBook(bookInput);
      if(fields.length)await conn.execute(`UPDATE items SET ${fields.join(', ')} WHERE id=?`,params);
      if(isBookCategory(category.slug)){
        if(book)await saveBook(conn,id,book);
        else{
          const [existing]=await conn.execute('SELECT item_id FROM item_books WHERE item_id=?',[id]);
          if(!existing.length)await saveBook(conn,id,normalizeBook());
        }
      }else await conn.execute('DELETE FROM item_books WHERE item_id=?',[id]);
    });
    ok(res, null, '已保存');
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/items/:id 删除商品（有订单则不允许删） */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await withTransaction(async (conn) => {
      // 与下单使用相同的商品行锁；检查和删除期间不能插入新订单。
      const [[item]] = await conn.execute('SELECT id, seller_id FROM items WHERE id = ? FOR UPDATE', [id]);
      if (!item) throw notFound('商品不存在');
      if (item.seller_id !== req.user.id) throw forbidden('只能删除自己发布的商品');
      const [orders] = await conn.execute('SELECT id FROM orders WHERE item_id = ? LIMIT 1', [id]);
      if (orders.length) throw conflict('该商品已产生订单，不能删除，请保留交易记录');
      await conn.execute('DELETE FROM items WHERE id = ?', [id]);
    });
    ok(res, null, '已删除');
  } catch (err) {
    next(err);
  }
});

/** GET /api/items/mine/list 我发布的商品 */
router.get('/mine/list', requireAuth, async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePage(req.query, { defaultSize: 10 });
    const { status } = req.query;
    const where = ['i.seller_id = ?'];
    const params = [req.user.id];
    if (status && ['on_sale', 'reserved', 'sold', 'off_shelf'].includes(status)) {
      where.push('i.status = ?'); params.push(status);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRow = await queryOne(
      `SELECT COUNT(*) AS total FROM items i ${whereSql}`, params,
    );
    const rows = await query(
      `SELECT ${ITEM_LIST_FIELDS}, ${ITEM_COVER_FIELD}
       FROM items i
       JOIN categories c ON c.id = i.category_id
       JOIN users u ON u.id = i.seller_id
       ${whereSql}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    ok(res, { list: rows, total: totalRow.total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

/** POST /api/items/upload 上传图片，返回可直接放进 images 的 url */
router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('请选择要上传的图片');
    const format = imageFormats[req.file.mimetype];
    if (!format.matches(req.file.buffer)) throw badRequest('图片内容与文件格式不匹配');
    const filename = `${randomUUID()}${format.extension}`;
    await writeFile(path.join(UPLOAD_DIR, filename), req.file.buffer, { flag: 'wx' });
    ok(res, { url: `/uploads/${filename}`, size: req.file.size }, '上传成功');
  } catch (err) {
    next(err);
  }
});

export default router;
