-- restart_table had the same stale INSERT as start_table_deal and failed after
-- a completed match because lots.bid_deadline was removed with the auction
-- timer. Preserve the atomic reset while using the timerless lots schema.

drop function if exists public.restart_table(uuid, integer, jsonb, jsonb, jsonb);

create function public.restart_table(
  p_table_id uuid,
  p_np integer,
  p_box jsonb,
  p_deck jsonb,
  p_first_card jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.picks where table_id = p_table_id;
  delete from public.matches where table_id = p_table_id;
  delete from public.lots where table_id = p_table_id;

  update public.seats
  set purse = 20,
      roster = '[]'::jsonb,
      locked = false
  where table_id = p_table_id;

  update public.tables
  set box = p_box,
      deck = p_deck,
      started = true,
      current_lot = 1,
      finished = false
  where id = p_table_id;

  if not found then
    raise exception 'table does not exist';
  end if;

  insert into public.lots (
    table_id, lot_num, card, high_seat, high_amount, opener,
    passed_by, sold, passed_in, history, lock_until
  ) values (
    p_table_id, 1, p_first_card, null, 0, 0,
    array_fill(false, array[p_np]), false, false, '[]'::jsonb, null
  );
end;
$$;

revoke all on function public.restart_table(uuid, integer, jsonb, jsonb, jsonb) from public;
grant execute on function public.restart_table(uuid, integer, jsonb, jsonb, jsonb) to service_role;
