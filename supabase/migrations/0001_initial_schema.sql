-- Stage 0: initial schema for moving the game off the host's browser.
-- See backend-migration-plan.md for the full reasoning behind each table.

create table if not exists tables (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  host_cid text not null,
  np int not null,
  box jsonb not null,          -- universes/tiers selected
  deck jsonb,                  -- server-shuffled, filled once table starts (Stage 1)
  started boolean default false,
  created_at timestamptz default now()
);

create table if not exists seats (
  table_id uuid references tables(id) on delete cascade,
  seat int not null,
  cid text,
  name text,
  purse int default 20,
  roster jsonb default '[]',
  locked boolean default false,
  primary key (table_id, seat)
);

create table if not exists lots (
  table_id uuid references tables(id) on delete cascade,
  lot_num int not null,
  card jsonb not null,
  high_seat int,
  high_amount int default 0,
  bid_deadline timestamptz,
  sold boolean default false,
  passed_by boolean[] default '{}',
  primary key (table_id, lot_num)
);

create table if not exists bids (            -- append-only audit log, not just current state
  id bigint generated always as identity primary key,
  table_id uuid references tables(id) on delete cascade,
  lot_num int not null,
  seat int not null,
  amount int not null,
  created_at timestamptz default now()
);

create table if not exists matches (
  table_id uuid references tables(id) on delete cascade,
  seed text not null,
  state jsonb not null,        -- the ST object, server-owned (Stage 3)
  updated_at timestamptz default now(),
  primary key (table_id)
);

-- Row Level Security: public read, no write policy at all for
-- anon/authenticated - absence of an insert/update/delete policy means
-- Postgres denies those by default once RLS is on. Only the service-role
-- key (used inside Edge Functions, never shipped to the browser) bypasses
-- RLS. See the chat history for why matches' "using (true)" read policy
-- will need tightening once Stage 3 (fight-pick secrecy) is built.

alter table tables  enable row level security;
alter table seats   enable row level security;
alter table lots    enable row level security;
alter table bids    enable row level security;
alter table matches enable row level security;

create policy "read own table" on tables for select using (true);
create policy "read seats for my table" on seats for select using (true);
create policy "read lots for my table" on lots for select using (true);
create policy "read bids for my table" on bids for select using (true);
create policy "read matches for my table" on matches for select using (true);
