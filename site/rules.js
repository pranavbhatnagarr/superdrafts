/* ------------------------------------------------------------------ *
 *  rules.js, the numbers everything else agrees on.
 *
 *  The ladder, the points, the five jobs and the two functions that turn
 *  a printed tier into the one a character actually fights at. game.js
 *  runs the sale off these, fight.js settles rounds with them, and
 *  tiers.js prints them in the public guide.
 *
 *  They live here because they were already written out twice, in game.js
 *  and again in fight.js, and a third copy for the guide would have been
 *  a page that quietly lied the first time anyone retuned a tier. Change
 *  a rule here and every screen changes with it.
 *
 *  Pure: no DOM, no state, no network. roleIconHtml returns a string.
 * ------------------------------------------------------------------ */

// The five jobs on a team. One character each, all five always filled.
export const ROLES = [
  { k:"S", name:"Strategist",  blurb:"Reads the fight before it starts. Comes alive with a week of prep." },
  { k:"W", name:"Wildcard",    blurb:"Magic, cosmic, rules that do not apply. Deadliest when nobody saw it coming." },
  { k:"P", name:"Powerhouse",  blurb:"Hits hardest, takes the most. Worth the same either way." },
  { k:"A", name:"Anchor",      blurb:"Keeps the other four standing. Worth the same either way." },
  { k:"E", name:"Executioner", blurb:"Ends people. Villains, and heroes willing to kill." }
];
export const ROLE = Object.fromEntries(ROLES.map(r => [r.k, r]));

// One small badge icon per role, shown on the right of each row in the drag
// and drop board. Real vector icons (Game-icons.net, via react-icons' "gi"
// set), not emoji: emoji render as full-color OS glyphs and would clash with
// the hand-inked, single-color look everywhere else on the card and ledger.
export const ROLE_ICON_PATH = {
  S: "M60.81 476.91h300v-60h-300v60zm233.79-347.3l13.94 7.39c31.88-43.62 61.34-31.85 61.34-31.85l-21.62 53 35.64 19 2.87 33 64.42 108.75-43.55 29.37s-26.82-36.39-39.65-43.66c-10.66-6-41.22-10.25-56.17-12l-67.54-76.91-12 10.56 37.15 42.31c-.13.18-.25.37-.38.57-35.78 58.17 23 105.69 68.49 131.78H84.14C93 85 294.6 129.61 294.6 129.61z",
  W: "M436.406 29.625l-18.094 42.22-48.562 5.905 42.156 25.656 1.375 13.47C367.938 90.74 302.435 75.36 214.78 82.31l-20.186-3.343-24.125-38.407.5 39.78-49.22 16.438 55.063 4.564 7.843 33.78 17.094-37.78 17.906-2.75c203.993 22.03 277.475 204.75 77.875 207.625l5.22-37.595 36.75-43.72-51.344-24.968-30.22-48.468-39.623 41.124-4.125 1.03C-8.4 163.078-31.708 304.485 98.844 376.125l-11.938 12.688L39.844 374.5l33.03 39.406-15.124 42.53 36.375-31.155 47.03 18.095-30.374-43.875 4.69-15.03c62.43 28.648 153.852 42.16 270.5 20.717-241.042 33.38-364.142-137.94-219.283-195.687l23.032 43.25-4 56.97 56.218-9.97 19.25 7.813c218.255 102.608 297.46-83.917 171.843-177.75l14.376-22.22 46.47-16.5-41.907-14.812-15.564-46.655zM34.53 79.03l4.845 26.095-19.47 22 27.22-3.25 17.563 23.344.687-29.47 24.78-17.906-33.218-1.72-22.406-19.093zm358.564 298.5l14.25 51.658-31.375 41.062 49.592-12.688 33.688 34.282-2.53-51.406 35.217-30.375-51.593 1.562-47.25-34.094z",
  P: "M198.844 64.75c-.985 0-1.974.03-2.97.094-15.915 1.015-32.046 11.534-37.78 26.937-34.072 91.532-51.085 128.865-61.5 222.876 14.633 13.49 31.63 26.45 50.25 38.125l66.406-196.467 17.688 5.968L163.28 362.5c19.51 10.877 40.43 20.234 62 27.28l75.407-201.53 17.5 6.53-74.937 200.282c19.454 5.096 39.205 8.2 58.78 8.875L381.345 225.5l17.094 7.594-75.875 170.656c21.82-1.237 43.205-5.768 63.437-14.28 43.317-53.844 72.633-109.784 84.5-172.69 5.092-26.992-14.762-53.124-54.22-54.81l-6.155-.282-2.188-5.75c-8.45-22.388-19.75-30.093-31.5-32.47-11.75-2.376-25.267 1.535-35.468 7.376l-13.064 7.47-.906-15c-.99-16.396-10.343-29.597-24.313-35.626-13.97-6.03-33.064-5.232-54.812 9.906l-10.438 7.25-3.812-12.125c-6.517-20.766-20.007-27.985-34.78-27.97zM103.28 188.344C71.143 233.448 47.728 299.56 51.407 359.656c27.54 21.84 54.61 33.693 80.063 35.438 14.155.97 27.94-1.085 41.405-6.438-35.445-17.235-67.36-39.533-92.594-63.53l-3.343-3.157.5-4.595c5.794-54.638 13.946-91.5 25.844-129.03z",
  A: "M90.53 23c-18.345 0-36.688 7.002-50.686 21-27.996 27.996-27.994 73.38 0 101.375 21.776 21.776 54.08 26.603 80.53 14.5l53.69 53.688c-21.425 19.696-44 38.257-67.44 55.937l30.126 30.125c18.734-22.545 37.953-44.474 57.844-65.53l169.594 169.593c-51.845 40.444-120.866 53.838-192.813 42.562L173 424.906 72.47 404.47l95.405 88.405 1.97-26c86.593 36.97 177.603 34.61 241.343-11.75l63.062 21.313-21.47-63.594c44.61-63.62 46.408-153.412 9.908-238.875l26.03-1.97-88.406-95.375 20.438 100.53 21.344-1.624c11.278 71.983-2.168 141.017-42.656 192.876l-169.782-169.75c21.075-20.34 42.93-39.665 65.78-57.72l-30.123-30.124c-17.015 24.154-35.673 46.66-55.688 67.813l-53.97-53.97C167.834 98.183 163.032 65.814 141.22 44c-14-13.998-32.343-21-50.69-21zm0 27.03c11.434.002 22.872 4.34 31.595 13.064 17.447 17.447 17.446 45.742 0 63.187-17.446 17.447-45.71 17.447-63.156 0-17.447-17.444-17.448-45.74 0-63.186C67.69 54.37 79.097 50.03 90.53 50.03z",
  E: "M326.1 32.71C225.6 59.65 191.7 102.6 180.2 136.3l-18.9 189c-33.4 27.9-75.14 45.3-122.16 60.9l18.31 37.3 38.59-13.8 22.06 21.4-17.3 27.6 36.2 19.1 20.5-29.9 36.8 7.2-10.9 30.4 41.8 9.9 12.6-37.5 42 .4 23 32.7 42.4-3.6-15.1-32.4 35.9-9.6 23.7 28.6 47.9-19.2-35.3-27.5 25.2-17.2 30.8 9.6 15.7-33c-42.9-18.7-87-37.1-114.8-59.9l-15.8-197.4c.6-19.4-43.1-50.58-17.3-96.69zM198.5 208c6 28.1 28.7 33.1 57.5 40.9-26.5.9-43.2 15.6-57.5 0-10.7-11.5-6.3-27.8 0-40.9zm131 0c6.3 13.1 10.7 29.4 0 40.9-14.3 15.6-31 .9-57.5 0 28.8-7.8 51.5-12.8 57.5-40.9z"
};
export const roleIconHtml = k => `<svg class="rs-icon" viewBox="0 0 512 512" aria-hidden="true">`
  + `<path d="${ROLE_ICON_PATH[k]}"/></svg>`;

