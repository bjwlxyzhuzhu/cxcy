-- ════════════════════════════════════════════════════════════════════
-- 0002 项目本体：对象 + 关系 + 动作审计 + 三态认证
-- ────────────────────────────────────────────────────────────────────
-- 原则（人判断 / AI 执行）：
--   · 每个对象都记录 origin（ai=AI 起草 / human=人写）与 status：
--       draft（草稿）→ certified（学生已认证）→ confirmed（教师已确认）；rejected（已驳回）
--   · AI 起草的内容不是证据：evidence_items 必须挂真实来源并经人认证，才能用于决策与计分
--   · 所有改变状态的操作都经 lib/ontology 的动作引擎执行，并写入 onto_audit
-- ════════════════════════════════════════════════════════════════════

-- ── 项目成员（一个项目由一支队伍共同维护）──
create table if not exists project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (project_id, user_id)
);
create index if not exists pm_user_idx on project_members (user_id);
-- 已有项目：创建者即负责人
insert or ignore into project_members (project_id, user_id, role) select id, user_id, 'owner' from projects;

-- ── 产品线对象（公共列：id / project_id / status / origin / source / 认证留痕 / 时间）──

-- 赛道画像
create table if not exists track_profiles (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  title text not null default '',
  track text not null default '',              -- 赛道名称
  audience text not null default '',           -- 目标人群
  summary text not null default '',
  trends jsontext not null default '[]',       -- 趋势与变化
  opportunities jsontext not null default '[]',
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- HMW 问题（我们如何……）
create table if not exists hmw_questions (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  text text not null default '',
  user_quote text not null default '',         -- 引发这个问题的用户原话
  rationale text not null default '',
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 产品任务书
create table if not exists task_briefs (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  title text not null default '',
  goal text not null default '',
  features jsontext not null default '[]',
  metrics jsontext not null default '[]',      -- 验证指标
  risks jsontext not null default '[]',
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 产品版本（V0.1 / V0.2…；“认证”即发布）。注意与研究用的 plan_versions（过程快照）不同
create table if not exists product_versions (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  label text not null,                         -- V0.1 / V0.2
  summary text not null default '',
  changes jsontext not null default '[]',      -- 相对上一版的改动
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (project_id, label)
);

-- 调研证据（访谈 / 问卷 / 实测 / 观察 / 文档 / 数据）
create table if not exists evidence_items (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  kind text not null default 'interview' check (kind in ('interview','survey','test','observation','document','data')),
  content text not null default '',            -- 证据摘要
  quote text not null default '',              -- 原话 / 原始记录片段
  sample_n integer,                            -- 样本量
  collected_at text,                           -- 采集日期
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',       -- 认证时必填：{kind, ref, note}
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 测试报告
create table if not exists test_reports (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  title text not null default '',
  summary text not null default '',
  metrics jsontext not null default '[]',      -- [{name, value, unit}]
  findings jsontext not null default '[]',
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 决策（保留 / 修改 / 放弃，必须挂证据）
create table if not exists decisions (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  verdict text not null default 'keep' check (verdict in ('keep','modify','drop')),
  subject text not null default '',            -- 针对什么（功能 / 假设 / 方向）
  rationale text not null default '',
  status text not null default 'draft' check (status in ('draft','certified','confirmed','rejected')),
  origin text not null default 'human' check (origin in ('ai','human')),
  source jsontext not null default '{}',
  created_by text references users(id) on delete set null,
  certified_by text references users(id) on delete set null, certified_at text,
  confirmed_by text references users(id) on delete set null, confirmed_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists tp_project_idx on track_profiles (project_id, status);
create index if not exists hmw_project_idx on hmw_questions (project_id, status);
create index if not exists tb_project_idx on task_briefs (project_id, status);
create index if not exists pv2_project_idx on product_versions (project_id, status);
create index if not exists ei_project_idx on evidence_items (project_id, status);
create index if not exists tr_project_idx on test_reports (project_id, status);
create index if not exists dc_project_idx on decisions (project_id, status);

-- updated_at 自动刷新
create trigger if not exists track_profiles_touch after update on track_profiles for each row when new.updated_at = old.updated_at
  begin update track_profiles set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists hmw_questions_touch after update on hmw_questions for each row when new.updated_at = old.updated_at
  begin update hmw_questions set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists task_briefs_touch after update on task_briefs for each row when new.updated_at = old.updated_at
  begin update task_briefs set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists product_versions_touch after update on product_versions for each row when new.updated_at = old.updated_at
  begin update product_versions set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists evidence_items_touch after update on evidence_items for each row when new.updated_at = old.updated_at
  begin update evidence_items set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists test_reports_touch after update on test_reports for each row when new.updated_at = old.updated_at
  begin update test_reports set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists decisions_touch after update on decisions for each row when new.updated_at = old.updated_at
  begin update decisions set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

-- ── 假设表重建：既可属于对局（match_id/team_id），也可属于项目（project_id）──
create table hypotheses_new (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  match_id text references arena_matches(id) on delete cascade,
  team_id text references arena_teams(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  created_by text references users(id) on delete set null,
  persona_id text references personas(id) on delete set null,
  round_no integer not null default 1,
  text text not null,
  status text not null default 'pending',
  reason text not null default '',
  revision text not null default '',
  evidence text not null default '',
  evidence_url text not null default '',
  reviewed_by text references users(id) on delete set null,
  review_note text not null default '',
  origin text not null default 'human' check (origin in ('ai','human')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check (match_id is not null or project_id is not null)
);
insert into hypotheses_new (id, match_id, team_id, project_id, created_by, persona_id, round_no, text, status, reason, revision, evidence, evidence_url, reviewed_by, review_note, created_at, updated_at)
  select h.id, h.match_id, h.team_id, t.project_id, h.created_by, h.persona_id, h.round_no, h.text, h.status, h.reason, h.revision, h.evidence, h.evidence_url, h.reviewed_by, h.review_note, h.created_at, h.updated_at
  from hypotheses h left join arena_teams t on t.id = h.team_id;
drop table hypotheses;
alter table hypotheses_new rename to hypotheses;
create index if not exists hyp_team_idx on hypotheses (team_id, status);
create index if not exists hyp_match_idx on hypotheses (match_id);
create index if not exists hyp_project_idx on hypotheses (project_id, status);
create trigger if not exists hypotheses_touch after update on hypotheses for each row when new.updated_at = old.updated_at
  begin update hypotheses set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

-- ── 通用关系：对象之间的真实业务关系（类型与方向由 lib/ontology/schema.ts 校验）──
create table if not exists onto_links (
  id integer primary key autoincrement,
  project_id text not null references projects(id) on delete cascade,
  link_type text not null,
  src_type text not null, src_id text not null,
  dst_type text not null, dst_id text not null,
  origin text not null default 'human' check (origin in ('ai','human')),
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (link_type, src_type, src_id, dst_type, dst_id)
);
create index if not exists ol_project_idx on onto_links (project_id);
create index if not exists ol_src_idx on onto_links (src_type, src_id);
create index if not exists ol_dst_idx on onto_links (dst_type, dst_id);

-- ── 动作审计：谁（人 / AI）在什么时候对什么对象执行了什么动作，成功与否 ──
create table if not exists onto_audit (
  id integer primary key autoincrement,
  project_id text references projects(id) on delete cascade,
  match_id text references arena_matches(id) on delete cascade,
  action text not null,
  actor_id text references users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('human','ai','system')),
  target_type text, target_id text,
  params jsontext not null default '{}',
  result jsontext not null default '{}',
  ok boolean not null default 1,
  error text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists oa_project_idx on onto_audit (project_id, id desc);
create index if not exists oa_match_idx on onto_audit (match_id, id desc);
create index if not exists oa_target_idx on onto_audit (target_type, target_id);
