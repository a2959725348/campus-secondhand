import mysql from 'mysql2/promise';
import { env } from './env.js';

/**
 * 连接池全局单例。
 * connectionLimit 20 对本项目足够：宿舍局域网场景并发很低，
 * 池子太大反而会占用 MySQL 的 max_connections。
 */
export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  // DECIMAL 默认返回字符串，容易在比较时踩坑，统一转成 number
  decimalNumbers: true,
  timezone: '+08:00',
});

/** 执行一条 SQL，返回结果行 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** 执行一条 SQL，返回首行；没有结果返回 null */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * 事务包装：回调里抛异常则自动回滚。
 * 下单流程（改商品状态 + 写订单）必须在同一个事务里，否则会出现
 * "商品已标记售出但订单没写进去" 的脏状态。
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
