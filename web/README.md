# 双创AI星际 · web（M1 骨架）

面向大学生创新创业竞赛的智能体集群网站。本目录是 Next.js 14 应用。

## 测试记录与课堂实验更新

已加入账号历史记录与继续对话、各测试模块七种格式导出、后台个人记录与在线状态、新版逐步课堂实验。更新数据库后使用，完整操作和验证说明见 [TESTING_AND_RECORDS.md](TESTING_AND_RECORDS.md)。

## 本地运行

```bash
pnpm install          # 首次（已配国内 npmmirror 源，见 .npmrc）
pnpm dev              # http://localhost:3000
pnpm build            # 生产构建（已验证通过）
```

## 首次激活（本地 PostgreSQL）

登录、积分和知识库都直接访问本地 PostgreSQL。使用仓库根目录的 `docker-compose.postgres.yml` 时，`migrate` 服务会自动执行迁移；演示账号可执行：

```bash
docker compose -f docker-compose.postgres.yml run --rm migrate node scripts/seed.mjs
```

### 演示账号（登录页用「学号 + 密码」）
| 角色 | 学号 | 密码 |
|---|---|---|
| 学生 | `202596057038` | `Student@2026` |
| 管理员 | `admin` | `Admin@2026` |

登录后右上角显示真实积分；点右下角**宇航员小航**打开对话，发消息会走 `/api/ai/chat`（APIMart）并**每次扣 1 积分**（数据库 `deduct_credits` 原子扣分 + 写 `usage_logs`）。

## 环境变量（`.env.local`，不提交）
见 `.env.example`。`DATABASE_URL` 和 `SESSION_SECRET` 仅服务端使用；浏览器只通过内部 `/api` 路由访问数据。

## 目录
```
app/                  页面与 API
  page.tsx            首页（Server Component：读登录积分）
  login/page.tsx      学号登录
  api/ai/chat/route.ts  扣积分服务端示例（鉴权→预检→APIMart→原子扣分）
  api/credits/route.ts  查积分
  globals.css         设计系统（移植自定稿原型）
components/
  GalaxyHome.tsx      首页 React 外壳 + 小航对话
  galaxyEngine.js     银河动效引擎（机器抽取自原型，勿手改）
lib/
  db.ts · db-client.ts · auth-local.ts  PostgreSQL 与本地 Session
  ai/{apimart,models}.ts · credits.ts · auth.ts
db/migrations/0001_init.sql             建表、索引、pgvector 与积分函数
scripts/migrate.mjs · scripts/seed.mjs  迁移与演示账号
Dockerfile · docker-compose.yml        部署骨架（9 月底阿里云上线用）
```

## Docker（部署用）
```bash
docker compose -f docker-compose.postgres.yml --env-file .env.local up -d
```

## GitHub Actions 镜像

仓库内的 `.github/workflows/docker-image.yml` 会在 `main` 分支推送或手动触发时，
构建 `linux/amd64` 与 `linux/arm64` 镜像并发布到 GitHub Container Registry；Pull Request
只执行构建检查，不会发布镜像。

镜像不依赖任何 Supabase 变量。Portainer 只需向 Stack 注入 PostgreSQL 密码、`DATABASE_URL` 组成参数、`SESSION_SECRET` 及可选 AI 配置。

发布成功后可在服务器上运行（将运行期密钥写入服务器上的 `.env.local`）：

```bash
docker pull ghcr.io/bjwlxyzhuzhu/cxcy:latest
docker run --env-file .env.local -p 3000:3000 ghcr.io/bjwlxyzhuzhu/cxcy:latest
```

首次拉取私有镜像时，需要使用具有 `read:packages` 权限的 GitHub Personal Access Token
登录 `ghcr.io`。如需公开镜像，可在仓库的 **Packages** 页面将可见性改为 Public。

## 设计来源
所有动效定稿在 `../设计风格预览/风格A_银河探索.html`；`galaxyEngine.js` 由它机器生成。改设计请改原型再重新抽取，不要直接改引擎。

## 进度
- ✅ M1：脚手架 · 设计系统/首页移植 · PostgreSQL 登录 · profiles/credits · 扣积分 API · Docker 骨架
- ⏭ M2 起：学习中心 6 模块 + AI 客服 RAG（知识库在 `../RAG/`）；应用中心各功能；管理端（名单导入、知识库上传带标签）

## 生产运行与开机自启（本机常驻）

平台以**生产模式**常驻本机，脱离编辑器/桌面应用独立运行。

```bash
node node_modules/next/dist/bin/next build   # 改完代码要重新构建，生产模式没有热更新
```

| 操作 | 命令（PowerShell） |
|---|---|
| 启动 | `schtasks /Run /TN "双创AI星际-网站"` |
| 停止 | `Get-NetTCPConnection -LocalPort 3000 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` 后再 `Get-Process node \| Stop-Process -Force` |
| 看日志 | `Get-Content web\logs\server.log -Tail 50 -Wait` |
| 取消开机自启 | `schtasks /Delete /TN "双创AI星际-网站" /F` |

机制：计划任务「双创AI星际-网站」在**登录后 20 秒**触发，并**每 10 分钟**再跑一次；
`scripts/serve.mjs` 发现 3000 端口已在服务就直接退出，所以重复触发不会起第二个实例，
真挂了则下一次触发把它拉起来。`serve.mjs` 自身还带看门狗，服务进程异常退出 3 秒后自动重启。
无窗口启动靠 `scripts/start-hidden.vbs`（**该文件必须保持 CRLF + UTF-16LE 编码**，
换成 LF 会让 Windows Script Host 静默卡死）。

只监听 `127.0.0.1`。要让同局域网的学生机访问，把 `serve.mjs` 里的 `HOST` 改成 `0.0.0.0`
并在防火墙放行 3000 端口。

> 注意：生产服务占用 3000 端口，此时再跑 `pnpm dev` / `node scripts/dev-watchdog.mjs` 会端口冲突。
> 要开发就先停掉常驻服务，或给 dev 换个端口。
