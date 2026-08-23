-- Stage 3: the one table in this whole project that's intentionally NOT
-- publicly readable. A seat's pick has to stay invisible to the other
-- seat until both are in - unlike everything else so far (bids, lots,
-- seats), where openness was fine or even the point.
--
-- No RLS policy of ANY kind (select included) is created for
-- anon/authenticated on this table. Absence of a policy = denied by
-- default once RLS is on - the same rule that already blocks writes on
-- every other table blocks reads here too. Only the service-role key,
-- used inside submit-pick, can ever see a row before the round resolves.

create table if not exists picks (
  table_id uuid references tables(id) on delete cascade,
  round_num int not null,
  owner text not null,       -- matches seats.name / the `owner` field resolveRound() keys off
  name text not null,        -- the fighter's name
  created_at timestamptz default now(),
  primary key (table_id, round_num, owner)
);

alter table picks enable row level security;
-- deliberately no policies at all - see comment above
