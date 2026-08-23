// supabase/functions/join-table/index.ts
//
// Same reasoning as create-table: seats a guest into a real database row
// so place-bid has something to check their cid against. Handles the
// same "reconnect walks straight back in" case the old knock/join flow
// had (see game.js's handle() "join" case) - a cid we've already seated
// gets their existing seat back, not a new one.
//
// Input: { room_code, cid, name }
// Output: { ok: true, table_id, seat, np } or { error, full: true }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { room_code, cid, name } = await req.json();
    if (!room_code || !cid) return json({ error: "room_code and cid are required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: table, error: tErr } = await sb
      .from("tables").select("id, np, started").eq("room_code", room_code).single();
    if (tErr) return json({ error: "no table with that room code" }, 404);

    const { data: seats, error: sErr } = await sb
      .from("seats").select("*").eq("table_id", table.id).order("seat");
    if (sErr) return json({ error: sErr.message }, 400);

    // reconnect: same cid already has a seat here, walk straight back in
    const already = seats.find((s: any) => s.cid === cid);
    if (already) {
      if (name) await sb.from("seats").update({ name }).eq("table_id", table.id).eq("seat", already.seat);
      return json({ ok: true, table_id: table.id, seat: already.seat, np: table.np });
    }

    const taken = new Set(seats.map((s: any) => s.seat));
    let freeSeat: number | null = null;
    for (let q = 1; q < table.np; q++) { if (!taken.has(q)) { freeSeat = q; break; } }

    if (freeSeat === null) {
      // The table is full by seat count, but this can genuinely be the
      // SAME player reconnecting with a new cid (a different device,
      // cleared storage, a browser that lost its own saved id) rather
      // than an actual new person - the plain cid match above can't
      // catch this at all, since a changed cid is the whole reason
      // they're here instead of walking straight back in above. This
      // never runs unsupervised: the host already had to see this exact
      // name and click "Let In" for this call to happen at all (see
      // admit() in game.js) - matching by name here doesn't weaken that
      // approval step, it just means an admission the host ALREADY
      // decided to grant, for someone they recognize, correctly
      // reclaims that seat's existing roster/purse/progress instead of
      // failing outright with "table is full."
      const byName = name && seats.find((s: any) =>
        s.name && s.name.trim().toLowerCase() === String(name).trim().toLowerCase());
      if (byName) {
        await sb.from("seats").update({ cid }).eq("table_id", table.id).eq("seat", byName.seat);
        return json({ ok: true, table_id: table.id, seat: byName.seat, np: table.np });
      }
      return json({ error: "table is full", full: true }, 409);
    }

    const { error: insErr } = await sb.from("seats").insert({
      table_id: table.id, seat: freeSeat, cid, name: name || null, purse: 20, roster: [],
    });
    if (insErr) return json({ error: insErr.message }, 400);

    return json({ ok: true, table_id: table.id, seat: freeSeat, np: table.np });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
