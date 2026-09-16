-- “多智能体协作—双层对抗”课堂实验数据层
create table if not exists public.experiment_runs (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  title text not null default 'AI学习与就业陪伴平台',
  starts_at timestamptz,
  duration_minutes int not null default 50,
  status text not null default 'draft' check (status in ('draft','active','closed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.experiment_participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.experiment_runs(id) on delete cascade,
  recovery_code text not null unique,
  cohort text not null check (cohort in ('single','panel')),
  consent boolean not null default false,
  stage text not null default 'join',
  created_at timestamptz not null default now(),
  unique(run_id, id)
);
create index if not exists experiment_participants_run_idx on public.experiment_participants(run_id);
create table if not exists public.experiment_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.experiment_runs(id) on delete cascade,
  participant_id uuid not null references public.experiment_participants(id) on delete cascade,
  event_type text not null,
  stage text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists experiment_events_participant_idx on public.experiment_events(participant_id, created_at);
