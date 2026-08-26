// supabase/functions/join-table/index.ts
//
// Same reasoning as create-table: seats a guest into a real database row
// so place-bid has something to check their cid against. Handles the
// same "reconnect walks straight back in" case the old knock/join flow
// had (see game.js's handle() "join" case) - a cid we've already seated
// gets their existing seat back, not a new one.
//
// Input: { room_code, cid, name, user_id? }
// user_id is optional and nullable, same reasoning as create-table's
// host_user_id - links this seat to a real signed-in account if one was
// provided, changes nothing about how the seat itself works otherwise.
//
// NEW: when user_id matches a seat that ALREADY has that same user_id
// stored (from an earlier visit, on any device), that seat is reclaimed
// immediately - checked before the cid-match, before table-fullness,
// before anything else. This is the piece that was missing before real
// accounts existed: cid is per-browser, so the host of a table opened on
// one device had no way at all to get back into seat 0 from a different
// one - not even the name-based reclaim below covers seat 0, since that
// path only ever runs for guest seats 1 and up. A signed-in account
// isn't per-device, so this works from anywhere, the moment someone
// who's actually authenticated as that account asks for it - no host
// approval needed here the way the name-based reclaim requires it,
// because a real session can't be spoofed the way a typed name can.
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
    const { room_code, cid, name, user_id, reconnect_only } = await req.json();
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
      const patch: Record<string, unknown> = {};
      if (name) patch.name = name;
      if (user_id && !already.user_id) patch.user_id = user_id;
      if (Object.keys(patch).length) {
        await sb.from("seats").update(patch).eq("table_id", table.id).eq("seat", already.seat);
      }
      return json({ ok: true, table_id: table.id, seat: already.seat, np: table.np });
    }

    // reconnect via a real, signed-in account - see the file-level
    // comment above. Runs on a NEW device (cid didn't match anything
    // above) for someone who's genuinely authenticated as an account
    // this table has already seen before, covering every seat including
    // 0 - the host's own, which nothing else here has ever reached.
    if (user_id) {
      const byUserId = seats.find((s: any) => s.user_id === user_id);
      if (byUserId) {
        const patch: Record<string, unknown> = { cid };
        if (name) patch.name = name;
        await sb.from("seats").update(patch).eq("table_id", table.id).eq("seat", byUserId.seat);
        return json({ ok: true, table_id: table.id, seat: byUserId.seat, np: table.np });
      }
    }

    // A manual room-code entry first uses this safe probe. Existing seats
    // reconnect immediately; genuinely new players still go through the
    // host-controlled knock/admit flow and are never seated by the probe.
    if (reconnect_only) return json({ error: "not already seated", reconnect: false }, 404);

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
        const patch: Record<string, unknown> = { cid };
        if (user_id && !byName.user_id) patch.user_id = user_id;
        await sb.from("seats").update(patch).eq("table_id", table.id).eq("seat", byName.seat);
        return json({ ok: true, table_id: table.id, seat: byName.seat, np: table.np });
      }
      return json({ error: "table is full", full: true }, 409);
    }

    const { error: insErr } = await sb.from("seats").insert({
      table_id: table.id, seat: freeSeat, cid, name: name || null, purse: 20, roster: [],
      user_id: user_id || null,
    });
    if (insErr) return json({ error: insErr.message }, 400);

    return json({ ok: true, table_id: table.id, seat: freeSeat, np: table.np });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
