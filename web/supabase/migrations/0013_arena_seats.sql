-- =====================================================================
-- 0013 对战席位：学生入队时选择队内角色（队长/调研/产品/财务/路演）
-- 大屏按"战队 × 席位"展示个人证据值，不显示姓名。纯新增、可重复执行。
-- =====================================================================
alter table public.arena_members add column if not exists seat int not null default 0;
create index if not exists am_team_idx on public.arena_members (team_id);
