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
  const i = effValue(ch, mode, role, roleShift);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];
}

// The same sum without the clamp. effTier caps at S+, so a base S wearing a
// suiting role and a base A with prep AND a suiting role both print "S+" and
// are indistinguishable - which is fine in a regular round, where a shared
// tier is meant to be a real stalemate, and fatal in overtime, where it sends
// the match round and round with no way to separate them. Sudden death reads
// this instead: how far past the cap a fighter actually got, then what tier
// they started from. Whoever was weaker to begin with loses the tie.
function effValue(ch, mode, role, roleShift){
  let i = LADDER.indexOf(ch.tier);
  if (mode === "prep") i -= (ch.prep || 0);
  i -= roleShift(ch, role, mode);
  return i;
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
function rankFighters(fighters, strict){
  // A regular round compares the printed tier and nothing else, so equals
  // draw. Overtime compares how far past the cap they got and then the tier
  // they started from, so only two genuinely identical cards can still draw.
  const key = f => strict
    ? [LADDER.indexOf(f.eff), f.val, f.baseIdx]
    : [LADDER.indexOf(f.eff)];
  const same = (a, b) => key(a).every((v, i) => v === key(b)[i]);
  const cmp = (a, b) => { const x = key(a), y = key(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0; };
  const withIdx = fighters.map(f => ({ f, idx: LADDER.indexOf(f.eff) }));
  // Stable sort: ties keep the order they were sent in, which only ever
  // surfaces as which name prints first within a tied group, never as an
  // actual ranking between them - there isn't one.
  withIdx.sort((a, b) => cmp(a.f, b.f));
  const order = withIdx.map(x => x.f);

  const groups = [];
  for (const x of withIdx){
    const last = groups[groups.length - 1];
    if (last && same(last.fighters[0], x.f)) last.fighters.push(x.f);
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
      ...f, side: ix, eff: effTier(f, mode, f.role, roleShift),
      val: effValue(f, mode, f.role, roleShift),
      baseIdx: LADDER.indexOf(f.tier), used: false
    })),
    // Names permanently barred from being resent once they have been part
    // of a draw, in a regular round or in overtime. Regular-round eligibility
    // still runs on each fighter's own .used flag above; this is the
    // separate list overtime eligibility runs on instead (see available()
    // and resolve() below) - the two never overlap in what they gate.
    drawnOut: new Set(),
    // Raw capability: the same tier score the ledger shows, but always
    // computed as if the encounter were random, so a week of prep never
    // feeds into it. This is the last word when sudden death cannot
    // separate two sides on the cards they sent.
    rawScore: t.fighters.reduce((n, f) =>
      n + (POINTS[effTier(f, "random", f.role, roleShift)] || 0), 0),
    purse: t.purse
  }));
  const points = sides.map(() => 0);
  const history = [];
  // Flips once, permanently, the moment every roster slot has been sent and
  // the standings are still tied. From that point every future round is
  // sudden death: any card but the ones already drawn out may be resent,
  // and the first round that is not itself a draw ends the whole match.
  let overtime = false;
  const all = () => sides.flatMap(s => s.fighters);
  // The pregame ground is themed around whoever actually won the auction:
  // the buyer who finished with the most money left, and specifically
  // their single most famous fighter - highest tier first, price paid as
  // the tiebreak (what the auction itself already said mattered), name
  // last for full determinism. A purse tie is broken with the seed rather
  // than always favouring seat 0, so both browsers agree without either
  // buyer being favoured.
  const maxPurse = Math.max(...sides.map(s => s.purse || 0));
  const richestSides = sides.filter(s => (s.purse || 0) === maxPurse);
  const richest = richestSides.length > 1 ? pick(r, richestSides) : richestSides[0];
  const famous = richest && richest.fighters.length
    ? richest.fighters.slice().sort((a, b) =>
        LADDER.indexOf(a.tier) - LADDER.indexOf(b.tier) ||
        (b.price || 0) - (a.price || 0) ||
        a.name.localeCompare(b.name))[0]
    : null;
  // Only counts as "home ground" if that specific fighter has a mapped
  // hometown - see the comment on HOME above. Otherwise this falls back to
  // neutral ground exactly as it did before this fighter had a home at all.
  const homeChar = famous && HOME[famous.name] ? famous : null;
  const neutralPick = homeChar ? null : pick(r, NEUTRAL);
  const ground = homeChar ? HOME[homeChar.name] : neutralPick.ground;
  const groundPlace = homeChar ? PLACE[homeChar.name] : neutralPick.place;

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
    title: () => titleFor(mode, groundPlace),
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

      const { order: ranked, groups, tied, fullDraw } = rankFighters(chosen, wasOvertime);
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
        } else if (sides.every(x => x.fighters.every(f => x.drawnOut.has(f.name)))){
          // Every card on every side has now been drawn out: sudden death
          // has tried the whole roster and every pairing came back level,
          // which is the state the match used to sit in forever, handing
          // out the same pairing again each time eligible() ran out of
          // un-drawn names. Settle it on raw capability instead, the same
          // tier score the ledger shows but always computed as if the
          // encounter were random, so a week of prep never decides it.
          // Only a dead heat there falls to the seed, and that means two
          // identically built teams.
          done = true;
          const best = Math.max(...points);
          const live = sides.filter((x, i) => points[i] === best);
          const top = Math.max(...live.map(x => x.rawScore));
          const front = live.filter(x => x.rawScore === top);
          const champ = front.length === 1 ? front[0] : pick(r, front);
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
  // MAR
  "Abomination":"a collapsed reactor block in Harlem",
  "Ant-Man":"the workbench in a shrunk-down garage",
  "Beast":"the Xavier School's late-night laboratory",
  "Black Panther":"the step wells under Birnin Zana",
  "Black Widow":"a fire escape over the Lower East Side",
  "Blade":"a boarded-up club after last call",
  "Bullseye":"a rooftop with a clean line of sight",
  "Cable":"a scavenged bunker outside a ruined timeline",
  "Captain America":"the steps of a shuttered Brooklyn gym",
  "Captain Marvel":"the tarmac of an old Air Force base",
  "Carnage":"a condemned block on the wrong side of town",
  "Colossus":"the frost of a Siberian steel mill",
  "Cyclops":"the ruins of the old Xavier mansion",
  "Daredevil":"the wet stone of Hell's Kitchen",
  "Deadpool":"a taco stand two blocks from nowhere important",
  "Doctor Doom":"the stone terrace of Castle Doom",
  "Doctor Octopus":"a gutted physics lab on the East River",
  "Doctor Strange":"the stairwell of the Sanctum Sanctorum",
  "Domino":"the catwalk above a shut-down casino floor",
  "Drax the Destroyer":"the scorched dirt of a dead colony world",
  "Electro":"a blacked-out substation on the edge of Queens",
  "Falcon":"the wind over the Harlem rooftops",
  "Gambit":"a back alley off Bourbon Street",
  "Gamora":"the deck of a stolen Kree cruiser",
  "Ghost Rider":"a desert two-lane at midnight",
  "Green Goblin":"a shut down rail yard in Queens",
  "Groot":"the tangled dark of a dying forest",
  "Hawkeye":"a fire escape in Bed-Stuy",
  "Hela":"the frozen throne room of Hel",
  "Hercules":"the marble steps of a ruined temple",
  "Hulk":"the crater where the last fight ended",
  "Human Torch":"the rain on the Baxter Building roof",
  "Invisible Woman":"the top floor of the Baxter Building",
  "Iron Fist":"the gates of a hidden mountain city",
  "Iron Man":"the landing pad above a Malibu cliff",
  "Jean Grey":"the psychic quiet of Cerebro's chamber",
  "Juggernaut":"a hole punched clean through a city block",
  "Kingpin":"the wet stone of Hell's Kitchen",
  "Kraven the Hunter":"the tall grass at the edge of the park",
  "Loki":"the gilded hall of a borrowed throne",
  "Luke Cage":"a stoop on a Harlem side street",
  "Magneto":"the rusted spine of Genosha",
  "Mantis":"the deck of a drifting cargo ship",
  "Miles Morales":"a Brooklyn rooftop two trains from home",
  "Moon Knight":"the moonlit steps of a Cairo museum",
  "Mr Fantastic":"the lab on the Baxter Building's top floor",
  "Ms. Marvel":"a Jersey City rooftop overlooking the mosque",
  "Mysterio":"a fog machine's worth of empty soundstage",
  "Namor":"a tidal shelf off the Atlantic ridge",
  "Nebula":"the wreck of a scrapped Kree warship",
  "Nick Fury":"a black site nobody admits exists",
  "Nightcrawler":"the bell tower of a German cathedral",
  "Nova":"the wreckage of the last Nova Corps outpost",
  "Professor X":"the study inside the Xavier mansion",
  "Quicksilver":"a stretch of empty highway at dawn",
  "Red Skull":"the bunker beneath a forgotten Hydra base",
  "Rhino":"a demolition site two blocks from the docks",
  "Rocket Raccoon":"the cargo bay of a stolen ship",
  "Rogue":"a Mississippi riverbank at dusk",
  "Sandman":"a construction site half-buried in loose sand",
  "Scarlet Witch":"the ruins of a house that was never really there",
  "Scorpion":"the sewer grates under midtown",
  "Sentry":"the golden light above the Watchtower",
  "Shang-Chi":"a courtyard behind a San Francisco teahouse",
  "She-Hulk":"the courthouse steps after hours",
  "Silver Surfer":"the open dark between two dying stars",
  "Spider-Man":"a shut down rail yard in Queens",
  "Star-Lord":"the cockpit of a stolen Ravager ship",
  "Storm":"a Cairo rooftop under a gathering storm",
  "Taskmaster":"an abandoned firing range",
  "The Punisher":"the wet stone of Hell's Kitchen",
  "The Thing":"the rubble of a collapsed Yancy Street block",
  "Thor":"the rainbow bridge into Asgard",
  "Ultron":"a gutted server farm that used to be a factory",
  "Venom":"a rain-slick alley behind a shuttered diner",
  "Vision":"the quiet static between two signals",
  "Vulture":"a scrapyard under the flight path",
  "War Machine":"a hangar at the edge of an airfield",
  "Wasp":"the workbench of a shrunk-down lab",
  "Winter Soldier":"a safehouse nobody wrote down",
  "Wolverine":"a logging road deep in the Canadian bush",
  "Wong":"the library of the Sanctum Sanctorum",
  "Yondu":"the deck of a Ravager scout ship",
  // DC
  "Aquaman":"a shelf of rock under the Atlantic",
  "Bane":"the yard of a black-site prison",
  "Batgirl":"the Gotham docks in the rain",
  "Batman":"the Gotham docks in the rain",
  "Beast Boy":"the common room of a beachfront tower",
  "Bizarro":"a cracked mirror of the Metropolis skyline",
  "Black Adam":"the cracked steps of a Kahndaq temple",
  "Black Canary":"the stage of a shuttered Gotham dive bar",
  "Black Manta":"the black trench floor off the continental shelf",
  "Blue Beetle":"a rooftop over El Paso",
  "Booster Gold":"the atrium of a museum after closing",
  "Brainiac":"the bottled-city hold of a scavenger fleet",
  "Captain Boomerang":"a pub car park in the small hours",
  "Captain Cold":"a frozen loading dock on the Gotham waterfront",
  "Catwoman":"the tiled rooftops above the Gotham museum district",
  "Clayface":"a flooded backlot on the old studio grounds",
  "Cyborg":"the STAR Labs loading bay",
  "Deadshot":"a rooftop three blocks from the target",
  "Deathstroke":"an empty freight yard at 3 a.m.",
  "Doomsday":"a crater still smoking from the last fight",
  "Etrigan":"the cracked flagstones of a deconsecrated chapel",
  "Firestorm":"the cooling towers of a shut-down plant",
  "Gorilla Grodd":"the jungle canopy above Gorilla City",
  "Green Arrow":"the rooftops of the Star City glades",
  "Green Lantern":"the edge of a Coast City construction site",
  "Harley Quinn":"the wreck of an old Gotham amusement pier",
  "Hawkman":"the dig site beneath a half-buried tomb",
  "Huntress":"a Gotham church bell tower",
  "John Constantine":"the back room of a London pub",
  "John Stewart":"the scaffolding of a half-built Detroit block",
  "Katana":"the dojo floor at closing hour",
  "Kid Flash":"a stretch of empty highway outside Central City",
  "Killer Croc":"the storm drains under the Gotham narrows",
  "Killer Frost":"the loading dock of a shut research wing",
  "King Shark":"the flooded lower levels of Belle Reve",
  "Lex Luthor":"the LexCorp plaza at night",
  "Martian Manhunter":"a rooftop watching the whole city breathe",
  "Metamorpho":"the loading dock of a private research vault",
  "Mr. Freeze":"the frost of a decommissioned cryo lab",
  "Mr. Terrific":"the workshop above a Detroit warehouse",
  "Nightwing":"a rooftop over Blüdhaven",
  "Peacemaker":"a compound gate nobody's supposed to find",
  "Poison Ivy":"a greenhouse gone completely feral",
  "Ra's al Ghul":"a frozen pass above the Lazarus pits",
  "Raven":"a chapel with the windows blacked out",
  "Red Hood":"the Gotham rail arches",
  "Red Robin":"a Gotham fire escape three floors up",
  "Reverse-Flash":"a stretch of track that outran its own clock",
  "Robin":"the Gotham rooftops just past the bridge",
  "Savitar":"a track that loops through no fixed place",
  "Scarecrow":"the halls of an abandoned asylum wing",
  "Shazam":"the steps of a Philadelphia rowhouse",
  "Sinestro":"the yellow glow of a Korugar ruin",
  "Solomon Grundy":"the swamp mud outside Slaughter Swamp",
  "Starfire":"the deck of a grounded alien cruiser",
  "Supergirl":"a Midvale wheat field at dusk",
  "Superman":"a rooftop above Metropolis",
  "Talia al Ghul":"a frozen pass above the Lazarus pits",
  "The Flash":"a track that circles the whole city",
  "The Joker":"the flooded Ace Chemical floor",
  "The Penguin":"the ice house behind the Iceberg Lounge",
  "The Riddler":"a locked room with one obvious door",
  "The Thinker":"a server room with the lights already off",
  "Two-Face":"the old Gotham courthouse steps",
  "Vandal Savage":"the ruins of a city no map remembers",
  "Vibe":"a Central City back alley humming with static",
  "Vigilante":"a dive bar just past the county line",
  "Wonder Woman":"the black sand of a Themysciran shore",
  "Zatanna":"the wings of a shuttered Gotham theater",
  // NAR
  "Deidara":"a cliffside overlooking the Hidden Rock",
  "Gaara":"the dunes outside the Hidden Sand",
  "Hashirama Senju":"the founding stone of the Hidden Leaf",
  "Hinata Hyuga":"the training yard behind the Hyuga compound",
  "Itachi Uchiha":"the empty streets of the Uchiha district",
  "Jiraiya":"the hot springs outside Konoha",
  "Kakashi Hatake":"the Konoha training grounds",
  "Kisame Hoshigaki":"a flooded cave beneath the Hidden Mist",
  "Madara Uchiha":"the Valley of the End",
  "Might Guy":"the training grounds at dawn, laps already run",
  "Minato Namikaze":"the rooftop of the Hokage tower",
  "Naruto Uzumaki":"the Konoha training grounds",
  "Neji Hyuga":"the training yard behind the Hyuga compound",
  "Obito Uchiha":"the ruins of an old Uchiha hideout",
  "Orochimaru":"a hidden lab beneath the forest floor",
  "Pain":"the rubble of a village he already ended once",
  "Rock Lee":"the training grounds at dawn, laps already run",
  "Sasuke Uchiha":"the Konoha training grounds",
  "Shikamaru Nara":"the shade of the Nara clan's deer forest",
  "Tsunade":"the office at the top of the Hokage tower",
  // JJK
  "Aoi Todo":"the gym at Kyoto Jujutsu High",
  "Choso":"a condemned tenement outside the city limits",
  "Hajime Kashimo":"a scorched clearing that used to be a dojo",
  "Hiromi Higuruma":"the steps of an empty courthouse",
  "Jogo":"the mouth of a smoking volcano",
  "Kenjaku":"the operating theater of a shuttered hospital",
  "Kento Nanami":"an overtime desk nobody else stayed for",
  "Kinji Hakari":"the vault beneath a shut-down casino",
  "Mahito":"a back alley that keeps changing shape",
  "Maki Zenin":"the training hall of the Zenin compound",
  "Megumi Fushiguro":"the gate of the Zenin family estate",
  "Mei Mei":"a rooftop with a clean invoice already written",
  "Nobara Kugisaki":"a back-street market stall at closing time",
  "Ryomen Sukuna":"the ashes of a village he ended personally",
  "Satoru Gojo":"the yard at Tokyo Jujutsu High",
  "Toji Fushiguro":"a rooftop with a contract already signed",
  "Uraume":"the frost around Sukuna's throne",
  "Yuji Itadori":"the yard behind Tokyo Jujutsu High",
  "Yuki Tsukumo":"the roof of a coffin-shaped mansion",
  "Yuta Okkotsu":"the dorm hall at Tokyo Jujutsu High",
  // DS
  "Akaza":"a moonless clearing outside a mountain dojo",
  "Doma":"the altar hall of a false shrine",
  "Giyu Tomioka":"the misty bank of a mountain river",
  "Gyomei Himejima":"the stone steps of a mountain temple",
  "Gyutaro":"the flooded alleys of the entertainment district",
  "Hantengu":"a rain-soaked forest that keeps splitting apart",
  "Inosuke Hashibira":"the wild slope of Mount Natagumo",
  "Kokushibo":"the ridge where the sun never quite reaches",
  "Kyojuro Rengoku":"the last car of a midnight train",
  "Mitsuri Kanroji":"the pink blossoms outside the Hashira estate",
  "Muichiro Tokito":"the mist over a quiet mountain pass",
  "Muzan Kibutsuji":"a mansion that isn't on any map",
  "Nezuko Kamado":"the pine slope under Mount Natagumo",
  "Obanai Iguro":"the shrine gate at the edge of the village",
  "Sanemi Shinazugawa":"the scorched field outside his home village",
  "Shinobu Kocho":"the butterfly garden behind the Hashira estate",
  "Tanjiro Kamado":"the pine slope under Mount Natagumo",
  "Tengen Uzui":"the rooftops of the entertainment district",
  "Yoriichi Tsugikuni":"a quiet clearing that remembers an older sword",
  "Zenitsu Agatsuma":"the porch of a mountain training hut",
  // BC
  "Asta":"the courtyard of the Black Bull hideout",
  "Charlotte Roselei":"the rose garden behind the Blue Rose base",
  "Dante Zogratis":"a cracked throne room underground",
  "Fuegoleon Vermillion":"the fire-scorched hall of the Crimson Lion base",
  "Jack the Ripper":"a foggy hunting ground on the kingdom's edge",
  "Julius Novachrono":"the Wizard King's tower balcony",
  "Langris Vaude":"the training yard of the Golden Dawn base",
  "Licht":"the ruined chapel of the elf hideout",
  "Lucius Zogratis":"the altar room beneath the Dark Triad hideout",
  "Luck Voltia":"a lightning-scarred clearing outside the Clover capital",
  "Magna Swing":"the courtyard of the Black Bull hideout",
  "Mereoleona Vermillion":"the training grounds of the Crimson Lion base",
  "Nacht Faust":"a shadowed alley in the underworld market",
  "Noelle Silva":"the docks outside the Silva family estate",
  "Vanica Zogratis":"a blood-soaked clearing outside the Spade Kingdom",
  "William Vangeance":"the captain's hall of the Golden Dawn base",
  "Yami Sukehiro":"the courtyard of the Black Bull hideout",
  "Yuno":"the training yard of the Golden Dawn base",
  "Zagred":"the throne room of a devil's true form",
  "Zenon Zogratis":"a bone-strewn clearing outside the Spade Kingdom",
  // SL
  "Baek Yoonho":"the rooftop of the Tiger Guild headquarters",
  "Beru":"the throne room of the ant dungeon",
  "Cha Hae-In":"the gate of the Hunters Guild headquarters",
  "Go Gunhee":"the top floor of the Hunters Association tower",
  "Igris":"the mouth of a Seoul dungeon gate",
  "Sung Jinwoo":"the mouth of a Seoul dungeon gate",
  "Thomas Andre":"the sparring hall of the National Guild",
  // HP
  "Alastor Moody":"the front step of a paranoid old cottage",
  "Albus Dumbledore":"the frost on the Hogwarts courtyard",
  "Bellatrix Lestrange":"the dungeon halls of Malfoy Manor",
  "Draco Malfoy":"the drawing room of Malfoy Manor",
  "Fenrir Greyback":"a moonlit clearing in the Forbidden Forest",
  "Filius Flitwick":"the Charms classroom after hours",
  "Gellert Grindelwald":"the cliffs above Nurmengard prison",
  "Harry Potter":"the frost on the Hogwarts courtyard",
  "Hermione Granger":"the stacks of the Hogwarts library",
  "Horace Slughorn":"the potions classroom, kettle already warm",
  "Kingsley Shacklebolt":"the atrium of the Ministry of Magic",
  "Lord Voldemort":"the frost on the Hogwarts courtyard",
  "Lucius Malfoy":"the drawing room of Malfoy Manor",
  "Minerva McGonagall":"the transfiguration classroom, lights still on",
  "Neville Longbottom":"the greenhouses behind Hogwarts castle",
  "Nymphadora Tonks":"the stairwell outside the Auror office",
  "Remus Lupin":"the edge of the Forbidden Forest at moonrise",
  "Rubeus Hagrid":"the hut at the edge of the forest",
  "Severus Snape":"the dungeon classroom, torches barely lit",
  "Sirius Black":"the drawing room of a house that hates him",
  // HXH
  "Biscuit Krueger":"the training grounds of Greed Island",
  "Chrollo Lucilfer":"the meeting hall of the Phantom Troupe hideout",
  "Feitan Portor":"a windowless room built for questions",
  "Ging Freecss":"the top of a mountain nobody's finished climbing",
  "Gon Freecss":"the dock on Whale Island",
  "Hisoka Morow":"a rooftop circus tent, half-collapsed",
  "Illumi Zoldyck":"the training halls of Kukuroo Mountain",
  "Isaac Netero":"the courtyard of Hunter Association headquarters",
  "Killua Zoldyck":"the gate of the Zoldyck family estate",
  "Kite":"a clearing deep in the Chimera Ant territory",
  "Kurapika":"the ashes of the Kurta clan village",
  "Machi Komacine":"the back room of a hideout tailor shop",
  "Menthuthuyoupi":"the throne chamber beneath the ant colony",
  "Meruem":"the throne chamber beneath the ant colony",
  "Morel Mackernasey":"a smoke-choked clearing in ant territory",
  "Neferpitou":"the palace halls of the Chimera Ant queen",
  "Shaiapouf":"the palace halls of the Chimera Ant queen",
  "Silva Zoldyck":"the training halls of Kukuroo Mountain",
  "Uvogin":"the meeting hall of the Phantom Troupe hideout",
  "Zeno Zoldyck":"the gate of the Zoldyck family estate",
  // MK
  "Baraka":"a Tarkatan war camp on the edge of Outworld",
  "Ermac":"the ruins of a battlefield that never quite ended",
  "Fujin":"the windswept cliffs above the Sky Temple",
  "Geras":"the sands outside Kronika's Keep",
  "Goro":"the throne pit of the Shokan temple",
  "Hanzo Hasashi":"the burned ground of the Shirai Ryu village",
  "Johnny Cage":"a movie set two blocks from a portal",
  "Kabal":"a scrapyard on the outskirts of Outworld",
  "Kitana":"the throne room of the Edenian palace",
  "Kratos":"the ash fields below a fallen temple",
  "Kung Lao":"the courtyard of the White Lotus temple",
  "Liu Kang":"the courtyard of the White Lotus temple",
  "Mileena":"the throne room of the Edenian palace",
  "Noob Saibot":"a realm with no light left in it",
  "Quan Chi":"the catacombs beneath the Netherrealm",
  "Raiden":"the courtyard of the Sky Temple",
  "Shang Tsung":"the arena of a soul-stealing tournament",
  "Shao Kahn":"the throne room of Outworld's dark fortress",
  "Shinnok":"the catacombs beneath the Netherrealm",
  "Sindel":"the throne room of the Edenian palace",
  "Sub-Zero":"the frozen halls of the Lin Kuei temple",
  // BOYS
  "Homelander":"the observation deck atop Vought Tower",
  "Soldier Boy":"a Cold War bunker sealed for decades",
  // INV
  "Atom Eve":"a rebuilt block in downtown Reform",
  "Battlebeast":"the arena floor of the Coalition of Planets",
  "Invincible":"the rooftop of a Reform apartment building",
  "Omni-Man":"the wreckage of a house on the edge of town",
  "Thragg":"the throne room of the Viltrumite Empire",
  // RE
  "Ada Wong":"a fire escape above a Raccoon City back alley",
  "Albert Wesker":"the lab beneath the Spencer Mansion",
  "Chris Redfield":"the courtyard of a quarantined mansion",
  "Ethan Winters":"the porch of a house that shouldn't still be standing",
  "Jill Valentine":"the precinct halls of the Raccoon City police department",
  "Leon Kennedy":"the flooded streets of downtown Raccoon City",
  "Mother Miranda":"the chapel of a fog-locked village",
  "Nemesis":"the ruined streets of Raccoon City at curfew",
  // INF
  "Cole MacGrath":"the fenced-off quarantine zone of Empire City",
  "Delsin Rowe":"the reservation outside Seattle",
  "Joseph Bertrand III":"the fortified rooftops of New Marais",
  "Kessler":"the ruins of a future that already happened",
  "The Beast":"a city block flattened before anyone could run"
};
// Short, clean place names for the story heading ("Random encounter in X") -
// one per character, same coverage as HOME above but terse: a city, realm,
// or short descriptor rather than the atmospheric phrase the fight itself
// narrates in. Kept as a separate map rather than trying to extract a place
// name out of HOME's prose at runtime, which would be unreliable for entries
// that never mention a proper noun at all ("a crater still smoking...").
const PLACE = {
  // MAR
  "Abomination":"Harlem",
  "Ant-Man":"San Francisco",
  "Beast":"the Xavier School",
  "Black Panther":"Wakanda",
  "Black Widow":"New York",
  "Blade":"New Orleans",
  "Bullseye":"New York",
  "Cable":"a ruined future",
  "Captain America":"Brooklyn",
  "Captain Marvel":"an Air Force base",
  "Carnage":"New York",
  "Colossus":"Siberia",
  "Cyclops":"Westchester",
  "Daredevil":"Hell's Kitchen",
  "Deadpool":"New York",
  "Doctor Doom":"Latveria",
  "Doctor Octopus":"New York",
  "Doctor Strange":"New York",
  "Domino":"Las Vegas",
  "Drax the Destroyer":"a dead colony world",
  "Electro":"Queens",
  "Falcon":"Harlem",
  "Gambit":"New Orleans",
  "Gamora":"deep space",
  "Ghost Rider":"the desert",
  "Green Goblin":"Queens",
  "Groot":"a dying forest",
  "Hawkeye":"Bed-Stuy",
  "Hela":"Hel",
  "Hercules":"Olympus",
  "Hulk":"the badlands",
  "Human Torch":"New York",
  "Invisible Woman":"New York",
  "Iron Fist":"K'un-Lun",
  "Iron Man":"Malibu",
  "Jean Grey":"Westchester",
  "Juggernaut":"New York",
  "Kingpin":"Hell's Kitchen",
  "Kraven the Hunter":"Central Park",
  "Loki":"Asgard",
  "Luke Cage":"Harlem",
  "Magneto":"Genosha",
  "Mantis":"deep space",
  "Miles Morales":"Brooklyn",
  "Moon Knight":"Cairo",
  "Mr Fantastic":"New York",
  "Ms. Marvel":"Jersey City",
  "Mysterio":"Hollywood",
  "Namor":"Atlantis",
  "Nebula":"deep space",
  "Nick Fury":"a black site",
  "Nightcrawler":"Germany",
  "Nova":"deep space",
  "Professor X":"Westchester",
  "Quicksilver":"the highway",
  "Red Skull":"a Hydra bunker",
  "Rhino":"the docks",
  "Rocket Raccoon":"deep space",
  "Rogue":"Mississippi",
  "Sandman":"a construction site",
  "Scarlet Witch":"Westchester",
  "Scorpion":"New York",
  "Sentry":"the Watchtower",
  "Shang-Chi":"San Francisco",
  "She-Hulk":"New York",
  "Silver Surfer":"deep space",
  "Spider-Man":"Queens",
  "Star-Lord":"deep space",
  "Storm":"Cairo",
  "Taskmaster":"a firing range",
  "The Punisher":"Hell's Kitchen",
  "The Thing":"Yancy Street",
  "Thor":"Asgard",
  "Ultron":"a gutted factory",
  "Venom":"New York",
  "Vision":"New York",
  "Vulture":"a scrapyard",
  "War Machine":"an airfield",
  "Wasp":"San Francisco",
  "Winter Soldier":"a safehouse",
  "Wolverine":"the Canadian wilds",
  "Wong":"the Sanctum Sanctorum",
  "Yondu":"deep space",
  // DC
  "Aquaman":"Atlantis",
  "Bane":"a black-site prison",
  "Batgirl":"Gotham",
  "Batman":"Gotham",
  "Beast Boy":"Titans Tower",
  "Bizarro":"Metropolis",
  "Black Adam":"Kahndaq",
  "Black Canary":"Gotham",
  "Black Manta":"the ocean floor",
  "Blue Beetle":"El Paso",
  "Booster Gold":"a museum",
  "Brainiac":"deep space",
  "Captain Boomerang":"a pub car park",
  "Captain Cold":"Central City",
  "Catwoman":"Gotham",
  "Clayface":"Hollywood",
  "Cyborg":"Detroit",
  "Deadshot":"Gotham",
  "Deathstroke":"a freight yard",
  "Doomsday":"Metropolis",
  "Etrigan":"an old chapel",
  "Firestorm":"a power plant",
  "Gorilla Grodd":"Gorilla City",
  "Green Arrow":"Star City",
  "Green Lantern":"Coast City",
  "Harley Quinn":"Gotham",
  "Hawkman":"Egypt",
  "Huntress":"Gotham",
  "John Constantine":"London",
  "John Stewart":"Detroit",
  "Katana":"a dojo",
  "Kid Flash":"Central City",
  "Killer Croc":"Gotham",
  "Killer Frost":"Central City",
  "King Shark":"Belle Reve",
  "Lex Luthor":"Metropolis",
  "Martian Manhunter":"Metropolis",
  "Metamorpho":"a research vault",
  "Mr. Freeze":"Gotham",
  "Mr. Terrific":"Detroit",
  "Nightwing":"Blüdhaven",
  "Peacemaker":"a black-ops compound",
  "Poison Ivy":"Gotham",
  "Ra's al Ghul":"the Lazarus pits",
  "Raven":"Titans Tower",
  "Red Hood":"Gotham",
  "Red Robin":"Gotham",
  "Reverse-Flash":"Central City",
  "Robin":"Gotham",
  "Savitar":"the Speed Force",
  "Scarecrow":"Gotham",
  "Shazam":"Philadelphia",
  "Sinestro":"Korugar",
  "Solomon Grundy":"Slaughter Swamp",
  "Starfire":"deep space",
  "Supergirl":"Midvale",
  "Superman":"Metropolis",
  "Talia al Ghul":"the Lazarus pits",
  "The Flash":"Central City",
  "The Joker":"Gotham",
  "The Penguin":"Gotham",
  "The Riddler":"Gotham",
  "The Thinker":"Central City",
  "Two-Face":"Gotham",
  "Vandal Savage":"a lost city",
  "Vibe":"Central City",
  "Vigilante":"a county line dive bar",
  "Wonder Woman":"Themyscira",
  "Zatanna":"Gotham",
  // NAR
  "Deidara":"the Hidden Rock",
  "Gaara":"the Hidden Sand",
  "Hashirama Senju":"the Hidden Leaf",
  "Hinata Hyuga":"the Hidden Leaf",
  "Itachi Uchiha":"the Hidden Leaf",
  "Jiraiya":"the Hidden Leaf",
  "Kakashi Hatake":"the Hidden Leaf",
  "Kisame Hoshigaki":"the Hidden Mist",
  "Madara Uchiha":"the Valley of the End",
  "Might Guy":"the Hidden Leaf",
  "Minato Namikaze":"the Hidden Leaf",
  "Naruto Uzumaki":"the Hidden Leaf",
  "Neji Hyuga":"the Hidden Leaf",
  "Obito Uchiha":"the Hidden Leaf",
  "Orochimaru":"a hidden lab",
  "Pain":"the Hidden Rain",
  "Rock Lee":"the Hidden Leaf",
  "Sasuke Uchiha":"the Hidden Leaf",
  "Shikamaru Nara":"the Hidden Leaf",
  "Tsunade":"the Hidden Leaf",
  // JJK
  "Aoi Todo":"Kyoto Jujutsu High",
  "Choso":"a condemned tenement",
  "Hajime Kashimo":"an old dojo",
  "Hiromi Higuruma":"a courthouse",
  "Jogo":"a volcano",
  "Kenjaku":"a shuttered hospital",
  "Kento Nanami":"an office district",
  "Kinji Hakari":"a casino",
  "Mahito":"a shifting back alley",
  "Maki Zenin":"the Zenin compound",
  "Megumi Fushiguro":"the Zenin estate",
  "Mei Mei":"a rooftop",
  "Nobara Kugisaki":"a market street",
  "Ryomen Sukuna":"a ruined village",
  "Satoru Gojo":"Tokyo Jujutsu High",
  "Toji Fushiguro":"a rooftop",
  "Uraume":"the Culling Game",
  "Yuji Itadori":"Tokyo Jujutsu High",
  "Yuki Tsukumo":"a coffin-shaped mansion",
  "Yuta Okkotsu":"Tokyo Jujutsu High",
  // DS
  "Akaza":"a mountain dojo",
  "Doma":"a false shrine",
  "Giyu Tomioka":"a mountain river",
  "Gyomei Himejima":"a mountain temple",
  "Gyutaro":"the entertainment district",
  "Hantengu":"a splitting forest",
  "Inosuke Hashibira":"Mount Natagumo",
  "Kokushibo":"a mountain ridge",
  "Kyojuro Rengoku":"a midnight train",
  "Mitsuri Kanroji":"the Hashira estate",
  "Muichiro Tokito":"a mountain pass",
  "Muzan Kibutsuji":"a hidden mansion",
  "Nezuko Kamado":"Mount Natagumo",
  "Obanai Iguro":"a village shrine",
  "Sanemi Shinazugawa":"a scorched village",
  "Shinobu Kocho":"the Hashira estate",
  "Tanjiro Kamado":"Mount Natagumo",
  "Tengen Uzui":"the entertainment district",
  "Yoriichi Tsugikuni":"a quiet clearing",
  "Zenitsu Agatsuma":"a mountain hut",
  // BC
  "Asta":"the Black Bull hideout",
  "Charlotte Roselei":"the Blue Rose base",
  "Dante Zogratis":"the Spade Kingdom",
  "Fuegoleon Vermillion":"the Crimson Lion base",
  "Jack the Ripper":"the kingdom's edge",
  "Julius Novachrono":"the Wizard King's tower",
  "Langris Vaude":"the Golden Dawn base",
  "Licht":"the elf hideout",
  "Lucius Zogratis":"the Dark Triad hideout",
  "Luck Voltia":"the Clover Kingdom",
  "Magna Swing":"the Black Bull hideout",
  "Mereoleona Vermillion":"the Crimson Lion base",
  "Nacht Faust":"the underworld market",
  "Noelle Silva":"the Silva estate",
  "Vanica Zogratis":"the Spade Kingdom",
  "William Vangeance":"the Golden Dawn base",
  "Yami Sukehiro":"the Black Bull hideout",
  "Yuno":"the Golden Dawn base",
  "Zagred":"the underworld",
  "Zenon Zogratis":"the Spade Kingdom",
  // SL
  "Baek Yoonho":"the Tiger Guild",
  "Beru":"the ant dungeon",
  "Cha Hae-In":"the Hunters Guild",
  "Go Gunhee":"the Hunters Association",
  "Igris":"a Seoul dungeon gate",
  "Sung Jinwoo":"Seoul",
  "Thomas Andre":"the National Guild",
  // HP
  "Alastor Moody":"an old cottage",
  "Albus Dumbledore":"Hogwarts",
  "Bellatrix Lestrange":"Malfoy Manor",
  "Draco Malfoy":"Malfoy Manor",
  "Fenrir Greyback":"the Forbidden Forest",
  "Filius Flitwick":"Hogwarts",
  "Gellert Grindelwald":"Nurmengard",
  "Harry Potter":"Hogwarts",
  "Hermione Granger":"Hogwarts",
  "Horace Slughorn":"Hogwarts",
  "Kingsley Shacklebolt":"the Ministry of Magic",
  "Lord Voldemort":"Hogwarts",
  "Lucius Malfoy":"Malfoy Manor",
  "Minerva McGonagall":"Hogwarts",
  "Neville Longbottom":"Hogwarts",
  "Nymphadora Tonks":"the Ministry of Magic",
  "Remus Lupin":"the Forbidden Forest",
  "Rubeus Hagrid":"Hogwarts",
  "Severus Snape":"Hogwarts",
  "Sirius Black":"Grimmauld Place",
  // HXH
  "Biscuit Krueger":"Greed Island",
  "Chrollo Lucilfer":"the Phantom Troupe hideout",
  "Feitan Portor":"an interrogation room",
  "Ging Freecss":"a mountain summit",
  "Gon Freecss":"Whale Island",
  "Hisoka Morow":"a rooftop circus",
  "Illumi Zoldyck":"Kukuroo Mountain",
  "Isaac Netero":"Hunter Association HQ",
  "Killua Zoldyck":"the Zoldyck estate",
  "Kite":"the Chimera Ant territory",
  "Kurapika":"the Kurta clan village",
  "Machi Komacine":"a hideout tailor shop",
  "Menthuthuyoupi":"the ant colony",
  "Meruem":"the ant colony",
  "Morel Mackernasey":"the ant territory",
  "Neferpitou":"the Chimera Ant palace",
  "Shaiapouf":"the Chimera Ant palace",
  "Silva Zoldyck":"Kukuroo Mountain",
  "Uvogin":"the Phantom Troupe hideout",
  "Zeno Zoldyck":"the Zoldyck estate",
  // MK
  "Baraka":"Outworld",
  "Ermac":"a ruined battlefield",
  "Fujin":"the Sky Temple",
  "Geras":"Kronika's Keep",
  "Goro":"the Shokan temple",
  "Hanzo Hasashi":"the Shirai Ryu village",
  "Johnny Cage":"a movie set",
  "Kabal":"Outworld",
  "Kitana":"Edenia",
  "Kratos":"a fallen temple",
  "Kung Lao":"the White Lotus temple",
  "Liu Kang":"the White Lotus temple",
  "Mileena":"Edenia",
  "Noob Saibot":"the Netherrealm",
  "Quan Chi":"the Netherrealm",
  "Raiden":"the Sky Temple",
  "Shang Tsung":"a soul-stealing tournament",
  "Shao Kahn":"Outworld",
  "Shinnok":"the Netherrealm",
  "Sindel":"Edenia",
  "Sub-Zero":"the Lin Kuei temple",
  // BOYS
  "Homelander":"Vought Tower",
  "Soldier Boy":"a Cold War bunker",
  // INV
  "Atom Eve":"Reform",
  "Battlebeast":"the Coalition of Planets",
  "Invincible":"Reform",
  "Omni-Man":"the edge of town",
  "Thragg":"the Viltrumite Empire",
  // RE
  "Ada Wong":"Raccoon City",
  "Albert Wesker":"the Spencer Mansion",
  "Chris Redfield":"a quarantined mansion",
  "Ethan Winters":"a cursed village",
  "Jill Valentine":"Raccoon City",
  "Leon Kennedy":"Raccoon City",
  "Mother Miranda":"a fog-locked village",
  "Nemesis":"Raccoon City",
  // INF
  "Cole MacGrath":"Empire City",
  "Delsin Rowe":"a reservation outside Seattle",
  "Joseph Bertrand III":"New Marais",
  "Kessler":"a ruined future",
  "The Beast":"a flattened city block"
};
// Neutral ground when nobody drafted owns anywhere. Each entry pairs the
// atmospheric phrase the fight narrates in with the short place name the
// heading uses, picked together so the two always agree with each other.
const NEUTRAL = [
  { ground: "a container yard with the lights still on", place: "a container yard" },
  { ground: "a rain slick multi storey car park", place: "a car park" },
  { ground: "the empty concourse of a shut station", place: "a shut-down station" },
  { ground: "a dry canal under a motorway bridge", place: "a dry canal" }
];

function titleFor(mode, place){
  // Fixed format now, not a pool of phrasings: which of the two encounter
  // types this is matters more here than narrative variety, since it is
  // the one thing on this heading the buyers actually chose. Short place
  // name, not the long HOME/NEUTRAL prose - "in Themyscira" reads as a
  // heading, "in the black sand of a Themysciran shore" reads as a run-on.
  const kind = mode === "prep" ? "Prep-time encounter" : "Random encounter";
  return `${kind} in ${place}`;
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
