import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import {randomBytes} from 'node:crypto';
import {access, readFile, unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {applyMigrations} from '../src/config/migrate.js';

test('campus marketplace real database integration',async t=>{
  dotenv.config({quiet:true});
  const database=`campus_ui_test_${process.pid}_${Date.now()}`;
  assert.match(database,/^campus_ui_test_\d+_\d+$/);
  const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,multipleStatements:true});
  let child;
  t.after(async()=>{if(child && child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end();});
  let schema=await readFile(new URL('../sql/schema.sql',import.meta.url),'utf8');
  schema=schema.replace(/DROP DATABASE IF EXISTS campus_trade;/,'').replaceAll('campus_trade',database);
  await db.query(schema);
  await applyMigrations(db);
  await db.query("INSERT INTO categories(name,slug,sort) VALUES ('教材书籍','books',1)");
  const port=52931;
  const jwtSecret = randomBytes(48).toString('hex');
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const testEnv = {...process.env, HOST:'127.0.0.1', PORT:String(port), DB_NAME:database, JWT_SECRET:jwtSecret};
  const runNode = (args, extra = {}) => promisify(execFile)(process.execPath, args, {
    cwd, env:{...testEnv, ...extra}, windowsHide:true,
  });
  child=spawn(process.execPath,['src/index.js'],{cwd,env:testEnv,stdio:'ignore',windowsHide:true});
  const api=async(path,method='GET',body,token)=>{
    const r=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return r.json();
  };
  for(let i=0;i<80;i++){try{const h=await api('/health');if(h.code===0)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw Error('Test server did not start');}
  const register=async username=>{const r=await api('/auth/register','POST',{username,password:'Testpass2026',nickname:username});assert.equal(r.code,0);return r.data;};
  const seller=await register('seller_ui'),buyer=await register('buyer_ui'),other=await register('other_ui');
  const item=async(title='测试教材')=>{const r=await api('/items','POST',{title,description:'这是隔离环境的测试教材商品描述。',price:38,categoryId:1,images:['/uploads/demo/book.svg']},seller.token);assert.equal(r.code,0);return r.data.id;};
  await t.test('authentication rejects tokens that omit their version', async () => {
    const claims = jwt.decode(buyer.token);
    const token = jwt.sign({id:buyer.user.id, username:buyer.user.username}, jwtSecret, {
      audience: claims.aud || 'legacy-audience',
    });
    assert.equal((await api('/auth/me', 'GET', undefined, token)).code, 1002);
    assert.equal((await api('/auth/me', 'GET', undefined, buyer.token)).code, 0);
  });
  await t.test('identical account ids and signing keys cannot authenticate across configured databases', async () => {
    const script = `import { signToken } from './src/utils/token.js';
      process.stdout.write(signToken({ id: ${buyer.user.id}, tokenVersion: 0 }));`;
    const otherDb = await runNode(['--input-type=module', '-e', script], {DB_NAME:`${database}_other`});
    assert.equal((await api('/auth/me', 'GET', undefined, otherDb.stdout)).code, 1002);
  });
  await t.test('environment rejects short and placeholder JWT signing secrets', async () => {
    const args = ['--input-type=module', '-e', "await import('./src/config/env.js')"];
    for (const candidate of ['short', 'campus-trade-dev-secret-change-me', 'please-replace-me-placeholder-value-for-secret']) {
      await assert.rejects(runNode(args, {JWT_SECRET:candidate}), /JWT_SECRET/);
    }
    await runNode(args);
  });
  const first=await item();let question,order;
  await t.test('public questions start empty',async()=>{const r=await api(`/community/items/${first}/questions`);assert.equal(r.code,0);assert.deepEqual(r.data.list,[]);});
  await t.test('anonymous cannot ask questions',async()=>assert.equal((await api(`/community/items/${first}/questions`,'POST',{content:'可以校内面交吗？'})).code,1002));
  await t.test('question validation rejects missing, wrong type and oversized inputs',async()=>{for(const content of ['',null,7,'x'.repeat(501)])assert.equal((await api(`/community/items/${first}/questions`,'POST',{content},buyer.token)).code,1001);});
  await t.test('buyer posts question persisted with public author fields only',async()=>{const r=await api(`/community/items/${first}/questions`,'POST',{content:'  可以校内面交吗？  '},buyer.token);assert.equal(r.code,0);question=r.data.id;const list=(await api(`/community/items/${first}/questions`)).data.list;assert.equal(list[0].content,'可以校内面交吗？');assert.equal(JSON.stringify(list).includes('phone'),false);assert.equal(JSON.stringify(list).includes('password'),false);});
  await t.test('only item seller may reply and reply is retained',async()=>{assert.equal((await api(`/community/questions/${question}/reply`,'PUT',{content:'冒充回复'},other.token)).code,1003);assert.equal((await api(`/community/questions/${question}/reply`,'PUT',{content:'可以，图书馆面交。'},seller.token)).code,0);assert.equal((await api(`/community/items/${first}/questions`)).data.list[0].reply,'可以，图书馆面交。');});
  await t.test('cancelled item can be ordered again without removing history',async()=>{let r=await api('/orders','POST',{itemId:first},buyer.token);assert.equal(r.code,0);order=(await api('/orders', 'GET',undefined,buyer.token)).data.list[0];assert.equal((await api(`/orders/${order.id}/cancel`,'PUT',{},buyer.token)).code,0);r=await api('/orders','POST',{itemId:first},other.token);assert.equal(r.code,0);const [rows]=await db.query('SELECT status FROM orders WHERE item_id=?',[first]);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.status).sort(),['cancelled','pending']);});
  const second=await item();let completed;
  await t.test('concurrent purchase admits exactly one buyer',async()=>{const result=await Promise.all([api('/orders','POST',{itemId:second},buyer.token),api('/orders','POST',{itemId:second},other.token)]);assert.deepEqual(result.map(r=>r.code).sort((a,b)=>a-b),[0,1005]);const [rows]=await db.query('SELECT * FROM orders WHERE item_id=?',[second]);assert.equal(rows.length,1);completed=rows[0];});
  const winner=()=>completed.buyer_id===buyer.user.id?buyer:other;
  await t.test('reserved item cannot be edited or relisted by seller',async()=>assert.equal((await api(`/items/${second}`,'PUT',{status:'on_sale',price:1},seller.token)).code,1005));
  await t.test('pending order and foreign user cannot create reviews',async()=>{assert.equal((await api(`/community/orders/${completed.id}/review`,'POST',{rating:5,content:'很好'},winner().token)).code,1005);assert.equal((await api(`/community/orders/${completed.id}/review`,'POST',{rating:5,content:'很好'},seller.token)).code,1003);});
  await t.test('complete transaction updates item status and buyer-only permissions',async()=>{assert.equal((await api(`/orders/${completed.id}/complete`,'PUT',{},seller.token)).code,1003);assert.equal((await api(`/orders/${completed.id}/complete`,'PUT',{},winner().token)).code,0);const [rows]=await db.query('SELECT status FROM items WHERE id=?',[second]);assert.equal(rows[0].status,'sold');});
  await t.test('review validation rejects noninteger, invalid range and empty content',async()=>{for(const rating of [0,6,3.5,'5'])assert.equal((await api(`/community/orders/${completed.id}/review`,'POST',{rating,content:'评价'},winner().token)).code,1001);assert.equal((await api(`/community/orders/${completed.id}/review`,'POST',{rating:5,content:''},winner().token)).code,1001);});
  await t.test('completed buyer review is unique under concurrent submissions',async()=>{const results=await Promise.all([1,2].map(()=>api(`/community/orders/${completed.id}/review`,'POST',{rating:5,content:'教材干净，面交顺利。'},winner().token)));assert.deepEqual(results.map(r=>r.code).sort((a,b)=>a-b),[0,1005]);const r=await api(`/community/items/${second}/reviews`);assert.equal(r.data.total,1);assert.equal(Number(r.data.average),5);assert.equal(r.data.list[0].rating,5);});
  await t.test('profile save validates types and field lengths',async()=>{for(const body of [{nickname:7},{nickname:' '},{nickname:'正常',campus:'x'.repeat(51)},{nickname:'正常',phone:'invalid'}])assert.equal((await api('/auth/me','PUT',body,seller.token)).code,1001);assert.equal((await api('/auth/me','PUT',{nickname:'林同学',campus:'东校区',phone:''},seller.token)).code,0);const r=await api('/auth/me','GET',undefined,seller.token);assert.equal(r.data.nickname,'林同学');assert.equal(r.data.campus,'东校区');});
  await t.test('personal overview is authenticated and reflects actual records',async()=>{assert.equal((await api('/community/me/overview')).code,1002);const r=await api('/community/me/overview','GET',undefined,seller.token);assert.equal(r.code,0);assert.equal(r.data.published,2);assert.equal(r.data.reviewCount,1);assert.equal(Number(r.data.rating),5);});
  await t.test('migration reruns preserve existing orders, questions and reviews',async()=>{
    const [before]=await db.query('SELECT id,status FROM orders ORDER BY id');
    await applyMigrations(db);await applyMigrations(db);
    const [after]=await db.query('SELECT id,status FROM orders ORDER BY id');assert.deepEqual(after,before);
    assert.equal((await api(`/community/items/${first}/questions`)).data.total,1);
    assert.equal((await api(`/community/items/${second}/reviews`)).data.total,1);
  });
  await t.test('initialization refuses a populated database without deleting its rows',async()=>{
    const run=promisify(execFile);
    await assert.rejects(run(process.execPath,['src/config/init-db.js'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,DB_NAME:database},windowsHide:true}),/目标库已有数据表/);
    const [[row]]=await db.query('SELECT COUNT(*) n FROM users');assert.equal(row.n,3);
  });
  await t.test('an old database upgrades without promoting a user named moya or altering orders', async () => {
    const legacy = `${database}_legacy`;
    assert.match(legacy, /^campus_ui_test_\d+_\d+_legacy$/);
    try {
      await db.query(schema.replaceAll(database, legacy));
      for (const migration of ['002_community.sql', '003_books.sql']) {
        await db.query(await readFile(new URL(`../sql/migrations/${migration}`, import.meta.url), 'utf8'));
      }
      const hash = await bcrypt.hash('Testpass2026', 4);
      await db.execute(
        "INSERT INTO users (username,password,nickname) VALUES ('moya',?, '原有用户'), ('legacy_seller',?, '卖家')",
        [hash, hash],
      );
      await db.query("INSERT INTO categories (name,slug) VALUES ('教材书籍','books')");
      await db.query("INSERT INTO items (title,description,price,category_id,seller_id,status) VALUES ('旧教材','保留旧订单测试',20,1,2,'sold')");
      await db.query("INSERT INTO orders (order_no,item_id,buyer_id,seller_id,price,status) VALUES ('old_order',1,1,2,20,'completed')");
      await applyMigrations(db);
      await applyMigrations(db);
      const [[moya]] = await db.query("SELECT password, role, status FROM users WHERE username='moya'");
      assert.deepEqual(moya, {password:hash, role:'user', status:'active'});
      const [[order]] = await db.query('SELECT id, order_no, status, delivery_mode, address_snapshot FROM orders');
      assert.deepEqual(order, {id:1, order_no:'old_order', status:'completed', delivery_mode:'pickup', address_snapshot:null});
    } finally {
      await db.query(`USE \`${database}\``);
      await db.query(`DROP DATABASE IF EXISTS \`${legacy}\``);
    }
  });
  await t.test('failed item reservation rolls the inserted order back',async()=>{
    const id=await item();
    await db.query(`CREATE TRIGGER fail_test_reservation BEFORE UPDATE ON items FOR EACH ROW BEGIN IF NEW.id=${id} AND NEW.status='reserved' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated rollback test'; END IF; END`);
    try{assert.equal((await api('/orders','POST',{itemId:id},buyer.token)).code,5000);const [[row]]=await db.query('SELECT status,(SELECT COUNT(*) FROM orders WHERE item_id=?) n FROM items WHERE id=?',[id,id]);assert.equal(row.status,'on_sale');assert.equal(row.n,0);}finally{await db.query('DROP TRIGGER fail_test_reservation');}
  });
  await t.test('concurrent completion and cancellation allow one consistent transition',async()=>{
    const id=await item();assert.equal((await api('/orders','POST',{itemId:id},buyer.token)).code,0);
    const [[order]]=await db.query('SELECT id FROM orders WHERE item_id=?',[id]);
    const result=await Promise.all([api(`/orders/${order.id}/complete`,'PUT',{},buyer.token),api(`/orders/${order.id}/cancel`,'PUT',{},seller.token)]);
    assert.deepEqual(result.map(r=>r.code).sort((a,b)=>a-b),[0,1005]);
    const [[row]]=await db.query('SELECT i.status itemStatus,o.status orderStatus FROM items i JOIN orders o ON i.id=o.item_id WHERE i.id=?',[id]);
    assert.equal(row.itemStatus,row.orderStatus==='completed'?'sold':'on_sale');
  });
  await t.test('deletion waits for a pending purchase and preserves its order',async()=>{
    const id=await item();await db.beginTransaction();
    await db.query('SELECT id FROM items WHERE id=? FOR UPDATE',[id]);
    const purchase=api('/orders','POST',{itemId:id},buyer.token);
    await new Promise(r=>setTimeout(r,150));
    const deletion=api(`/items/${id}`,'DELETE',undefined,seller.token);
    await new Promise(r=>setTimeout(r,150));await db.commit();
    assert.equal((await purchase).code,0);assert.equal((await deletion).code,1005);
    const [[row]]=await db.query('SELECT COUNT(*) n FROM orders WHERE item_id=?',[id]);assert.equal(row.n,1);
  });
  await t.test('fresh installation creates only categories and a hashed administrator',async()=>{
    const fresh=`${database}_fresh`;assert.match(fresh,/^campus_ui_test_\d+_\d+_fresh$/);
    try{
      const init = overrides => runNode(['src/config/init-db.js'], {
        DB_NAME:fresh, ADMIN_USERNAME:'moya', ADMIN_PASSWORD:'123456', ...overrides,
      });
      await assert.rejects(init({ADMIN_USERNAME:'?'}), /管理员账号/);
      await assert.rejects(init({ADMIN_PASSWORD:'123'}), /管理员密码/);
      const [[before]] = await db.execute('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=?', [fresh]);
      assert.equal(before.count, 0);
      await init();
      const [users]=await db.query(`SELECT * FROM \`${fresh}\`.users`);
      assert.equal(users.length,1);
      assert.equal(users[0].username,'moya');
      assert.equal(users[0].role,'admin');
      assert.equal(await bcrypt.compare('123456',users[0].password),true);
      const [[categories]]=await db.query(`SELECT COUNT(*) n FROM \`${fresh}\`.categories`);
      assert.equal(categories.n,8);
      for (const table of ['items','item_images','item_books','orders','addresses','admin_audit','item_questions','order_reviews']) {
        const [[row]]=await db.query(`SELECT COUNT(*) n FROM \`${fresh}\`.\`${table}\``);
        assert.equal(row.n,0,table);
      }
    }finally{await db.query(`DROP DATABASE IF EXISTS \`${fresh}\``);}
  });
  const textbook={author:'严蔚敏',publisher:'清华大学出版社',edition:'第 2 版',isbn:'9787111128069',course:'数据结构',genre:'textbook',annotation:'light'};
  let bookId;
  await t.test('book listing persists metadata and returns it on its public detail',async()=>{
    const r=await api('/items','POST',{title:'二手数据结构教材',description:'用于课程学习的旧教材，仅有少量铅笔笔记。',price:25,categoryId:1,book:textbook},seller.token);
    assert.equal(r.code,0);bookId=r.data.id;
    const detail=await api(`/items/${bookId}`);assert.equal(detail.data.book.author,'严蔚敏');assert.equal(detail.data.book.course,'数据结构');assert.equal(detail.data.book.annotation,'light');
  });
  await t.test('book metadata validation rejects invalid shape, ISBN, genre and note level',async()=>{
    for(const book of [[],7,{...textbook,isbn:'not-an-isbn'},{...textbook,genre:'invalid'},{...textbook,annotation:'invalid'},{...textbook,author:'x'.repeat(101)}]){
      const r=await api('/items','POST',{title:'二手教材',description:'用于课程学习的旧教材，保存状态良好。',price:20,categoryId:1,book},seller.token);assert.equal(r.code,1001);
    }
  });
  await t.test('book metadata cannot be attached to an unrelated category',async()=>{
    await db.query("INSERT INTO categories(id,name,slug,sort) VALUES (2,'数码电器','digital',2)");
    const r=await api('/items','POST',{title:'普通鼠标',description:'测试非书籍分类不应该接受教材信息。',price:20,categoryId:2,book:textbook},seller.token);assert.equal(r.code,1001);
  });
  await t.test('book catalogue searches ISBN and course while excluding unrelated items',async()=>{
    assert.equal((await api('/items','POST',{title:'普通鼠标',description:'这是一件与校园书籍没有关系的数码商品。',price:30,categoryId:2},seller.token)).code,0);
    const r=await api('/items?kind=book&keyword=9787111128069');assert.equal(r.code,0);assert.equal(r.data.total,1);assert.equal(r.data.list[0].id,bookId);
    assert.equal((await api('/items?kind=book&keyword=978-7-111-12806-9')).data.total,1);
    const courses=await api('/items?kind=book&course=数据结构&annotation=light&genre=textbook');assert.equal(courses.data.total,1);
    assert.equal((await api('/items?kind=book&genre=reading')).data.total,0);
    assert.equal((await api('/items?kind=book&annotation=invalid')).code,1001);
  });
  await t.test('a published book follows purchase, completion and review permissions',async()=>{
    const buy=await api('/orders','POST',{itemId:bookId},buyer.token);assert.equal(buy.code,0);
    const [[row]]=await db.query('SELECT id FROM orders WHERE item_id=?',[bookId]);
    assert.equal((await api(`/orders/${row.id}/complete`,'PUT',{},buyer.token)).code,0);
    assert.equal((await api(`/community/orders/${row.id}/review`,'POST',{rating:4,content:'书籍版本一致，笔记情况与描述相符。'},buyer.token)).code,0);
    assert.equal((await api(`/community/items/${bookId}/reviews`)).data.total,1);
  });
  await t.test('book edits retain metadata and changing category removes obsolete book fields',async()=>{
    const made=await api('/items','POST',{title:'可修改的教材',description:'这本二手教材用于验证编辑分类和书籍信息。',price:18,categoryId:1,book:textbook},seller.token);const id=made.data.id;
    assert.equal((await api(`/items/${id}`,'PUT',{book:{...textbook,edition:'第 3 版'}},other.token)).code,1003);
    assert.equal((await api(`/items/${id}`,'PUT',{book:{...textbook,isbn:'invalid'}},seller.token)).code,1001);
    assert.equal((await api(`/items/${id}`,'PUT',{book:{...textbook,edition:'第 3 版'}},seller.token)).code,0);
    assert.equal((await api(`/items/${id}`)).data.book.edition,'第 3 版');
    assert.equal((await api(`/items/${id}`,'PUT',{categoryId:2},seller.token)).code,0);
    assert.equal((await api(`/items/${id}`)).data.book,null);
    assert.equal((await api(`/items/${id}`,'PUT',{categoryId:1},seller.token)).code,0);
    assert.equal((await api(`/items/${id}`)).data.book.genre,'textbook');
  });
  await t.test('upload checks image contents and uses a server-selected extension', async t => {
    const upload = async (bytes, name) => {
      const data = new FormData();
      data.set('file', new Blob([bytes], {type:'image/png'}), name);
      const response = await fetch(`http://127.0.0.1:${port}/api/items/upload`, {
        method:'POST', headers:{Authorization:`Bearer ${seller.token}`}, body:data,
      });
      const result = await response.json();
      const url = result.data?.url;
      if (url && /^\/uploads\/[A-Za-z0-9.-]+$/.test(url)) {
        t.after(() => unlink(new URL(`..${url}`, import.meta.url)));
      }
      return result;
    };
    assert.equal((await upload('This file is not an image', 'picture.png')).code, 1001);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR4YAAAAASUVORK5CYII=', 'base64');
    const uploaded = await upload(png, 'picture.svg');
    assert.equal(uploaded.code, 0);
    assert.match(uploaded.data.url, /^\/uploads\/[A-Za-z0-9-]+\.png$/);
    const staticResponse = await fetch(`http://127.0.0.1:${port}${uploaded.data.url}`);
    assert.equal(staticResponse.headers.get('content-type'), 'image/png');
    assert.equal(staticResponse.headers.get('x-content-type-options'), 'nosniff');
  });
  await t.test('same-origin frontend fallback leaves unknown API and upload URLs as JSON errors', async () => {
    const origin = `http://127.0.0.1:${port}`;
    const options = {headers:{Accept:'text/html'}};
    for (const path of ['/api/missing', '/api/admin/missing', '/uploads/missing']) {
      const response = await fetch(origin + path, options);
      assert.equal(response.status, 404);
      assert.equal((await response.json()).code, 1004);
    }

    // A source-only install can run the API tests before building the frontend.
    const built = await access(new URL('../../web/dist/index.html', import.meta.url)).then(() => true, () => false);
    if (built) {
      const response = await fetch(origin + '/admin', options);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      assert.match(await response.text(), /id="app"/);
    }
  });
  await verifyProduction(t, {api, db, runNode, buyer, seller, other, item});

  await t.test('disabled sellers cannot accept new orders and past orders remain accessible', async () => {
    const title = '下单资格校验教材';
    const itemId = await item(title);
    const alreadyOrdered = await api('/orders', 'POST', {itemId:await item(), deliveryMode:'pickup'}, buyer.token);
    assert.equal(alreadyOrdered.code, 0);
    const catalogue = `/items?keyword=${encodeURIComponent(title)}`;
    assert.equal((await api(catalogue)).data.total, 1);
    const categoryCount = async () => (await api('/categories')).data.find(row => row.id === 1).itemCount;
    const publicCount = await categoryCount();
    assert.ok(publicCount > 0);
    await db.execute("UPDATE users SET status='disabled' WHERE id=?", [seller.user.id]);
    try {
      const result = await api('/orders', 'POST', {itemId, deliveryMode:'pickup'}, buyer.token);
      assert.equal(result.code, 1005);
      assert.equal((await api(catalogue)).data.total, 0);
      assert.equal(await categoryCount(), 0);
      const existing = await api(`/orders/${alreadyOrdered.data.id}`, 'GET', undefined, buyer.token);
      assert.equal(existing.data.status, 'pending');
    } finally {
      await db.execute("UPDATE users SET status='active' WHERE id=?", [seller.user.id]);
    }
    assert.equal(await categoryCount(), publicCount);
    assert.equal((await api('/orders', 'POST', {itemId, deliveryMode:'pickup'}, buyer.token)).code, 0);
  });
});

