// supabase/functions/submit-pick/index.ts
//
// Replaces sendPick()/takePick() from game.js. Those held each round's
// picks in the HOST's own browser memory until both sides were in - which
// works fine for a guest (they can't see anything the host doesn't show
// them), but not for the host, who is also a player in a 1v1: nothing
// stopped a modified host client from reading the guest's pick the
// instant it arrived and choosing their own in response. Picks now sit
// in a table (`picks`) with no read policy for anyone but the
// service-role key used right here - so there's no point in the process
// where either client, host included, could see the other side's pick
// before both are committed.
//
// Input: { table_id, seat, cid, name, mode }
// mode is required now: a table can hold TWO active/finished matches at
// once (one per encounter type - see start-match), so every lookup here
// has to say which one it means, not just which table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSides, resolveRound } from "../_shared/fight-engine.ts";

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
    const { table_id, seat, cid, name, mode } = await req.json();
    if (!table_id || seat === undefined || !cid || !name || !mode) {
      return json({ error: "table_id, seat, cid, name, and mode are required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: table, error: tErr }, { data: seats, error: sErr }, { data: match, error: mErr }] =
      await Promise.all([
        sb.from("tables").select("np, finished").eq("id", table_id).single(),
        sb.from("seats").select("*").eq("table_id", table_id).order("seat"),
        sb.from("matches").select("*").eq("table_id", table_id).eq("mode", mode).single(),
      ]);
    if (tErr) return json({ error: tErr.message }, 400);
    if (sErr) return json({ error: sErr.message }, 400);
    if (mErr) return json({ error: "match not started" }, 409);

    const mySeat = seats.find((s: any) => s.seat === seat);
    if (!mySeat || mySeat.cid !== cid) return json({ error: "you may only act for your own seat" }, 403);
    const owner = mySeat.name;

    const state = match.state as any;
    const round = state.round;

    const { data: already } = await sb
      .from("picks").select("owner")
      .eq("table_id", table_id).eq("mode", mode).eq("round_num", round).eq("owner", owner).maybeSingle();
    if (already) return json({ ok: true, waiting: true, already_submitted: true });

    const teams = seats.map((s: any) => ({
      owner: s.name, purse: s.purse,
      fighters: (s.roster || []).map((r: any) => ({ ...r.char, role: r.role, price: r.price })),
    }));
    const sides = buildSides(teams, state.mode, state);
    const mySide = sides.find((s) => s.owner === owner);
    const legalNow = state.overtime
      ? mySide.fighters.filter((f: any) => !mySide.drawnOut.has(f.name))
      : mySide.fighters.filter((f: any) => !f.used);
    const legalPool = legalNow.length ? legalNow : mySide.fighters;
    if (!legalPool.some((f: any) => f.name === name)) {
      return json({ error: "that fighter isn't yours to send this round" }, 400);
    }

    await sb.from("picks").insert({ table_id, mode, round_num: round, owner, name });

    // Re-query the picks table itself, not the in-memory state.locked -
    // two concurrent submit-pick calls (one per seat, which is the
    // NORMAL case, not an edge case - both players act, then it
    // resolves) each read the SAME stale state.locked at the start of
    // their own request. Each computes "who's locked in" by appending
    // itself to that stale list, so one call's write silently overwrote
    // the other's - neither ever saw both names together, and the round
    // never resolved. picks has no such race: each insert is for a
    // different owner, nothing to collide with, so counting real rows
    // there is the reliable source of truth this needed all along.
    const { data: currentPicks, error: cpErr } = await sb
      .from("picks").select("owner, name")
      .eq("table_id", table_id).eq("mode", mode).eq("round_num", round);
    if (cpErr) return json({ error: cpErr.message }, 400);

    const allSeatOwners = seats.map((s: any) => s.name);
    if (currentPicks!.length < allSeatOwners.length) {
      const newLocked = currentPicks!.map((p: any) => p.owner);
      await sb.from("matches").update({ state: { ...state, locked: newLocked } })
        .eq("table_id", table_id).eq("mode", mode);
      return json({ ok: true, waiting: true, locked: newLocked });
    }

    // Everyone's in. resolveRound() is a pure, deterministic function of
    // (sides, picks, points, overtime, seed) - if both concurrent calls
    // reach this point, they compute the exact same result and write the
    // exact same newState. A redundant second write isn't corruption
    // (unlike the seats-roster race fixed earlier), just a harmless
    // duplicate of identical data.
    const allPicks = currentPicks!;

    const points = state.points.length ? state.points : sides.map(() => 0);
    const result = resolveRound(sides, allPicks, points, state.overtime, Number(match.seed));
    if (!result) return json({ error: "round could not be resolved" }, 409);

    const newUsed: Record<string, string[]> = { ...state.used };
    const newDrawnOut: Record<string, string[]> = { ...state.drawnOut };
    for (const s of sides) {
      newUsed[s.owner] = s.fighters.filter((f: any) => f.used).map((f: any) => f.name);
      newDrawnOut[s.owner] = [...s.drawnOut];
    }

    const newState = {
      ...state,
      round: round + 1,
      used: newUsed,
      drawnOut: newDrawnOut,
      points: result.points,
      overtime: result.overtime,
      locked: [],
      beats: [...state.beats, { ranked: result.ranked }],
      done: result.done,
      champion: result.champion,
    };
    await sb.from("matches").update({ state: newState }).eq("table_id", table_id).eq("mode", mode);

    return json({ ok: true, waiting: false, result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
