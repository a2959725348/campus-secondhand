# 拾光集市正式版：订单、地址与后台

用户授权：移除校园交易演示项目与演示账号，提供正式版；管理员 moya / 123456，登录后自动进入后台。

## 范围

- 保留 Vue / Express / MySQL。全新初始化仅分类和管理员，无虚构商品、演示用户或订单。旧数据库升级保留数据，不自动清除用户记录。正式本地运行切到独立新库。
- 普通用户：注册登录、资料、地址 CRUD 和默认地址、买卖订单列表/状态筛选/详情；校内面交或邮寄下单。邮寄需本人地址，保存不可变地址快照；卖家发货填快递公司/单号，买家签收完成；取消仅待交易订单。
- 后台：独立中文深绿布局，概览、订单搜索/状态筛选/详情及取消待交易订单、商品下架/恢复在售但不得改变已预定/售出、用户启用/禁用、操作日志、账户改密。禁止管理员自禁，注册不能指定管理员。权限由数据库实时角色与用户状态决定，不信任 localStorage 或 JWT 的角色。
- 管理员初始用户名 moya、密码 123456，仅存 bcrypt 哈希；不在登录页公开显示。可从后台改密，旧令牌随 token_version 撤销。管理员登录无论原 redirect 是什么，进入 /admin。
- 订单状态：pending/shipped/completed/cancelled；面交 pending→completed，邮寄 pending→shipped→completed；pending→cancelled。与原商品行锁、事务、有效订单唯一约束兼容。已发货不可取消后重新上架。
- 地址字段：receiverName、phone、province、city、district、detail、label、isDefault。订单仅买卖双方与管理员可看地址快照；公开商品/问答不返回地址或电话。
- 不新增资金支付，不伪造支付状态，不发布至未知公网目的地，不改 MOYA 网站，不修改原 ZIP 或正式业务库。

## 固定接口

GET/POST /api/addresses；PUT/DELETE /api/addresses/:id；PUT /api/addresses/:id/default。

POST /api/orders {itemId,remark?,deliveryMode:'pickup'|'shipping',addressId?} → {id,orderNo}。
GET /api/orders?role=buyer|seller&status=...&keyword=... 返回 {list,total,page,pageSize}。
GET /api/orders/:id → 单个订单；PUT /api/orders/:id/ship {carrier,trackingNo}；原 complete/cancel 继续使用。
订单对象统一包括 id/orderNo/status/itemId/itemTitle/cover/price/buyerId/buyerNickname/sellerId/sellerNickname/remark/createdAt/reviewId/reviewRating/deliveryMode/addressSnapshot/carrier/trackingNo/shippedAt/completedAt。

GET /api/admin/overview → {users,items,onSale,orders,pending,shipped,completed,cancelled,recentOrders}；各计数为数字。
GET /api/admin/orders → 同普通订单列表形状，跨用户；GET /api/admin/orders/:id；PUT /api/admin/orders/:id/cancel {reason}。
GET /api/admin/items?keyword=&status= → {list,total,page,pageSize}；字段复用商品列表并含 sellerNickname。
PUT /api/admin/items/:id/status {status:'on_sale'|'off_shelf',reason}。
GET /api/admin/users?keyword=&status= → {list,total,page,pageSize}；用户字段 id,username,nickname,role,status,createdAt（不返回密码或密钥）。
PUT /api/admin/users/:id/status {status:'active'|'disabled',reason}；GET /api/admin/audit → {list,total,page,pageSize}，记录 actorName/action/targetType/targetId/detail/createdAt。
PUT /api/auth/password {currentPassword,newPassword} → 登出，重新登录；GET auth/me 与登录返回 role/status。

## 验证

先写真实隔离 MySQL 测试，覆盖管理员权限/禁用/注册提权拒绝、地址归属/默认唯一、地址快照、邮寄发货权限与状态、后台管理动作和审计、干净初始化；保留书市与交易回归。前端构建与 PC/390 手机浏览器验证，打包排除真实 env/数据/上传文件。
