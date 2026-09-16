-- 注册资料与真实访问会话统计
-- 访问量按“每天每个访问者会话一次”计数，不读取可能被旧版本污染的 site_visits.count。
create table if not exists public.site_visit_events (
  day date not null,
  visitor_id text not null,
  first_seen_at timestamptz not null default now(),
  primary key (day, visitor_id)
);
create index if not exists site_visit_events_day_idx on public.site_visit_events(day);
