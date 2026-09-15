# Portainer 单 Stack 部署

本项目现在使用本地 PostgreSQL（带 pgvector）和 `cxcy`，不再依赖 Supabase。

在 Portainer → Stacks → Add stack → Web editor 中粘贴仓库根目录的 `docker-compose.postgres.yml`。

至少配置：

```env
POSTGRES_PASSWORD=强随机密码
SESSION_SECRET=至少32位随机字符串
CXCY_PORT=3000
```

需要 AI 功能时再填写 `APIMART_*`、`CHAT_*`、`PPTGEN_*` 等变量。数据库只在 Docker 内网可见，不映射 5432 公网端口。

Stack 启动顺序为 `postgres` → `migrate` → `cxcy`。首次初始化演示账号可在 Portainer 的 `migrate` 容器 Console 执行 `node scripts/seed.mjs`，然后立即修改默认密码：

- 管理员：`admin` / `Admin@2026`
- 学生：`202596057038` / `Student@2026`

详细说明见 [`deploy/postgres/README.md`](/root/projects/cxcy/deploy/postgres/README.md)。不要删除 `cxcy_postgres_data` 卷，否则会清空数据库。
