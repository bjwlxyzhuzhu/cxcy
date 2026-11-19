-- 全量迁移（0001–0013 顺序合并，可重复执行的部分已用 if not exists）

-- ===== 0001_init.sql =====
-- ===================================================================
-- 双创AI星际 · M1 数据层（可重复运行）
-- 用法：Supabase Dashboard → SQL Editor → New query → 粘贴本文件 → Run
-- ===================================================================
create extension if not exists pgcrypto;

-- 角色枚举
do $$ begin
  create type public.user_role as enum ('student','teacher','admin');
exception when duplicate_object then null; end $$;

-- 用户档案（id 关联 auth.users，带积分）
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_no text,
  name text,
  class text,
  college text,
  major text,
  role public.user_role not null default 'student',
  credits int not null default 120,
  created_at timestamptz default now()
);

-- 班级名单白名单（注册校验用）
create table if not exists public.rosters (
  id bigint generated always as identity primary key,
  class text, student_no text, name text, college text, major text, gender text,
  unique (class, student_no)
);

-- AI / 生图调用记账
create table if not exists public.usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  cost int not null default 0,
  meta jsonb default '{}',
  created_at timestamptz default now()
);

-- 应用配置（积分规则 / 外链等，可被管理端覆盖）
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- 管理员判断（SECURITY DEFINER 避免 profiles 自引用 RLS 递归）
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role in ('admin','teacher'));
$$;

