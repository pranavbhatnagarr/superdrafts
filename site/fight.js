/* ------------------------------------------------------------------ *
 *  fight.js, the template fight.
 *
 *  Simulates the whole fight in the browser and narrates it from stored
 *  lines, so it costs nothing, never rate limits and cannot contradict
 *  itself. The LLM path in scenario.mjs stays exactly as it is; this runs
 *  instead of it whenever the writer is unavailable or unaffordable.
 *
 *  Two rules this file exists to guarantee, both of which the LLM broke
 *  repeatedly and could only be caught after the fact:
 *    - nobody is eliminated twice, and nobody returns
 *    - the losing side is wiped out and the winner keeps at least one
 *  Here they hold by construction. There is no beat the simulation cannot
 *  account for, because the prose is generated FROM the simulation rather
 *  than checked against it.
 *
 *  Both browsers must see the same fight, so everything random comes from
 *  one seed the host makes and syncs. Same seed in, same fight out.
 * ------------------------------------------------------------------ */

// S+ sits one rung above S and no character is ever printed at it: it only
// exists as a destination, reached when a base-S character's prep bonus,
// role fit, or both push them past the top of their own printed tier.
// effTier's own clamp below is what actually enforces "no higher than the
// top of the ladder" - extending LADDER with S+ at index 0 is the whole
// change; nothing else here needs to know it's special.
const LADDER = ["S+","S","A","B","C","D","E"];
const POINTS = { "S+":32, S:16, A:8, B:4, C:2, D:1, E:0.5 };

/* Small deterministic PRNG. Math.random cannot be used anywhere in here:
   the two players would get different stories for the same fight. */
function rng(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
// Draw without repeats inside one fight, so a five character team does not
// use the same taunt twice in the same paragraph.
function drawer(r){
  const used = new Set();
  return arr => {
    const free = arr.filter(x => !used.has(x));
    const out = pick(r, free.length ? free : arr);
    used.add(out);
    return out;
  };
}

/* ---------------------------- the simulation ---------------------------- */

// Same maths the auction screen already shows, so a clash and the tier score
// on the ledger can never disagree.
function effTier(ch, mode, role, roleShift){
  let i = LADDER.indexOf(ch.tier);
  if (mode === "prep") i -= (ch.prep || 0);
  i -= roleShift(ch, role, mode);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];
}

// The rule now: whichever fighter has the strictly better tier always wins,
// no roll, ever. Exactly the same tier is a draw between whoever shares it.
// Role fit and prep already had their say before this point, inside
// effTier - they move a fighter a full rung on the ladder, they do not
// additionally thumb the scale once two fighters actually meet at the same
// rung. That is what makes a same-tier clash a real coin a plan cannot buy
// its way out of, rather than a coin flip dressed up as a tactical edge.
//
// Groups fighters by tier, best first. Two shapes are possible with two
// seats; three-seat rounds add a third:
//   - every tier distinct: a normal ranking, nobody tied with anyone.
//   - every fighter shares one tier: nobody has any edge over anybody, a
//     full draw - the round awards no points at all and every fighter in
//     it is barred from resend in overtime.
//   - (three seats only) exactly two share a tier and the third stands
//     alone: those two drew with EACH OTHER specifically, barred from
//     overtime resend the same as a full draw, while the lone fighter is
//     never touched by it - see pointsForGroups just below for what each
//     of them actually scores.
function rankFighters(fighters){
  const withIdx = fighters.map(f => ({ f, idx: LADDER.indexOf(f.eff) }));
  // Stable sort: ties keep the order they were sent in, which only ever
  // surfaces as which name prints first within a tied group, never as an
  // actual ranking between them - there isn't one.
  withIdx.sort((a, b) => a.idx - b.idx);
  const order = withIdx.map(x => x.f);

  const groups = [];
  for (const x of withIdx){
    const last = groups[groups.length - 1];
    if (last && last.idx === x.idx) last.fighters.push(x.f);
    else groups.push({ idx: x.idx, fighters: [x.f] });
  }
  const tied = new Set();
  groups.forEach(g => { if (g.fighters.length > 1) g.fighters.forEach(f => tied.add(f)); });

  return { order, groups, tied, fullDraw: groups.length === 1 };
}

