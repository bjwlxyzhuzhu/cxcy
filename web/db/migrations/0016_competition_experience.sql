-- 新增功能采用独立表；保留历史积分和课堂记录。
alter table profiles add column if not exists last_bonus_at date;
create table if not exists credit_rewards (
 id bigint generated always as identity primary key,
 user_id uuid not null references users(id) on delete cascade,
 kind text not null check(kind in ('daily','reflection')),
 reward_day date not null, amount integer not null check(amount > 0),
 content text not null default '', created_at timestamptz not null default now(),
 unique(user_id,kind,reward_day)
);
create table if not exists generated_reports (
 id uuid primary key, user_id uuid not null references users(id) on delete cascade,
 kind text not null check(kind in ('expert','defense')),
 fingerprint text not null, input text not null, output text,
 cost integer not null check(cost >= 0),
 status text not null check(status in ('pending','completed','refunded')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists generated_reports_owner_idx on generated_reports(user_id,created_at);
