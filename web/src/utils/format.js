import itemPlaceholder from '../assets/item-placeholder.svg';
/** 成色中文映射，多处复用 */
export const CONDITION_LABELS = {
  new: '全新',
  like_new: '几乎全新',
  good: '成色良好',
  fair: '有使用痕迹',
};

export const STATUS_LABELS = {
  on_sale: '在售',
  reserved: '已预定',
  sold: '已售出',
  off_shelf: '已下架',
};

export const SORT_OPTIONS = [
  { value: 'latest', label: '最新发布' },
  { value: 'priceAsc', label: '价格从低到高' },
  { value: 'priceDesc', label: '价格从高到低' },
  { value: 'popular', label: '最多浏览' },
];

/** 图片地址兜底：没有图就返回占位图，避免列表出现破图 */
export function resolveImage(url) {
  return url || itemPlaceholder;
}

/** 千分位价格，¥32,000 这种读起来更快 */
export function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return '¥0';
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** 相对时间：3 分钟前 / 2 天前，比一串时间戳更好读 */
export function timeAgo(input) {
  if (!input) return '';
  const time = new Date(input).getTime();
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(input).toLocaleDateString('zh-CN');
}