-- 注册时自动建立档案
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ★ 原子扣分 + 记账（服务端唯一扣分入口）
create or replace function public.deduct_credits(
  p_user uuid, p_action text, p_cost int, p_meta jsonb default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare remaining int;
begin
  update public.profiles set credits = credits - p_cost
   where id = p_user and credits >= p_cost
   returning credits into remaining;
  if remaining is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;
  insert into public.usage_logs (user_id, action, cost, meta)
  values (p_user, p_action, p_cost, p_meta);
  return remaining;
end $$;

-- ===== 行级权限 =====
alter table public.profiles    enable row level security;
alter table public.usage_logs  enable row level security;
alter table public.rosters     enable row level security;
alter table public.app_config  enable row level security;

drop policy if exists "own profile read"   on public.profiles;
create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (id = auth.uid() or public.is_admin());

drop policy if exists "logs read" on public.usage_logs;
create policy "logs read" on public.usage_logs for select using (user_id = auth.uid() or public.is_admin());
-- usage_logs 的写入由服务端 service_role 完成（绕过 RLS），不开放学生 INSERT，防伪造刷分。

drop policy if exists "rosters read"  on public.rosters;
create policy "rosters read"  on public.rosters for select using (auth.role() = 'authenticated');
drop policy if exists "rosters admin" on public.rosters;
create policy "rosters admin" on public.rosters for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "config read"  on public.app_config;
create policy "config read"  on public.app_config for select using (auth.role() = 'authenticated');
drop policy if exists "config admin" on public.app_config;
create policy "config admin" on public.app_config for all using (public.is_admin()) with check (public.is_admin());

-- 积分规则默认值
insert into public.app_config (key, value) values
  ('credit_costs', '{"chat":1,"topic":2,"text":5,"ppt":5,"image":10,"defense":2,"data":3}')
on conflict (key) do nothing;

-- ===== 0002_user_api_keys.sql =====
-- ===================================================================
-- 双创AI星际 · 用户自带 API Key（按用途/智能体）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run（可重复运行）
-- ===================================================================
create table if not exists public.user_api_keys (
  user_id uuid references auth.users(id) on delete cascade,
  purpose text not null,            -- chat 通用对话 | reason 思考 | text 文本 | image PPT配图
  provider text,                    -- deepseek | moonshot | qwen | minimax | zhipu | openai | apimart | custom
  base_url text,
  api_key text,
  model text,
  updated_at timestamptz default now(),
  primary key (user_id, purpose)
);

alter table public.user_api_keys enable row level security;

-- 仅本人可增删改查自己的 key（浏览器端用 publishable key 即可安全管理）
drop policy if exists "own api keys" on public.user_api_keys;
create policy "own api keys" on public.user_api_keys for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== 0003_m2_learn_rag.sql =====
-- ===================================================================
-- 双创AI星际 · M2 闯关中心数据层（可重复运行）
-- 知识库(向量) + 案例宝库 + 模板宝库 + 相似度检索 RPC
-- 用法：Supabase Dashboard → SQL Editor → New query → 粘贴本文件 → Run
-- 依赖：0001_init.sql（is_admin()）已先跑过。
-- ===================================================================

-- pgvector 扩展（Supabase 默认可用）
create extension if not exists vector;

-- RAG 文本块：仅服务端 service_role 检索，不开放学生读原文
create table if not exists public.knowledge (
  id bigint generated always as identity primary key,
  source text not null,            -- 来源标签：案例 / 备赛指南 / 答辩100问 ...
  title text,                      -- 出处标题（案例名 / 文档名）
  tags text[] default '{}',
  chunk text not null,             -- 文本块
  embedding vector(1536),          -- text-embedding-3-small = 1536 维
  created_at timestamptz default now()
);

-- 案例宝库
create table if not exists public.cases (
  id bigint generated always as identity primary key,
  code text unique,                -- case-01 ...
  title text not null,
  region text,                     -- 区域（某市…）
  industry text,                   -- 产业（某新材料…）
  points text[] default '{}',      -- 核心知识点
  situation text,                  -- 案例情境
  task text,                       -- 课堂任务
  questions jsonb default '[]',    -- 讨论问题[]
  analysis jsonb default '[]',     -- 分析表[{dim,point,tip}]
  image text,                      -- /library/cases/case-01.png
  doc text,                        -- 原始 DOCX 下载路径（如有）
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- 模板宝库
create table if not exists public.templates (
  id bigint generated always as identity primary key,
  name text not null,
  category text,                   -- 计划书 / PPT / 合同 / 指南 ...
  file text,                       -- /library/templates/xxx.docx
  ext text,                        -- docx / pptx
  size_kb int,
  intro text,
  tags text[] default '{}',
  sort int default 0,
  created_at timestamptz default now()
);

-- 相似度检索（服务端 admin 调用；service_role 绕过 knowledge 的 RLS）
create or replace function public.match_knowledge(
  query_embedding vector(1536), match_count int default 6)
returns table(id bigint, source text, title text, chunk text, similarity float)
language sql stable set search_path = public as $$
  select k.id, k.source, k.title, k.chunk, 1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge k
  where k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

-- ===== 行级权限 =====
alter table public.knowledge enable row level security;  -- 无 select 策略 → 学生读不到；服务端 service_role 绕过
alter table public.cases     enable row level security;
alter table public.templates enable row level security;

drop policy if exists "cases read"  on public.cases;
create policy "cases read"  on public.cases for select using (auth.role() = 'authenticated');
drop policy if exists "cases admin" on public.cases;
create policy "cases admin" on public.cases for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "templates read"  on public.templates;
create policy "templates read"  on public.templates for select using (auth.role() = 'authenticated');
drop policy if exists "templates admin" on public.templates;
create policy "templates admin" on public.templates for all using (public.is_admin()) with check (public.is_admin());

-- ===== 0004_admin_hardening.sql =====
-- ===================================================================
-- 双创AI星际 · M5 安全加固（可选，建议跑）
-- 收紧 profiles 的 UPDATE 策略：仅管理员/教师可改（原策略 id=auth.uid() OR is_admin()
-- 且无 WITH CHECK → 学生可改自己的 credits 自助加分）。
-- 客户端无合法的 profiles 自写：改密走 auth、头像走 localStorage、扣分走 service_role。
-- 用法：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。依赖 0001（is_admin()）。
-- ===================================================================
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "admin profile update" on public.profiles;
create policy "admin profile update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ===== 0005_projects.sql =====
-- 0005 跨设备项目存储：学生的创业项目（名称/BP草稿/分节/团队）存云端，换设备可续、教师后台可看。
-- 纯新增、可重复执行。应用方式：Supabase 控制台 SQL Editor 粘贴执行，或 supabase db push。

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '我的项目',
  draft text not null default '',
  sections jsonb not null default '{}'::jsonb,
  team jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

-- 本人对自己的项目有全部权限
drop policy if exists "projects_own_all" on public.projects;
create policy "projects_own_all" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 教师/管理员可只读全部项目（复用 0001 的 public.is_admin()），用于后台查看学生产出
drop policy if exists "projects_admin_read" on public.projects;
create policy "projects_admin_read" on public.projects
  for select using (public.is_admin());

-- updated_at 自动更新
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated on public.projects;
create trigger projects_touch_updated before update on public.projects
  for each row execute function public.touch_updated_at();

-- ===== 0006_daily_bonus.sql =====
-- M·每日登录奖励：记录上次发放日期，保证每个自然日（中国时区）只发一次 +30 积分。
-- 仅新增一列，幂等、无副作用；服务端用 service-role 读改 profiles，不依赖 RLS。
alter table public.profiles add column if not exists last_bonus_at date;

comment on column public.profiles.last_bonus_at is '上次发放每日登录积分的日期（Asia/Shanghai），用于每日签到 +30 去重';

-- ===== 0007_skills.sql =====
-- M·技能系统：用户沉淀的自有技能 + 用户启用/安装的技能 id。
-- 仅两张表，RLS「仅本人」，客户端用 supabase client 直接增删改（同 user_api_keys 模式，无需 service-role）。
-- 不动 profiles（规避 0004 加固对自写的限制）。幂等。

-- 1) 用户沉淀的自有技能
create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text default '🧩',
  category text default '我的',
  scope text default 'all',          -- all / leader / writer / 或某搭子 key（strategy/design/teacher/student/industry/mentor/advisor/boss）
  instruction text not null,         -- 注入到智能体 system 的技能指令
  created_at timestamptz default now()
);
alter table public.user_skills enable row level security;
drop policy if exists "own user_skills" on public.user_skills;
create policy "own user_skills" on public.user_skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) 用户已启用/安装的技能 id（内置/商店用其字符串 id；自有用 'mine:'+uuid；演示插件用 'plugin:'+id）
create table if not exists public.user_enabled_skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, skill_id)
);
alter table public.user_enabled_skills enable row level security;
drop policy if exists "own user_enabled_skills" on public.user_enabled_skills;
create policy "own user_enabled_skills" on public.user_enabled_skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 0008_evidence.sql =====
-- 0008 成长星图 · 证据事件层（P0）
-- 学生在各模块的里程碑产出自动"盖章存证"：选题结论 / BP 成稿 / 专家审稿 / 答辩雷达(五维时序) / 导出 / 技能启用。
-- 防伪造设计：与 usage_logs 相同——不开放客户端 INSERT，只由服务端 service_role 写入，时间戳由数据库生成。
-- 纯新增、可重复执行。应用方式：Supabase 控制台 SQL Editor 粘贴执行。

