import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeBook,saveBook} from '../utils/books.js';

const catalogUrl=new URL('../../data/catalog-20261125.json',import.meta.url);
const uploadRoot=new URL('../../',import.meta.url);

export async function loadCatalog(){
  const catalog=JSON.parse(await readFile(catalogUrl,'utf8'));
  if(!Array.isArray(catalog)||catalog.length<60)throw Error('商品目录至少需要 60 条');
  const keys=new Set();
  for(const item of catalog){
    if(typeof item.key!=='string'||!/^[a-z0-9-]{1,75}$/.test(item.key)||keys.has(item.key))throw Error('目录商品标识无效或重复');
    keys.add(item.key);
    if(typeof item.title!=='string'||!item.title.trim()||item.title.length>60)throw Error('商品标题无效');
    if(typeof item.description!=='string'||item.description.length<10)throw Error('商品介绍无效');
    if(!Number.isFinite(item.price)||item.price<=0||item.price>999999)throw Error('商品价格无效');
    if(!['new','like_new','good','fair'].includes(item.condition))throw Error('商品成色无效');
    if(!Array.isArray(item.images)||!item.images.length)throw Error('商品必须配图');
    for(const image of item.images){
      if(!/^\/uploads\/catalog\/[a-z0-9-]+\.jpg$/.test(image))throw Error('商品图片路径无效');
      const bytes=await readFile(new URL('.'+image,uploadRoot));
      if(bytes.length<2000||!bytes.subarray(0,3).equals(Buffer.from([255,216,255])))throw Error('商品实物图缺失或格式无效');
    }
    if(item.categorySlug==='book')normalizeBook(item.book);
    else if(item.book)throw Error('非书籍分类不能包含书籍资料');
  }
  return catalog;
}

/** 显式内容导入，拥有独立事务；不会修改现有商品或创建卖家账号。 */
export async function importCatalog(conn,{sellerUsername,catalog}){
  const [[candidate]]=await conn.execute('SELECT id,role,status FROM users WHERE username=?',[sellerUsername]);
  if(!candidate||candidate.role!=='admin'||candidate.status!=='active')throw Error('请指定已启用的管理员账号作为发布者');
  await conn.query(`CREATE TABLE IF NOT EXISTS catalog_imports (
    seller_id INT UNSIGNED NOT NULL,
    entry_key VARCHAR(100) NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    PRIMARY KEY(seller_id,entry_key),
    CONSTRAINT fk_catalog_import_seller FOREIGN KEY(seller_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_catalog_import_item FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await conn.beginTransaction();
  try{
    const [[seller]]=await conn.execute('SELECT id,role,status FROM users WHERE id=? FOR UPDATE',[candidate.id]);
    if(seller.role!=='admin'||seller.status!=='active')throw Error('发布者管理员已停用或权限已变化');
    const [categories]=await conn.query('SELECT id,slug FROM categories');
    const categoryIds=new Map(categories.map(c=>[c.slug,c.id]));
    if(!categoryIds.has('book')&&categoryIds.has('books'))categoryIds.set('book',categoryIds.get('books'));
    for(const item of catalog)if(!categoryIds.has(item.categorySlug))throw Error('目录使用了不存在的商品分类');
    const [existing]=await conn.execute('SELECT entry_key FROM catalog_imports WHERE seller_id=?',[seller.id]);
    const imported=new Set(existing.map(row=>row.entry_key));
    let inserted=0,skipped=0;
    for(const item of catalog){
      const key='20261125:'+item.key;
      if(imported.has(key)){skipped++;continue;}
      const [result]=await conn.execute(`INSERT INTO items(title,description,price,category_id,seller_id,item_condition,trade_place,status)
        VALUES(?,?,?,?,?,?,?,'on_sale')`,[item.title,item.description,item.price,categoryIds.get(item.categorySlug),seller.id,item.condition,item.tradePlace||null]);
      for(const [sort,url] of item.images.entries())await conn.execute('INSERT INTO item_images(item_id,url,sort) VALUES(?,?,?)',[result.insertId,url,sort]);
      if(item.book)await saveBook(conn,result.insertId,normalizeBook(item.book));
      await conn.execute('INSERT INTO catalog_imports(seller_id,entry_key,item_id) VALUES(?,?,?)',[seller.id,key,result.insertId]);
      inserted++;
    }
    await conn.commit();return {inserted,skipped};
  }catch(error){await conn.rollback();throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const catalog=await loadCatalog();
  if(process.argv.includes('--dry-run')){
    console.log(JSON.stringify({validated:catalog.length,books:catalog.filter(i=>i.book).length,images:new Set(catalog.flatMap(i=>i.images)).size}));
  }else{
    const arg=process.argv.indexOf('--seller');
    const sellerUsername=arg>=0?process.argv[arg+1]:null;
    if(!sellerUsername)throw Error('请通过 --seller moya 指定发布者');
    const {default:dotenv}=await import('dotenv');dotenv.config({quiet:true});
    const database=process.env.DB_NAME;
    if(!database||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(database))throw Error('请设置有效 DB_NAME');
    const {default:mysql}=await import('mysql2/promise');
    const conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database});
    try{console.log(JSON.stringify({database,...await importCatalog(conn,{sellerUsername,catalog})}));}finally{await conn.end();}
  }
}
