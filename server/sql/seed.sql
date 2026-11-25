-- 新库分类由 npm run db:init 写入。
INSERT INTO categories (id, name, slug, icon, sort) VALUES
  (1, '教材书籍', 'book',     'Reading',      1),
  (2, '数码电器', 'digital',  'Cellphone',    2),
  (3, '生活用品', 'life',     'Household',    3),
  (4, '服饰鞋包', 'clothing', 'ShoppingBag',  4),
  (5, '运动户外', 'sports',   'Basketball',   5),
  (6, '美妆护肤', 'beauty',   'MagicStick',   6),
  (7, '乐器文创', 'art',      'Headset',      7),
  (8, '其他闲置', 'other',    'MoreFilled',   8);
