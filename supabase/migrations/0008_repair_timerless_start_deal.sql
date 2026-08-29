-- The auction timer migration removed lots.bid_deadline, but the live
-- start_table_deal RPC still inserted that old column. The guest seat was
-- created successfully, then opening lot 1 failed and left both players in
-- the lobby. Recreate the atomic deal RPC against the timerless lots schema.

drop function if exists public.start_table_deal(uuid, integer, jsonb, jsonb, jsonb);

create function public.start_table_deal(
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
  update public.tables
  set box = p_box,
      deck = p_deck,
      started = true,
      current_lot = 1,
      finished = false
  where id = p_table_id
    and started = false;

  if not found then
    raise exception 'table is missing or already started';
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

revoke all on function public.start_table_deal(uuid, integer, jsonb, jsonb, jsonb) from public;
grant execute on function public.start_table_deal(uuid, integer, jsonb, jsonb, jsonb) to service_role;