// A fitting role is worth a tier, an absurd one costs a tier, and the encounter
// decides whether the Strategist or the Wildcard is the one that matters.
export function roleShift(ch, role, mode){
  if (!role) return 0;
  const suits = !!(ch.fit && ch.fit.includes(role));
  let d = 0;
  if (suits) d += 1;
  if (ch.bad && ch.bad.includes(role)) d -= 1;
  // No encounter bonus. Strategist used to gain a rung in prep and Wildcard
  // one in a random encounter, which stacked with the prep climb and the role
  // fit and put too many characters on S. A role is worth one rung either way
  // now, and the encounter only decides whether the prep climb applies.
  return d;
}

// Tiers are scaled honestly across universes, never rebalanced. A weaker world
// simply sits lower: Demon Slayer tops out at B, Harry Potter at B, while Gojo,
// Sukuna and Sung Jinwoo genuinely earn S alongside Superman and Thor.
// Tier points are deliberately steep. One S has to outweigh a handful of Cs,
// otherwise a tier is just a label and the draft is decided by volume.
// S+ sits one rung above S and no character is ever printed at it - see the
// comment on effTier just below for how a character actually gets there.
export const LADDER = ["S+","S","A","B","C","D","E"];
export const POINTS = { "S+": 32, S: 16, A: 8, B: 4, C: 2, D: 1, E: 0.5 };

// A week of prep moves a character along the ladder by its own prep rating.
// Batman climbs three steps. The Hulk does not move. Superman slides down one,
// because a week is long enough for the other side to find kryptonite.
// The climb is never capped below S+ specifically: it is capped at index 0,
// same as it always was, and S+ simply became the new index 0 once LADDER
// grew a rung. A base-S character with a fitting role, prep, or both is the
// only way there - nothing below S has enough climb in it to reach past S
// itself, let alone past that.
export function effTier(ch, mode, role){
  let i = LADDER.indexOf(ch.tier);
  if (mode === "prep") i -= (ch.prep || 0);
  i -= roleShift(ch, role, mode);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];
}

export const UNIVERSES = {
  MAR: { name: "Marvel",         group: "Comics" },
  DC:  { name: "DC",             group: "Comics" },
  BOYS:{ name: "The Boys",       group: "Comics" },
  INV: { name: "Invincible",     group: "Comics" },
  NAR: { name: "Naruto",         group: "Anime"  },
  JJK: { name: "Jujutsu Kaisen", group: "Anime"  },
  DS:  { name: "Demon Slayer",   group: "Anime"  },
  BC:  { name: "Black Clover",   group: "Anime"  },
  SL:  { name: "Solo Leveling",  group: "Anime"  },
  HXH: { name: "Hunter x Hunter",group: "Anime"  },
  HP:  { name: "Harry Potter",   group: "Other"  },
  RE:  { name: "Resident Evil",  group: "Other"  },
  INF: { name: "Infamous",       group: "Other"  },
  MK:  { name: "Mortal Kombat",  group: "Other"  },
  GOT: { name: "Game of Thrones",group: "Other"  }
};

/* Where the roster lives. The key is the publishable one and is meant to
   ship in the page. It sits here rather than in each screen so the game
   and the public tier guide can never end up reading different projects. */
export const DB_URL = "https://trtccsljexjplnuhnlkz.supabase.co";
export const DB_KEY = "sb_publishable_3Yt4Gih8Ta_co31EDqy7Jw_-R5sBxMK";
