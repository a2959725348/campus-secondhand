/**
 * 统一响应格式：
 *   成功 { code: 0, message: 'ok', data }
 *   失败 { code: 非0, message: '人话错误提示' }
 * 前端只需要判断 code 是否为 0，不用解析 HTTP 状态语义。
 */

const CODE = {
  OK: 0,
  PARAM: 1001,       // 参数校验失败
  UNAUTH: 1002,      // 未登录 / token 失效
  FORBID: 1003,      // 已登录但无权限
  NOT_FOUND: 1004,   // 资源不存在
  CONFLICT: 1005,    // 业务冲突（重复收藏、商品已售）
  SERVER: 5000,      // 服务端异常
};

export class ApiError extends Error {
  constructor(code, message, httpStatus = 200) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export const ok = (res, data = null, message = 'ok') => res.json({ code: 0, message, data });

export const fail = (res, code, message) => res.json({ code, message });

/** 抛参数错误，交给全局错误中间件转成响应 */
export const badRequest = (message) => new ApiError(CODE.PARAM, message);
export const unauthorized = (message = '请先登录') => new ApiError(CODE.UNAUTH, message);
export const forbidden = (message = '没有操作权限') => new ApiError(CODE.FORBID, message);
export const notFound = (message = '资源不存在') => new ApiError(CODE.NOT_FOUND, message);
export const conflict = (message) => new ApiError(CODE.CONFLICT, message);

/**
 * 分页参数解析。前端可能传 page=0、page=-1 或 page=abc，全部夹到合法范围，
 * 并且限制 pageSize 上限防止有人传 100000 把库拖死。
 */
export function parsePage(query, { defaultSize = 12, maxSize = 50 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawSize = Number.parseInt(query.pageSize, 10) || defaultSize;
  const pageSize = Math.min(maxSize, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export { CODE };
