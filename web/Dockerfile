# 双创AI星际 · Next.js standalone 多阶段镜像（为 9 月底阿里云上线备好）
# 构建：docker compose --env-file .env.local up --build

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 服务端密钥（DATABASE_URL / SESSION_SECRET / AI keys）运行期由 Stack 注入，不打进镜像
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts/start-container.sh ./scripts/start-container.sh
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /app/scripts/seed.mjs ./scripts/seed.mjs
COPY --from=builder /app/db/migrations ./db/migrations
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["./scripts/start-container.sh", "node", "server.js"]
