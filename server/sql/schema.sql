-- =============================================================
-- 校园二手交易平台 · 数据库结构
-- MySQL 8.0 / utf8mb4
-- 首次安装请使用 npm run db:init；已有数据库升级使用 npm run db:migrate。
-- =============================================================

CREATE DATABASE IF NOT EXISTS campus_trade DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE campus_trade;

-- -------------------------------------------------------------
-- 1. 用户表
-- -------------------------------------------------------------
CREATE TABLE users (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username    VARCHAR(30)     NOT NULL COMMENT '登录账号，学号或手机号',
  password    CHAR(60)        NOT NULL COMMENT 'bcrypt 散列，绝不存明文',
  nickname    VARCHAR(30)     NOT NULL COMMENT '展示昵称',
  avatar      VARCHAR(255)    DEFAULT NULL COMMENT '头像相对路径',
  phone       VARCHAR(20)     DEFAULT NULL,
  campus      VARCHAR(50)     DEFAULT NULL COMMENT '所在校区',
  credit      SMALLINT        NOT NULL DEFAULT 100 COMMENT '信用分，0-100',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户';

-- -------------------------------------------------------------
-- 2. 商品分类表
-- -------------------------------------------------------------
CREATE TABLE categories (
  id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(20)      NOT NULL,
  slug        VARCHAR(20)      NOT NULL COMMENT '前端路由用英文标识',
  icon        VARCHAR(30)      DEFAULT NULL COMMENT '前端图标名',
  sort        TINYINT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品分类';

-- -------------------------------------------------------------
-- 3. 商品表
-- -------------------------------------------------------------
CREATE TABLE items (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  title          VARCHAR(60)    NOT NULL,
  description    TEXT           NOT NULL,
  price          DECIMAL(10,2)  NOT NULL COMMENT '售价',
  original_price DECIMAL(10,2)  DEFAULT NULL COMMENT '原价，用于展示折扣',
  category_id    TINYINT UNSIGNED NOT NULL,
  seller_id      INT UNSIGNED   NOT NULL,
  item_condition ENUM('new','like_new','good','fair') NOT NULL DEFAULT 'good' COMMENT '成色',
  trade_place    VARCHAR(50)    DEFAULT NULL COMMENT '面交地点',
  status         ENUM('on_sale','reserved','sold','off_shelf') NOT NULL DEFAULT 'on_sale',
  view_count     INT UNSIGNED   NOT NULL DEFAULT 0,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_category (category_id, status),
  KEY idx_items_seller   (seller_id, status),
  KEY idx_items_status_time (status, created_at),
  FULLTEXT KEY ft_items_title (title, description) WITH PARSER ngram,
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_items_seller   FOREIGN KEY (seller_id)   REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_items_price  CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品';

-- -------------------------------------------------------------
-- 4. 商品图片表（一个商品多图，1:N）
-- -------------------------------------------------------------
CREATE TABLE item_images (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id    INT UNSIGNED NOT NULL,
  url        VARCHAR(255) NOT NULL,
  sort       TINYINT      NOT NULL DEFAULT 0 COMMENT '0 为主图',
  PRIMARY KEY (id),
  KEY idx_item_images_item (item_id, sort),
  CONSTRAINT fk_item_images_item FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品图片';

-- -------------------------------------------------------------
-- 5. 收藏表（用户 × 商品 多对多）
-- -------------------------------------------------------------
CREATE TABLE favorites (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  item_id    INT UNSIGNED NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_favorites_user_item (user_id, item_id),
  KEY idx_favorites_item (item_id),
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_item FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收藏';

-- -------------------------------------------------------------
-- 6. 订单表
-- -------------------------------------------------------------
CREATE TABLE orders (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  order_no   CHAR(20)      NOT NULL COMMENT '业务单号',
  item_id    INT UNSIGNED  NOT NULL,
  buyer_id   INT UNSIGNED  NOT NULL,
  seller_id  INT UNSIGNED  NOT NULL,
  price      DECIMAL(10,2) NOT NULL COMMENT '下单时价格快照',
  status     ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  remark     VARCHAR(100)  DEFAULT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orders_no (order_no),
  UNIQUE KEY uk_orders_item (item_id) COMMENT '一件商品只能被下单一次，靠唯一索引兜底防超卖',
  KEY idx_orders_buyer  (buyer_id, status),
  KEY idx_orders_seller (seller_id, status),
  CONSTRAINT fk_orders_item   FOREIGN KEY (item_id)   REFERENCES items (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_buyer  FOREIGN KEY (buyer_id)  REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单';
