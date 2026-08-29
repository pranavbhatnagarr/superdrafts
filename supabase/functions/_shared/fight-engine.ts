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

// Power level alone decides a clash. Equal power always stalemates. A power
// gap of 1-5 has a 50/40/30/20/10 percent stalemate chance respectively;
// otherwise the higher-power fighter wins.
const powerLevel = (f: any): number => Math.max(0, Number(f.power ?? f.Power_lvl ?? f.power_lvl ?? 0) || 0);
const roleAdjustedPower = (f: any, mode: string): number =>
  Math.max(0, powerLevel(f) + roleShift(f, f.role, mode) * 10
    + (mode === "prep" ? (Number(f.prep) || 0) * 10 : 0));
const relationshipBonus = (team: any[], relationships: any[]): number => {
  if (team.length !== 2) return 0;
  const [a, b] = team;
  const relation = (relationships || []).find((link: any) =>
    (link.a === a.name && link.b === b.name) || (link.a === b.name && link.b === a.name));
  const kind = String(relation?.kind || "").toLowerCase();
  if (/(friend|ally|allies|partner|family|teammate|mentor)/.test(kind)) return 5;
  if (/(rival|enemy|enemies|nemesis)/.test(kind)) return -5;
  return 0;
};
const deployedFighterPower = (fighter: any, team: any[], relationships: any[]): number =>
  Math.max(0, powerLevel(fighter) + relationshipBonus(team, relationships));
const deployedTeamPower = (fighters: any[], relationships: any[]): number => {
  const total = fighters.reduce((n: number, f: any) => n + deployedFighterPower(f, fighters, relationships), 0);
  return fighters.length === 2 ? total / 1.58 : total;
};
const stalemateChance = (gap: number): number => gap === 0 ? 1 : (gap >= 1 && gap <= 5 ? (6 - gap) / 10 : 0);

export function rankFighters(fighters: any[], _strict: boolean, random: () => number) {
  const sorted = fighters.slice().sort((a, b) => powerLevel(b) - powerLevel(a));
  const groups: { idx: number; fighters: any[] }[] = [];
  for (const fighter of sorted) {
    const last = groups[groups.length - 1];
    if (!last) {
      groups.push({ idx: -powerLevel(fighter), fighters: [fighter] });
      continue;
    }
    const gap = powerLevel(last.fighters[0]) - powerLevel(fighter);
    const chance = stalemateChance(gap);
    if (chance === 1 || (chance > 0 && random() < chance)) last.fighters.push(fighter);
    else groups.push({ idx: -powerLevel(fighter), fighters: [fighter] });
  }
  const tied = new Set<any>();
  groups.forEach((g) => { if (g.fighters.length > 1) g.fighters.forEach((f) => tied.add(f)); });
  return { order: groups.flatMap((g) => g.fighters), groups, tied, fullDraw: groups.length === 1 };
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
        ...f, side: ix, power: roleAdjustedPower(f, mode),
        eff: effTier(f, mode, f.role),
        val: effValue(f, mode, f.role),
        baseIdx: LADDER.indexOf(f.tier),
        used: usedNames.includes(f.name),
      })),
      drawnOut: new Set(drawnOutNames),
      rawScore: t.fighters.reduce((n: number, f: any) => n + roleAdjustedPower(f, mode), 0),
      purse: t.purse,
    };
  });
}

function eligible(side: any, isOT: boolean) {
  if (!isOT) return side.fighters.filter((f: any) => !f.used);
  return side.fighters.filter((f: any) => !side.drawnOut.has(f.name));
}

