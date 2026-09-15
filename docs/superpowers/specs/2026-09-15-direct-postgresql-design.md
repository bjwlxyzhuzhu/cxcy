# 直连 PostgreSQL 与应用自建认证设计

## 目标

将 `cxcy` 从 Supabase 完整改造成 Next.js 服务端直连本地 PostgreSQL 的应用，并通过一个 Portainer Stack 部署 PostgreSQL 与 `cxcy`。使用全新的数据库，不迁移现有 Supabase 数据。

## 已确认约束

- 目标服务器为 `x86_64`，镜像构建目标为 `linux/amd64`。
- 不再部署或依赖 Supabase Auth、REST、RLS、Storage、Kong 或 Supabase Key。
- 浏览器不直接连接 PostgreSQL；所有数据访问经由 Next.js Route Handler/API。
- 使用全新 PostgreSQL 数据库，首次启动执行本项目迁移和演示账号种子脚本。
- 文档上传当前只在内存中解析，不使用持久化对象存储；本次不新增 Storage 子系统。
- 保留现有 AI、PPT 和其他外部服务配置，作为容器运行期变量注入。

## 架构

```text
Browser
  └── fetch /api/*
Next.js (cxcy)
  ├── pg.Pool
  ├── bcrypt 密码哈希
  ├── HttpOnly session cookie
  └── PostgreSQL
```

### 数据库

连接使用 `DATABASE_URL`：

```text
postgresql://cxcy:<password>@postgres:5432/cxcy
```

`web/db/migrations/` 保存从零初始化的迁移。原 Supabase 迁移只作为业务字段参考，不再执行其中的 `auth.users`、RLS、Supabase RPC 或 Supabase 触发器语句。

核心表包括：

- `users`: 用户 ID、学号、密码哈希、姓名、角色、创建时间
- `sessions`: Session Token 哈希、用户 ID、过期时间、创建时间
- `profiles`: 兼容现有业务档案与积分字段，或与 `users` 合并后的明确字段映射
- 现有业务表：`rosters`、`usage_logs`、`app_config`、`knowledge`、`cases`、`templates`、`user_api_keys`、`projects`、证据、干预和对抗性对话表

积分扣除使用 PostgreSQL 事务和行锁，确保并发下不会超扣；向量检索使用 PostgreSQL `vector` 扩展和参数化查询。

### 认证

认证接口：

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

登录使用学号映射到用户记录，密码用 bcrypt 校验。服务端生成高熵随机 Session Token，只将 Token 的哈希写入 `sessions`；原始 Token 放入 `HttpOnly`、`SameSite=Lax`、生产环境 `Secure` 的 Cookie。`getUser()` 和 `requireAdmin()` 统一从 Session 查询用户，所有受保护接口使用同一套鉴权函数。

### API 边界

浏览器端原有 Supabase 调用改成内部 API。至少覆盖：

- 登录、退出、当前用户和账户面板
- 课程案例、模板、知识库查询
- 用户 API Key 的读取和修改
- 项目列表、保存和删除
- 管理员学生、名册、知识库、配置和统计操作

服务端已有 AI、积分、证据和干预路由改为调用参数化 SQL 数据访问函数。API 不接受客户端传入的用户 ID 作为权限依据，统一使用 Session 用户身份；管理员操作额外校验 `role`。

## 部署

Portainer Stack 包含：

```text
postgres
  └── named volume postgres_data
cxcy
  └── depends_on postgres healthcheck
```

环境变量：

```env
POSTGRES_DB=cxcy
POSTGRES_USER=cxcy
POSTGRES_PASSWORD=<strong password>
DATABASE_URL=postgresql://cxcy:<strong password>@postgres:5432/cxcy
SESSION_SECRET=<random string, at least 32 characters>
```

数据库端口只在 Stack 内部网络可见，不对公网暴露。`cxcy` 使用已发布的 `ghcr.io/bjwlxyzhuzhu/cxcy:latest`，应用端口按 Portainer 配置映射。

启动顺序：PostgreSQL 健康检查通过 → 执行迁移 → 创建演示账号 → 启动/重启 `cxcy`。迁移与 seed 必须幂等，重启 Stack 不重复破坏数据。

## 错误处理与安全

- 缺少 `DATABASE_URL` 或 `SESSION_SECRET` 时应用明确拒绝启动。
- 数据库查询统一使用参数化参数；连接池错误返回通用错误，不泄露连接串。
- 登录失败不区分“用户不存在”和“密码错误”，避免账号枚举；登录接口应有基本频率限制或部署层限流说明。
- Session 过期、退出和密码重置删除/失效对应记录。
- 密码、Session Token、数据库密码和 AI Key 不写日志、前端响应或镜像构建层。

## 验证标准

1. 全新 PostgreSQL 卷可通过迁移完成初始化。
2. 演示管理员和学生账号可以登录、退出、刷新页面并保持 Session。
3. 学生不能访问管理员 API；管理员可以执行现有管理操作。
4. 积分扣减在并发请求下原子且不会超扣。
5. 现有项目、课程、知识库、用户 API Key、证据和干预功能通过内部 API 工作。
6. Docker 镜像构建不需要任何 Supabase 变量，Portainer 只需 PostgreSQL 与应用运行期变量。
7. PostgreSQL 命名卷重启后数据仍然存在。

