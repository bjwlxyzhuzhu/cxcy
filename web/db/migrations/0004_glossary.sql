-- ════════════════════════════════════════════════════════════════════
-- 0004 口径与术语表
-- ────────────────────────────────────────────────────────────────────
-- 团队术语（project_id 非空）：本队对关键说法的统一定义，走 草稿→认证→教师确认。
-- 课堂口径（project_id 为空）：教师维护、全班统一（如什么算“带证据回应”），创建即为教师已确认。
-- conflicts：AI 检查发现的“同一个词、不同说法”，每种说法都附原文出处；学生对齐定义并重新认证后清空。
-- 认证过的口径会作为上下文提供给平台里的 AI 角色（人认过、机器懂）。
-- ════════════════════════════════════════════════════════════════════
create table if not exists glossary_terms (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text references projects(id) on delete cascade,
  term text not null,                           -- 术语
  definition text not null default '',          -- 定义 / 口径
  formula text not null default '',             -- 怎么算（如：愿意付费人数 ÷ 受访人数）
  aliases jsontext not null default '[]',       -- 同义说法
  examples jsontext not null default '[]',      -- 例子 / 反例
  conflicts jsontext not null default '[]',     -- [{meaning, where, quote}]
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- 同一项目内术语不重复；课堂口径全局不重复（不区分大小写）
create unique index if not exists gt_project_term_uq on glossary_terms (project_id, term collate nocase) where project_id is not null;
create unique index if not exists gt_class_term_uq on glossary_terms (term collate nocase) where project_id is null;
create index if not exists gt_project_idx on glossary_terms (project_id, status);
create trigger if not exists glossary_terms_touch after update on glossary_terms for each row when new.updated_at = old.updated_at
  begin update glossary_terms set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
