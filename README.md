# 拾光集市 · 校园二手交易平台

Vue 3 / Vite / Element Plus + Express + MySQL 8。正式版初始化只创建分类与管理员，不安装演示账号、商品或订单。首页保留校园摄影设计，真实库存由用户发布。

## 主要功能

| 模块 | 功能 |
| --- | --- |
| 商品与书市 | 搜索、分类、收藏、多图发布、上下架；二手书作者、版次、ISBN、课程、笔记程度 |
| 账号与资料 | 注册登录、个人资料、发布与收藏统计 |
| 地址管理 | 新增、编辑、删除、默认地址；仅本人可管理 |
| 订单管理 | 我买到的 / 我卖出的、状态筛选、搜索、分页、详情；校内面交或邮寄 |
| 邮寄流程 | 下单保存地址快照，卖家填写快递公司与单号，买家确认收货 |
| 社区与评价 | 公开问答、卖家回复；完成订单后买家一次性评价 |
| 管理后台 | 概览、订单管理、商品下架与恢复、账号启停、操作日志、账户改密 |

管理员初始账号 **moya**，初始密码 **123456**。登录后自动进入独立后台，普通用户进入交易网站。后台“账户设置”可修改密码。初始密码依照项目要求设置，请在公开使用前修改。

系统记录交易与快递信息，尚未接入在线支付或物流实时查询；订单状态不代表支付凭证。

## 64 件商品与书籍内容包

当前本地版本已加入 64 件在售内容：32 本技术与英文阅读书籍、12 件数码电器、5 件生活用品、5 件服饰鞋包、7 件运动户外、3 件乐器文创。均配有本地图片、价格、中文介绍与面交信息；书籍额外包含作者、ISBN、课程和类型。

新机器安装仍默认是空商品库。若要导入本次内容，完成数据库初始化后在 `server` 目录执行：

```powershell
npm.cmd run catalog:import -- --dry-run
npm.cmd run catalog:import -- --seller moya
```

第一条只校验文件，不连接数据库；第二条使用 `.env` 的 `DB_NAME` 写入。执行前核对目标库。导入挂在指定的已启用管理员名下，不创建额外账号，不更改已存在的商品；重复执行会跳过已导入项目，保留之后的标题、价格与上下架修改。导入使用事务和 `catalog_imports` 标识表，数据库账号需有建表权限。

内容文件为 `server/data/catalog-20261125.json`，图片位于 `server/uploads/catalog` 与 `web/public/uploads/catalog`；来源记录见 `docs/CATALOG-PHOTO-SOURCES.json`。书籍是英文版，封面按 ISBN 配对，未提供电子书内容。文案与上架信息应在实际交易前由发布者核实。详见 `docs/CATALOG-UPDATE.md`。

## 首次安装（Windows PowerShell）

从 GitHub 克隆或下载的源码需要先构建前端。在项目 web 目录执行 `npm.cmd ci` 和 `npm.cmd run build -- --configLoader runner`，再按下列步骤初始化后端。

准备 Node.js 22 / 24、MySQL 8，使用全新的专用数据库名。交付包附带已编译的 `web/dist`，不含私有配置、业务数据或依赖目录。

```powershell
cd "你的项目路径\server"
npm.cmd ci
Copy-Item .env.example .env
notepad .env
```

填写数据库连接参数；建议 `DB_NAME=campus_trade_production`。`JWT_SECRET` 必须填写自己生成的至少 32 字节随机长密钥，不能使用公开示例值。可用以下命令生成，结果只保存在自己的 `.env`，不要提交仓库：

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

本机单端口运行时配置 `HOST=127.0.0.1`、`PORT=3000`、`WEB_ORIGIN=http://127.0.0.1:3000`。首次初始化：

```powershell
npm.cmd run db:init
$env:NODE_ENV='production'
npm.cmd start
```

打开 http://127.0.0.1:3000/ ，使用管理员账号登录。Express 同时提供前端和 `/api`，正式运行无需启动 Vite。`db:init` 拒绝目标库中已有任何表，不会清空旧库。`ADMIN_USERNAME`、`ADMIN_PASSWORD` 可在初始化前覆盖默认管理员凭据。

## 已有版本升级（保留数据）

1. 备份原数据库、`server/.env` 和 `server/uploads`，停止旧服务写入。
2. 替换代码，保留原私有配置与商品图片；若旧 `JWT_SECRET` 为公开示例值或不足 32 字节，先按首次安装说明生成并替换密钥。在 `server` 执行 `npm.cmd ci`。
3. 执行 `npm.cmd run db:migrate`，然后 `npm.cmd run admin:create`。
4. 启动服务，检查账号、商品与历史订单。升级不删除旧演示数据；要完全干净运行，请改用新库初始化。

迁移包含社区、书市与 `004_production.sql`，可重复执行。管理员创建不会重置已有管理员密码；同名普通账号会导致创建停止，请先核对归属。升级并更换令牌校验后需要重新登录。不要向旧业务库执行 `db:init` 或种子脚本。

## 操作流程

- 普通用户注册后可发布实拍商品、购买、填写地址。在详情选择“校内面交”或“邮寄”；邮寄必须选择本人地址。
- 待交易订单允许取消，商品恢复在售。邮寄须由卖家先发货、买家再确认收货；已发货订单不提供取消后重新出售的入口。
- 修改或删除地址不改变已下单的地址快照。订单地址仅交易双方与管理员可见。
- 管理员可搜索订单、查看详情、填写原因取消待交易订单；可上下架商品、启停普通账号并查看日志。不能禁用当前管理员本人。
- 无评价显示“暂无评价”，空库显示空状态，不制造销量与库存。

## 修改代码与更新

前端位于 `web/src`，后端位于 `server/src`。后端修改后重启服务；前端修改后重新构建：

```powershell
cd "你的项目路径\web"
npm.cmd ci
npm.cmd run build -- --configLoader runner
```

开发模式可分别运行 `server` 的 `npm.cmd run dev` 与 `web` 的 `npm.cmd run dev`。Vite 默认代理到后端 3000；自定义后端端口可设置 `API_TARGET`。正式部署使用构建产物。

## 公网部署

本交付包提供正式版源码和可运行构建，尚未绑定校园项目的公网域名。服务器需持续运行 Node.js 与 MySQL，通过 HTTPS 反向代理转发到本机 API 端口，并设置进程守护、数据库与图片备份。若需直接监听其他网卡，可显式设置 `HOST`；默认仅本机访问。前后端使用同一域名，`WEB_ORIGIN` 改为该 HTTPS 域名。公网入口应配置登录限流。

请将 `.env`、数据库、真实上传图片、备份排除在公开 Git 仓库之外。关闭开发电脑后仍运行，需要把服务部署到持续运行的服务器。

## 验证与资料

后端：在 `server` 执行 `npm.cmd test`。测试使用随机前缀的独立 MySQL 数据库，覆盖交易、权限、地址快照、邮寄、管理操作、审计回滚和干净初始化。数据库账号需有创建测试库权限。

接口统一响应 `{code,message,data}`，不能仅以 HTTP 200 判断成功。细节见 `docs/PRODUCTION-SPEC.md`、`docs/PRODUCTION-VERIFICATION.md`。`docs/PHOTO-SOURCES.json` 记录装饰摄影来源；出售商品应使用发布者自己的实拍图。历史设计说明不适用于正式初始化。