create table if not exists public.evidence_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null,               -- topic_match / bp_draft / expert_review / defense_radar / export_doc / skill_use / crew_final / intervention_response
  title text not null default '',   -- 星图上这颗"星"的名字（如「模拟答辩 · 高教主赛道·创意组」）
  dims jsonb,                       -- 五维能力快照（defense_radar 用）：{ key, axes:[{dim,score,max}], total }
  payload jsonb not null default '{}'::jsonb,  -- 产物引用/回放摘录（问题与回答节选、导出文件名等）
  created_at timestamptz not null default now()
);

create index if not exists evidence_user_time_idx on public.evidence_events (user_id, created_at desc);
create index if not exists evidence_user_kind_idx on public.evidence_events (user_id, kind, created_at desc);

alter table public.evidence_events enable row level security;

-- 学生可读自己的证据链；教师/管理员可读全部（学情看板、成长报告用）
drop policy if exists "evidence_own_read" on public.evidence_events;
create policy "evidence_own_read" on public.evidence_events
  for select using (user_id = auth.uid() or public.is_admin());

-- 不建 INSERT/UPDATE/DELETE 策略：写入仅服务端 service_role（绕过 RLS），学生无法伪造或篡改证据。

-- ===== 0009_interventions.sql =====
-- 0009 教师干预闭环（P2）· 猫头鹰督导干预卡片
-- 实时触发：系统检测学生证据链中的成长风险模式（弱项连击/成稿未答辩/维度暴跌），
-- 由 AI（猫头鹰人格，反谄媚、对事不对人）生成四段式卡片：一针见血→证据→怎么改→去哪练。
-- 学生三按钮回应（接受/已改进/不同意），"不同意"升级教师裁决；回应本身写回证据链。
-- 写入/更新仅服务端 service_role（API 内做归属与状态机校验），学生端不可伪造。
-- 纯新增、可重复执行。应用方式：Supabase 控制台 SQL Editor 粘贴执行。

