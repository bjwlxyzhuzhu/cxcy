# Direct PostgreSQL Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all Supabase dependencies with direct PostgreSQL access, app-owned authentication, and a single Portainer Stack containing PostgreSQL and `cxcy`.

**Architecture:** A server-only `pg.Pool` and parameterized query helpers replace Supabase clients. Opaque hashed sessions stored in PostgreSQL replace Supabase Auth cookies. Browser components call internal Next.js APIs instead of connecting to a database service. The Docker Stack initializes PostgreSQL with idempotent migrations and persists it in a named volume.

**Tech Stack:** Next.js 14 App Router, TypeScript, `pg`, `bcryptjs`, Node crypto, PostgreSQL 16 with pgvector, Docker Compose/Portainer.

**Spec:** `docs/superpowers/specs/2026-09-15-direct-postgresql-design.md`

## Global Constraints

- Browser code must never receive `DATABASE_URL`, database credentials, or direct PostgreSQL access.
- Every SQL query uses parameters; user-provided identifiers must be allow-listed.
- Session tokens are opaque random values; only hashes are stored in PostgreSQL.
- Fresh database initialization is required; no Supabase data migration is implemented.
- Existing AI/PPT runtime variables remain supported.
- Build and runtime must not require any Supabase variables or packages.

---

### Task 1: PostgreSQL schema, pool, and authentication primitives

**Files:**
- Create: `web/db/migrations/0001_init.sql`
- Create: `web/lib/db.ts`
- Create: `web/lib/auth-local.ts`
- Create: `web/app/api/auth/login/route.ts`
- Create: `web/app/api/auth/logout/route.ts`
- Create: `web/app/api/auth/me/route.ts`
- Modify: `web/package.json`
- Modify: `web/.env.example`
- Test: `web/lib/auth-local.test.mjs`

**Interfaces:**
- `query<T>(text: string, values?: unknown[]): Promise<QueryResult<T>>`
- `getSessionUser(): Promise<LocalUser | null>`
- `requireUser(): Promise<LocalUser>`
- `requireAdmin(): Promise<LocalUser>`
- `POST /api/auth/login` accepts `{ studentNo, password }` and sets `cxcy_session`.

- [ ] Write failing auth tests for password verification, session hash lookup, and role rejection.
- [ ] Run the tests and verify they fail because the local auth module is absent.
- [ ] Add `pg`, `bcryptjs`, and the PostgreSQL schema with users, sessions, profiles, business tables, indexes, and pgvector.
- [ ] Implement the connection pool, session cookie helpers, login/logout/me routes, and auth guards.
- [ ] Run auth tests and verify they pass.
- [ ] Commit `feat: add local PostgreSQL auth foundation`.

### Task 2: Replace server-side Supabase data access

**Files:**
- Modify: `web/lib/auth.ts`
- Modify: `web/lib/admin.ts`
- Modify: `web/lib/credits.ts`
- Modify: `web/lib/evidence.ts`
- Modify: `web/lib/interventions.ts`
- Modify: `web/lib/ai/resolve.ts`
- Modify: `web/app/api/**/*.ts`
- Delete: `web/lib/supabase/admin.ts`, `web/lib/supabase/server.ts`

**Interfaces:**
- All server routes use `query`/transaction helpers and `requireUser`/`requireAdmin`.
- `deductCredits` remains the public service interface but executes an atomic PostgreSQL transaction.

- [ ] Add query helpers for profiles, config, API keys, projects, evidence, interventions, knowledge, stats, and roster records.
- [ ] Convert each route from Supabase query-builder calls to parameterized SQL while preserving response shapes and status codes.
- [ ] Convert vector search to `ORDER BY embedding <=> $1::vector LIMIT $2`.
- [ ] Convert admin account management to local users/password updates.
- [ ] Remove Supabase server/admin imports and run TypeScript type-checking.
- [ ] Commit `refactor: replace server Supabase access with PostgreSQL`.

### Task 3: Replace browser Supabase access and login UI

**Files:**
- Modify: `web/app/login/page.tsx`
- Modify: `web/components/GalaxyHome.tsx`
- Modify: `web/components/LoginModal.tsx`
- Modify: `web/components/AccountPanel.tsx`
- Modify: `web/components/AccountButton.tsx`
- Modify: `web/components/admin/KnowledgeAdmin.tsx`
- Modify: `web/components/admin/StudentManager.tsx`
- Modify: `web/components/admin/UsageStats.tsx`
- Modify: `web/app/learn/cases/page.tsx`
- Modify: `web/app/learn/templates/page.tsx`
- Modify: `web/app/apply/cockpit/page.tsx`
- Delete: `web/lib/supabase/client.ts`, `web/middleware.ts`

**Interfaces:**
- Browser code uses `fetch` against internal APIs and `router.refresh()` after auth changes.
- Login submits `{ studentNo, password }` to `/api/auth/login`.

- [ ] Replace login Supabase call with local login API.
- [ ] Replace each browser query with a server API request; preserve loading/error/empty states.
- [ ] Add missing read/write API routes where a component currently accessed Supabase directly.
- [ ] Remove runtime Supabase config script and client package references.
- [ ] Run lint and type-checking.
- [ ] Commit `refactor: route browser data through local APIs`.

### Task 4: Seed scripts, Docker Stack, and documentation

**Files:**
- Modify: `web/scripts/seed.mjs`
- Create: `web/scripts/migrate.mjs`
- Create: `docker-compose.postgres.yml`
- Modify: `web/Dockerfile`
- Modify: `.github/workflows/docker-image.yml`
- Modify: `web/README.md`
- Create: `deploy/postgres/README.md`

**Interfaces:**
- `pnpm migrate` runs idempotent migrations using `DATABASE_URL`.
- `pnpm seed` creates demo users directly in PostgreSQL.
- Stack service `postgres` exposes only the internal Docker network; `cxcy` depends on its health check.

- [ ] Add migration and seed package scripts.
- [ ] Implement migration tracking and bcrypt-based demo account seeding.
- [ ] Add PostgreSQL healthcheck Stack with named volume and runtime variables.
- [ ] Remove Supabase build/runtime variables from Docker and CI.
- [ ] Document Portainer Web Editor deployment, migration, seed, backup, and update steps.
- [ ] Commit `feat: deploy cxcy with local PostgreSQL`.

### Task 5: Verification

- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run local auth/database unit tests with a mocked query boundary and real password hashing.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build` without Supabase variables.
- [ ] Parse Docker Compose and workflow YAML.
- [ ] Run `git diff --check` and scan for active Supabase imports/variables.
- [ ] Confirm clean working tree and report any Docker runtime verification blocked by unavailable daemon/database.

