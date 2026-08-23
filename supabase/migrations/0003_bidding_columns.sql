-- Additions needed for Stage 2 (bidding). Run this before deploying
-- place-bid.

alter table seats
  add column if not exists cid text;              -- to verify who's calling on behalf of which seat

alter table lots
  add column if not exists opener int,             -- seat obliged to open a compulsory lot (see obliged() in game.js)
  add column if not exists lock_until timestamptz,  -- mirrors lot.lockUntil / ACK_MS in game.js: brief pause after each bid
  add column if not exists passed_in boolean default false,
  add column if not exists history jsonb default '[]';

alter table tables
  add column if not exists current_lot int default 0,
  add column if not exists finished boolean default false;

-- RLS: same pattern as Stage 0 - public read, no write policy for anon/authenticated.
-- (skip if you already ran an equivalent read-all policy on seats/lots in Stage 0)