// Points for a resolved clash, given rankFighters' own groups (already
// sorted best to worst). Two seats only ever produce the first two shapes
// below; a three-seat round can also produce the third, the one shape with
// real points on the table even though part of the round was a stalemate -
// there is nobody left over in a two-seat round to be the lone fighter it
// needs.
function pointsForGroups(groups, seatCount){
  const pts = new Map();
  if (groups.length === 1){
    // everybody tied: nobody scores, win or lose does not apply to anyone
    groups[0].fighters.forEach(f => pts.set(f, 0));
    return pts;
  }
  if (seatCount === 2){
    pts.set(groups[0].fighters[0], 1);
    pts.set(groups[1].fighters[0], 0);
    return pts;
  }
  if (groups.length === 3){
    // three distinct tiers: the original spread, unchanged
    pts.set(groups[0].fighters[0], 2);
    pts.set(groups[1].fighters[0], 1);
    pts.set(groups[2].fighters[0], 0);
    return pts;
  }
  // three seats, exactly two tier groups: one holds both tied fighters, the
  // other holds the lone one. The tied pair banks 1 point each regardless
  // of which side of the split they land on; the lone fighter scores
  // against their SHARED tier, not against either of them individually -
  // 2 if its own tier beats that shared one, 0 if it does not.
  const duo = groups.find(g => g.fighters.length === 2);
  const solo = groups.find(g => g.fighters.length === 1);
  duo.fighters.forEach(f => pts.set(f, 1));
  pts.set(solo.fighters[0], solo.idx < duo.idx ? 2 : 0);
  return pts;
}

/**
 * Five blind rounds. Each side sends one character per round, nobody sees the
 * other pick until it is resolved, and every character fights exactly once.
 *
 *   const m = createMatch({ teams, mode, seed, roleShift, rivalries });
 *   m.available();                    -> who each side has left to send
 *   m.resolve([{owner, name}, ...]);  -> { text, ranked, standings, done }
 *
 * The engine never chooses for anybody and never reveals anything early: the
 * page holds each side's pick until both are in, then calls resolve once.
 */
