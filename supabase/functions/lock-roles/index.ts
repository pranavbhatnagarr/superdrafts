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

    // Only the seat's own owner may lock their own roles - the exact
    // same rule every other action in this game already enforces (bid,
    // pass, submit-pick). Nobody, host included, can lock roles on
    // someone else's behalf.
    const { data: mySeat, error: sErr } = await sb
      .from("seats").select("cid, locked").eq("table_id", table_id).eq("seat", seat).maybeSingle();
    if (sErr) return json({ error: sErr.message }, 400);
    if (!mySeat || mySeat.cid !== cid) return json({ error: "you may only lock your own roles" }, 403);
    if (mySeat.locked) return json({ error: "roles already locked" }, 409);

    // All the real validation - legal role keys, all 5 used exactly
    // once, roles lined up against the real roster by name - lives in
    // this one atomic database function, not here. See its own comment
    // for why: a row lock for the duration of the check-and-write means
    // no read-modify-write gap for a second call to land in, the same
    // class of race the seats-roster award bug taught us to close
    // properly rather than patch around.
    const { data: newRoster, error: lockErr } = await sb.rpc("lock_role", {
      p_table_id: table_id, p_seat: seat, p_roles: roles,
    });
    if (lockErr) return json({ error: lockErr.message }, 400);

    return json({ ok: true, roster: newRoster });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
