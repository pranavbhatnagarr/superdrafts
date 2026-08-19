/* ------------------------------------------------------------------ *
 *  bot.js, the computer opponent.
 *
 *  Pure decisions, nothing else: no DOM, no state, no timers, no network.
 *  game.js owns all of that and calls in here when it needs a bot to make
 *  up its mind. That split is what makes the bot testable without opening
 *  a browser, and it is why every scoring helper the bot needs is passed
 *  in rather than imported: the rules live in game.js and fight.js, and a
 *  second copy of them here would drift the first time anyone touched a
 *  tier.
 *
 *  Three levels, and they differ in what the bot is allowed to KNOW as
 *  much as in how well it plays:
 *
 *    easy    values a card by its printed tier only, bids shy of what it
 *            can afford, drops out early, assigns roles at random and
 *            sends a random character each round.
 *    medium  values a card properly, spends its purse in proportion to
 *            what it still needs, prefers roles that suit, and always
 *            leads with its strongest card left.
 *    hard    values a card by what it would actually fight at, budgets
 *            across the whole sale, solves the role board exactly, and
 *            counter picks: it reads the rosters everyone can already see
 *            and sends the cheapest card that still beats the best thing
 *            its rivals have left, saving its own best for when it is
 *            genuinely needed.
 *
 *  Nothing here peeks at anything a human player could not also see. The
 *  rosters are on screen from the moment the auction ends, and the tiers
 *  are printed on the cards. A hard bot is not cheating, it is just doing
 *  the arithmetic every time instead of only when it feels like it.
 * ------------------------------------------------------------------ */

export const LEVELS = ["easy", "medium", "hard"];

export const LEVEL_BLURB = {
  easy:   "Bids shy, picks at random. A gentle first game.",
  medium: "Values the cards properly and leads with its best.",
  hard:   "Budgets the whole sale, solves the role board, and counter picks."
};

