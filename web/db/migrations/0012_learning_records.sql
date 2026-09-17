-- 兼容旧实验：不改写原有记录或分组。
alter table experiment_runs add column if not exists protocol_version text not null default 'legacy-v1';
alter table experiment_participants add column if not exists participant_code text;
alter table experiment_participants add column if not exists user_id uuid references users(id) on delete set null;
create unique index if not exists experiment_account_run_idx on experiment_participants(run_id,user_id) where user_id is not null;
update experiment_participants set participant_code='E-' || upper(substr(replace(id::text,'-',''),1,12)) where participant_code is null;
alter table experiment_participants alter column participant_code set not null;
create unique index if not exists experiment_participant_code_idx on experiment_participants(participant_code);
alter table experiment_events add column if not exists request_id text;
create unique index if not exists experiment_request_idx on experiment_events(participant_id,request_id) where request_id is not null;
create table if not exists experiment_drafts (
 participant_id uuid not null references experiment_participants(id) on delete cascade,
 stage text not null, payload jsonb not null default '{}', updated_at timestamptz not null default now(),
 primary key(participant_id,stage)
);
create table if not exists learning_sessions (
 id uuid primary key, user_id uuid not null references users(id) on delete cascade,
 module text not null, title text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists learning_sessions_owner_idx on learning_sessions(user_id,module,updated_at);
create table if not exists learning_records (
 id bigint generated always as identity primary key,
 session_id uuid not null references learning_sessions(id) on delete cascade,
 request_id uuid not null, role text not null check(role in ('user','assistant','system')),
 content text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(session_id,request_id,role)
);
