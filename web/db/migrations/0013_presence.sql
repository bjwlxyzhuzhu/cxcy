-- 不把旧会话迁移时间误标为学生上线时间。
alter table sessions add column if not exists last_seen_at timestamptz;
alter table sessions alter column last_seen_at set default now();
alter table sessions add column if not exists last_path text;
create index if not exists sessions_presence_idx on sessions(user_id,last_seen_at);
alter table users add column if not exists last_seen_at timestamptz;
