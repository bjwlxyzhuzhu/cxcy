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
