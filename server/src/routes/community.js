import {Router} from 'express';
import {query,queryOne} from '../config/db.js';
import {requireAuth} from '../middleware/auth.js';
import {ok,badRequest,forbidden,notFound,conflict,parsePage} from '../utils/response.js';
const router=Router();
const idOf=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw badRequest('ID 不合法');return n;};
const text=value=>{if(typeof value!=='string'||!value.trim()||value.trim().length>500)throw badRequest('内容需为 1–500 字');return value.trim();};
const requireItem=async id=>{const item=await queryOne('SELECT id,seller_id FROM items WHERE id=?',[id]);if(!item)throw notFound('商品不存在');return item;};
router.get('/items/:id/questions',async(req,res,next)=>{try{
 const id=idOf(req.params.id);await requireItem(id);const {page,pageSize,offset}=parsePage(req.query,{defaultSize:10});
 const rows=await query(`SELECT q.id,q.content,q.reply,q.created_at AS createdAt,q.replied_at AS repliedAt,u.nickname AS authorName,u.avatar AS authorAvatar FROM item_questions q JOIN users u ON u.id=q.user_id WHERE q.item_id=? ORDER BY q.id DESC LIMIT ? OFFSET ?`,[id,pageSize,offset]);
 const count=await queryOne('SELECT COUNT(*) total FROM item_questions WHERE item_id=?',[id]);ok(res,{list:rows,total:count.total,page,pageSize});
}catch(e){next(e);}});
router.post('/items/:id/questions',requireAuth,async(req,res,next)=>{try{
 const id=idOf(req.params.id),content=text(req.body?.content);await requireItem(id);
 const r=await query('INSERT INTO item_questions(item_id,user_id,content) VALUES(?,?,?)',[id,req.user.id,content]);ok(res,{id:r.insertId},'留言已发布');
}catch(e){next(e);}});
router.put('/questions/:id/reply',requireAuth,async(req,res,next)=>{try{
 const id=idOf(req.params.id),content=text(req.body?.content);
 const q=await queryOne('SELECT q.id,i.seller_id FROM item_questions q JOIN items i ON i.id=q.item_id WHERE q.id=?',[id]);
 if(!q)throw notFound('留言不存在');if(q.seller_id!==req.user.id)throw forbidden('仅商品卖家可以回复');
 await query('UPDATE item_questions SET reply=?,replied_at=CURRENT_TIMESTAMP WHERE id=?',[content,id]);ok(res,null,'回复已保存');
}catch(e){next(e);}});
router.get('/items/:id/reviews',async(req,res,next)=>{try{
 const id=idOf(req.params.id);await requireItem(id);const {page,pageSize,offset}=parsePage(req.query,{defaultSize:10});
 const from='FROM order_reviews r JOIN orders o ON o.id=r.order_id';
 const list=await query(`SELECT r.id,r.rating,r.content,r.created_at AS createdAt,u.nickname AS authorName ${from} JOIN users u ON u.id=o.buyer_id WHERE o.item_id=? ORDER BY r.id DESC LIMIT ? OFFSET ?`,[id,pageSize,offset]);
 const stats=await queryOne(`SELECT COUNT(*) total,COALESCE(ROUND(AVG(r.rating),1),0) average ${from} WHERE o.item_id=?`,[id]);ok(res,{list,...stats,page,pageSize});
}catch(e){next(e);}});
router.post('/orders/:id/review',requireAuth,async(req,res,next)=>{try{
 const id=idOf(req.params.id),rating=req.body?.rating,content=text(req.body?.content);
 if(!Number.isInteger(rating)||rating<1||rating>5)throw badRequest('评分需为 1–5 星整数');
 const order=await queryOne('SELECT id,buyer_id,seller_id,status FROM orders WHERE id=?',[id]);
 if(!order)throw notFound('订单不存在');if(order.buyer_id!==req.user.id||order.seller_id===req.user.id)throw forbidden('仅订单买家可评价');
 if(order.status!=='completed')throw conflict('交易完成后才可评价');
 try{const result=await query('INSERT INTO order_reviews(order_id,rating,content) VALUES(?,?,?)',[id,rating,content]);ok(res,{id:result.insertId},'感谢你的评价');}
 catch(e){if(e.code==='ER_DUP_ENTRY')throw conflict('该订单已经评价过了');throw e;}
}catch(e){next(e);}});
router.get('/me/overview',requireAuth,async(req,res,next)=>{try{
 const id=req.user.id;
 const stats=await queryOne(`SELECT COUNT(*) published,COALESCE(SUM(status='on_sale'),0) onSale,COALESCE(SUM(status='sold'),0) sold FROM items WHERE seller_id=?`,[id]);
 const orders=await queryOne(`SELECT COUNT(*) purchases,COALESCE(SUM(status='completed'),0) completed FROM orders WHERE buyer_id=?`,[id]);
 const favorites=await queryOne('SELECT COUNT(*) favorites FROM favorites WHERE user_id=?',[id]);
 const reviews=await queryOne('SELECT COUNT(*) reviewCount,COALESCE(ROUND(AVG(r.rating),1),0) rating FROM order_reviews r JOIN orders o ON o.id=r.order_id WHERE o.seller_id=?',[id]);
 ok(res,{...stats,...orders,...favorites,...reviews});
}catch(e){next(e);}});
export default router;
