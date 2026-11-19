-- ════════════════════════════════════════════════════════════════════
-- 0001 基线迁移（SQLite）：合并原 supabase/migrations 0001–0013，去掉 Supabase 依赖
-- ────────────────────────────────────────────────────────────────────
-- 与原 Postgres 版的对应关系：
--   · auth.users 外键 → public.users（自建账号表，见本文件第一张表）
--   · RLS 策略、auth.uid()、anon/authenticated/service_role 授权全部删除：
--     现在所有读写都经服务端接口，权限在接口里判断
--   · uuid → TEXT（默认值用 randomblob 生成 v4 格式）
--   · jsonb / text[] → 声明类型 jsontext（TEXT 亲和性，存 JSON 文本，由 lib/db 自动序列化）
--   · boolean → 声明类型 boolean（存 0/1，由 lib/db 自动转回 true/false）
--   · timestamptz → TEXT，ISO 8601 UTC（与 JS toISOString 同格式，可直接字符串比较）
--   · bigint identity → INTEGER PRIMARY KEY AUTOINCREMENT
--   · deduct_credits、match_knowledge 改在 lib/db.ts 里用 JS 实现（事务 + 余弦相似度）
--   · knowledge.embedding vector(1536) → BLOB（Float32 小端）
-- 以后改表一律新建 0002_*.sql，不要改本文件。
-- ════════════════════════════════════════════════════════════════════

