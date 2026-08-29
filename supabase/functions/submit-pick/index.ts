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

// Stable but server-only salt: concurrent retries resolve identically, while
// clients cannot predict a close-match stalemate before locking their pick.
const secretSeed = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { table_id, seat, cid, names, mode } = await req.json();
    if (!table_id || seat === undefined || !cid || !Array.isArray(names) || !mode) {
      return json({ error: "table_id, seat, cid, names, and mode are required" }, 400);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const [{ data: table, error: tErr }, { data: seats, error: sErr }, { data: match, error: mErr },
      { data: relationships, error: rErr }] =
      await Promise.all([
        sb.from("tables").select("np, finished").eq("id", table_id).single(),
        sb.from("seats").select("*").eq("table_id", table_id).order("seat"),
        sb.from("matches").select("*").eq("table_id", table_id).eq("mode", mode).single(),
        sb.from("rivalries").select("a,b,kind"),
      ]);
    if (tErr) return json({ error: tErr.message }, 400);
    if (sErr) return json({ error: sErr.message }, 400);
    if (mErr) return json({ error: "match not started" }, 409);
    if (rErr) return json({ error: rErr.message }, 400);

    const mySeat = seats.find((s: any) => s.seat === seat);
    if (!mySeat || mySeat.cid !== cid) return json({ error: "you may only act for your own seat" }, 403);
    const owner = mySeat.name;

    const state = match.state as any;
    // A stale or duplicate call after the match already concluded has
    // nothing left to do - most importantly, it must never reach the
    // stats-recording block below a second time for the same finished
    // match. The client never calls this once ST.end is set, but the
    // server is still the one that decides, not the client's own gating.
    if (state.done) return json({ ok: true, waiting: false, already_done: true });
    const round = state.round;
    const contenders: string[] | null = state.contenders || null;

    // In a 3+ player match, once regular rounds end in a PARTIAL tie
    // (two sides tied for first, one clearly behind), only the tied
    // sides go to overtime - see fight-engine.ts's own comment on
    // resolveRound() for the full reasoning. A pick from someone whose
    // side already finished (not a contender anymore) is rejected
    // outright here, the same way a pick for a fighter that isn't
    // legally theirs already was - not that this should ever actually
    // happen from the real client, since it stops offering a picker to
    // an eliminated seat at all, but the server is still the one that
    // decides, not the client's own UI state.
    if (contenders && !contenders.includes(owner)) {
      return json({ error: "your side is no longer contending in this match" }, 403);
    }

    const { data: already } = await sb
      .from("picks").select("owner")
      .eq("table_id", table_id).eq("mode", mode).eq("round_num", round).eq("owner", owner).maybeSingle();
    if (already) return json({ ok: true, waiting: true, already_submitted: true });

    const teams = seats.map((s: any) => ({
      owner: s.name, purse: s.purse,
      fighters: (s.roster || []).map((r: any) => ({ ...r.char, role: r.role, price: r.price })),
    }));    if (teams.some((team: any) => team.fighters.some((fighter: any) => !Number(fighter.power)))) {
      return json({ error: "This table predates power levels. Restart the table to play with the new rules." }, 409);
    }

    const sides = buildSides(teams, state.mode, state);
    const mySide = sides.find((s) => s.owner === owner);
    const legalNow = state.overtime
      ? mySide.fighters.filter((f: any) => !mySide.drawnOut.has(f.name))
      : mySide.fighters.filter((f: any) => !f.used);
    const legalPool = legalNow;
    const uniqueNames = [...new Set(names.map((name: unknown) => String(name)))];
    const roundsLeft = 4 - Number(round);
    const minPick = state.overtime ? 1 : Math.max(1, legalPool.length - 2 * (roundsLeft - 1));
    const maxPick = state.overtime ? 1 : Math.min(2, legalPool.length - (roundsLeft - 1));
    if (uniqueNames.length < minPick || uniqueNames.length > maxPick) {
      return json({ error: `send between ${minPick} and ${maxPick} characters this round` }, 400);
    }
    if (uniqueNames.some((name) => !legalPool.some((f: any) => f.name === name))) {
      return json({ error: state.overtime
        ? "overtime fighters must be yours, unique, and must not have drawn earlier"
        : "every fighter must be yours, unused, and unique" }, 400);
    }

    await sb.from("picks").insert({ table_id, mode, round_num: round, owner, name: JSON.stringify(uniqueNames) });

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

    // How many picks a round needs to resolve is normally every seat -
    // but once contenders narrows the field, only THOSE seats' picks
    // matter. Waiting on all original seats here would mean an
    // eliminated player's round simply never resolves at all, since
    // nothing ever asks them to submit anything again once they're out.
    const requiredOwners = contenders || seats.map((s: any) => s.name);
    if (currentPicks!.length < requiredOwners.length) {
      const newLocked = currentPicks!.map((p: any) => p.owner);
      await sb.from("matches").update({ state: { ...state, locked: newLocked } })
        .eq("table_id", table_id).eq("mode", mode);
      return json({ ok: true, waiting: true, locked: newLocked });
    }

    // Everyone's in. resolveRound() is a pure, deterministic function of
    // (sides, picks, points, overtime, seed, contenders) - if both
    // concurrent calls reach this point, they compute the exact same
    // result and write the exact same newState. A redundant second
    // write isn't corruption, just a harmless duplicate of identical
    // data.
    const allPicks = currentPicks!.map((pick: any) => {
      try { return { owner: pick.owner, names: JSON.parse(pick.name) }; }
      catch { return { owner: pick.owner, names: [pick.name] }; }
    });

    const points = state.points.length ? state.points : sides.map(() => 0);
    const privateSeed = (Number(match.seed) ^ secretSeed(serviceKey)) >>> 0;
    const result = resolveRound(sides, allPicks, points, state.overtime, privateSeed, contenders, Number(state.round || 1), relationships || []);
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
      contenders: result.contenders,
    };
    await sb.from("matches").update({ state: newState }).eq("table_id", table_id).eq("mode", mode);

    // Character-level stats run unconditionally, canon or not - a
    // character's own record reflects every real fight it was actually
    // sent into, regardless of whether that particular match counts
    // toward any PLAYER's win/loss record. Genuinely per ROUND, not per
    // match, since a round can end in a real draw (two fighters tied
    // within the same rank group) even though the MATCH as a whole
    // never can (sudden death always eventually produces exactly one
    // champion). result.ranked already carries everything needed per
    // fighter that took part this round: place===1 with no tie is a
    // win, a tie is a draw, anything else is a loss. Wrapped so a stats
    // hiccup can never block the round's real result from reaching the
    // players.
    try {
      await Promise.all(
        result.ranked.map((f: any) =>
          sb.rpc("record_character_round", { p_name: f.name, p_won: f.place === 1 && !f.draw, p_drew: f.draw })
        )
      );
    } catch (statsErr) {
      console.error("record_character_round failed:", statsErr);
    }

    // Player-level match stats are the ONLY thing gated on is_canon -
    // whichever mode was started FIRST for this table's rosters is the
    // real result (is_canon, set once at start-match and never changed
    // after); a second mode played afterward with the same rosters is a
    // rematch for exploring "what if", and shouldn't pad or dent anyone's
    // actual competitive record even though the fight itself was
    // completely real and its characters' own stats count normally.
    //
    // Stats only ever get recorded here, at the exact round that flips
    // done from false to true - the guard at the top of this function
    // (state.done -> early return) is what guarantees this block can
    // never run twice for the same finished match. Every ORIGINAL seat
    // gets games_played counted, including one eliminated early by a
    // partial tie (see fight-engine.ts's contenders) - they genuinely
    // played the match, they just didn't win it. Only a seat with a
    // real user_id has anything to record against; a guest seat is
    // simply skipped, not an error. Wrapped so a stats hiccup can never
    // block the actual fight result from reaching the players - whoever
    // won still finds out even if this part fails for some reason.
    if (match.is_canon && result.done && result.champion) {
      try {
        await Promise.all(
          seats
            .filter((s: any) => s.user_id)
            .map((s: any) =>
              sb.rpc("record_match_stats", { p_user_id: s.user_id, p_won: s.name === result.champion })
            )
        );
      } catch (statsErr) {
        console.error("record_match_stats failed:", statsErr);
      }
    }

    return json({ ok: true, waiting: false, result });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