create table if not exists public.intervention_cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null,                       -- 触发规则标识（同一规则 7 天内不重复发卡）
  sharp text not null default '',           -- ①一针见血（犀利，但只指向产出证据，不指向人格）
  evidence text not null default '',        -- ②证据（触发本卡的具体事件描述）
  advice text not null default '',          -- ③怎么改（具体可执行动作）
  link_href text not null default '',       -- ④去哪练（平台内深链）
  link_label text not null default '',
  status text not null default 'open',      -- open / accepted / improved / disputed / retracted
  student_note text not null default '',    -- 学生回应备注（"不同意"时的申诉理由）
  teacher_note text not null default '',    -- 教师裁决/备注
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists icards_user_time_idx on public.intervention_cards (user_id, created_at desc);
create index if not exists icards_status_idx on public.intervention_cards (status, created_at desc);

alter table public.intervention_cards enable row level security;

-- 学生可读自己的卡；教师/管理员可读全部（督导队列）
drop policy if exists "icards_own_read" on public.intervention_cards;
create policy "icards_own_read" on public.intervention_cards
  for select using (user_id = auth.uid() or public.is_admin());

-- 不建 INSERT/UPDATE/DELETE 策略：全部经服务端 API（service_role），保证状态机与归属校验。

-- ===== 0010_stats.sql =====
-- 0010 P4 成效面板 · 站点访问量统计（真实计数，服务端写入）
-- 首页每次访问 +1（按天累计）；成效面板与首页动态墙读取。
-- 纯新增、可重复执行。应用方式：Supabase 控制台 SQL Editor 粘贴执行。

create table if not exists public.site_visits (
  day date primary key,
  count bigint not null default 0
);

alter table public.site_visits enable row level security;
-- 不建任何客户端策略：读写全部经服务端 API（service_role），防刷防伪造。

-- ===== 0011_adversarial_dialogue.sql =====
-- Compatibility columns used by the research export
alter table public.profiles add column if not exists native_lang text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists hsk_level int;

