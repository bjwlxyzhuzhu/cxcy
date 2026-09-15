# Portainer Supabase Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `cxcy` deployable with a complete self-hosted Supabase and the application in one Portainer Stack, with Supabase configuration supplied only at container runtime.

**Architecture:** Keep the official Supabase Docker distribution as the source of truth for Supabase services and add a Portainer overlay Stack file for the `cxcy` service. Change the Next.js browser client to read a startup-generated `/runtime-config.js`, while server clients read runtime environment variables. Remove Supabase build arguments from GitHub Actions.

**Tech Stack:** Next.js 14 standalone, TypeScript, Docker Compose, Portainer, official Supabase Docker distribution, shell entrypoint.

**Spec:** `docs/superpowers/specs/2026-09-15-portainer-supabase-stack-design.md`

## Global Constraints

- Target platform is `linux/amd64` / `x86_64`.
- Supabase PostgreSQL, Auth, REST, Storage, Realtime, Kong, and Studio remain part of the deployment.
- `SERVICE_ROLE_KEY`, database passwords, JWT secrets, and AI keys must never enter the browser bundle or image build logs.
- Supabase API URL must be a browser-reachable public URL, not an internal Docker service name.
- Existing local development using `NEXT_PUBLIC_SUPABASE_*` remains supported.

---

### Task 1: Runtime Supabase configuration contract

**Files:**
- Create: `web/public/runtime-config.js` (placeholder fallback)
- Create: `web/scripts/start-container.sh`
- Modify: `web/lib/supabase/client.ts`
- Modify: `web/app/layout.tsx`
- Modify: `web/Dockerfile`
- Test: `web/scripts/start-container.test.sh`

**Interfaces:**
- `start-container.sh` consumes `SUPABASE_PUBLIC_URL`, `SUPABASE_ANON_KEY`, and the standalone server command.
- Browser global `window.__CXCY_RUNTIME_CONFIG__` produces `{ supabaseUrl: string; supabaseAnonKey: string }`.

- [ ] **Step 1: Write a failing startup-config test**

Create a shell test that runs the entrypoint with controlled variables and asserts the generated file contains the URL and key, and that missing values exits non-zero.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash web/scripts/start-container.test.sh`

Expected: FAIL because `start-container.sh` does not exist.

- [ ] **Step 3: Implement startup generation and browser loading**

Generate a JavaScript file using a quoted heredoc and JSON-safe escaping; update the browser client to prefer `window.__CXCY_RUNTIME_CONFIG__` and fall back to `NEXT_PUBLIC_*`; load the file before interactive scripts in the root layout; invoke the script from the runner image.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash web/scripts/start-container.test.sh`

Expected: PASS for generation, escaping, and missing-variable failure.

- [ ] **Step 5: Run the application build**

Run: `cd web && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder pnpm build`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/public/runtime-config.js web/scripts/start-container.sh web/scripts/start-container.test.sh web/lib/supabase/client.ts web/app/layout.tsx web/Dockerfile
git commit -m "feat: inject Supabase config at container runtime"
```

### Task 2: Portainer deployment stack and documentation

**Files:**
- Create: `deploy/portainer/cxcy-stack.yml`
- Create: `deploy/portainer/README.md`
- Modify: `web/docker-compose.yml`
- Modify: `web/README.md`
- Modify: `部署迁移手册_国内服务器.md`

**Interfaces:**
- Portainer consumes the official Supabase Compose project plus the documented `cxcy` service overlay.
- `cxcy` consumes `SUPABASE_PUBLIC_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and existing AI/PPT runtime variables.

- [ ] **Step 1: Add a one-stack overlay and variable template**

Define the `cxcy` service using `ghcr.io/bjwlxyzhuzhu/cxcy:latest`, `restart: unless-stopped`, port `3000`, and explicit runtime variables. Use the shared Supabase network name and document the required external network name.

- [ ] **Step 2: Update local Compose compatibility**

Replace the local-only `env_file: .env.local` dependency with an `environment` mapping that supports both Portainer interpolation and local `--env-file` usage.

- [ ] **Step 3: Document one-stack deployment**

Document copying the official Supabase Docker Compose services into the same Portainer Stack, generating keys with `sh utils/generate-keys.sh --update-env`, running migrations, setting one domain/reverse proxy, and starting `cxcy` from GHCR.

- [ ] **Step 4: Validate YAML and docs**

Run the repository YAML parser checks and `git diff --check`.

- [ ] **Step 5: Commit**

```bash
git add deploy/portainer web/docker-compose.yml web/README.md 部署迁移手册_国内服务器.md
git commit -m "docs: add Portainer Supabase stack deployment"
```

### Task 3: Remove build-time Supabase dependency from CI

**Files:**
- Modify: `.github/workflows/docker-image.yml`

**Interfaces:**
- GitHub Actions builds and publishes the same multi-architecture image without repository Supabase Variables.

- [ ] **Step 1: Remove Supabase build arguments**

Delete the two `build-args` entries for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the runtime entrypoint supplies configuration in Portainer.

- [ ] **Step 2: Validate workflow structure**

Run the YAML parser and assert no Supabase GitHub variable references remain.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docker-image.yml
git commit -m "ci: build image without Supabase variables"
```

### Task 4: Final verification

**Files:**
- Verify: all files above

- [ ] **Step 1: Run startup test**

Run: `bash web/scripts/start-container.test.sh`

- [ ] **Step 2: Run lint and production build**

Run: `cd web && pnpm lint && NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder pnpm build`

- [ ] **Step 3: Validate workflow and Compose YAML**

Run a Python YAML parse over `.github/workflows/docker-image.yml`, `deploy/portainer/cxcy-stack.yml`, and `web/docker-compose.yml`.

- [ ] **Step 4: Review secrets and diff**

Run `git diff --check` and search tracked changes for `SERVICE_ROLE_KEY` values or private tokens.

