-- ════════════════════════════════════════════════════════════════════
-- 0005 项目成果：路演 HTML（第 7 步）与项目档案（第 8 步）
-- ────────────────────────────────────────────────────────────────────
-- 由平台按“已认证 / 已确认”的本体对象自动生成（不调用模型、不引用外网资源，离线可播）。
-- 路演页：draft → 学生审阅确认（certified）；项目档案：生成即归档（certified）。
-- 撤回：status = 'rejected'，保留记录与审计。
-- ════════════════════════════════════════════════════════════════════
create table if not exists project_artifacts (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  kind text not null check (kind in ('pitch','archive')),
  title text not null default '',
  html text not null default '',                 -- 自包含 HTML（内联样式，无外部资源）
  data jsontext not null default '{}',           -- 生成时依据的对象快照（档案用）
  status text not null default 'draft' check (status in ('draft','certified','rejected')),
  origin text not null default 'ai' check (origin in ('ai','human')),
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists pa_project_idx on project_artifacts (project_id, kind, created_at desc);