-- =====================================================================
-- 0011 对抗性质询 · 轮级对话日志与研究数据层
--
-- 目的：为《对抗性多智能体课堂中的认知冲突与批判性思维生成机制》一文
--       采集可编码、可统计、可聚类的真实过程数据。
--
-- 现状问题：/api/ai/ask 一问一答即走，只在里程碑门槛处写 evidence_events
--          （问 300 字 / 答 800 字摘录）。这不足以支撑：
--            · 追问轮次强度与维度广度统计
--            · 质询—回应片段的三级编码与路径归纳
--            · 项目迭代序列的最优匹配聚类
--          以上三项恰是审稿专家1 第 1、3、4 条意见所要求的证据。
--
-- 纯新增、可重复执行。应用方式：Supabase 控制台 SQL Editor 粘贴执行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 一、研究知情同意（写入 profiles，不新建表）
-- 未同意的学生照常使用平台，其数据不纳入研究分析。
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists research_consent boolean not null default false;
alter table public.profiles
  add column if not exists research_consent_at timestamptz;
alter table public.profiles
  add column if not exists research_pid text;   -- 研究编号（如 T01-S07），与姓名学号解耦

comment on column public.profiles.research_consent is
  '学生是否同意其平台过程数据被用于教学研究（匿名化后）。默认 false。';
comment on column public.profiles.research_pid is
  '研究用假名编号。导出分析数据时只带此列，不带 name/student_no。';


-- ---------------------------------------------------------------------
-- 二、对抗性质询会话
-- 一个团队针对一个方案版本接受一次完整的四维质询 = 一个 session
-- ---------------------------------------------------------------------
create table if not exists public.challenge_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  team_code text not null default '',       -- 团队编号（同一团队多名学生共享）
  round_no int not null default 1,          -- 该项目的第几轮质询（对应方案第几版）
  scenario text not null default '',        -- 课次，如 '创业机会识别'
  dbr_cycle int not null default 1,         -- 属于 DBR 第几轮迭代（1/2/3）
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists cs_user_idx    on public.challenge_sessions (user_id, started_at desc);
create index if not exists cs_project_idx on public.challenge_sessions (project_id, round_no);
create index if not exists cs_team_idx    on public.challenge_sessions (team_code, round_no);


-- ---------------------------------------------------------------------
-- 三、轮级对话日志 —— 本次改造的核心
-- 每一轮（智能体的一次追问 / 学生的一次回应）各一行。
-- ---------------------------------------------------------------------
create table if not exists public.dialogue_turns (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.challenge_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_index int not null,                  -- 会话内轮次序号，从 1 起

  speaker text not null,                    -- 'agent' | 'student' | 'teacher'
  agent_key text,                           -- virtual_user / investor / professor / peer
  conflict_dim text,                        -- demand / value / feasibility / ethics
  move_type text,                           -- 见下方 CHECK 说明；可先留空，由编码阶段回填

  content text not null,
  char_len int generated always as (char_length(content)) stored,

  -- 追问强度的机器可测代理指标（由 API 侧规则打标，编码阶段人工校验）
  demands_evidence boolean not null default false,  -- 该追问是否明确索要证据/数据
  cites_evidence   boolean not null default false,  -- 该回应是否给出了具体证据
  is_unanswered    boolean not null default false,  -- 学生是否回避/答不出

  created_at timestamptz not null default now()
);

create index if not exists dt_session_idx on public.dialogue_turns (session_id, turn_index);
create index if not exists dt_user_idx    on public.dialogue_turns (user_id, created_at desc);
create index if not exists dt_dim_idx     on public.dialogue_turns (conflict_dim, speaker);

comment on column public.dialogue_turns.move_type is
  '编码阶段回填。智能体侧：challenge_assumption/request_evidence/counter_example/reframe；'
  '学生侧：defend（维护原方案）/concede（承认问题）/verify（去查证）/revise（据证修正）/'
  'comply（无判断照单全收）/reject（视为刁难）。'
  '其中 verify+revise → 认识性调节；defend+reject 与 comply → 关系性调节。';


