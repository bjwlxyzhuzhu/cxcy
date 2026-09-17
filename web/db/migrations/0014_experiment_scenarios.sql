-- Existing classrooms retain their original topic. New classrooms store a full immutable snapshot.
alter table experiment_runs add column if not exists scenario jsonb not null default '{"id":"ai-campus-v1"}'::jsonb;
