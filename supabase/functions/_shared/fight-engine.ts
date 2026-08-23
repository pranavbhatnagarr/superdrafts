// supabase/functions/_shared/fight-engine.ts
//
// Ported directly from fight.js - rng(), effTier(), effValue(),
// rankFighters(), pointsForGroups(), and the decision half of
// createMatch()'s resolve()/available(). Logic is copied as-is, not
// reinvented, so results match the client's own copy exactly.
//
// Deliberately NOT ported: say(), line(), rivalLine(), exchange(),
// clashText(), titleFor(), and every other narration function (~800
// lines of fight.js). None of that decides anything - it's prose
// generated FROM an already-resolved round - so it has no reason to run
// anywhere but the browser, same as the countdown digit or the stamp
// animation. The client calls this function's twin locally (same inputs,
// same seed) to build the story text around whatever this returns.
//
// Why this needs to exist here at all, when createMatch() is otherwise a
// pure function both clients already run locally and agree on: the ONE
// thing that can't safely happen in either client's browser is combining
// two players' hidden picks for the same round. In a 1v1, the host is
// also a player - if picks were held in the host's own memory (as they
// are today, in game.js's takePick()), a modified host client could read
// the guest's pick and choose their own in response, before "submitting"
// anything. This runs the same resolve() logic, but only after both picks
// are already sitting in a database row that neither client could read
// mid-round.

const LADDER = ["S+", "S", "A", "B", "C", "D", "E"];
const POINTS: Record<string, number> = { "S+": 32, S: 16, A: 8, B: 4, C: 2, D: 1, E: 0.5 };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];

// A fitting role is worth a tier, an absurd one costs a tier. Ported
// as-is from roleShift() in game.js.
export function roleShift(ch: any, role: string, _mode: string): number {
  if (!role) return 0;
  const suits = !!(ch.fit && ch.fit.includes(role));
  let d = 0;
  if (suits) d += 1;
  if (ch.bad && ch.bad.includes(role)) d -= 1;
  return d;
}

export function effValue(ch: any, mode: string, role: string): number {
  let i = LADDER.indexOf(ch.tier);
  if (mode === "prep") i -= (ch.prep || 0);
  i -= roleShift(ch, role, mode);
  return i;
}

export function effTier(ch: any, mode: string, role: string): string {
  const i = effValue(ch, mode, role);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];
}