export function createMatch({ teams, mode, seed, roleShift, rivalries }){
  const r = rng(seed);
  const d = drawer(rng(seed ^ 0x9E3779B9));
  const sides = teams.map((t, ix) => ({
    ix, owner: t.owner,
    fighters: t.fighters.map(f => ({
      ...f, side: ix, eff: effTier(f, mode, f.role, roleShift), used: false
    })),
    // Names permanently barred from being resent once they have been part
    // of a draw, in a regular round or in overtime. Regular-round eligibility
    // still runs on each fighter's own .used flag above; this is the
    // separate list overtime eligibility runs on instead (see available()
    // and resolve() below) - the two never overlap in what they gate.
    drawnOut: new Set()
  }));
  const points = sides.map(() => 0);
  const history = [];
  // Flips once, permanently, the moment every roster slot has been sent and
  // the standings are still tied. From that point every future round is
  // sudden death: any card but the ones already drawn out may be resent,
  // and the first round that is not itself a draw ends the whole match.
  let overtime = false;
  // How many sudden-death rounds have been played. Tracked so a matchup
  // that is genuinely dead even - every remaining card on both sides sits
  // at the same effective tier - cannot draw forever. Once every card has
  // had a full lap through overtime twice over with no sole leader ever
  // emerging, resolve() below forces a result instead of letting the
  // fallback in eligible() hand out the exact same pairing again and again.
  let overtimeRounds = 0;
  const OVERTIME_CAP = Math.max(...sides.map(s => s.fighters.length)) * 2;

  const all = () => sides.flatMap(s => s.fighters);
  const owners = all().filter(f => HOME[f.name]);
  const homeChar = owners.length ? pick(r, owners) : null;
  const ground = homeChar ? HOME[homeChar.name] : pick(r, NEUTRAL);

  // The one pool-of-legal-fighters rule, used by both available() (what the
  // page is allowed to OFFER) and resolve() (what it is allowed to ACCEPT).
  // They have to agree exactly, or a card the UI shows as pickable can turn
  // around and get silently rejected the moment it is actually sent - which
  // is exactly what having two separately-written versions of "who's
  // eligible" risks the instant one of them changes and the other does not.
  function eligible(side, isOT){
    if (!isOT) return side.fighters.filter(f => !f.used);
    const elig = side.fighters.filter(f => !side.drawnOut.has(f.name));
    return elig.length ? elig : side.fighters;   // nothing left un-drawn: don't deadlock
  }

  return {
    ground, homeChar,
    title: () => titleFor(r, ground),
    roundNo: () => history.length + 1,
    totalRounds: () => sides[0].fighters.length,
    // Whether the round about to be picked is a sudden-death round. The
    // page needs this to label rounds past the roster size as overtime
    // rather than "Round 6 of 5", and to know which picking rules apply
    // before it has resolve()'s own per-round confirmation of the same
    // thing (see resolve()'s overtimeNow field).
    inOvertime: () => overtime,
    // What each side still has in hand. Two entirely different pools
    // depending on phase: a regular round only ever offers characters that
    // have never been sent; overtime offers every character EXCEPT ones
    // already drawn out, including characters a regular round already
    // used, since sudden death is played from the same five cards, not a
    // fresh five.
    available: () => sides.map(s => ({ owner: s.owner, names: eligible(s, overtime).map(f => f.name) })),
    standings: () => sides.map((s, i) => ({ owner: s.owner, points: points[i] })),

    resolve(picks){
      // Captured before anything below can flip it: this round's own rules
      // (which pool it drew from, whether it can still bank points) are
      // whatever the match's phase WAS when the pick was made, never
      // whatever the phase becomes as a result of resolving it.
      const wasOvertime = overtime;

      const chosen = picks.map(p => {
        const side = sides.find(x => x.owner === p.owner);
        if (!side) return null;
        const legal = eligible(side, wasOvertime);
        return legal.find(f => f.name === p.name) || null;
      }).filter(Boolean);
      if (chosen.length !== sides.length) return null;   // a pick was missing or ineligible
      if (!wasOvertime) chosen.forEach(f => { f.used = true; });

      const { order: ranked, groups, tied, fullDraw } = rankFighters(chosen);
      // The round's top group: one fighter in it means a clean, undisputed
      // best - a real winner, whether or not anyone else in the round also
      // happens to tie for a lower spot with somebody. More than one
      // fighter in it means the top spot itself is shared, which is still
      // unresolved no matter what else happened underneath it.
      const soleLeader = groups[0].fighters.length === 1;
      const roundWinnerSide = soleLeader ? groups[0].fighters[0].side : null;

      // Every fighter that shared a tier with at least one other fighter
      // this round is barred from ever being resent, whether or not the
      // round as a whole produced any points - drawing with one specific
      // opponent costs the same either way, and this is the one list every
      // later overtime round's eligible() checks against.
      tied.forEach(f => sides[f.side].drawnOut.add(f.name));

      let pointsMap = null;
      if (!wasOvertime){
        // Regular rounds only: overtime never banks real points, a decisive
        // result there ends the match outright instead (see below).
        pointsMap = pointsForGroups(groups, sides.length);
        pointsMap.forEach((pts, f) => { points[f.side] += pts; });
      }

      history.push({ names: chosen.map(f => f.name) });

      let done = false, championOwner = null;

      if (wasOvertime){
        overtimeRounds++;
        // Sudden death: a shared top spot - a full draw or, in a three-seat
        // round, two tied for best with a worse third - changes nothing
        // but the drawn-out list above and keeps going, since the actual
        // question sudden death exists to answer, who is better, still has
        // no answer either way. A sole leader ends the match this instant,
        // no matter what a third fighter's own tier happened to do - a
        // symbolic point is banked purely so the final scoreboard's bars do
        // not show two sides still level after one of them has actually
        // won.
        if (soleLeader){
          done = true; championOwner = sides[roundWinnerSide].owner;
          points[roundWinnerSide] += 1;
        } else if (overtimeRounds >= OVERTIME_CAP){
          // A true deadlock: every card that could still be sent keeps
          // landing on the same effective tier as its opposite number, so
          // eligible()'s own drawnOut-exhausted fallback just hands out the
          // identical pairing again once every card has had its lap - this
          // round would otherwise draw forever with no winner ever
          // declared. Break it with one coin flip off the match's own
          // synced seed, so both browsers land on the same name without
          // needing another round trip.
          done = true;
          const champ = pick(r, sides);
          championOwner = champ.owner;
          points[champ.ix] += 1;
        }
      } else {
        const regularOver = sides.every(s => s.fighters.every(f => f.used));
        if (regularOver){
          const best = Math.max(...points);
          const tiedSides = sides.filter((s, i) => points[i] === best);
          if (tiedSides.length === 1){ done = true; championOwner = tiedSides[0].owner; }
          else overtime = true;   // every round from here on is sudden death
        }
      }

      // place mirrors which GROUP a fighter landed in, not raw array
      // position: two fighters tied with each other always share one place
      // number instead of one printing as "2nd" and the other "3rd" for a
      // tie that was never actually broken between them.
      const groupPlace = new Map();
      groups.forEach((g, gi) => g.fighters.forEach(f => groupPlace.set(f, gi + 1)));

      return {
        // clashText no longer receives an upset flag: there is no such
        // thing as an upset once tier order is deterministic, so it always
        // gets false and its one "nobody saw that coming" line simply
        // never fires. The field survives only because nothing downstream
        // currently reads it; nothing here depends on its content.
        text: clashText(r, d, chosen, ranked, rivalries, history.length, false, ground),
        ranked: ranked.map(f => ({
          owner: sides[f.side].owner, name: f.name, place: groupPlace.get(f),
          eff: f.eff, draw: tied.has(f),
          points: pointsMap ? (pointsMap.get(f) || 0) : 0
        })),
        isDraw: fullDraw,
        roundWasOvertime: wasOvertime,
        overtimeNow: overtime,
        standings: sides.map((s, i) => ({ owner: s.owner, points: points[i] })),
        done,
        champion: done ? championOwner : null
      };
    }
  };
}

