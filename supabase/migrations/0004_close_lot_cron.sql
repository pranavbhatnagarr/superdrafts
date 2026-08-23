-- Enable pg_cron once, if not already on (Database -> Extensions in the
-- dashboard also works instead of this line).
create extension if not exists pg_cron;

-- pg_cron can't loop over rows itself in a simple schedule, so this calls
-- a small SQL function that finds every table with an expired,
-- still-open lot and invokes close-lot for each. Requires the
-- `pg_net` extension (also on by default in Supabase) to make HTTP calls
-- from inside Postgres.
create extension if not exists pg_net;

create or replace function trigger_close_expired_lots() returns void as $$
declare
  t record;
begin
  for t in
    select distinct l.table_id
    from lots l
    join tables tb on tb.id = l.table_id and tb.current_lot = l.lot_num
    where l.sold = false
      and l.bid_deadline is not null
      and l.bid_deadline < now()
      and tb.finished = false
  loop
    perform net.http_post(
      url := 'https://trtccsljexjplnuhnlkz.supabase.co/functions/v1/close-lot',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('table_id', t.table_id)
    );
  end loop;
end;
$$ language plpgsql;

-- Every few seconds is plenty - the deadline itself is 8s, we just need
-- to catch it soon after it passes, not to the millisecond.
select cron.schedule(
  'close-expired-lots',
  '*/10 * * * * *',  -- every 10 seconds (pg_cron supports second-level schedules)
  $$ select trigger_close_expired_lots(); $$
);
