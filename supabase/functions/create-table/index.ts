// supabase/functions/create-table/index.ts
//
// Prerequisite for Stage B. Nothing in game.js's lobby flow (knock/join,
// seatOf) ever wrote a real `tables`/`seats` row before now - seatOf was
// only ever in the host's own memory. place-bid needs a real seats row
// with a real `cid` to check "does this caller own this seat" against,
// so that row has to exist before any bid can be placed. This is what
// creates it, once, when a host opens a table.
//
// Input: { room_code, host_cid, host_name, np, box, host_user_id? }
// host_user_id is optional and nullable - a signed-in host links their
// seat to a real account (see the profiles migration); a guest host
// leaves this null and plays exactly as before, purely on cid. Nothing
// about the auction, bidding, or fight logic reads this column at all -
// it exists only so a seat can be traced back to a real, stable identity
// instead of only a device-generated one, for whatever a real profile
// eventually needs it for (reconnect-by-account, stats, preferences).
// Output: { ok: true, table_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { room_code, host_cid, host_name, np, box, host_user_id } = await req.json();
    if (!room_code || !host_cid || !np || !box) {
      return json({ error: "room_code, host_cid, np, and box are required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: table, error: tErr } = await sb
      .from("tables")
      .insert({ room_code, host_cid, np, box, started: false, current_lot: 0 })
      .select("id").single();
    if (tErr) return json({ error: tErr.message }, 400);

    // seat 0 is always the host, same convention game.js already uses
    const { error: sErr } = await sb.from("seats").insert({
      table_id: table.id, seat: 0, cid: host_cid, name: host_name || null, purse: 20, roster: [],
      user_id: host_user_id || null,
    });
    if (sErr) return json({ error: sErr.message }, 400);

    return json({ ok: true, table_id: table.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
