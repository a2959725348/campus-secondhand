import { badRequest } from './response.js';

export function positiveId(value, label) {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 4294967295) throw badRequest(`${label} ID 不合法`);
  return id;
}

export function requiredText(value, label, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw badRequest(`${label}需填写且最多 ${max} 字`);
  return text;
}

export function parseFilters({ status = '', keyword = '' }, statuses) {
  if (status !== '' && !statuses.includes(status)) throw badRequest('状态筛选参数不正确');
  if (typeof keyword !== 'string' || keyword.length > 100) throw badRequest('搜索词最多 100 字');
  return { status, keyword: keyword.trim() };
}