// A seeded shuffle so a solo game is as repeatable as a shared one. Same
// generator shape fight.js uses, kept local rather than shared because the
// bot must never advance the match's own sequence.
function rng(seed){
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const ROLE_KEYS = ["S", "W", "P", "A", "E"];

/**
 * @param level    one of LEVELS
 * @param helpers  { POINTS, effTier, roleShift, slots, purse, seed }
 *                 effTier(char, mode, roleKey) -> tier letter, exactly the
 *                 one game.js and fight.js already share.
 */
export function createBot({ level = "medium", helpers }){
  const { POINTS, effTier, slots = 5, purse = 20 } = helpers;
  const r = rng(helpers.seed || 1);
  const easy = level === "easy", hard = level === "hard";

  // What a character would fight at if it were given the role that suits it
  // best. Easy never looks this far and just reads the printed tier, which
  // is why it overpays for a headline name that plays below its billing.
  const bestTier = (char, mode) => {
    if (easy) return char.tier;
    let best = char.tier;
    for (const k of ROLE_KEYS){
      const t = effTier(char, mode, k);
      if (POINTS[t] > POINTS[best]) best = t;
    }
    return best;
  };

  // Dollars, not points. A whole roster has to come out of one purse, so a
  // character is worth its share of the points a full roster would hold.
  // Medium and hard price on what it would fight at, easy on the letter.
  const worth = (char, mode) => {
    const pts = POINTS[hard || !easy ? bestTier(char, mode) : char.tier] || 1;
    const typical = POINTS.B * slots;              // a plain, respectable five
    const share = pts / typical;
    return Math.max(1, Math.round(share * purse));
  };

  return {
    level,
    worth,

    /**
     * One bidding decision.
     *   ask        what it costs to take the lot right now
     *   ceiling    the most this seat may legally bid
     *   slotsLeft  how many characters it still has to buy
     *   mustBuy    true when passing is not allowed on this lot
     */
    bid({ char, mode, ask, ceiling, purse: left, slotsLeft, mustBuy }){
      if (ceiling < ask) return { act: "pass" };

      let want = worth(char, mode);

      // Money that has to stretch across the slots still open. A bot that
      // spends its whole purse on lot two ends up with four dollar cards,
      // which is exactly the trap a human falls into as well.
      const reserve = Math.max(0, slotsLeft - 1);
      const spendable = Math.max(1, left - reserve);

      if (easy){
        // shy, and inconsistent about it
        want = Math.round(want * (0.45 + r() * 0.35));
        if (!mustBuy && r() < 0.30) return { act: "pass" };
      } else if (hard){
        // Pays a premium when it is short of bodies and the lot is good,
        // and walks away early when it is nearly full and the card is not.
        const need = slotsLeft / slots;
        want = Math.round(want * (0.85 + need * 0.45));
      }

      const cap = Math.min(want, spendable, ceiling);
      if (mustBuy) return { act: "bid", amount: Math.max(ask, Math.min(ask, ceiling)) };
      if (ask > cap) return { act: "pass" };
      return { act: "bid", amount: ask };
    },

    /**
     * Which role goes on which character.
     * Returns an array of role keys, one per roster index.
     *
     * Hard solves it exactly: five roles across five characters is 120
     * arrangements, so it simply scores all of them and takes the best.
     * Medium is greedy, which lands close most of the time and misses the
     * arrangement that needs one character to take a worse role so another
     * can take a much better one. Easy does not look at all.
     */
    assignRoles(roster, mode){
      const chars = roster.map(x => x.char);
      if (easy){
        const keys = ROLE_KEYS.slice();
        for (let i = keys.length - 1; i > 0; i--){
          const j = Math.floor(r() * (i + 1));
          [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        return keys;
      }

      const score = arrangement =>
        arrangement.reduce((n, key, i) => n + (POINTS[effTier(chars[i], mode, key)] || 0), 0);

      if (hard){
        let best = null, bestScore = -1;
        const walk = (used, acc) => {
          if (acc.length === chars.length){
            const s = score(acc);
            if (s > bestScore){ bestScore = s; best = acc.slice(); }
            return;
          }
          for (const k of ROLE_KEYS){
            if (used.has(k)) continue;
            used.add(k); acc.push(k);
            walk(used, acc);
            acc.pop(); used.delete(k);
          }
        };
        walk(new Set(), []);
        return best;
      }

      // medium: hand each role to whoever gains most from it, best role first
      const out = new Array(chars.length).fill(null);
      const takenChar = new Set();
      const gains = [];
      for (const k of ROLE_KEYS)
        chars.forEach((c, i) => gains.push({ k, i, pts: POINTS[effTier(c, mode, k)] || 0 }));
      gains.sort((a, b) => b.pts - a.pts);
      const takenRole = new Set();
      for (const g of gains){
        if (takenRole.has(g.k) || takenChar.has(g.i)) continue;
        out[g.i] = g.k; takenRole.add(g.k); takenChar.add(g.i);
      }
      // anything left over (identical scores can leave gaps) fills in order
      ROLE_KEYS.forEach(k => {
        if (takenRole.has(k)) return;
        const i = out.findIndex(x => x === null);
        if (i > -1){ out[i] = k; takenRole.add(k); }
      });
      return out;
    },

    /**
     * Which character to send this round.
     *   mine    [{ name, tier }] still in hand, tier already effective
     *   rivals  [[{ name, tier }]] what each opponent has left, which is
     *           public information: every roster is on screen.
     */
    pick({ mine, rivals, mode }){
      if (!mine.length) return null;
      const rank = t => POINTS[t] || 0;
      const sorted = mine.slice().sort((a, b) => rank(b.tier) - rank(a.tier));

      if (easy) return mine[Math.floor(r() * mine.length)].name;
      if (!hard) return sorted[0].name;            // medium always leads best

      // hard: the strongest thing anyone else could send this round
      const threat = Math.max(0, ...rivals.flat().map(x => rank(x.tier)));

      // cheapest card that still beats it, so the good ones are kept back
      const enough = sorted.filter(x => rank(x.tier) > threat);
      if (enough.length) return enough[enough.length - 1].name;

      // cannot win this one: throw the weakest away rather than waste a card
      // that would have won a later round
      return sorted[sorted.length - 1].name;
    },

    /** Random or a week of prep, when the bot is the one who gets to call it. */
    encounter(roster, effTierFn){
      if (easy) return r() < 0.5 ? "random" : "prep";
      const total = mode => roster.reduce((n, x) =>
        n + (POINTS[effTier(x.char, mode, x.role)] || 0), 0);
      return total("prep") > total("random") ? "prep" : "random";
    }
  };
}
