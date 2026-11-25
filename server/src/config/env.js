import 'dotenv/config';

/**
 * 环境变量集中读取 + 启动前校验。
 * 缺失关键配置时直接抛错，避免带着 undefined 跑到运行时才炸。
 */
const required = ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`缺少环境变量：${missing.join(', ')}，请复制 .env.example 为 .env 后填写`);
}

const jwtSecret = process.env.JWT_SECRET;
const placeholder = /change[-_\s]*me|replace[-_\s]*me|your[-_\s]*secret|example[-_\s]*secret|placeholder/i;
if (Buffer.byteLength(jwtSecret.trim()) < 32 || new Set(jwtSecret.trim()).size < 8 || placeholder.test(jwtSecret)) {
  throw new Error('JWT_SECRET 需要至少 32 字节的独立随机密钥。请按 .env.example 生成。');
}

export const env = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
};
