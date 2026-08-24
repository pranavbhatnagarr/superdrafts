// supabase/functions/lock-roles/index.ts
//
// Replaces lockRoles()'s old broadcast-only path (send({t:"roles",...})
// / pushState()) for real multiplayer. Roles have always affected fight
// outcomes (roleShift() applies a tier bonus or penalty per role) but
// were never validated or persisted anywhere - the host's own browser
// accepted any role assignment a guest broadcast with zero checking,
// and since seats.roster never stored role at all, submit-pick's own
// server-side fight resolution had no way to apply role shifts
// correctly regardless of what either client claimed.
//
// Called ONCE per seat, at the moment that seat actually locks in - not
// per individual drag. An in-progress, unlocked assignment has no game-
// affecting consequence at all, so there is nothing to validate until
// the player commits to a final one.
//
// Input: { table_id, seat, cid, roles: [{ name, role }, ...] }
//   roles must list all 5 of that seat's characters, in the SAME order
//   as their roster, each paired with the role key chosen for them -
//   the name is included specifically so the database function can
//   verify it lines up with the real roster instead of trusting
//   position alone.
// Output: { ok: true, roster } or { error }
//
// This used to also pre-fetch the seat's own cid/locked status here
// before ever calling the RPC - a second, redundant round trip, since
// lock_role's own row lock (see that migration) needs to read the exact
// same row anyway to validate the roster. cid now goes straight into
// the RPC call, which does the ownership/already-locked check itself as
// part of the same lock it was already taking - one round trip instead
// of two, with no change in what's actually validated or how safely.

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
    const { table_id, seat, cid, roles } = await req.json();
    if (!table_id || seat === undefined || !cid || !Array.isArray(roles)) {
      return json({ error: "table_id, seat, cid, and roles are required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Every check - this is your own seat, it isn't already locked, the
    // roles are legal, all 5 used exactly once, lined up against the
    // real roster by name - now lives in this one atomic database call.
    // The client only ever reads err.message on failure (see
    // sendPick()/lockRoles() in game.js), not the HTTP status code, so
    // collapsing every failure case into one status here changes nothing
    // about what the player actually sees - the specific reason is still
    // the exact message the database raised.
    const { data: newRoster, error: lockErr } = await sb.rpc("lock_role", {
      p_table_id: table_id, p_seat: seat, p_cid: cid, p_roles: roles,
    });
    if (lockErr) return json({ error: lockErr.message }, 400);

    return json({ ok: true, roster: newRoster });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
