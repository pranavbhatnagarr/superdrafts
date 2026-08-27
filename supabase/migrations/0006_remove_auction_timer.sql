-- Auctions now resolve only through explicit player passes. Remove the
-- timeout backstop and the deadline field that powered it.
do $$
declare
  close_job_id bigint;
begin
  select jobid into close_job_id
  from cron.job
  where jobname = 'close-expired-lots'
  limit 1;

  if close_job_id is not null then
    perform cron.unschedule(close_job_id);
  end if;
end;
$$;

drop function if exists trigger_close_expired_lots();
alter table lots drop column if exists bid_deadline;