/* Generic pools, used when a character has nothing of their own stored.
   Anything in the characters table under `lines` wins over these, so the
   writing improves as that table is filled in without touching this file.

   Deliberately character neutral: every line is spoken by anybody from any of
   the eight worlds against anybody else, so nothing can name a power, a city
   or a relationship. That constraint keeps them safe and also keeps them
   plain. They are the floor, not the ceiling. Kept large because the repeat
   rate is what gives a template away. */
const POOL = {
  taunt: [
    "You are standing in the wrong place.",
    "I have read your file. It is short.",
    "Last chance to sit this one out.",
    "Do you want to do this the fast way or the slow way?",
    "I was told you were dangerous.",
    "Somebody paid good money for you. I cannot see why.",
    "Move and I will make it quick.",
    "You look like someone who has never lost properly.",
    "Whatever they promised you, it was not enough.",
    "Walk away and I will pretend I never saw you.",
    "You are the one they were saving for last?",
    "I have been up since yesterday. Do not make this long.",
    "Say something clever. I will wait.",
    "Every one of you thinks they are the exception.",
    "You should have brought more people.",
    "There is still time to be somewhere else.",
    "I am going to remember your face. Briefly.",
    "You are in my way, and I am in a hurry.",
    "Do not make me explain this twice.",
    "I would tell you to run, but I have seen you move."
  ],
  reply: [
    "Talk later. Hit now.",
    "You first.",
    "That is a lot of words for someone about to be on the floor.",
    "I have heard worse from better.",
    "Try it.",
    "You are going to regret opening with that.",
    "Big talk from someone standing that close.",
    "I have been threatened by professionals. You are not one.",
    "Keep going. I am enjoying this.",
    "Is that the whole speech, or is there more?",
    "You are stalling. I can hear it.",
    "Fine. Let us both find out.",
    "I do not need you to like me. I need you to move.",
    "Nobody is coming to help you either.",
    "That is the second mistake you have made today.",
    "Careful. That is how people get hurt.",
    "You have my attention. You will regret having it.",
    "I was hoping you would say something like that.",
    "Then stop talking about it.",
    "Save your breath. You are going to want it."
  ],
  teammate: [
    "Watch your left, I cannot cover both.",
    "That was not the plan we agreed on.",
    "Stay behind me and stop arguing.",
    "If you have a better idea, now is the time.",
    "I do not like this. Keep moving anyway.",
    "Do not do anything clever. Please.",
    "I will hold here. You go.",
    "Get up. I am not carrying you out of here.",
    "Whatever you are about to do, do it now.",
    "I told you this would happen.",
    "Do not wait for me. I mean it.",
    "We have done worse than this before."
  ],
  overDown: [
    "Stay down. I mean it.",
    "That is one.",
    "You should have stayed home.",
    "Nothing personal.",
    "Somebody get them out of here.",
    "That was quicker than I expected.",
    "You fought well. It did not help.",
    "I did warn you.",
    "Do not get up. There is no point.",
    "You had a choice. That was it.",
    "Sleep it off.",
    "Tell them it was not close.",
    "That is what happens.",
    "No hard feelings. Not many, anyway."
  ],
  falling: [
    "That is not fair.",
    "I can still, no. No, I cannot.",
    "Tell them it took everything.",
    "I am not finished, I am just, hold on.",
    "Go. Do not wait for me.",
    "Well. That is embarrassing.",
    "I had one more in me. I was sure of it.",
    "Do not let them see me like this.",
    "Somebody else will finish this.",
    "I was winning. I was almost winning.",
    "Fine. Fine. You got me.",
    "I am still here. I am just not getting up.",
    "It was worth it. Mostly.",
    "Do not tell anyone I said anything at the end."
  ],
  lastStand: [
    "You will have to come through me.",
    "I know how this ends. Come and finish it.",
    "There is nobody behind me now. Good.",
    "I am still standing. Do something about it.",
    "One more. I have one more in me.",
    "Take your time. I am not going anywhere.",
    "Come on then. All of you.",
    "This is the part I am good at."
  ],
  lastStandReply: [
    "You do not have to do this.",
    "Then it is your turn.",
    "I will make it quick.",
    "Brave. Pointless, but brave.",
    "You have made your point.",
    "Then let us get it over with."
  ],
  upset: [
    "Nobody saw that coming, least of all",
    "Somewhere a bookmaker just tore up a slip over",
    "The tier sheet said otherwise about",
    "Everything anyone knew stopped being true about",
    "That was not supposed to be possible for",
    "The whole room got it wrong about"
  ]
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const q = s => "\u201C" + s + "\u201D";      // curly quotes, same as the LLM path
// Speech with its tag. The comma belongs inside the quotes unless the line
// already ends in its own punctuation.
function say(text, who, verb){
  // A question mark or exclamation stays and takes the place of the comma;
  // only a full stop is swapped out. "the slow way?," is nobody's punctuation.
  const t = text.replace(/\s+$/, "");
  const end = /[?!]$/.test(t) ? t : t.replace(/[.,]$/, "") + ",";
  return "\u201C" + end + "\u201D " + who + " " + (verb || "said") + ".";
}

// A character's own stored line if there is one, else the generic pool.
function line(d, f, kind){
  const own = f.lines && Array.isArray(f.lines[kind]) && f.lines[kind].length
    ? f.lines[kind] : null;
  return own ? d(own) : d(POOL[kind]);
}

// Anything hand written for this exact pairing wins over everything else.
// This is where the template path can beat a language model outright: a
// stored Batman and Joker exchange is never wrong about who they are.
function rivalLine(rivalries, a, b, idx){
  if (!rivalries) return null;
  const hit = rivalries.find(v =>
    (v.a === a.name && v.b === b.name) || (v.a === b.name && v.b === a.name));
  if (!hit || !hit.lines || !hit.lines.length) return null;
  // A second exchange needs a second stored pair. Reusing the first one
  // swapped round produced the same two lines twice in a row, which was
  // worse than falling back to the generic pool.
  const l = hit.lines[idx || 0];
  if (!l) return null;
  const flip = hit.a !== a.name;
  return { first: flip ? l.b : l.a, second: flip ? l.a : l.b };
}

// Turf that belongs to a specific character. Only these let the opening claim
// somebody knows the ground, because "Doctor Doom knew Queens better than
// anyone" is worse than saying nothing at all.
const HOME = {
  "Batman":"the Gotham docks in the rain", "Batgirl":"the Gotham docks in the rain",
  "Nightwing":"a rooftop over Bl\u00fcdhaven", "Red Hood":"the Gotham rail arches",
  "The Joker":"the flooded Ace Chemical floor", "Two-Face":"the old Gotham courthouse steps",
  "The Penguin":"the ice house behind the Iceberg Lounge",
  "Ra's al Ghul":"a frozen pass above the Lazarus pits",
  "Superman":"a rooftop above Metropolis", "Lex Luthor":"the LexCorp plaza at night",
  "Wonder Woman":"the black sand of a Themysciran shore",
  "Aquaman":"a shelf of rock under the Atlantic",
  "Spider-Man":"a shut down rail yard in Queens",
  "Green Goblin":"a shut down rail yard in Queens",
  "Daredevil":"the wet stone of Hell's Kitchen", "Elektra":"the wet stone of Hell's Kitchen",
  "Kingpin":"the wet stone of Hell's Kitchen", "The Punisher":"the wet stone of Hell's Kitchen",
  "Human Torch":"the rain on the Baxter Building roof",
  "Doctor Doom":"the stone terrace of Castle Doom",
  "Black Panther":"the step wells under Birnin Zana",
  "Namor":"a tidal shelf off the Atlantic ridge",
  "Doctor Strange":"the stairwell of the Sanctum Sanctorum",
  "Magneto":"the rusted spine of Genosha",
  "Naruto Uzumaki":"the Konoha training grounds", "Sasuke Uchiha":"the Konoha training grounds",
  "Kakashi Hatake":"the Konoha training grounds",
  "Ichigo Kurosaki":"a Karakura Town backstreet",
  "Gojo Satoru":"the yard at Tokyo Jujutsu High",
  "Tanjiro Kamado":"the pine slope under Mount Natagumo",
  "Sung Jinwoo":"the mouth of a Seoul dungeon gate",
  "Harry Potter":"the frost on the Hogwarts courtyard",
  "Albus Dumbledore":"the frost on the Hogwarts courtyard"
};
// Neutral ground when nobody drafted owns anywhere.
const NEUTRAL = [
  "a container yard with the lights still on",
  "a rain slick multi storey car park",
  "the empty concourse of a shut station",
  "a dry canal under a motorway bridge"
];

function titleFor(r, ground){
  // Keep the ground phrase intact rather than hacking the article off it,
  // which produced "The Long Night on Shut down rail yard in Queens".
  const place = ground;   // keep the article, it is part of the phrase
  const forms = [
    `The Long Night on ${place}`,
    `No One Walks Off ${place}`,
    `Last Stand on ${place}`,
    `Blood on ${place}`,
    `The Day It Ended on ${place}`
  ];
  return pick(r, forms);
}

function exchange(r, d, a, b, rivalries, kindA, kindB, idx){
  const rl = rivalLine(rivalries, a, b, idx);
  if (rl) return `${say(rl.first, a.name)} ${say(rl.second, b.name, "answered")}`;
  return `${say(line(d, a, kindA), a.name)} ${say(line(d, b, kindB), b.name, "answered")}`;
}

/* One clash: the reveal, two exchanges, then the result. Nothing here decides
   anything, the ranking is already settled; this only describes it.
   ground is woven through the turn and the finish now, not just spent on the
   title and then forgotten: a fight that never once mentions where it is
   happening reads like two people arguing in a void, which was the actual
   complaint. It has to stay a noun phrase usable after a preposition
   ("in ${ground}", "across ${ground}"), since ground values already carry
   their own article ("a container yard...", "the rusted spine...") and
   re-capitalizing or splicing into the middle of them breaks half the set. */
function clashText(r, d, chosen, ranked, rivalries, roundNo, upset, ground){
  const s = [];
  const win = ranked[0], lose = ranked[ranked.length - 1];
  const names = chosen.map(f => f.name);

  // The reveal. Several shapes, not two, so five rounds in the same match
  // don't all open on the identical sentence pattern.
  const reveals = roundNo === 1
    ? [`${listNames(names)} step out at the same moment.`,
       `No warning. ${listNames(names)} are just suddenly there.`,
       `${listNames(names)} find each other first, before anyone else does.`]
    : [`${listNames(names)}, and neither side knew until now.`,
       `${listNames(names)}. Nobody saw this pairing coming.`,
       `It's ${listNames(names)} this time, revealed together.`];
  s.push(pick(r, reveals));

  // Exchange one: whoever is sizing the other up first.
  const a = chosen[0], b = chosen[1];
  s.push(exchange(r, d, a, b, rivalries, "taunt", "reply", 0));
  // A third fighter does not stand there silently.
  if (chosen[2]) s.push(say(line(d, chosen[2], "taunt"), chosen[2].name, "cut in"));

  // Exchange two: the turn, once it is going badly for somebody. Ground
  // gets its first real callback here, mid-fight rather than only at the
  // very top, so the place stays part of the fight, not just the poster.
  const turns = [
    `It turned on the second pass, and ${ground} was no place to be caught losing.`,
    `Something gave way, right there in ${ground}.`,
    `By the second exchange, ${ground} had already picked a side.`,
    `The second pass didn't stay even for long, not in ${ground}.`,
    `That's when it stopped being a conversation, somewhere across ${ground}.`
  ];
  s.push(pick(r, turns));
  s.push(exchange(r, d, b, a, rivalries, "taunt", "reply", 1));

  // The result. Ground again, and enough shapes that a finish never reads
  // as the same flat sentence twice across a five round match.
  if (upset) s.push(`${pick(r, POOL.upset)} ${lose.name}.`);
  s.push(pick(r, DOWN_FORMS)(win.name, lose.name, ground));
  s.push(say(line(d, lose, "falling"), lose.name, pick(r, FALL_VERBS)));
  s.push(say(line(d, win, "overDown"), win.name, pick(r, OVER_VERBS)));
  if (chosen[2]) s.push(`${ranked[1].name} was still standing when it ended, second and no better than that.`);
  return s.join(" ");
}

// Several shapes for the same event, ground-aware now, because one template
// five times running is the tell that a machine wrote it, and a fight that
// never touches the ground it's standing on reads like it's happening
// nowhere in particular.
const DOWN_FORMS = [
  (a, b, ground) => `${a} put ${b} down in ${ground} and did not look back.`,
  (a, b, ground) => `${b} went down under ${a} and stayed down, ${ground} gone quiet around them.`,
  (a, b, ground) => `It was ${a} who finished ${b}. Even ${ground} seemed to hold still for it.`,
  (a, b, ground) => `${a} caught ${b} clean, right there in ${ground}. That was the end of it.`,
  (a, b, ground) => `${b} had nothing left for ${a}, not with ${ground} closing in like that.`,
  (a, b, ground) => `${a} finished it fast. ${ground} didn't get to see much of a fight.`
];
const OVER_VERBS = ["said", "said quietly", "said over them", "added"];
const FALL_VERBS = ["said", "managed", "got out", "said, and meant it"];

function listNames(a){
  if (!a.length) return "nobody";
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
}
