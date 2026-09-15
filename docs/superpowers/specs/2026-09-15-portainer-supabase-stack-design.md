# Portainer 单 Stack 自建 Supabase 设计

## 目标

在一台 `x86_64` 服务器上，通过 Portainer Web Editor 使用一个 Docker Compose Stack 同时部署完整自建 Supabase 和 `cxcy` 网站。Supabase 的 URL、公开 Key 与服务端 Key 只在 Portainer Stack 环境变量中维护；GitHub Actions 只负责构建和发布不含环境密钥的应用镜像。

## 背景与约束

- `cxcy` 当前依赖 Supabase Auth、REST API、RLS、PostgreSQL RPC、Storage 及 pgvector，不能只替换为裸 PostgreSQL 而不重写业务。
- Supabase 使用官方自托管 Docker 发行版；数据库、Auth、REST、Storage、Realtime、Kong 和 Studio 由同一 Compose 项目管理。
- 应用镜像使用 `ghcr.io/bjwlxyzhuzhu/cxcy:latest`，目标平台为 `linux/amd64`。
- Supabase 公网 API 与网站共用一个域名，通过反向代理按路径转发；Supabase 内部服务名不得写入浏览器端 URL。
- `SERVICE_ROLE_KEY`、数据库密码、JWT 密钥和 AI 服务 Key 只能作为运行期环境变量，不能进入前端构建产物、Git 历史或镜像层。

## 方案

### Stack 组成

Portainer Stack 由两个逻辑部分组成：

1. 官方 Supabase 服务与持久化卷。Supabase 官方 Compose 文件负责服务版本、健康检查、依赖关系和内部网络；项目文档提供获取、配置和更新该文件的步骤，避免长期复制上游大文件造成版本漂移。
2. `cxcy` 服务。使用 GHCR 预构建镜像，加入同一 Docker 网络，通过环境变量连接 Supabase Kong API。应用服务不直接连接数据库容器。

网站服务使用运行时配置注入：容器启动时读取 `SUPABASE_PUBLIC_URL` 与 `SUPABASE_ANON_KEY`，生成浏览器可读取的 `/runtime-config.js`；服务端 Supabase 客户端读取同一环境变量，并兼容本地开发用的 `NEXT_PUBLIC_SUPABASE_*` 变量。这样 GitHub 构建不需要 Supabase 配置。

### 环境变量边界

Portainer Stack 环境变量分为：

- Supabase 官方变量：`POSTGRES_PASSWORD`、`JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`、`SITE_URL`、`API_EXTERNAL_URL`、Dashboard 凭据及官方 Compose 所需其他密钥。
- `cxcy` 变量：`SUPABASE_PUBLIC_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、AI 服务配置、PPT 引擎配置等。

同一个公开 URL 和公开 Key 由 Portainer 变量引用传给 Supabase 与 `cxcy`，避免重复维护。`SUPABASE_SERVICE_ROLE_KEY` 只传给 `cxcy` 服务端，不生成到 runtime-config.js。

### 域名与反向代理

使用单域名时，默认路由转发到 `cxcy`，Supabase API 路径转发到 Kong：

- `/auth/v1/*`
- `/rest/v1/*`
- `/storage/v1/*`
- `/realtime/v1/*`

Studio 只监听内网或通过独立管理员入口保护，不与公开应用路径混用。若使用路径前缀，Kong 的外部 URL 和应用的 `SUPABASE_PUBLIC_URL` 必须保持一致，并验证 CORS、Auth 回调和 Storage URL。

### 数据初始化

Supabase Stack 启动并确认 Kong/API 可用后，在 Studio SQL Editor 或数据库容器中按顺序执行 `web/supabase/migrations/0001` 至最新迁移，或执行 `_ALL.sql`。迁移必须在 `cxcy` 首次登录前完成，以确保 Auth 触发器、RLS、RPC 和 pgvector 对象存在。

## 错误处理与安全

- 启动脚本缺少 `SUPABASE_PUBLIC_URL` 或 `SUPABASE_ANON_KEY` 时应明确报错并停止应用，而不是生成不可用的前端配置。
- 服务端密钥缺失时，应用启动可以完成，但需要在运行期功能调用处返回清晰错误；密钥值不得写日志。
- Supabase PostgreSQL、Kong 管理端口和 Studio 管理接口不直接暴露到公网；公网只开放 80/443（必要时临时开放应用演示端口）。
- 数据卷必须使用命名卷或固定服务器路径，升级 Stack 时不得删除数据库卷。

## 验收标准

1. GitHub Actions 在未配置 Supabase Variables 时仍能构建 `cxcy` 镜像。
2. Portainer 使用一份 Stack 环境变量启动 Supabase 与 `cxcy`，应用容器健康运行。
3. 浏览器从运行时配置连接自建 Supabase，登录、积分 RPC、RAG 查询和管理员 API 均能访问。
4. 重建 `cxcy` 容器不会改变数据库数据；重启 Stack 后 Supabase 数据仍存在。
5. `SERVICE_ROLE_KEY` 不出现在浏览器响应、静态资源和镜像构建日志中。