export function rankFighters(fighters: any[], strict: boolean) {
  const key = (f: any) => strict
    ? [LADDER.indexOf(f.eff), f.val, f.baseIdx]
    : [LADDER.indexOf(f.eff)];
  const same = (a: any, b: any) => key(a).every((v, i) => v === key(b)[i]);
  const cmp = (a: any, b: any) => {
    const x = key(a), y = key(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const withIdx = fighters.map((f) => ({ f, idx: LADDER.indexOf(f.eff) }));
  withIdx.sort((a, b) => cmp(a.f, b.f));
  const order = withIdx.map((x) => x.f);

  const groups: { idx: number; fighters: any[] }[] = [];
  for (const x of withIdx) {
    const last = groups[groups.length - 1];
    if (last && same(last.fighters[0], x.f)) last.fighters.push(x.f);
    else groups.push({ idx: x.idx, fighters: [x.f] });
  }
  const tied = new Set<any>();
  groups.forEach((g) => { if (g.fighters.length > 1) g.fighters.forEach((f) => tied.add(f)); });

  return { order, groups, tied, fullDraw: groups.length === 1 };
}

export function pointsForGroups(groups: { idx: number; fighters: any[] }[], seatCount: number) {
  const pts = new Map<any, number>();
  if (groups.length === 1) {
    groups[0].fighters.forEach((f) => pts.set(f, 0));
    return pts;
  }
  if (seatCount === 2) {
    pts.set(groups[0].fighters[0], 1);
    pts.set(groups[1].fighters[0], 0);
    return pts;
  }
  if (groups.length === 3) {
    pts.set(groups[0].fighters[0], 2);
    pts.set(groups[1].fighters[0], 1);
    pts.set(groups[2].fighters[0], 0);
    return pts;
  }
  const duo = groups.find((g) => g.fighters.length === 2)!;
  const solo = groups.find((g) => g.fighters.length === 1)!;
  duo.fighters.forEach((f) => pts.set(f, 1));
  pts.set(solo.fighters[0], solo.idx < duo.idx ? 2 : 0);
  return pts;
}

// Reconstructs the same `sides` state createMatch() builds, from the
// match's stored seed/teams/mode - so a stateless Edge Function call can
// pick up mid-match without needing the whole match object kept alive
// somewhere between rounds. `priorState` carries forward the parts of
// createMatch()'s closure that change round to round (used flags, drawn-
// out sets, points, overtime flag) - see matches.state in the schema.
export function buildSides(teams: any[], mode: string, priorState: any) {
  return teams.map((t, ix) => {
    const usedNames: string[] = priorState?.used?.[t.owner] || [];
    const drawnOutNames: string[] = priorState?.drawnOut?.[t.owner] || [];
    return {
      ix, owner: t.owner,
      fighters: t.fighters.map((f: any) => ({
        ...f, side: ix,
        eff: effTier(f, mode, f.role),
        val: effValue(f, mode, f.role),
        baseIdx: LADDER.indexOf(f.tier),
        used: usedNames.includes(f.name),
      })),
      drawnOut: new Set(drawnOutNames),
      rawScore: t.fighters.reduce((n: number, f: any) =>
        n + (POINTS[effTier(f, "random", f.role)] || 0), 0),
      purse: t.purse,
    };
  });
}

function eligible(side: any, isOT: boolean) {
  if (!isOT) return side.fighters.filter((f: any) => !f.used);
  const elig = side.fighters.filter((f: any) => !side.drawnOut.has(f.name));
  return elig.length ? elig : side.fighters;
}

// The decision-only twin of createMatch().resolve() - same logic, minus
// the `text: clashText(...)` line, since narration doesn't belong here.
export function resolveRound(
  sides: any[],
  picks: { owner: string; name: string }[],
  points: number[],
  overtime: boolean,
  seed: number,
) {
  const r = rng(seed);
  const wasOvertime = overtime;

  const chosen = picks.map((p) => {
    const side = sides.find((x) => x.owner === p.owner);
    if (!side) return null;
    const legal = eligible(side, wasOvertime);
    return legal.find((f: any) => f.name === p.name) || null;
  }).filter(Boolean);
  if (chosen.length !== sides.length) return null;
  if (!wasOvertime) chosen.forEach((f: any) => { f.used = true; });

  const { order: ranked, groups, tied, fullDraw } = rankFighters(chosen, wasOvertime);
  const soleLeader = groups[0].fighters.length === 1;
  const roundWinnerSide = soleLeader ? groups[0].fighters[0].side : null;

  tied.forEach((f: any) => sides[f.side].drawnOut.add(f.name));

  let pointsMap: Map<any, number> | null = null;
  if (!wasOvertime) {
    pointsMap = pointsForGroups(groups, sides.length);
    pointsMap.forEach((pts, f) => { points[f.side] += pts; });
  }

  let done = false, championOwner: string | null = null;
  let overtimeNow = overtime;

  if (wasOvertime) {
    if (soleLeader) {
      done = true; championOwner = sides[roundWinnerSide!].owner;
      points[roundWinnerSide!] += 1;
    } else if (sides.every((x) => x.fighters.every((f: any) => x.drawnOut.has(f.name)))) {
      done = true;
      const best = Math.max(...points);
      const live = sides.filter((_x, i) => points[i] === best);
      const top = Math.max(...live.map((x) => x.rawScore));
      const front = live.filter((x) => x.rawScore === top);
      const champ = front.length === 1 ? front[0] : pick(r, front);
      championOwner = champ.owner;
      points[champ.ix] += 1;
    }
  } else {
    const regularOver = sides.every((s) => s.fighters.every((f: any) => f.used));
    if (regularOver) {
      const best = Math.max(...points);
      const tiedSides = sides.filter((_s, i) => points[i] === best);
      if (tiedSides.length === 1) { done = true; championOwner = tiedSides[0].owner; }
      else overtimeNow = true;
    }
  }

  const groupPlace = new Map<any, number>();
  groups.forEach((g, gi) => g.fighters.forEach((f) => groupPlace.set(f, gi + 1)));

  return {
    ranked: ranked.map((f: any) => ({
      owner: sides[f.side].owner, name: f.name, place: groupPlace.get(f),
      eff: f.eff, draw: tied.has(f),
      points: pointsMap ? (pointsMap.get(f) || 0) : 0,
    })),
    isDraw: fullDraw,
    roundWasOvertime: wasOvertime,
    overtimeNow,
    standings: sides.map((s, i) => ({ owner: s.owner, points: points[i] })),
    done, champion: done ? championOwner : null,
    points, overtime: overtimeNow,
  };
}