// The decision-only twin of createMatch().resolve() - same logic, minus
// the `text: clashText(...)` line, since narration doesn't belong here.
//
// `contenders` is new: null/undefined means every side is still in the
// running (always true in a 2-player game, and true for the whole
// regular five rounds of a 3-player game too). Once regular rounds end
// with a PARTIAL tie in a 3+ player game - two sides tied for first,
// one clearly behind - only the genuinely tied sides should go to
// overtime. Before this, overtimeNow was just a boolean with nothing
// tracking WHICH sides it actually applied to, so a clearly-eliminated
// third side kept being asked to pick and kept being ranked and scored
// in every sudden-death round after it, indefinitely - the exact bug
// this closes. Once set, contenders is the list of owners still
// fighting for the win; anyone else's earlier finish is locked in as
// final and they take no further part.
export function resolveRound(
  sides: any[],
  picks: { owner: string; names?: string[]; name?: string }[],
  points: number[],
  overtime: boolean,
  seed: number,
  contenders: string[] | null = null,
  roundNumber = 1,
  relationships: any[] = [],
) {
  const r = rng((seed ^ Math.imul(roundNumber, 0x9E3779B9)) >>> 0);
  if (roundNumber < 1 || (!overtime && roundNumber > 3)) return null;
  const roundsLeft = 4 - roundNumber;
  const chosenTeams: any[] = [];

  const activeSides = contenders
    ? sides.filter((side) => contenders.includes(side.owner))
    : sides;
  for (const side of activeSides) {
    const submitted = picks.find((p) => p.owner === side.owner);
    const names = submitted ? (submitted.names || (submitted.name ? [submitted.name] : [])) : [];
    const unique = [...new Set(names)];
    const legal = eligible(side, overtime);
    const min = overtime ? 1 : Math.max(1, legal.length - 2 * (roundsLeft - 1));
    const max = overtime ? 1 : Math.min(2, legal.length - (roundsLeft - 1));
    if (unique.length < min || unique.length > max) return null;
    const fighters = unique.map((name) => legal.find((f: any) => f.name === name)).filter(Boolean);
    if (fighters.length !== unique.length) return null;
    chosenTeams.push({ side, fighters, power: deployedTeamPower(fighters, relationships) });
  }

  if (!overtime) chosenTeams.forEach((team) => team.fighters.forEach((f: any) => { f.used = true; }));
  const ordered = chosenTeams.slice().sort((a, b) => b.power - a.power);
  const groups: any[] = [];
  for (const team of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.power === team.power) last.teams.push(team);
    else groups.push({ power: team.power, teams: [team] });
  }
  const soleLeader = groups[0].teams.length === 1;
  if (!overtime && soleLeader) points[groups[0].teams[0].side.ix] += 1;
  groups.filter((group) => group.teams.length > 1)
    .forEach((group) => group.teams.forEach((team: any) =>
      team.fighters.forEach((f: any) => team.side.drawnOut.add(f.name))));

  const place = new Map<number, number>();
  groups.forEach((group, index) => group.teams.forEach((team: any) => place.set(team.side.ix, index + 1)));
  const ranked = groups.flatMap((group) => group.teams.flatMap((team: any) =>
    team.fighters.map((f: any) => ({
      owner: team.side.owner, name: f.name, place: place.get(team.side.ix),
      eff: f.eff, power: deployedFighterPower(f, team.fighters, relationships), teamPower: team.power,
      draw: group.teams.length > 1,
      points: soleLeader && team === groups[0].teams[0] ? 1 : 0,
    }))
  ));

  let done = false;
  let championOwner: string | null = null;
  let nextContenders = contenders;
  let nextOvertime = overtime;
  if (overtime) {
    if (soleLeader) {
      championOwner = groups[0].teams[0].side.owner;
      points[groups[0].teams[0].side.ix] += 1;
      done = true;
    }
  } else if (roundNumber === 3) {
    const bestPoints = Math.max(...points);
    const finalists = sides.filter((_side, i) => points[i] === bestPoints);
    if (finalists.length === 1) {
      championOwner = finalists[0].owner;
      done = true;
    } else {
      nextOvertime = true;
      nextContenders = finalists.map((side) => side.owner);
    }
  }

  return {
    ranked,
    isDraw: !soleLeader,
    roundWasOvertime: overtime,
    overtimeNow: nextOvertime,
    standings: sides.map((side, i) => ({ owner: side.owner, points: points[i] })),
    done,
    champion: done ? championOwner : null,
    points,
    overtime: nextOvertime,
    contenders: nextContenders,
  };
}
