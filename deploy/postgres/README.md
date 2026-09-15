# Portainer Web Editor：cxcy + PostgreSQL

这个 Stack 会在同一个私有 Docker 网络中部署：

- `postgres`：`pgvector/pgvector:pg16`，只对 Stack 内部开放，数据持久化到 `cxcy_postgres_data`。
- `migrate`：等待数据库健康后执行幂等迁移。
- `cxcy`：从 GHCR 拉取镜像，使用 HttpOnly Session Cookie 登录。

## 部署步骤

1. 在 Portainer → **Stacks** → **Add stack**，名称填写 `cxcy`。
2. Web editor 粘贴仓库中的 [`docker-compose.postgres.yml`](/root/projects/cxcy/docker-compose.postgres.yml) 内容。
3. 在 Environment variables 添加：

   - `POSTGRES_PASSWORD`：强密码。
   - `SESSION_SECRET`：至少 32 个字符的随机字符串。
   - `CXCY_PORT`：对外端口，默认 `3000`。
   - 需要 AI 时再填写 `APIMART_*`、`CHAT_*`、`PPTGEN_*` 等变量。

4. 点击 **Deploy the stack**。首次启动顺序是 PostgreSQL → migrate → cxcy。
5. 部署完成后访问 `http://服务器IP:CXCY_PORT/login`。

首次演示账号需要在容器内执行一次：

```text
docker compose -f docker-compose.postgres.yml run --rm migrate node scripts/seed.mjs
```

在 Portainer 中也可以打开 `cxcy` 容器的 Console，执行 `node scripts/seed.mjs`；容器必须带有同样的 `DATABASE_URL` 环境变量。演示账号：

- 管理员：`admin` / `Admin@2026`
- 学生：`202596057038` / `Student@2026`

登录后请立即修改密码。数据库密码、Session Secret 和 AI Key 只写在 Stack 环境变量，不要写进镜像或提交到 Git。

## 更新与备份

更新镜像后重新部署 Stack；迁移服务会自动跳过已执行版本。不要删除 `cxcy_postgres_data` 卷，否则会清空本地数据库。

备份示例：

```text
docker exec -t $(docker ps -qf name=cxcy-postgres) pg_dump -U cxcy cxcy > cxcy.sql
```

恢复前先停止 `cxcy`，再将 SQL 导入同一个 PostgreSQL 容器。数据库没有公网端口映射，只有 `cxcy` 服务能通过内部服务名 `postgres` 访问它。