-- ---------------------------------------------------------------------
-- 四、方案版本快照 —— 迭代序列聚类的输入
-- 每次质询后学生修订方案即存一版，形成可做最优匹配的状态序列。
-- ---------------------------------------------------------------------
create table if not exists public.plan_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_code text not null default '',
  version_no int not null,
  session_id uuid references public.challenge_sessions(id) on delete set null,

  sections jsonb not null default '{}'::jsonb,   -- 该版各分节全文
  change_summary text not null default '',       -- 学生自述这版改了什么、为什么

  -- 序列编码：本版相对上一版的状态（聚类时作为序列元素）
  -- A=提出新假设  F=假设被证伪  R=据证据修正  V=补充验证证据
  -- S=场景跃迁（校园→产业）  N=无实质变化
  seq_state char(1),

  created_at timestamptz not null default now(),
  unique (project_id, version_no)
);

create index if not exists pv_project_idx on public.plan_versions (project_id, version_no);
create index if not exists pv_team_idx    on public.plan_versions (team_code, version_no);


-- ---------------------------------------------------------------------
-- 五、批判性思维量规评分 —— 效度检验的输入
-- 同一份材料由多位评分者独立评分，用于 ICC 与因子分析。
-- ---------------------------------------------------------------------
create table if not exists public.ct_ratings (
  id bigint generated always as identity primary key,
  target_kind text not null,                -- 'plan_version' | 'session' | 'reflection'
  target_id text not null,                  -- 对应主键（转文本，兼容 bigint/uuid）
  ratee_user_id uuid references auth.users(id) on delete cascade,
  team_code text not null default '',
  rater_code text not null,                 -- 评分者编号 R1/R2/AI
  occasion text not null default 'pre',     -- pre / mid / post

  -- Facione 五维，各 0—2 分
  interpret smallint check (interpret between 0 and 2),
  evaluate  smallint check (evaluate  between 0 and 2),
  infer     smallint check (infer     between 0 and 2),
  selfreg   smallint check (selfreg   between 0 and 2),
  synthesis smallint check (synthesis between 0 and 2),
  total smallint generated always as
    (coalesce(interpret,0)+coalesce(evaluate,0)+coalesce(infer,0)
     +coalesce(selfreg,0)+coalesce(synthesis,0)) stored,

  note text not null default '',
  created_at timestamptz not null default now(),
  unique (target_kind, target_id, rater_code, occasion)
);

create index if not exists ctr_ratee_idx on public.ct_ratings (ratee_user_id, occasion);
create index if not exists ctr_team_idx  on public.ct_ratings (team_code, occasion);


