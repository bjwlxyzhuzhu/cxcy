# Portainer 单 Stack 部署

本目录用于在 `x86_64` 服务器上把官方 Supabase 和 `cxcy` 放进同一个 Portainer Stack。

## 1. 准备官方 Supabase Compose

在服务器上获取官方自托管发行版：

```bash
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker
cp .env.example .env
sh utils/generate-keys.sh --update-env
```

不要把生成后的 `.env` 提交到 Git。Portainer Web Editor 中粘贴官方
`docker-compose.yml` 的完整内容，然后把本目录 `cxcy-stack.yml` 里的
`services.cxcy` 服务合并到同一个 `services:` 下；最终只创建一个 Stack。

## 2. Portainer 环境变量

在 Stack → Environment variables 中配置官方 `.env` 所需变量，至少包括：

```env
POSTGRES_PASSWORD=强随机密码
JWT_SECRET=至少32位随机字符串
ANON_KEY=官方脚本生成的ANON_KEY
SERVICE_ROLE_KEY=官方脚本生成的SERVICE_ROLE_KEY
SITE_URL=https://example.com
API_EXTERNAL_URL=https://example.com
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=强随机密码
APIMART_BASE_URL=https://api.apimart.ai/v1
APIMART_API_KEY=你的APIMart密钥
```

`cxcy` 服务会自动从同一 Stack 的 `API_EXTERNAL_URL`、`ANON_KEY` 和
`SERVICE_ROLE_KEY` 读取 Supabase 配置，不需要再填写 `NEXT_PUBLIC_SUPABASE_URL`
或 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

## 3. 数据库初始化

Supabase 启动成功后，在 Studio SQL Editor 中执行：

```text
web/supabase/migrations/_ALL.sql
```

或按 `0001` 至最新迁移文件顺序执行。完成后再访问 `cxcy`。

## 4. 单域名反向代理

网站和 Supabase API 可以共用一个域名：

```text
/auth/v1/*      → Supabase Kong :8000
/rest/v1/*      → Supabase Kong :8000
/storage/v1/*   → Supabase Kong :8000
/realtime/v1/*  → Supabase Kong :8000
其余路径        → cxcy :3001（容器内仍为 3000）
```

因此 `API_EXTERNAL_URL` 应填写浏览器实际访问的地址，例如
`https://example.com`，不能填写 `http://kong:8000`。PostgreSQL、Kong 管理端口和
Studio 不应直接暴露公网；公网安全组只开放 80/443。

## 5. 更新

更新 `cxcy`：在 Portainer 重新部署或执行 `docker compose pull cxcy` 后重建该服务。
更新 Supabase：按官方发行版说明更新 Compose 文件，保留 PostgreSQL、Storage 等数据卷。
