import { CODE } from '../utils/response.js';

/** 404 兜底：所有未匹配的路径 */
export function notFoundHandler(req, res) {
  res.status(404).json({ code: CODE.NOT_FOUND, message: `接口不存在：${req.method} ${req.path}` });
}

/**
 * 全局错误处理。
 * 约定：业务错误用 ApiError 抛，这里翻译成 code + message；
 * 非预期的异常一律回 5000 并打印堆栈，绝不把 SQL 报错原文返回给前端
 * （会泄露表结构，也不安全）。
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.code && typeof err.code === 'number' && err.httpStatus) {
    return res.status(err.httpStatus).json({ code: err.code, message: err.message });
  }

  // multer 的文件体积超限
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.json({ code: CODE.PARAM, message: '图片不能超过 5MB' });
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ code: CODE.SERVER, message: '服务器开小差了，请稍后再试' });
}