-- ---------------------------------------------------------------------
-- 六、真实同伴反馈对照 —— 支撑"超过真实大班情境"这一论断
-- 没有这张表，"强度与广度超过真实反馈"就只是断言。
-- ---------------------------------------------------------------------
create table if not exists public.peer_feedback (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete cascade,
  team_code text not null default '',
  round_no int not null default 1,
  from_user_id uuid references auth.users(id) on delete set null,
  conflict_dim text,                        -- demand / value / feasibility / ethics
  content text not null,
  demands_evidence boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pf_project_idx on public.peer_feedback (project_id, round_no);


-- ---------------------------------------------------------------------
-- 七、行级权限
-- 与 usage_logs / evidence_events 一致：客户端只读自己的，写入一律走服务端
-- service_role，学生无法伪造或篡改研究数据。
-- ---------------------------------------------------------------------
alter table public.challenge_sessions enable row level security;
alter table public.dialogue_turns     enable row level security;
alter table public.plan_versions      enable row level security;
alter table public.ct_ratings         enable row level security;
alter table public.peer_feedback      enable row level security;

drop policy if exists "cs_read" on public.challenge_sessions;
create policy "cs_read" on public.challenge_sessions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "dt_read" on public.dialogue_turns;
create policy "dt_read" on public.dialogue_turns
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "pv_read" on public.plan_versions;
create policy "pv_read" on public.plan_versions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ctr_read" on public.ct_ratings;
create policy "ctr_read" on public.ct_ratings
  for select using (ratee_user_id = auth.uid() or public.is_admin());

drop policy if exists "pf_read" on public.peer_feedback;
create policy "pf_read" on public.peer_feedback
  for select using (from_user_id = auth.uid() or public.is_admin());
-- 均不建 INSERT/UPDATE/DELETE 策略：写入仅服务端 service_role。


-- ---------------------------------------------------------------------
-- 八、研究导出视图（已脱敏：只带 research_pid，不带姓名学号）
-- 分析时直接 select * 导出 CSV 即可。
-- ---------------------------------------------------------------------
create or replace view public.v_research_turns as
select
  t.id, t.session_id, t.turn_index, t.speaker, t.agent_key, t.conflict_dim,
  t.move_type, t.char_len, t.demands_evidence, t.cites_evidence, t.is_unanswered,
  t.content, t.created_at,
  s.team_code, s.round_no, s.scenario, s.dbr_cycle,
  p.research_pid
from public.dialogue_turns t
join public.challenge_sessions s on s.id = t.session_id
join public.profiles p          on p.id = t.user_id
where p.research_consent = true;

create or replace view public.v_research_sequences as
select
  v.project_id, v.team_code, v.version_no, v.seq_state, v.change_summary,
  v.created_at, p.research_pid
from public.plan_versions v
join public.profiles p on p.id = v.user_id
where p.research_consent = true
order by v.team_code, v.version_no;

-- ===== 0012_arena.sql =====
-- =====================================================================
-- 0012 虚实对局 · 数字分身 · 假设看板
--
-- 目的：支撑《创新创业基础》"智能组织"课堂——
--   ① 分身工坊：学生把真实调研（访谈/问卷/观察）注入，生成可对话的角色数字分身；
--      教师注入评委、投资人、导师等角色原型。
--   ② 虚实对局：6 支队伍在同一局里，与其他队伍的分身（对抗）和导师角色（协作）多轮交锋。
--   ③ 虚实闭环：虚拟交锋只产出"待验证假设"，必须回到现实验证（教师确认）才计高分。
--
-- 设计原则：
--   · 分身只做"角色原型"，不复制真人；原始资料入库前去除身份证/手机/邮箱/学号。
--   · 积分记在"证据"上（被证伪的假设、真实验证、带证据的回应），不按聊天轮数计。
--   · 过程同时写入 0011 的 challenge_sessions / dialogue_turns / plan_versions，
--     与论文研究数据层同源，可走既有匿名导出。
--
-- 纯新增、可重复执行。依赖 0001(profiles/is_admin)、0005(projects)、0011。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 一、数字分身 / 角色原型
-- ---------------------------------------------------------------------
create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'twin',          -- twin=学生调研分身；role=教师注入角色
  role_type text not null,                    -- customer/buyer/competitor/supplier/expert/judge/investor/mentor/ethics/business/legal/industry
  label text not null,                        -- 角色名，如"钛材厂采购经理A"
  team_code text not null default '',         -- 作者所在队伍（跨队对抗与积分归属用）
  card jsonb not null default '{}'::jsonb,    -- 角色卡：identity/context/pains/goals/budget/decision_logic/objections/quotes/source
  source_text text not null default '',       -- 已脱敏的原始调研文本（检索注入用，≤12000 字）
  pii_flags jsonb not null default '{}'::jsonb,
  consent jsonb not null default '{}'::jsonb, -- 知情同意确认项与时间
  visibility text not null default 'class',   -- class=全班可见；team=仅本队
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personas_owner_idx on public.personas (owner_id, updated_at desc);
create index if not exists personas_team_idx  on public.personas (team_code);

-- ---------------------------------------------------------------------
-- 二、对局 / 队伍 / 成员
-- ---------------------------------------------------------------------
create table if not exists public.arena_matches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '虚实对局',
  scenario text not null default '',          -- 课次，如"路演答辩演练"
  status text not null default 'lobby',       -- lobby / running / ended
  round_no int not null default 0,
  rounds int not null default 3,
  round_minutes int not null default 12,
  round_ends_at timestamptz,
  join_code text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists am_status_idx on public.arena_matches (status, created_at desc);

create table if not exists public.arena_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  team_code text not null,                    -- 与 personas.team_code / challenge_sessions.team_code 对齐
  name text not null,
  venture text not null default '',           -- 这支队伍经营的"AI 原生微企业"一句话描述
  project_id uuid references public.projects(id) on delete set null,
  sort int not null default 0,
  unique (match_id, team_code)
);

