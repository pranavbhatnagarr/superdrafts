-- The Edge Function reads from `characters` using the service-role key,
-- which bypasses RLS entirely - so no policy change is needed on
-- `characters` itself for this to work. This file is just a sanity check
-- and the one real prerequisite: a `tables` row has to exist before
-- start-table can update it.

-- Quick manual test row - delete this after you've confirmed the function
-- works, don't leave throwaway rows in a table you're about to depend on.
insert into tables (room_code, host_cid, np, box, started)
values ('TEST', 'debug-cid', 2, '{"u": ["MAR", "DC"]}', false)
returning id;

-- Copy the returned id and use it as table_id when you call the function
-- (see the curl command in the deploy steps).
