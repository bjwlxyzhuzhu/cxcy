# 双创AI星际 · Next.js standalone 多阶段镜像
# 构建并启动：docker compose up -d --build
# 数据库是 SQLite 单文件，用 Node 内置 node:sqlite，所以基础镜像必须是 Node 24 及以上

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Linux 下 next.config.mjs 默认产出 standalone
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 数据库文件放在数据卷里（见 docker-compose.yml），重建镜像不丢数据
ENV DATABASE_URL=file:/app/data/app.db
# 密钥（SESSION_SECRET / CHAT_API_KEY 等）运行时由 env_file 注入，不打进镜像
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 迁移文件：网站启动时自动执行未执行的迁移
COPY --from=builder /app/db ./db
# 命令行运维脚本（建号、名册导入、迁移）
COPY --from=builder /app/scripts/create-user.mjs /app/scripts/import120.mjs /app/scripts/db-migrate.mjs /app/scripts/seed.mjs ./scripts/
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
