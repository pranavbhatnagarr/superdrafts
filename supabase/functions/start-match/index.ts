// supabase/functions/start-match/index.ts
//
// Replaces the client-side `seed: (Math.random() * 2 ** 31) | 0` in
// game.js's role-lock/match-start flow. That line ran in the host's own
// browser - and since both rosters are already fully public by the time
// a match starts (everyone's picks were visible during the auction),
// a modified host client could try many seeds locally against its own
// copy of the fight engine and only ever broadcast the one that favours
// it. Moving the ENGINE server-side wouldn't fix that (it's a pure
// function either way - grinding works identically against a local copy
// regardless of where the "official" copy lives). What actually closes
// the gap: this generates the seed with real, unpredictable randomness,
// and commits it before the host's client ever sees it. There's nothing
// left to grind against once the seed a match will actually use isn't a
// number the host chose.
//
// Input: { table_id, mode: "random" | "prep" }
// Effect: writes a fresh matches row (seed + starting state) IF one
// doesn't already exist for this table_id+mode - calling this twice for
// the SAME mode is a no-op, not a reroll. The game's own rules allow
// BOTH encounters to be played with the same rosters, so existence is
// checked per-mode now, not per-table: matches' primary key is
// (table_id, mode), not just table_id, specifically so a table can hold
// one row for "random" and a separate row for "prep" at the same time.

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
    const { table_id, mode } = await req.json();
    if (!table_id || !mode) return json({ error: "table_id and mode are required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existing, error: exErr } = await sb
      .from("matches").select("table_id").eq("table_id", table_id).eq("mode", mode).maybeSingle();
    if (exErr) return json({ error: exErr.message }, 400);
    if (existing) return json({ ok: true, already_started: true });

    // crypto.getRandomValues, not Math.random - real entropy, and not
    // reproducible/predictable by anything watching this function run.
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];

    const initialState = {
      mode,
      round: 1,
      used: {},        // owner -> [fighter names already sent]
      drawnOut: {},     // owner -> [fighter names barred from overtime resend]
      points: [],       // filled in by the first submit-pick call once teams are known
      overtime: false,
      locked: [],       // owners who've locked in a pick for the CURRENT round - names only, never what they picked
      beats: [],        // resolved round history, for the scoreboard
    };

    const { error: insErr } = await sb.from("matches").insert({
      table_id, mode, seed: String(seed), state: initialState,
    });
    if (insErr) return json({ error: insErr.message }, 400);

    return json({ ok: true, already_started: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
