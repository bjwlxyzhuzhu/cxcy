alter table intervention_cards alter column user_id drop not null;
alter table intervention_cards add column if not exists source_key text;
alter table intervention_cards add column if not exists context jsonb not null default '{}'::jsonb;
alter table intervention_cards add column if not exists updated_at timestamptz not null default now();
alter table intervention_cards add column if not exists resolved_at timestamptz;
create unique index if not exists intervention_cards_source_key on intervention_cards(source_key);
create table if not exists supervision_checkpoints (
  source_key text primary key,
  fingerprint text not null,
  checked_at timestamptz not null default now()
);