-- ── 账号（替代 Supabase auth.users）──
create table if not exists users (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  account text not null unique collate nocase,     -- 登录账号（学生为学号）
  password_hash text not null,                     -- scrypt$N$r$p$salt$hash
  session_version integer not null default 1,      -- 改密/禁用时 +1，旧会话立即失效
  disabled boolean not null default 0,
  last_login_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── 0001 用户档案 / 名册 / 积分流水 / 配置 ──
create table if not exists profiles (
  id text primary key references users(id) on delete cascade,
  student_no text,
  name text,
  class text,
  college text,
  major text,
  role text not null default 'student' check (role in ('student','teacher','admin')),
  credits integer not null default 120,
  last_bonus_at text,                               -- 0006：上次每日签到日期（Asia/Shanghai，YYYY-MM-DD）
  native_lang text,                                 -- 0011
  country text,
  hsk_level integer,
  research_consent boolean not null default 0,      -- 是否同意过程数据匿名用于教学研究
  research_consent_at text,
  research_pid text,                                -- 研究假名编号，与姓名学号解耦
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists rosters (
  id integer primary key autoincrement,
  class text, student_no text, name text, college text, major text, gender text,
  unique (class, student_no)
);

create table if not exists usage_logs (
  id integer primary key autoincrement,
  user_id text references users(id) on delete cascade,
  action text not null,
  cost integer not null default 0,
  meta jsontext default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists usage_logs_user_idx on usage_logs (user_id, created_at desc);
create index if not exists usage_logs_time_idx on usage_logs (created_at desc);

create table if not exists app_config (
  key text primary key,
  value jsontext not null default '{}',
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

insert or ignore into app_config (key, value) values
  ('credit_costs', '{"chat":1,"topic":2,"text":5,"ppt":5,"image":10,"defense":2,"data":3}');

-- ── 0002 用户自带模型密钥 ──
create table if not exists user_api_keys (
  user_id text not null references users(id) on delete cascade,
  purpose text not null,            -- chat 通用对话 | reason 思考 | text 文本 | image PPT配图
  provider text,
  base_url text,
  api_key text,
  model text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, purpose)
);

-- ── 0003 知识库 / 案例 / 模板 ──
create table if not exists knowledge (
  id integer primary key autoincrement,
  source text not null,
  title text,
  tags jsontext default '[]',
  chunk text not null,
  embedding blob,                   -- Float32Array（1536 维），检索在 lib/db.ts 里算余弦
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists knowledge_source_idx on knowledge (source);

create table if not exists cases (
  id integer primary key autoincrement,
  code text unique,
  title text not null,
  region text,
  industry text,
  points jsontext default '[]',
  situation text,
  task text,
  questions jsontext default '[]',
  analysis jsontext default '[]',
  image text,
  doc text,
  tags jsontext default '[]',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists templates (
  id integer primary key autoincrement,
  name text not null,
  category text,
  file text,
  ext text,
  size_kb integer,
  intro text,
  tags jsontext default '[]',
  sort integer default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── 0005 云端项目 ──
create table if not exists projects (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  user_id text not null references users(id) on delete cascade,
  name text not null default '我的项目',
  draft text not null default '',
  sections jsontext not null default '{}',
  team jsontext not null default '[]',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists projects_user_idx on projects (user_id, updated_at desc);

-- ── 0007 技能 ──
create table if not exists user_skills (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  user_id text not null references users(id) on delete cascade,
  name text not null,
  icon text default '🧩',
  category text default '我的',
  scope text default 'all',
  instruction text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists user_enabled_skills (
  user_id text not null references users(id) on delete cascade,
  skill_id text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, skill_id)
);

-- ── 0008 成长证据 ──
create table if not exists evidence_events (
  id integer primary key autoincrement,
  user_id text not null references users(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  kind text not null,
  title text not null default '',
  dims jsontext,
  payload jsontext not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists evidence_user_time_idx on evidence_events (user_id, created_at desc);
create index if not exists evidence_user_kind_idx on evidence_events (user_id, kind, created_at desc);

-- ── 0009 干预卡 ──
create table if not exists intervention_cards (
  id integer primary key autoincrement,
  user_id text not null references users(id) on delete cascade,
  rule text not null,
  sharp text not null default '',
  evidence text not null default '',
  advice text not null default '',
  link_href text not null default '',
  link_label text not null default '',
  status text not null default 'open',
  student_note text not null default '',
  teacher_note text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at text
);
create index if not exists icards_user_time_idx on intervention_cards (user_id, created_at desc);
create index if not exists icards_status_idx on intervention_cards (status, created_at desc);

-- ── 0010 访问计数 ──
create table if not exists site_visits (
  day text primary key,             -- YYYY-MM-DD
  count integer not null default 0
);

-- ── 0011 对抗式对话研究数据 ──
create table if not exists challenge_sessions (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  user_id text not null references users(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  team_code text not null default '',
  round_no integer not null default 1,
  scenario text not null default '',
  dbr_cycle integer not null default 1,
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at text
);
create index if not exists cs_user_idx     on challenge_sessions (user_id, started_at desc);
create index if not exists cs_project_idx  on challenge_sessions (project_id, round_no);
create index if not exists cs_team_idx     on challenge_sessions (team_code, round_no);
create index if not exists cs_scenario_idx on challenge_sessions (scenario);

create table if not exists dialogue_turns (
  id integer primary key autoincrement,
  session_id text not null references challenge_sessions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  turn_index integer not null,
  speaker text not null,            -- 'agent' | 'student' | 'teacher'
  agent_key text,
  conflict_dim text,
  move_type text,
  content text not null,
  char_len integer generated always as (length(content)) stored,
  demands_evidence boolean not null default 0,
  cites_evidence   boolean not null default 0,
  is_unanswered    boolean not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists dt_session_idx on dialogue_turns (session_id, turn_index);
create index if not exists dt_user_idx    on dialogue_turns (user_id, created_at desc);
create index if not exists dt_dim_idx     on dialogue_turns (conflict_dim, speaker);

create table if not exists plan_versions (
  id integer primary key autoincrement,
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  team_code text not null default '',
  version_no integer not null,
  session_id text references challenge_sessions(id) on delete set null,
  sections jsontext not null default '{}',
  change_summary text not null default '',
  seq_state text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (project_id, version_no)
);
create index if not exists pv_team_idx on plan_versions (team_code, version_no);

create table if not exists ct_ratings (
  id integer primary key autoincrement,
  target_kind text not null,
  target_id text not null,
  ratee_user_id text references users(id) on delete cascade,
  team_code text not null default '',
  rater_code text not null,
  occasion text not null default 'pre',
  interpret integer check (interpret between 0 and 2),
  evaluate  integer check (evaluate  between 0 and 2),
  infer     integer check (infer     between 0 and 2),
  selfreg   integer check (selfreg   between 0 and 2),
  synthesis integer check (synthesis between 0 and 2),
  total integer generated always as
    (coalesce(interpret,0)+coalesce(evaluate,0)+coalesce(infer,0)+coalesce(selfreg,0)+coalesce(synthesis,0)) stored,
  note text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (target_kind, target_id, rater_code, occasion)
);
create index if not exists ctr_ratee_idx on ct_ratings (ratee_user_id, occasion);
create index if not exists ctr_team_idx  on ct_ratings (team_code, occasion);

create table if not exists peer_feedback (
  id integer primary key autoincrement,
  project_id text references projects(id) on delete cascade,
  team_code text not null default '',
  round_no integer not null default 1,
  from_user_id text references users(id) on delete set null,
  conflict_dim text,
  content text not null,
  demands_evidence boolean not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists pf_project_idx on peer_feedback (project_id, round_no);

-- ── 0012/0013 虚实对局 ──
create table if not exists personas (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  owner_id text not null references users(id) on delete cascade,
  kind text not null default 'twin',
  role_type text not null,
  label text not null,
  team_code text not null default '',
  card jsontext not null default '{}',
  source_text text not null default '',
  pii_flags jsontext not null default '{}',
  consent jsontext not null default '{}',
  visibility text not null default 'class',
  enabled boolean not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists personas_owner_idx on personas (owner_id, updated_at desc);
create index if not exists personas_team_idx  on personas (team_code);

create table if not exists arena_matches (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  teacher_id text not null references users(id) on delete cascade,
  title text not null default '虚实对局',
  scenario text not null default '',
  status text not null default 'lobby',
  round_no integer not null default 0,
  rounds integer not null default 3,
  round_minutes integer not null default 12,
  round_ends_at text,
  join_code text not null,
  config jsontext not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists am_status_idx on arena_matches (status, created_at desc);
create index if not exists am_code_idx on arena_matches (join_code);

create table if not exists arena_teams (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  match_id text not null references arena_matches(id) on delete cascade,
  team_code text not null,
  name text not null,
  venture text not null default '',
  project_id text references projects(id) on delete set null,
  sort integer not null default 0,
  unique (match_id, team_code)
);

create table if not exists arena_members (
  match_id text not null references arena_matches(id) on delete cascade,
  team_id text not null references arena_teams(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  seat integer not null default 0,
  joined_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (match_id, user_id)
);
create index if not exists am_team_idx on arena_members (team_id);

create table if not exists hypotheses (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  match_id text not null references arena_matches(id) on delete cascade,
  team_id text not null references arena_teams(id) on delete cascade,
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
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists hyp_team_idx on hypotheses (team_id, status);
create index if not exists hyp_match_idx on hypotheses (match_id);

create table if not exists arena_events (
  id integer primary key autoincrement,
  match_id text not null references arena_matches(id) on delete cascade,
  team_id text references arena_teams(id) on delete cascade,
  user_id text references users(id) on delete set null,
  round_no integer not null default 0,
  kind text not null,
  points integer not null default 0,
  persona_id text references personas(id) on delete set null,
  payload jsontext not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists ae_match_idx on arena_events (match_id, created_at desc);
create index if not exists ae_team_idx  on arena_events (team_id, kind);

-- ── updated_at 自动刷新（替代 Postgres 的 touch_updated_at 触发器）──
-- 只在本次 UPDATE 没有显式改 updated_at 时补写，避免递归
create trigger if not exists projects_touch after update on projects
  for each row when new.updated_at = old.updated_at
  begin update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists personas_touch after update on personas
  for each row when new.updated_at = old.updated_at
  begin update personas set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger if not exists hypotheses_touch after update on hypotheses
  for each row when new.updated_at = old.updated_at
  begin update hypotheses set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

-- ── 研究导出视图（只含同意研究的学生，只带研究假名编号）──
create view if not exists v_research_turns as
select
  t.id, t.session_id, t.turn_index, t.speaker, t.agent_key, t.conflict_dim,
  t.move_type, t.char_len, t.demands_evidence, t.cites_evidence, t.is_unanswered,
  t.content, t.created_at,
  s.team_code, s.round_no, s.scenario, s.dbr_cycle,
  p.research_pid
from dialogue_turns t
join challenge_sessions s on s.id = t.session_id
join profiles p          on p.id = t.user_id
where p.research_consent = 1;

create view if not exists v_research_sequences as
select
  v.project_id, v.team_code, v.version_no, v.seq_state, v.change_summary,
  v.created_at, p.research_pid
from plan_versions v
join profiles p on p.id = v.user_id
where p.research_consent = 1
order by v.team_code, v.version_no;

create view if not exists v_research_arena as
select e.id, e.match_id, e.round_no, e.kind, e.points, e.payload, e.created_at,
       t.team_code, p.research_pid
from arena_events e
left join arena_teams t on t.id = e.team_id
left join profiles p on p.id = e.user_id
where p.research_consent = 1;