async function verifyProduction(t, {api, db, runNode, buyer, seller, other, item}) {
  const address = {
    receiverName:'拾光同学', phone:'13800138000', province:'浙江省', city:'杭州市',
    district:'西湖区', detail:'学校东门 101 室', label:'学校',
  };
  const call = (path, method, body, account) => api(path, method, body, account?.token);
  const addAddress = async (account, details = {}) => {
    const result = await call('/addresses', 'POST', {...address, ...details}, account);
    assert.equal(result.code, 0);
    return result.data;
  };
  const getAddresses = async account => {
    const result = await call('/addresses', 'GET', undefined, account);
    assert.equal(result.code, 0);
    return result.data;
  };
  await t.test('addresses are private and concurrent updates preserve one default', async () => {
    assert.equal((await api('/addresses')).code, 1002);
    assert.equal((await call('/addresses', 'POST', {...address, phone:'invalid'}, buyer)).code, 1001);
    const first = await addAddress(buyer);
    assert.equal(first.isDefault, true);
    const [second] = await Promise.all([
      addAddress(buyer, {detail:'第二个地址', isDefault:true}),
      addAddress(buyer, {detail:'第三个地址', isDefault:true}),
    ]);
    assert.equal((await getAddresses(buyer)).filter(row => row.isDefault).length, 1);
    assert.deepEqual(await getAddresses(other), []);
    const firstPath = `/addresses/${first.id}`;
    for (const [path, method, body] of [
      [firstPath, 'PUT', address], [`${firstPath}/default`, 'PUT', {}], [firstPath, 'DELETE', undefined],
    ]) {
      assert.equal((await call(path, method, body, other)).code, 1004);
    }
    assert.equal((await call(`/addresses/${second.id}/default`, 'PUT', {}, buyer)).code, 0);
    assert.deepEqual((await getAddresses(buyer)).filter(row => row.isDefault).map(row => row.id), [second.id]);
    assert.equal((await call(`/addresses/${second.id}`, 'DELETE', undefined, buyer)).code, 0);
    assert.equal((await getAddresses(buyer)).filter(row => row.isDefault).length, 1);
  });

  await t.test('shipping requires an owned address and preserves a private address snapshot', async () => {
    const itemId = await item();
    const shipping = {itemId, deliveryMode:'shipping'};
    assert.equal((await call('/orders', 'POST', shipping, buyer)).code, 1001);
    const saved = await addAddress(buyer);
    const foreign = await addAddress(other);
    assert.equal((await call('/orders', 'POST', {...shipping, addressId:foreign.id}, buyer)).code, 1004);
    const created = await call('/orders', 'POST', {...shipping, addressId:saved.id}, buyer);
    assert.equal(created.code, 0);
    const orderPath = `/orders/${created.data.id}`;
    const addressPath = `/addresses/${saved.id}`;
    assert.equal((await call(addressPath, 'PUT', {...address, detail:'改变后的收件地址'}, buyer)).code, 0);
    assert.equal((await call(addressPath, 'DELETE', undefined, buyer)).code, 0);
    for (const account of [buyer, seller]) {
      const detail = await call(orderPath, 'GET', undefined, account);
      assert.equal(detail.code, 0);
      assert.deepEqual(detail.data.addressSnapshot, address);
      assert.equal(detail.data.orderNo, created.data.orderNo);
      assert.equal(detail.data.deliveryMode, 'shipping');
    }
    assert.equal((await call(orderPath, 'GET', undefined, other)).code, 1003);
    const keyword = created.data.orderNo;
    assert.equal((await call(`/orders?role=buyer&status=pending&keyword=${keyword}`, 'GET', undefined, buyer)).data.total, 1);
    assert.equal((await call(`/orders?role=seller&status=shipped&keyword=${keyword}`, 'GET', undefined, seller)).data.total, 0);
    assert.equal(JSON.stringify((await api(`/items/${itemId}`)).data).includes(address.phone), false);
  });

  await t.test('only the seller may ship and only the buyer may complete a shipped order', async () => {
    assert.equal((await api('/orders/1/ship', 'PUT', {})).code, 1002);
    const itemId = await item();
    const existing = await addAddress(buyer);
    const created = await call('/orders', 'POST', {itemId, deliveryMode:'shipping', addressId:existing.id}, buyer);
    assert.equal(created.code, 0);
    const orderPath = `/orders/${created.data.id}`;
    const shipment = {carrier:'顺丰', trackingNo:'SF12345678'};
    assert.equal((await call(`${orderPath}/complete`, 'PUT', {}, buyer)).code, 1005);
    assert.equal((await call(`${orderPath}/ship`, 'PUT', shipment, buyer)).code, 1003);
    assert.equal((await call(`${orderPath}/ship`, 'PUT', {carrier:' ', trackingNo:'123'}, seller)).code, 1001);
    assert.equal((await call(`${orderPath}/ship`, 'PUT', shipment, seller)).code, 0);
    const shipped = (await call(orderPath, 'GET', undefined, buyer)).data;
    assert.equal(shipped.status, 'shipped');
    assert.equal(shipped.carrier, shipment.carrier);
    assert.equal(shipped.trackingNo, shipment.trackingNo);
    assert.ok(shipped.shippedAt);
    assert.equal((await call(`${orderPath}/cancel`, 'PUT', {}, seller)).code, 1005);
    assert.equal((await call(`${orderPath}/complete`, 'PUT', {}, seller)).code, 1003);
    assert.equal((await call(`${orderPath}/complete`, 'PUT', {}, buyer)).code, 0);
    const finished = (await call(orderPath, 'GET', undefined, buyer)).data;
    assert.equal(finished.status, 'completed');
    assert.ok(finished.completedAt);
    const [[soldItem]] = await db.execute('SELECT status FROM items WHERE id=?', [itemId]);
    assert.equal(soldItem.status, 'sold');
    const pickup = (await call('/orders', 'POST', {itemId:await item(), deliveryMode:'pickup'}, buyer)).data;
    assert.equal((await call(`/orders/${pickup.id}/ship`, 'PUT', shipment, seller)).code, 1005);
  });

  await t.test('admin actions enforce current roles and record the resulting changes', async () => {
    assert.equal((await api('/admin/overview')).code, 1002);
    assert.equal((await call('/admin/overview', 'GET', undefined, buyer)).code, 1003);
    const attempt = await api('/auth/register', 'POST', {
      username:'role_claim', password:'Testpass2026', nickname:'普通用户', role:'admin',
    });
    assert.equal(attempt.code, 1001);

    const bootstrap = extra => runNode(['src/config/admin-bootstrap.js'], extra);
    await assert.rejects(bootstrap({ADMIN_USERNAME:'buyer_ui', ADMIN_PASSWORD:'123456'}), /普通用户/);
    assert.equal((await call('/admin/overview', 'GET', undefined, buyer)).code, 1003);
    await bootstrap({ADMIN_USERNAME:'moya', ADMIN_PASSWORD:'123456'});
    const login = (username, password) => api('/auth/login', 'POST', {username, password});
    const signedIn = await login('moya', '123456');
    assert.equal(signedIn.code, 0);
    const admin = signedIn.data;
    assert.equal(admin.user.role, 'admin');
    assert.equal(admin.user.status, 'active');
    assert.equal(Object.hasOwn(admin.user, 'password'), false);
    assert.equal((await call('/auth/me', 'GET', undefined, admin)).data.role, 'admin');
    const overview = await call('/admin/overview', 'GET', undefined, admin);
    for (const field of ['users','items','onSale','orders','pending','shipped','completed','cancelled']) {
      assert.equal(typeof overview.data[field], 'number', field);
    }
    assert.ok(Array.isArray(overview.data.recentOrders));

    const manageable = await item();
    const pending = (await call('/orders', 'POST', {itemId:manageable, deliveryMode:'pickup'}, buyer)).data;
    const orderPath = `/admin/orders/${pending.id}`;
    assert.equal((await call(orderPath, 'GET', undefined, admin)).data.orderNo, pending.orderNo);
    assert.equal((await call(`/admin/orders?status=pending&keyword=${pending.orderNo}`, 'GET', undefined, admin)).data.total, 1);
    const itemStatus = status => call(`/admin/items/${manageable}/status`, 'PUT', {status, reason:'管理测试'}, admin);
    assert.equal((await itemStatus('off_shelf')).code, 1005);
    assert.equal((await call(`${orderPath}/cancel`, 'PUT', {}, admin)).code, 1001);
    await db.query("CREATE TRIGGER fail_test_audit BEFORE INSERT ON admin_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated audit rollback test'");
    try {
      assert.equal((await call(`${orderPath}/cancel`, 'PUT', {reason:'应回滚'}, admin)).code, 5000);
      const [[unchanged]] = await db.execute(
        'SELECT i.status AS itemStatus, o.status AS orderStatus FROM items i JOIN orders o ON o.item_id=i.id WHERE o.id=?',
        [pending.id],
      );
      assert.deepEqual(unchanged, {itemStatus:'reserved', orderStatus:'pending'});
    } finally {
      await db.query('DROP TRIGGER fail_test_audit');
    }
    assert.equal((await call(`${orderPath}/cancel`, 'PUT', {reason:'双方请求取消'}, admin)).code, 0);
    assert.equal((await itemStatus('off_shelf')).code, 0);
    const offShelf = await call('/admin/items?status=off_shelf&keyword=测试教材', 'GET', undefined, admin);
    assert.equal(offShelf.data.total, 1);
    assert.ok(offShelf.data.list[0].sellerNickname);
    assert.equal((await itemStatus('on_sale')).code, 0);

    const accountStatus = (id, status) => call(`/admin/users/${id}/status`, 'PUT', {status, reason:'账户状态测试'}, admin);
    assert.equal((await accountStatus(admin.user.id, 'disabled')).code, 1003);
    assert.equal((await accountStatus(other.user.id, 'disabled')).code, 0);
    assert.equal((await call('/auth/me', 'GET', undefined, other)).code, 1003);
    assert.equal((await login('other_ui', 'Testpass2026')).code, 1003);
    const disabled = await call('/admin/users?keyword=other_ui&status=disabled', 'GET', undefined, admin);
    assert.deepEqual(Object.keys(disabled.data.list[0]).sort(), ['createdAt','id','nickname','role','status','username']);
    assert.equal((await accountStatus(other.user.id, 'active')).code, 0);
    assert.equal((await call('/auth/me', 'GET', undefined, other)).code, 1002);

    const audit = await call('/admin/audit', 'GET', undefined, admin);
    assert.equal(audit.data.total, 5);
    assert.deepEqual(new Set(audit.data.list.map(row => row.targetType)), new Set(['order','item','user']));
    assert.ok(audit.data.list.every(row => row.actorName === 'moya' && row.detail && row.createdAt));

    const changed = await call('/auth/password', 'PUT', {currentPassword:'123456', newPassword:'Changed2026'}, admin);
    assert.equal(changed.code, 0);
    assert.equal((await call('/admin/overview', 'GET', undefined, admin)).code, 1002);
    await bootstrap({ADMIN_USERNAME:'moya', ADMIN_PASSWORD:'123456'});
    assert.equal((await login('moya', '123456')).code, 1002);
    const renewed = (await login('moya', 'Changed2026')).data;
    await db.execute("UPDATE users SET role='user' WHERE id=?", [admin.user.id]);
    assert.equal((await call('/admin/overview', 'GET', undefined, renewed)).code, 1003);
  });
  await t.test('catalogue pagination is stable when many listings share the same timestamp and price',async()=>{
    const keyword='同秒批量上架分页';
    for(let i=0;i<64;i++)await db.execute("INSERT INTO items(title,description,price,category_id,seller_id,created_at) VALUES(?,?,20,1,?,'2026-01-01 12:00:00')",[keyword+i,'同秒批量上架，用于检验分页是否重叠或遗漏。',seller.user.id]);
    for(const sort of ['latest','priceAsc','priceDesc','popular']){
      const ids=[];
      for(let page=1;page<=2;page++){
        const result=await api(`/items?keyword=${encodeURIComponent(keyword)}&sort=${sort}&pageSize=50&page=${page}`);
        assert.equal(result.code,0);assert.equal(result.data.total,64);ids.push(...result.data.list.map(item=>item.id));
      }
      assert.equal(ids.length,64);assert.equal(new Set(ids).size,64,sort+' 页间不能重复或遗漏');
      assert.deepEqual(ids,[...ids].sort((a,b)=>b-a),sort+' 同值应按商品编号倒序保持稳定');
    }
  });
}
