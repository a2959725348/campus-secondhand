import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {applyMigrations} from '../src/config/migrate.js';
import {loadCatalog, importCatalog} from '../src/config/import-catalog.js';

test('catalogue contains at least 60 complete listings with local book covers and product photos', async()=>{
  const catalog=await loadCatalog();
  assert.equal(catalog.length,64);
  assert.equal(catalog.filter(item=>item.book).length,32);
  assert.equal(new Set(catalog.map(item=>item.key)).size,64);
  assert.equal(new Set(catalog.flatMap(item=>item.images)).size,64);
  for(const item of catalog){
    assert.ok(item.description.length>=80,item.title);
    assert.ok(item.price>0,item.title);
    for(const image of item.images){
      const server=await readFile(new URL('..'+image,import.meta.url));
      const web=await readFile(new URL('../../web/public'+image,import.meta.url));
      assert.deepEqual(server.subarray(0,3),Buffer.from([255,216,255]));
      assert.deepEqual(server,web);
    }
  }
});

test('catalogue import is atomic, uses the selected administrator and preserves subsequent edits',async t=>{
  dotenv.config({quiet:true});
  const database=`campus_catalog_test_${process.pid}_${Date.now()}`;
  assert.match(database,/^campus_catalog_test_\d+_\d+$/);
  const conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,multipleStatements:true});
  t.after(async()=>{await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);await conn.end();});
  const schema=(await readFile(new URL('../sql/schema.sql',import.meta.url),'utf8')).replaceAll('campus_trade',database);
  await conn.query(schema);await applyMigrations(conn);
  await conn.query(await readFile(new URL('../sql/seed.sql',import.meta.url),'utf8'));
  await conn.query("INSERT INTO users(username,password,nickname,role) VALUES ('moya','unused-test-hash','管理员','admin'),('member','unused-test-hash','普通用户','user')");
  const catalog=await loadCatalog();
  await assert.rejects(importCatalog(conn,{sellerUsername:'member',catalog}),/管理员/);
  const invalid=structuredClone(catalog);invalid[63].categorySlug='missing-category';
  await assert.rejects(importCatalog(conn,{sellerUsername:'moya',catalog:invalid}),/分类/);
  assert.equal((await conn.query('SELECT COUNT(*) n FROM items'))[0][0].n,0);
  const first=await importCatalog(conn,{sellerUsername:'moya',catalog});
  assert.equal(first.inserted,64);assert.equal(first.skipped,0);
  const [[firstItem]]=await conn.query('SELECT id FROM items ORDER BY id LIMIT 1');
  await conn.execute("UPDATE items SET title='管理员已修改标题',price=99,status='off_shelf' WHERE id=?",[firstItem.id]);
  const second=await importCatalog(conn,{sellerUsername:'moya',catalog});
  assert.equal(second.inserted,0);assert.equal(second.skipped,64);
  const [[edited]]=await conn.execute('SELECT title,price,status FROM items WHERE id=?',[firstItem.id]);
  assert.equal(edited.title,'管理员已修改标题');assert.equal(Number(edited.price),99);assert.equal(edited.status,'off_shelf');
  assert.equal((await conn.query('SELECT COUNT(*) n FROM item_books'))[0][0].n,32);
  assert.equal((await conn.query('SELECT COUNT(DISTINCT seller_id) n FROM items'))[0][0].n,1);
  assert.equal((await conn.query('SELECT COUNT(*) n FROM users'))[0][0].n,2);
});