create table if not exists public.arena_members (
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  team_id uuid not null references public.arena_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

-- ---------------------------------------------------------------------
-- 三、假设看板（虚实闭环的核心）
-- pending 待验证 → falsified 已证伪 / verifying 待教师确认 → verified 已验证
-- ---------------------------------------------------------------------
create table if not exists public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  team_id uuid not null references public.arena_teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  persona_id uuid references public.personas(id) on delete set null,  -- 由哪个分身的质询触发
  round_no int not null default 1,
  text text not null,
  status text not null default 'pending',
  reason text not null default '',            -- 证伪理由
  revision text not null default '',          -- 证伪后的修正
  evidence text not null default '',          -- 现实验证证据（访谈/问卷/实测结果摘要）
  evidence_url text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hyp_team_idx on public.hypotheses (team_id, status);

-- ---------------------------------------------------------------------
-- 四、对局事件流（积分账本 + 大屏动态）
-- ---------------------------------------------------------------------
create table if not exists public.arena_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.arena_matches(id) on delete cascade,
  team_id uuid references public.arena_teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  round_no int not null default 0,
  kind text not null,       -- turn / evidence_reply / hypothesis / falsify / verify_submit / verify / twin_hit / collab / round
  points int not null default 0,
  persona_id uuid references public.personas(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ae_match_idx on public.arena_events (match_id, created_at desc);
create index if not exists ae_team_idx  on public.arena_events (team_id, kind);

-- ---------------------------------------------------------------------
-- 五、行级权限：客户端不直连，读写一律经服务端 API（service_role）鉴权
-- ---------------------------------------------------------------------
alter table public.personas      enable row level security;
alter table public.arena_matches enable row level security;
alter table public.arena_teams   enable row level security;
alter table public.arena_members enable row level security;
alter table public.hypotheses    enable row level security;
alter table public.arena_events  enable row level security;

drop policy if exists "personas_admin_read" on public.personas;
create policy "personas_admin_read" on public.personas for select using (public.is_admin());
-- 其余均不建策略：学生无法绕过 API 直接改分数或假设状态。

-- updated_at 自动更新（复用 0005 的 touch_updated_at）
drop trigger if exists personas_touch on public.personas;
create trigger personas_touch before update on public.personas
  for each row execute function public.touch_updated_at();
drop trigger if exists hypotheses_touch on public.hypotheses;
create trigger hypotheses_touch before update on public.hypotheses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 六、研究导出视图：对局事件（只带 research_pid）
-- ---------------------------------------------------------------------
create or replace view public.v_research_arena as
select e.id, e.match_id, e.round_no, e.kind, e.points, e.payload, e.created_at,
       t.team_code, p.research_pid
from public.arena_events e
left join public.arena_teams t on t.id = e.team_id
left join public.profiles p on p.id = e.user_id
where p.research_consent = true;
-- 视图以所有者身份运行，会绕过底表 RLS：只允许服务端读取
revoke all on public.v_research_arena from anon, authenticated;

-- ===== 0013_arena_seats.sql =====
-- =====================================================================
-- 0013 对战席位：学生入队时选择队内角色（队长/调研/产品/财务/路演）
-- 大屏按"战队 × 席位"展示个人证据值，不显示姓名。纯新增、可重复执行。
-- =====================================================================
alter table public.arena_members add column if not exists seat int not null default 0;
create index if not exists am_team_idx on public.arena_members (team_id);
