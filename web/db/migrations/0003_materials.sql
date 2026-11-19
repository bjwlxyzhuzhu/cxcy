-- ════════════════════════════════════════════════════════════════════
-- 0003 调研资料：AI 自动建本体的原始依据
-- ────────────────────────────────────────────────────────────────────
-- 学生上传或粘贴的访谈记录、问卷结果、实测记录等（入库前已做个人信息脱敏）。
-- AI 起草的证据在 source 里记下 material_id 与原话位置，可一路查回原文。
-- ════════════════════════════════════════════════════════════════════
create table if not exists materials (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  project_id text not null references projects(id) on delete cascade,
  name text not null default '',                 -- 资料名称（文件名或学生填写）
  kind text not null check (kind in ('interview','survey','test','observation','document','public_data')),
  ref_note text not null default '',             -- 出处说明：谁、何时、怎么采集
  text text not null default '',                 -- 脱敏后的原文
  chars integer not null default 0,
  pii_flags jsontext not null default '{}',      -- 脱敏时发现并隐去的个人信息类型与数量
  created_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists mat_project_idx on materials (project_id, created_at desc);
create index if not exists mat_user_idx on materials (created_by, created_at desc);
