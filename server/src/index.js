import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { attachUser } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import categoriesRouter from './routes/categories.js';
import itemsRouter from './routes/items.js';
import ordersRouter from './routes/orders.js';
import favoritesRouter from './routes/favorites.js';
import communityRouter from './routes/community.js';
import addressesRouter from './routes/addresses.js';
import adminRouter from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: env.webOrigin, credentials: true }));
// 图片走 base64 上传时体积较大，放宽到 2mb
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);

// 静态资源：商品图片
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), {
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  },
}));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ code: 0, message: 'ok', data: { db: 'up', time: new Date().toISOString() } });
  } catch {
    res.json({ code: 5000, message: '数据库连接失败' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/items', itemsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/community', communityRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/admin', adminRouter);

app.use(['/api', '/uploads'], notFoundHandler);
const webDist = path.resolve(__dirname, '../../web/dist');
const webIndex = path.join(webDist, 'index.html');
if (existsSync(webIndex)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (!req.accepts('html') || path.extname(req.path)) return next();
    res.sendFile(webIndex);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, env.host, () => {
  console.log(`拾光集市已启动：http://${env.host}:${server.address().port}`);
});

// 优雅退出：关掉连接池，避免 node --watch 重启时连接数越积越多
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`收到 ${signal}，正在关闭...`);
    server.close();
    await pool.end();
    process.exit(0);
  });
}

export default app;
