import { createMatch } from "./fight.js";
import { Backend } from "./backend.js";
import { createBot, LEVELS, LEVEL_BLURB } from "./bot.js";

// Hand written exchanges for pairs with real history. Loaded once with the
// roster; the match falls back to generic lines for anyone not in here.
let RIVALRIES = [];

/* ------------------------------------------------------------------ *
 *  STOCK, the character roster: name, universe, real name, blurb, tier,
 *  prep shift, fit roles, bad roles. Marvel & DC, A-list through mid-tier,
 *  base versions. Deliberately excludes cosmic-god tier (One-Above-All,
 *  Living Tribunal, Beyonder, Galactus, Phoenix Force, Lucifer, Spectre,
 *  Darkseid, Presence).
 *
 *  No longer hardcoded here: it is fetched from Supabase at boot by
 *  loadStock() below, and starts empty until that resolves.
 * ------------------------------------------------------------------ */
let STOCK = [];

const SLOTS = 5, PURSE = 20;

// Two or three buyers. Everything below counts seats rather than assuming a
// pair, so the third chair is a number, not a special case.
// The five jobs on a team. One character each, all five always filled.
const ROLES = [
  { k:"S", name:"Strategist",  blurb:"Reads the fight before it starts. Comes alive with a week of prep." },
  { k:"W", name:"Wildcard",    blurb:"Magic, cosmic, rules that do not apply. Deadliest when nobody saw it coming." },
  { k:"P", name:"Powerhouse",  blurb:"Hits hardest, takes the most. Worth the same either way." },
  { k:"A", name:"Anchor",      blurb:"Keeps the other four standing. Worth the same either way." },
  { k:"E", name:"Executioner", blurb:"Ends people. Villains, and heroes willing to kill." }
];
const ROLE = Object.fromEntries(ROLES.map(r => [r.k, r]));

// One small badge icon per role, shown on the right of each row in the drag
// and drop board. Real vector icons (Game-icons.net, via react-icons' "gi"
// set), not emoji: emoji render as full-color OS glyphs and would clash with
// the hand-inked, single-color look everywhere else on the card and ledger.
const ROLE_ICON_PATH = {
  S: "M60.81 476.91h300v-60h-300v60zm233.79-347.3l13.94 7.39c31.88-43.62 61.34-31.85 61.34-31.85l-21.62 53 35.64 19 2.87 33 64.42 108.75-43.55 29.37s-26.82-36.39-39.65-43.66c-10.66-6-41.22-10.25-56.17-12l-67.54-76.91-12 10.56 37.15 42.31c-.13.18-.25.37-.38.57-35.78 58.17 23 105.69 68.49 131.78H84.14C93 85 294.6 129.61 294.6 129.61z",
  W: "M436.406 29.625l-18.094 42.22-48.562 5.905 42.156 25.656 1.375 13.47C367.938 90.74 302.435 75.36 214.78 82.31l-20.186-3.343-24.125-38.407.5 39.78-49.22 16.438 55.063 4.564 7.843 33.78 17.094-37.78 17.906-2.75c203.993 22.03 277.475 204.75 77.875 207.625l5.22-37.595 36.75-43.72-51.344-24.968-30.22-48.468-39.623 41.124-4.125 1.03C-8.4 163.078-31.708 304.485 98.844 376.125l-11.938 12.688L39.844 374.5l33.03 39.406-15.124 42.53 36.375-31.155 47.03 18.095-30.374-43.875 4.69-15.03c62.43 28.648 153.852 42.16 270.5 20.717-241.042 33.38-364.142-137.94-219.283-195.687l23.032 43.25-4 56.97 56.218-9.97 19.25 7.813c218.255 102.608 297.46-83.917 171.843-177.75l14.376-22.22 46.47-16.5-41.907-14.812-15.564-46.655zM34.53 79.03l4.845 26.095-19.47 22 27.22-3.25 17.563 23.344.687-29.47 24.78-17.906-33.218-1.72-22.406-19.093zm358.564 298.5l14.25 51.658-31.375 41.062 49.592-12.688 33.688 34.282-2.53-51.406 35.217-30.375-51.593 1.562-47.25-34.094z",
  P: "M198.844 64.75c-.985 0-1.974.03-2.97.094-15.915 1.015-32.046 11.534-37.78 26.937-34.072 91.532-51.085 128.865-61.5 222.876 14.633 13.49 31.63 26.45 50.25 38.125l66.406-196.467 17.688 5.968L163.28 362.5c19.51 10.877 40.43 20.234 62 27.28l75.407-201.53 17.5 6.53-74.937 200.282c19.454 5.096 39.205 8.2 58.78 8.875L381.345 225.5l17.094 7.594-75.875 170.656c21.82-1.237 43.205-5.768 63.437-14.28 43.317-53.844 72.633-109.784 84.5-172.69 5.092-26.992-14.762-53.124-54.22-54.81l-6.155-.282-2.188-5.75c-8.45-22.388-19.75-30.093-31.5-32.47-11.75-2.376-25.267 1.535-35.468 7.376l-13.064 7.47-.906-15c-.99-16.396-10.343-29.597-24.313-35.626-13.97-6.03-33.064-5.232-54.812 9.906l-10.438 7.25-3.812-12.125c-6.517-20.766-20.007-27.985-34.78-27.97zM103.28 188.344C71.143 233.448 47.728 299.56 51.407 359.656c27.54 21.84 54.61 33.693 80.063 35.438 14.155.97 27.94-1.085 41.405-6.438-35.445-17.235-67.36-39.533-92.594-63.53l-3.343-3.157.5-4.595c5.794-54.638 13.946-91.5 25.844-129.03z",
  A: "M90.53 23c-18.345 0-36.688 7.002-50.686 21-27.996 27.996-27.994 73.38 0 101.375 21.776 21.776 54.08 26.603 80.53 14.5l53.69 53.688c-21.425 19.696-44 38.257-67.44 55.937l30.126 30.125c18.734-22.545 37.953-44.474 57.844-65.53l169.594 169.593c-51.845 40.444-120.866 53.838-192.813 42.562L173 424.906 72.47 404.47l95.405 88.405 1.97-26c86.593 36.97 177.603 34.61 241.343-11.75l63.062 21.313-21.47-63.594c44.61-63.62 46.408-153.412 9.908-238.875l26.03-1.97-88.406-95.375 20.438 100.53 21.344-1.624c11.278 71.983-2.168 141.017-42.656 192.876l-169.782-169.75c21.075-20.34 42.93-39.665 65.78-57.72l-30.123-30.124c-17.015 24.154-35.673 46.66-55.688 67.813l-53.97-53.97C167.834 98.183 163.032 65.814 141.22 44c-14-13.998-32.343-21-50.69-21zm0 27.03c11.434.002 22.872 4.34 31.595 13.064 17.447 17.447 17.446 45.742 0 63.187-17.446 17.447-45.71 17.447-63.156 0-17.447-17.444-17.448-45.74 0-63.186C67.69 54.37 79.097 50.03 90.53 50.03z",
  E: "M326.1 32.71C225.6 59.65 191.7 102.6 180.2 136.3l-18.9 189c-33.4 27.9-75.14 45.3-122.16 60.9l18.31 37.3 38.59-13.8 22.06 21.4-17.3 27.6 36.2 19.1 20.5-29.9 36.8 7.2-10.9 30.4 41.8 9.9 12.6-37.5 42 .4 23 32.7 42.4-3.6-15.1-32.4 35.9-9.6 23.7 28.6 47.9-19.2-35.3-27.5 25.2-17.2 30.8 9.6 15.7-33c-42.9-18.7-87-37.1-114.8-59.9l-15.8-197.4c.6-19.4-43.1-50.58-17.3-96.69zM198.5 208c6 28.1 28.7 33.1 57.5 40.9-26.5.9-43.2 15.6-57.5 0-10.7-11.5-6.3-27.8 0-40.9zm131 0c6.3 13.1 10.7 29.4 0 40.9-14.3 15.6-31 .9-57.5 0 28.8-7.8 51.5-12.8 57.5-40.9z"
};
const roleIconHtml = k => `<svg class="rs-icon" viewBox="0 0 512 512" aria-hidden="true">`
  + `<path d="${ROLE_ICON_PATH[k]}"/></svg>`;

// A fitting role is worth a tier, an absurd one costs a tier, and the encounter
// decides whether the Strategist or the Wildcard is the one that matters.
function roleShift(ch, role, mode){
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

const SEATS = [
  { key: "red",   pencil: "Red pencil"   },
  { key: "blue",  pencil: "Blue pencil"  },
  { key: "green", pencil: "Green pencil" }
];
let NP = 2;
const seats  = () => Array.from({ length: NP }, (_, i) => i);
const rivals = p => seats().filter(q => q !== p);
const nameList = ps => ps.map(q => P[q].name).join(" and ");

const UNIVERSES = {
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
  MK:  { name: "Mortal Kombat",  group: "Other"  }
};

// Tiers are scaled honestly across universes, never rebalanced. A weaker world
// simply sits lower: Demon Slayer tops out at B, Harry Potter at B, while Gojo,
// Sukuna and Sung Jinwoo genuinely earn S alongside Superman and Thor.
// Tier points are deliberately steep. One S has to outweigh a handful of Cs,
// otherwise a tier is just a label and the draft is decided by volume.
// S+ sits one rung above S and no character is ever printed at it - see the
// comment on effTier just below for how a character actually gets there.
const LADDER = ["S+","S","A","B","C","D","E"];
const POINTS = { "S+": 32, S: 16, A: 8, B: 4, C: 2, D: 1, E: 0.5 };

// One material per tier for the round reveal, in place of the plain "Tier A"
// text it used to print: a struck medallion, the tier letter engraved in
// the middle, one consistent badge design recoloured through six real
// materials, S+ at prism down to D at wood, rather than different shapes
// per tier. E has no material of its own in the brief, so it shares wood
// with D, the bottom of the ladder either way. S+ is never a character's
// printed tier - only prep, role fit, or both can push a card up into it -
// so prism is a boost's own material, not one any card is born with.
const TIER_MATERIAL = { "S+":"prism", S:"diamond", A:"gold", B:"silver", C:"bronze", D:"wood", E:"wood" };
// Three stops each: a bright hit, the material's own colour, then a shadow
// side, so the flat SVG fill reads as brushed metal (or grain, for wood)
// rather than a solid colour swatch. Prism breaks that pattern on purpose -
// four stops sweeping through a full spectrum rather than one hue shaded
// light to dark, since it has to read as "beyond diamond" at a glance
// rather than just another blue.
const TIER_MATERIAL_STOPS = {
  wood:    ["#d3ac78", "#8a5a34", "#4d3018"],
  bronze:  ["#e7a06a", "#a35c22", "#5e340f"],
  silver:  ["#f5f7f9", "#aab2ba", "#666e75"],
  gold:    ["#fbe28a", "#c99a2e", "#7a5a12"],
  diamond: ["#ffffff", "#8fd8f5", "#3f8fb8"],
  prism:   ["#ffe6fb", "#c88bff", "#5b8dff", "#3f3f8f"]
};
let tierIconSeq = 0;
const tierIconHtml = tier => {
  const mat = TIER_MATERIAL[tier] || "wood";
  const stops = TIER_MATERIAL_STOPS[mat];
  // A fresh gradient id per icon: many fighters can share a tier in the
  // same round, and an id reused across sibling <svg> elements is invalid,
  // even though every browser tested happens to render it fine anyway.
  const gid = `tg${++tierIconSeq}`;
  // Stops spread evenly regardless of count, so prism's four-stop spectrum
  // and everyone else's three-stop shade both just work off the same loop.
  const stopTags = stops.map((c, i) =>
    `<stop offset="${Math.round(i / (stops.length - 1) * 100)}%" stop-color="${c}"/>`).join("");
  // S+ is two characters, not one: a smaller font than the rest keeps it
  // inside the same medallion without crowding the ring.
  const fontSize = tier && tier.length > 1 ? 16 : 23;
  return `<svg class="tier-icon tier-icon-${mat}" viewBox="0 0 48 48" role="img" aria-label="Tier ${tier || "?"}">`
    + `<title>Tier ${tier || "?"}</title>`
    + `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">${stopTags}</linearGradient></defs>`
    + `<circle cx="24" cy="24" r="21" fill="none" stroke="url(#${gid})" stroke-width="4"/>`
    + `<circle cx="24" cy="24" r="15.5" fill="none" stroke="url(#${gid})" stroke-width="1.4" opacity=".65"/>`
    + `<text x="24" y="25" text-anchor="middle" dominant-baseline="central" `
    + `font-family="var(--slab)" font-weight="900" font-size="${fontSize}" fill="url(#${gid})" `
    + `stroke="var(--ink)" stroke-width="0.6" paint-order="stroke">${escTxt(tier || "?")}</text>`
    + `</svg>`;
};


// A week of prep moves a character along the ladder by its own prep rating.
// Batman climbs three steps. The Hulk does not move. Superman slides down one,
// because a week is long enough for the other side to find kryptonite.
// The climb is never capped below S+ specifically: it is capped at index 0,
// same as it always was, and S+ simply became the new index 0 once LADDER
// grew a rung. A base-S character with a fitting role, prep, or both is the
// only way there - nothing below S has enough climb in it to reach past S
// itself, let alone past that.
function effTier(ch, mode, role){
  let i = LADDER.indexOf(ch.tier);
  if (mode === "prep") i -= (ch.prep || 0);
  i -= roleShift(ch, role, mode);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];
}
const teamScore = (roster, mode) =>
  roster.reduce((n, r) => n + (POINTS[effTier(r.char, mode, r.role)] || 0), 0);

// Binding, with a close-call window: a clear lead decides the fight, a narrow
// one leaves it to tactics so a near-even draft still gets a real story.
const CLOSE = 0.20;
function verdict(mode){
  const scores = seats().map(p => teamScore(P[p].roster, mode));
  const top = Math.max(...scores), hi = top || 1;
  const lead = scores.indexOf(top);
  const rest = scores.filter((_, i) => i !== lead);
  const gap = (top - Math.max(...rest)) / hi;      // only the nearest rival matters
  return { scores, gap, close: gap <= CLOSE, winner: gap <= CLOSE ? null : lead };
}

// Lots dealt per sale. Deliberately tight: at ten per buyer half the box went
// unsold, so passing on a mid tier cost nothing and the compulsory rule handed
// out filler at a dollar at the end. Anyone could ignore every B and C, spend
// the purse on one monster and still fill a roster. Fifteen for two buyers
// leaves five spare across the table, twenty five for three leaves ten.
const perSale = () => NP === 3 ? 25 : 15;

// After any bid the table freezes for a beat so everyone sees it land before
// the next one goes in. Without this the fastest connection wins every
// contested lot, which is lag rather than nerve.
const ACK_MS = 1600;
let lockTill = 0;                 // local clock: when this screen may bid again
const locked = () => Date.now() < lockTill;

// A live bid puts the rival on the clock: 8 seconds to answer (outbid, or
// pass and hand it over) before the lot sells itself to whoever is
// standing. The last 3 of those seconds get the 3-2-1 countdown on the
// card. Purely a pacing device, same spirit as ACK_MS above, just longer
// and rendered rather than just felt.
const BID_TIMER_MS = 8000;
const BID_URGENT_MS = 3000;
let bidDeadlineLocal = 0;         // local clock: when the standing bid auto-sells
let bidTimerShown = 0;            // last countdown digit painted, so repaints don't restart the pop

// What is in the box. The host owns this and it travels to the joiner.
let BOX = { u: ["MAR","DC"], tiers: false };
// Set the moment a player actually clicks a universe chip themselves -
// see paintBox()'s click handler. Checked before ever applying a signed-
// in player's saved favorite_universes, so a real choice they've already
// made (even accidentally, even before the profile fetch resolves) is
// never silently overwritten by a preference set in some earlier session.
let boxTouchedByUser = false;

/* ---------------------------- solo play ---------------------------- */
// A game against the computer is the same game with nobody on the other end
// of the wire. The human is still the host and still owns every rule; the
// other chairs are simply filled by decisions made in bot.js instead of by
// messages arriving from another browser. connect() is never called, which
// leaves chan undefined, which makes send() the no-op it already guards for.
let SOLO = false;
let BOT_LEVEL = "medium";
let BOTS = {};              // seat -> bot instance, host only
let botBusy = false;        // one scheduled bot action at a time

const MIN_BOX = () => perSale();   // one full sale
const inBox = c => BOX.u.includes(c[1]);
const boxCount = () => STOCK.filter(inBox).length;

const $ = id => document.getElementById(id);
const money = n => "$" + n;

let P, deck, lot, lotNum, over, deckLeft = 0;

/* ==================================================================
 *  DATA + NETWORK
 *  One Supabase project now does both jobs. Read-only REST calls pull the
 *  roster/art/rivalries at boot (see loadStock() below); the same project's
 *  Realtime broadcast+presence is what syncs bids/picks/state between the
 *  two browsers once a table is open - no tables involved in that part,
 *  nothing stored, just messages passed through.
 *  The player who opens the table is authoritative: they hold the deck,
 *  apply every rule, and publish the whole state. The joiner sends
 *  intents ("I bid 4") and renders whatever comes back. One referee
 *  means a simultaneous click can never sell the same issue twice.
 * ================================================================== */
// This key is meant to be public and cannot be hidden: the browser itself
// has to open the socket and issue the REST reads, so anything it needs, a
// reader can see. This is a PUBLISHABLE key, which is why that is fine - it
// grants nothing except reading `characters`/`rivalries` and joining
// broadcast channels. Keep it that way: no writable tables in this project,
// and if you ever add one, turn on row level security. Secrets that must
// stay secret (the LLM key) live in Vercel environment variables and are
// read only by api/scenario.mjs on the server, never here.
// The full roster (names, universes, tiers, prep shifts, roles, blurbs) AND
// the artwork both live in one `characters` table in Arul's Supabase project,
// read only. It used to be split, STOCK hardcoded here and only images
// fetched remotely, but the table now carries everything, so one request at
// boot fills both STOCK and ART together. See loadStock() below.
// NOTE: Realtime must be switched on for this project in the Supabase
// dashboard (Project Settings → Realtime, or Database → Replication,
// depending on plan/version) or connect() below will fail to open a
// channel even though the REST reads keep working fine.
const ART_URL = "https://trtccsljexjplnuhnlkz.supabase.co";
const ART_KEY = "sb_publishable_3Yt4Gih8Ta_co31EDqy7Jw_-R5sBxMK";
const ART = new Map();

// Anything here wins over the database. Arul's importer pulls from Comic Vine,
// which is a comics archive, so it has nothing for the anime rosters or for
// Harry Potter. Paste a direct image URL against a name to fill a gap without
// waiting on his pipeline.
const ART_EXTRA = {
  // "Sung Jinwoo": "https://…/jinwoo.jpg",
};

// Fetches the whole roster and its artwork in a single request and fills in
// STOCK (still the same 8-column shape everything else here expects: name,
// universe, real name, blurb, tier, prep shift, fit roles, bad roles) and
// ART (name -> image url). Unlike a missing picture, a missing roster is
// fatal to the game, so the Open/Join buttons stay disabled until this
// either succeeds or gives up.
async function loadStock(){
  $("openBox").disabled = true;
  $("joinBtn").disabled = true;
  $("setupMsg").textContent = "Loading the roster…";
  try {
    // Ask for everything, but do not let one missing column take the game down.
    // A schema change mid-session used to 400 the whole request and leave the
    // setup screen dead; now the optional columns drop out one at a time and
    // the sale still runs, just without whatever that column fed.
    const CORE = "name,universe,real_name,tier,fit_roles,bad_roles,image_url";
    const OPTIONAL = ["prep_shift", "blurb", "lines"];
    const ask = cols => fetch(
      ART_URL + "/rest/v1/characters?select=" + cols + "&universe=not.is.null",
      { headers: { apikey: ART_KEY, Authorization: "Bearer " + ART_KEY } });

    let have = OPTIONAL.slice(), r = await ask([CORE, ...have].join(","));
    while (!r.ok && have.length){
      const missing = have.find(c => String(r.statusText).includes(c)) ||
                      (await r.clone().text().then(t => have.find(c => t.includes(c))).catch(() => null));
      if (!missing) break;
      have = have.filter(c => c !== missing);
      r = await ask([CORE, ...have].join(","));
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const rows = await r.json();
    if (!rows.length) throw new Error("empty roster");

    STOCK = rows.map(row => [
      row.name, row.universe, row.real_name, row.blurb || "",
      row.tier, row.prep_shift || 0, row.fit_roles || "", row.bad_roles || "",
      row.lines || null
    ]);

    // Rivalries are optional. A failure here costs flavour, not the game.
    try {
      const rv = await fetch(ART_URL + "/rest/v1/rivalries?select=a,b,kind,lines",
        { headers: { apikey: ART_KEY, Authorization: "Bearer " + ART_KEY } });
      if (rv.ok) RIVALRIES = await rv.json();
    } catch {}
    for (const row of rows) if (row.image_url) ART.set(row.name, row.image_url);
    for (const [n, u] of Object.entries(ART_EXTRA)) if (u) ART.set(n, u);

    $("setupMsg").textContent = "";
    $("openBox").disabled = false;
    $("joinBtn").disabled = false;
  } catch (e){
    // No roster, no game. Say so plainly rather than letting Open/Join fail
    // silently against an empty STOCK.
    $("setupMsg").textContent =
      "Could not load the character roster. Check your connection and refresh.";
  }
  $("stockCount").textContent = STOCK.length + " Characters";
  refreshSetupBox();
  if (lot) renderLot();                        // roster/art arrived after the first card
}

const SAVE_KEY = "longbox.table";
// Separate key for real multiplayer tables: pushState()'s own save (above)
// only ever writes P/lot/deck straight from this browser's memory, which
// is correct for SOLO (nothing else was ever the source of truth there)
// but was never wired up for real games at all - a host reload had no
// table_id to reconnect to, and reconstructed a completely local, stale
// copy of state that had no connection to the real database. This key
// holds only what's needed to reconnect properly: the real table_id, so
// a reload just re-runs backend.connect() and lets the actual current
// state arrive fresh, same as opening the page for the first time would.
const MP_SAVE_KEY = "longbox.mp";
// A browser keeps one id so that reconnecting returns you to your own seat
// rather than handing you someone else's roster.
const CID = (() => {
  const read = s => { try { return s.getItem("superdrafts.cid"); } catch { return null; } };
  const write = (s, v) => { try { s.setItem("superdrafts.cid", v); } catch {} };
  // sessionStorage survives a reload even in private browsing, where
  // localStorage is often empty or unwritable. Try both, write to both.
  let v = read(localStorage) || read(sessionStorage);
  if (!v) v = Math.random().toString(36).slice(2, 10);
  write(localStorage, v); write(sessionStorage, v);
  return v;
})();
let seatedAck = false;                 // guest: the host has given us a chair
const knocks = new Map();              // host: who is at the door

let heardBids = 0, heardFolds = 0;
let sb, chan, ROOM = "", ME = 0, HOST = false, started = false, peerOn = false,
    fxSeq = 0, lastFx = 0, drawnLot = -1;
// Stage B: backend is the real authority for bidding once a multiplayer
// table exists in the database. null in solo mode, where there's nobody
// else to cheat against and no reason to pay a network round trip.
let backend = null, TABLE_ID = null;

const code4 = () => Array.from({length:4}, () =>
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");

const myName = () => {
  const n = ($("myName").value || "").trim().slice(0,14);
  if (n) try { localStorage.setItem("longbox.name", n); } catch {}
  return n;
};

// Everyone except you, named once their names have arrived.
function peerLabel(){
  if (!P) return "connected";
  const names = rivals(ME).map(q => P[q] && P[q].name).filter(n => n && n !== "…");
  return names.length ? names.join(", ") + " connected" : "connected";
}

function setWire(on, text){
  peerOn = on;
  $("wire").classList.toggle("off", !on);
  $("wireText").textContent = text;
}

async function connect(){
  if (!window.supabase) throw new Error("offline");
  sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
  // Do not leave an older room channel alive when reconnecting in this tab.
  if (chan) { try { await sb.removeChannel(chan); } catch {} chan = null; }
  chan = sb.channel("longbox-" + ROOM,
    { config: { broadcast: { self: false }, presence: { key: CID } } });

  chan.on("broadcast", { event: "msg" }, ({ payload }) => handle(payload));
  chan.on("presence", { event: "sync" }, () => {
    const others = Object.values(chan.presenceState()).flat().filter(x => x.me !== ME);
    if (others.length) setWire(true, peerLabel());
    else setWire(false, started ? "a buyer dropped, they can rejoin" : "waiting…");
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), 12000);
    chan.subscribe(status => {
      if (status === "SUBSCRIBED"){ clearTimeout(t); chan.track({ me: ME, cid: CID }); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT"){ clearTimeout(t); reject(new Error(status)); }
    });
  });
}

const send = payload => chan && chan.send({ type: "broadcast", event: "msg", payload });

function handle(m){
  // Somebody following the link asks first. A cid we already seated is a
  // reconnect and walks straight back in, so a dropped phone is never stuck
  // waiting on the host to notice. Checked against the real backend-sourced
  // P array now, not the seatOf map - that map is never populated anymore
  // (Stage B moved real seat assignment to join-table), so this check was
  // silently dead: every reconnect used to sit through the full knock/admit
  // wait again, even for a cid that already genuinely had a seat.
  if (m.t === "knock" && HOST){
    const already = backend && backend.tableId ? P.findIndex(p => p.cid === m.cid) : -1;
    if (already > 0){ send({ t: "seat", cid: m.cid, seat: already, np: NP, table_id: TABLE_ID }); return; }
    knocks.set(m.cid, { name: (m.name || "Someone").slice(0, 14), at: Date.now(), userId: m.user_id || null });
    paintPending();
    send({ t: "knocked", cid: m.cid });
    return;
  }

  if (m.t === "knocked" && !HOST && m.cid === CID){
    $("knockMsg").hidden = false;
    $("knockMsg").textContent = "Asked. Waiting for the host to let you in.";
  }
  if (m.t === "refused" && !HOST && m.cid === CID){
    $("knockMsg").hidden = false;
    $("knockMsg").textContent = "The host did not let you in.";
    $("knockAsk").hidden = false;
  }
  if (m.t === "seat" && !HOST && m.cid === CID){ onSeated(m); }
  if (m.t === "full" && !HOST && m.cid === CID){
    nudge("That table is full. Three buyers is the limit.");
  }
  // The old "roles" broadcast handler that used to live here is gone -
  // lockRoles() now calls backend.lockRoles() directly for multiplayer
  // (see that function's own comment), which validates and persists the
  // real lock server-side instead of the host's browser blindly trusting
  // whatever a guest broadcast. Nothing sends {t:"roles",...} anymore.
  if (m.t === "state" && !HOST) applyState(m.s);
  // The story is written once, by the host, and every beat is shared, so all
  // of them read the same issue and see the same choices.
  if (m.t === "st" && !HOST){
    // A null st is the host's explicit "that match is over, forget it"
    // signal (see the again-button handler). Route it through the same
    // resetMatchState() the host uses, or only ST itself clears here while
    // this browser's own MATCH/revealedRound/shownSig/etc keep the last
    // game's data, which is what let an already-fought character in the
    // last game keep reading as "already used" in the next one.
    if (!m.st){ resetMatchState(); stPaint(); }
    else {
      // Rebuild from the same seed so the guest can render its own hand and
      // stay in step without ever being told the other side's picks.
      if (!MATCH || !ST || ST.seed !== m.st.seed){
        ST = m.st; try { buildMatch(); } catch {}
      } ST = m.st; stPaint();
    }
  }
  // Same dead-seatOf bug as the "roles" handler above: seatOf[m.cid]
  // is never populated anymore, so these two checks always failed -
  // a guest's fight-pick never reached the host (the fight would just
  // hang forever waiting on a pick that never arrived), and if a GUEST
  // happened to be whoever kept the most money, they could never
  // actually start the fight at all. Both now validate against the
  // seat the message itself claims (m.p), the same pattern as "roles".
  if (m.t === "pick" && HOST && m.p > 0 && m.p < NP && typeof m.name === "string")
    takePick(P[m.p].name, m.name);
  if (m.t === "startstory" && HOST && m.p === caller()
      && (!ST || ST.end || ST.err) && modeLeft(m.mode)) startStory(m.mode);
  if (m.t === "closed" && !HOST){
    setWire(false, "table closed");
    $("setupMsg").textContent = "The host closed the table.";
    showScreen("setup");
    try { localStorage.removeItem(MP_SAVE_KEY); } catch {}
  }
}

function snapshot(fx){
  const lockLeft = lot && lot.lockUntil ? Math.max(0, lot.lockUntil - Date.now()) : 0;
  const bidLeft = lot && lot.bidDeadline ? Math.max(0, lot.bidDeadline - Date.now()) : 0;
  return { P, lot, lotNum, over, box: BOX, np: NP, lockLeft, bidLeft,
           deckLeft: deck ? deck.length : 0, fx: fx || null };
}

function pushState(fx){
  const s = snapshot(fx);
  send({ t: "state", s });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ROOM, deck, ...s })); } catch {}
  applyState(s, true);
  if (SOLO) botTick();
}

// Client-driven timeout resolution, restoring the original instant feel.
// The lazy-check inside place-bid only fires when someone actually takes
// an action - if both players just watch the clock hit zero without
// clicking anything, nothing triggers it, leaving cron's 1-minute
// backstop as the only thing that would eventually close it. This
// schedules a real setTimeout for the exact moment the CURRENT lot's own
// deadline arrives (only rescheduling when the deadline actually
// changes, not on every snapshot), and fires backend.closeLot() right
// then - close-lot re-validates everything server-side itself, so this
// is safe even though any connected client can trigger it.
let __closeLotDeadline = 0;
let timeoutResultPreview = null;
// A tiny scheduling cushion prevents the request landing a few milliseconds
// before the recorded deadline while keeping settlement visually immediate.
const CLIENT_GRACE_MS = 25;
function scheduleCloseLot(s){
  if (!backend || !s.lot || s.lot.sold || !s.lot.bidDeadline) return;
  if (s.lot.bidDeadline === __closeLotDeadline) return;   // already scheduled for this exact deadline
  __closeLotDeadline = s.lot.bidDeadline;
  clearTimeout(window.__closeLotTimer);
  const wait = Math.max(0, s.lot.bidDeadline - Date.now()) + CLIENT_GRACE_MS;
  window.__closeLotTimer = setTimeout(() => {
    previewTimeoutResult(s.lotNum);
    backend.closeLot().catch(() => {});
  }, wait);
}

// Show the result implied by the last confirmed lot at the exact visual
// deadline. The server remains authoritative and corrects any rare mismatch.
function previewTimeoutResult(expectedLotNum){
  if (!lot || lot.sold || lotNum !== expectedLotNum) return;
  let word, line, tone;
  if (lot.high !== null){
    word = "Sold";
    line = `${lot.char.name} to seat ${lot.high} for ${money(lot.price)}`;
    tone = lot.high === 0 ? "red" : "blue";
  } else {
    const ob = obliged();
    if (ob !== null){
      word = "Sold";
      line = `${lot.char.name} to seat ${ob} for $1`;
      tone = ob === 0 ? "red" : "blue";
    } else {
      const soloSeat = seats().find(inPlay);
      const cost = soloSeat !== undefined ? passCost(soloSeat) : 0;
      word = "Passed";
      line = `${lot.char.name}, nobody wanted it` + (cost ? `, ${money(cost)} to walk away` : "");
      tone = "grey";
    }
  }
  timeoutResultPreview = { lotNum, word, line };
  stamp(word, line, tone, true);
  word === "Sold" ? SFX.sold() : SFX.passedIn();
}
function applyState(s, local){
  if (!s || !s.lot) return;          // nothing to draw before the sale opens
  scheduleCloseLot(s);
  // Track what is actually on the cover. The host mutates lotNum before it
  // publishes, so comparing state-to-state would never see the change.
  const lotChanged = drawnLot !== s.lotNum;
  // Roles are still local-only, unsynced state (never written to the
  // database - Stage B deliberately left the whole roles/face-off system
  // on the old broadcast/drag mechanism). But s.P itself now comes from
  // the real backend, not a potentially-stale host broadcast the way it
  // did pre-migration - so the roster's actual CONTENTS (which
  // characters, purse) are always authoritative and should always be
  // adopted. Discarding the whole incoming P[q] for any unlocked seat
  // (the old version here) also silently discarded genuine roster
  // updates along with it - e.g. the auction's very last lot resolving
  // right as the screen transitioned to face-off left that purchase
  // invisible on screen until the seat locked roles or the page was
  // refreshed, even though the database had it correctly the whole time.
  //
  // incoming.locked has two genuinely different meanings depending on
  // which system this snapshot came from, and there is no way to tell
  // which one a given call is from here: the OLD broadcast system sets
  // it correctly and authoritatively (a real "this seat just locked"
  // signal, built from snapshot()'s own P). backend.js's own polling
  // sets it from seats.locked, a completely unrelated database column
  // that the roles system never touches at all - always false. A first
  // attempt at this fix always adopted incoming.locked wholesale, which
  // meant the very next 3-second poll (backend-sourced, locked always
  // false) silently reverted anyone's just-set local lock back to
  // false - "Lock the Roles" appeared to do nothing at all. When
  // incoming genuinely says locked, trust it fully (that only ever
  // happens for a real broadcast-sourced confirmation). Otherwise, merge
  // in the real roster contents but keep local role assignments AND
  // local locked status - a false from backend.js's irrelevant column
  // must never be allowed to stomp a lock that already happened.
  P = (local || !P || !s.over) ? s.P
    : s.P.map((incoming, q) => {
        if (incoming.locked) return incoming;
        const prevRoster = (P[q] && P[q].roster) || [];
        const roster = (incoming.roster || []).map(r => {
          const prev = prevRoster.find(pr => pr.char.name === r.char.name);
          return prev && prev.role ? { ...r, role: prev.role } : r;
        });
        const locked = (P[q] && P[q].locked) || false;
        return { ...incoming, roster, locked };
      });
  lot = resolveLotForDisplay(s.lot); lotNum = s.lotNum; over = s.over; deckLeft = s.deckLeft;
  if (s.box) BOX = s.box;
  if (s.np) NP = s.np;
  // Held a little longer than the host, so our buttons never unlock early and
  // fire a bid the host is still going to refuse.
  lockTill = s.lockLeft ? Date.now() + s.lockLeft + 200 : 0;
  clearTimeout(window.__lockTimer);
  if (s.lockLeft) window.__lockTimer =
    setTimeout(() => { if (lot && !over) render(); }, s.lockLeft + 250);
  // Uses the real, absolute deadline straight from the database now,
  // not a recomputed Date.now()+bidLeft. That relative approach made
  // sense in the old host-broadcast architecture (no shared, absolute
  // timestamp existed to compare against), but now that backend.js
  // provides lot.bidDeadline as a real timestamp, recomputing it fresh
  // on every single snapshot - including every routine 3-second poll,
  // whether or not the deadline actually changed - introduced exactly
  // the kind of accumulating drift that caused several other bugs
  // today: each recomputation combines a slightly-delayed bidLeft
  // value with a freshly-read Date.now(), which can systematically
  // shift the PERCEIVED deadline earlier or later depending on network
  // timing, however small. Using the absolute value directly means the
  // countdown is fixed and correct the moment a lot opens, and never
  // drifts no matter how many redundant snapshots arrive in between -
  // it only ever changes when the real deadline genuinely does (a bid
  // extending it, or a new lot).
  bidDeadlineLocal = (s.lot && s.lot.bidDeadline) || 0;
  if (!local) started = true;
  if (over){
    showFaceoff();
    if (timeoutResultPreview){
      timeoutResultPreview = null;
      releaseStamp(100);
    }
    return;
  }
  // A fresh sale is starting: over just flipped back to false, which only
  // happens right after a deal, never mid-match. Any ST left over from the
  // match that just finished is stale on THIS browser the moment that
  // happens - normally the again-button handler's own send() already
  // cleared it everywhere, this is just the fallback for a dropped message
  // or a guest that reconnects mid-transition, so a repeated character name
  // in the new deal never reads as "already sent" from the old match.
  if (ST) resetMatchState();
  // Same in-flight-poll race the host's own click handler guards against
  // (see suppressMatchSnapshotUntil's declaration), applied here so the
  // GUEST side is covered too: a guest never clicks "Run it again"
  // themselves, they only learn a fresh sale started once a real
  // snapshot shows over===false, right here. Their own poll can just as
  // easily be in flight at that exact moment, carrying pre-restart
  // matches data that would otherwise land right after this reset and
  // briefly repopulate ST from the old, finished match on their screen too.
  suppressMatchSnapshotUntil = Date.now() + 2000;
  // The foSides/roleBox clearing that used to live here is gone now that
  // restart-table writes everything in one atomic transaction (see its
  // own migration comment) - there is no longer an intermediate, half-
  // emptied server state for a client to ever observe in the first
  // place, so clearing these here would have been the ONLY remaining
  // source of a visible "nothing assigned" flash, not a fix for one.
  // The real data now genuinely stays unchanged, right up until the
  // whole restart commits together and this screen gets replaced by the
  // new auction outright.
  // Re-arm the face-off "finish" sound for the NEXT time we get there.
  // This runs on every applyState() call while genuinely mid-auction, not
  // just once - which is exactly what's needed, since it means the flag
  // resets no matter how the new sale started (a fresh connect, or the
  // restart-table flow), rather than only being reset at specific
  // hand-picked call sites that are easy to miss or lose track of.
  faceoffSoundPlayed = false;
  if (peerOn) setWire(true, peerLabel());          // names arrive after presence

  // Sound is driven off state transitions rather than off clicks, so both
  // screens hear the same beat at the same point in the sale.
  const bidsNow = (s.lot.history || []).length;
  const foldsNow = (s.lot.passed || []).filter(Boolean).length;
  {
    if (lotChanged) SFX.pull();
    else if (bidsNow > heardBids) SFX.bid();
    else if (foldsNow > heardFolds && !s.lot.sold) SFX.pass();
  }
  heardBids = lotChanged ? 0 : bidsNow;
  heardFolds = lotChanged ? 0 : foldsNow;

  if (over) paintRoles();
  // If this snapshot is swapping to a genuinely different lot WHILE an
  // earlier stamp is still showing on screen, defer the entire visual
  // repaint until that stamp actually finishes. #stampLayer is a
  // separate overlay, not part of the card itself - renderLot() used to
  // swap the card's content out from under a still-visible stamp with no
  // coordination between them at all, so for whatever was left of its
  // 1.1s, the "Passed"/"Sold" stamp ended up sitting on top of the
  // BRAND NEW card instead of the one it was actually announcing. How
  // often that happened depended purely on how fast the next lot arrived
  // relative to the stamp's remaining display time - sometimes it
  // finished first (looked fine), sometimes it didn't (looked like a bug
  // on the wrong card, because it was).
  const doVisualUpdate = () => {
    if (lotChanged){ drawnLot = s.lotNum; renderLot(); }
    render();
    // Only reveal the screen once the card is actually fully painted above -
    // showScreen used to run before renderLot()/render(), which meant the
    // empty card shape (or, before that fix, leftover placeholder HTML) was
    // visible for a frame before real data ever landed in it. Order this
    // last, not first.
    showScreen("auction");
    // fitName() (inside renderLot(), called above) bails out early if the
    // card isn't visible yet - clientWidth/clientHeight both read 0 on a
    // hidden element - which is exactly the state renderLot() ran in a
    // moment ago, now that showScreen() runs after it instead of before.
    // One more pass, now that the screen is actually visible, catches any
    // long name that needed shrinking to fit.
    if (lotChanged) fitName();
    if (s.fx && s.fx.id !== lastFx){
      lastFx = s.fx.id;
      const alreadyPreviewed = timeoutResultPreview &&
        timeoutResultPreview.lotNum === s.lotNum &&
        timeoutResultPreview.word === s.fx.word &&
        timeoutResultPreview.line === s.fx.line;
      if (!alreadyPreviewed){
        timeoutResultPreview = null;
        stamp(s.fx.word, s.fx.line, s.fx.tone);
        s.fx.word === "Sold" ? SFX.sold() : SFX.passedIn();
      }
    }
  };
  const nextLotAfterPreview = lotChanged && timeoutResultPreview &&
    s.lotNum !== timeoutResultPreview.lotNum;
  if (nextLotAfterPreview){
    // Paint the confirmed next card behind the still-visible result, then
    // remove the overlay. There is never an uncovered old-card frame.
    doVisualUpdate();
    timeoutResultPreview = null;
    releaseStamp(100);
  } else if (lotChanged && Date.now() < stampHideAt){
    clearTimeout(window.__stampDeferredRender);
    window.__stampDeferredRender = setTimeout(doVisualUpdate, stampHideAt - Date.now() + 20);
  } else {
    doVisualUpdate();
  }
}

/* An action either runs here (host) or travels to the referee (guest). */
// Stage B fix: once backend exists, every browser - host or guest - has
// its own Backend instance carrying its OWN cid, and place-bid checks
// that cid against the seat being acted for. So each side now calls
// bid()/pass() directly with its own ME, rather than a guest relaying
// through the host (which would have sent the bid under the HOST's cid,
// and place-bid would rightly reject it as someone acting for a seat
// they don't own). The old broadcast-relay path only remains as a
// fallback for the moment right after connect() but before backend has
// finished attaching - in practice this shouldn't fire once Stage B's
// flows above are in place, kept only so a slow connection doesn't throw
// on nothing to call.
// bid()/pass() already branch internally on SOLO/backend (see their own
// definitions), so act() itself needs no branching of its own anymore -
// this used to also fall back to a broadcast relay for guests without a
// backend yet, but that path was never actually reachable: backend is
// always set by the time the auction screen (the only place act() is
// ever called from) becomes visible, in solo or multiplayer alike.
function act(kind, amount){
  return kind === "bid" ? bid(ME, amount) : pass(ME);
}

function showScreen(which){
  for (const id of ["gate","profile","leaderboard","setup","knock","lobby","auction","faceoff"]) $(id).hidden = (id !== which);
}

/* ------------------------- the box picker ------------------------- */
// Rendered in two places: the setup screen, and the face-off so the host can
// swap universes in or out before running it again.
function paintBox(chipsEl, countEl, onChange){
  chipsEl.innerHTML = "";
  let group = "";
  for (const [code, u] of Object.entries(UNIVERSES)){
    // A world with nobody in it yet is not a choice, it is a dead chip reading
    // zero. Skipping it lets a universe be declared here before its characters
    // exist: the chip appears by itself the moment the first one lands, with
    // no second deploy. Hunter x Hunter and Mortal Kombat are both waiting on
    // exactly that.
    if (!STOCK.some(c => c[1] === code)) continue;
    if (u.group !== group){
      group = u.group;
      const h = document.createElement("span");
      h.className = "chip-group"; h.textContent = group;
      chipsEl.appendChild(h);
    }
    const on = BOX.u.includes(code);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (on ? " on" : "");
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.innerHTML = `<span class="chip-name"></span><span class="chip-n"></span>`;
    b.querySelector(".chip-name").textContent = u.name;
    b.querySelector(".chip-n").textContent =
      STOCK.filter(c => c[1] === code).length;
    b.addEventListener("click", () => {
      boxTouchedByUser = true;
      BOX.u = on ? BOX.u.filter(x => x !== code) : BOX.u.concat(code);
      if (!BOX.u.length) BOX.u = [code];              // never empty the box
      onChange();
    });
    chipsEl.appendChild(b);
  }

  const n = boxCount();
  countEl.textContent = n < MIN_BOX()
    ? `Only ${n} characters match. A ${NP}-buyer sale needs ${MIN_BOX()}, so widen the box.`
    : `${n} to draw from. ${perSale()} come out each sale.`;
  countEl.classList.toggle("thin", n < MIN_BOX());
  return n;
}

const boxSummary = () =>
  BOX.u.map(c => UNIVERSES[c].name).join(", ") + (BOX.tiers ? "" : " · tiers hidden");

function refreshFoBox(){
  paintBox($("foChips"), $("foCount"), refreshFoBox);
  $("againBtn").disabled = boxCount() < MIN_BOX();
}

function paintNP(){
  const row = $("npRow");
  row.innerHTML = "";
  for (const n of [2, 3]){
    const on = NP === n;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "band" + (on ? " on" : "");
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.innerHTML = `<b></b><em></em>`;
    b.querySelector("b").textContent = n === 2 ? "Two buyers" : "Three buyers";
    const lots = n === 3 ? 25 : 15;
    b.querySelector("em").textContent = n === 2
      ? `Head to head. ${lots} lots, five each.`
      : `Free for all, five against five against five. ${lots} lots.`;
    b.addEventListener("click", () => { NP = n; refreshSetupBox(); });
    row.appendChild(b);
  }
  paintBotRow();
}

// Who is in the other chairs. Off means people, on means the computer, and
// the difficulty only appears once it is actually going to be used.
function paintBotRow(){
  const row = $("botRow"); if (!row) return;
  row.innerHTML = "";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "band band-solo" + (SOLO ? " on" : "");
  toggle.setAttribute("aria-pressed", SOLO ? "true" : "false");
  toggle.innerHTML = "<b></b><em></em>";
  toggle.querySelector("b").textContent = SOLO ? "Playing the computer" : "Play the computer";
  toggle.querySelector("em").textContent = SOLO
    ? (NP === 3 ? "Two of them, and no waiting for anybody." : "No table, no code, no waiting for anybody.")
    : "On your own. Start straight away, no code to send.";
  toggle.addEventListener("click", () => { SOLO = !SOLO; refreshSetupBox(); });
  row.appendChild(toggle);

  if (!SOLO) return;
  const chips = document.createElement("div");
  chips.className = "chips bot-levels";
  for (const lv of LEVELS){
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip" + (BOT_LEVEL === lv ? " on" : "");
    c.setAttribute("aria-pressed", BOT_LEVEL === lv ? "true" : "false");
    c.textContent = lv[0].toUpperCase() + lv.slice(1);
    c.title = LEVEL_BLURB[lv];
    c.addEventListener("click", () => { BOT_LEVEL = lv; refreshSetupBox(); });
    chips.appendChild(c);
  }
  row.appendChild(chips);
  const note = document.createElement("p");
  note.className = "bot-note";
  note.textContent = LEVEL_BLURB[BOT_LEVEL];
  row.appendChild(note);
}

/* --------------------- character leaderboard --------------------- */
// character_stats is publicly readable (see its own RLS policy), so
// this queries it directly with the anon key, same as profiles' public
// stats - no Edge Function needed, there's nothing here that needs
// server-side validation the way a bid or a fight pick does.
let lbRows = [];      // last fetch, enriched with universe/tier from STOCK
let lbSort = "wins";

async function openLeaderboard(){
  showScreen("leaderboard");
  $("lbMsg").textContent = "Loading…";
  $("lbList").innerHTML = "";
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const { data, error } = await sb.from("character_stats").select("*");
    if (error) throw error;
    // STOCK is already loaded client-side for card rendering - reusing
    // it here for universe/tier avoids a second, redundant query for
    // data this page already has sitting in memory. STOCK's own shape
    // is a plain tuple, not an object - see loadStock()'s own comment
    // for why (index 0 name, 1 universe, 4 tier).
    const byName = new Map(STOCK.map(c => [c[0], { pub: c[1], tier: c[4] }]));
    lbRows = (data || []).map(r => ({
      ...r,
      pub: byName.get(r.name)?.pub || null,
      tier: byName.get(r.name)?.tier || null,
      rounds: r.wins + r.losses + r.draws,
      rate: (r.wins + r.losses + r.draws) ? r.wins / (r.wins + r.losses + r.draws) : 0,
      avgPrice: r.times_bought ? r.total_spent / r.times_bought : 0,
    }));
    $("lbMsg").textContent = lbRows.length ? "" : "Nobody's fought or bought anything yet.";
    paintLeaderboard();
  } catch (e) {
    $("lbMsg").textContent = "Could not load the leaderboard: " + (e?.message || String(e));
  }
}

function paintLeaderboard(){
  const q = ($("lbSearch").value || "").trim().toLowerCase();
  const rows = lbRows
    .filter(r => !q || r.name.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => {
      if (lbSort === "wins") return b.wins - a.wins;
      if (lbSort === "rate") return b.rate - a.rate || b.rounds - a.rounds;
      if (lbSort === "price") return b.avgPrice - a.avgPrice;
      return 0;
    });

  const list = $("lbList");
  list.innerHTML = "";
  for (const r of rows){
    const row = document.createElement("div");
    row.className = "lb-row";
    const artUrl = ART.get(r.name);
    row.innerHTML = `
      ${artUrl ? `<img class="lb-thumb" src="${artUrl}" alt="" loading="lazy">` : `<span class="lb-thumb lb-thumb-blank">?</span>`}
      <span class="lb-name">
        <b></b>
        <i></i>
      </span>
      <span class="lb-record"></span>
      <span class="lb-rate"></span>
      <span class="lb-price"></span>`;
    row.querySelector(".lb-name b").textContent = r.name;
    row.querySelector(".lb-name i").textContent = (UNIVERSES[r.pub] || {}).name || r.pub || "";
    row.querySelector(".lb-record").textContent = `${r.wins}-${r.losses}-${r.draws}`;
    row.querySelector(".lb-rate").textContent = r.rounds ? Math.round(r.rate * 100) + "%" : "—";
    row.querySelector(".lb-price").textContent = r.times_bought ? "$" + r.avgPrice.toFixed(1) : "—";
    list.appendChild(row);
  }
  if (!rows.length && lbRows.length) $("lbMsg").textContent = "No character matches that search.";
  else if (rows.length) $("lbMsg").textContent = "";
}

$("leaderboardOpenBtn")?.addEventListener("click", openLeaderboard);
$("lbBackBtn")?.addEventListener("click", () => { showScreen("setup"); });
$("lbSearch")?.addEventListener("input", paintLeaderboard);
$("lbSortChips")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sort]");
  if (!btn) return;
  lbSort = btn.dataset.sort;
  $("lbSortChips").querySelectorAll("[data-sort]").forEach(b => {
    b.classList.toggle("on", b === btn);
    b.setAttribute("aria-pressed", b === btn ? "true" : "false");
  });
  paintLeaderboard();
});

function refreshSetupBox(){
  paintNP();
  $("coverEdition").textContent =
    `${perSale()} Lots \u00b7 ${5 * NP} Sold \u00b7 ${NP === 3 ? "Three" : "Two"} Buyers`;
  BOX.tiers = $("showTiers").checked;
  paintBox($("uniChips"), $("boxCount"), refreshSetupBox);
}


/* --------------------- letting people in --------------------- */
// Host: draw whoever is at the door, with a decision next to each name.
function paintPending(){
  const box = $("pending"), list = $("pendingList");
  if (!HOST) return;
  // seatOf itself is never populated anymore - Stage B moved real seat
  // assignment to join-table, and nothing ever wrote back into this map
  // afterward, so this always read as "1 chair open" regardless of how
  // many seats were actually filled, and the Let In button could never
  // grey out even on a genuinely full table. P is kept current by the
  // real backend snapshot, so count real, named seats there instead.
  const seated = P.filter(x => x.name && x.name !== "…").length;
  const room = NP - seated;
  list.innerHTML = "";
  for (const [cid, who] of knocks){
    const li = document.createElement("li");
    li.className = "pending-row";
    li.innerHTML = `<span class="pending-name"></span>
      <button type="button" class="pn-pass allow">Let in</button>
      <button type="button" class="ghost-btn deny">No</button>`;
    li.querySelector(".pending-name").textContent = who.name;
    const allow = li.querySelector(".allow");
    // A full table doesn't always mean this specific request is a genuinely
    // new person - it can just as easily be the SAME player reconnecting
    // with a new cid (a different device, cleared storage), knocking again
    // because the plain cid-match reconnect in join-table has no way to
    // recognize them. Matching this knock's name against an existing
    // seat's name catches exactly that case, so the host isn't blocked
    // from re-admitting someone they clearly already recognize just
    // because the room-count alone reads as full. join-table's own name-
    // match fallback (see its comment) is what actually reclaims the seat
    // once this button is clickable at all.
    const reclaim = P.some(p => p.name && p.name.trim().toLowerCase() === who.name.trim().toLowerCase());
    const canAdmit = room >= 1 || reclaim;
    allow.disabled = !canAdmit;
    allow.title = canAdmit ? "" : "Every chair is taken";
    allow.addEventListener("click", () => admit(cid, who.name, who.userId));
    li.querySelector(".deny").addEventListener("click", () => {
      knocks.delete(cid); send({ t: "refused", cid }); paintPending();
    });
    list.appendChild(li);
  }
  box.hidden = knocks.size === 0;
  $("lobbyMsg").textContent = room > 0
    ? `${room} ${room === 1 ? "chair" : "chairs"} still open.`
    : "Every chair is taken.";
}

// Host: give someone a chair. Reuses their old one if they are coming back.
// Two people at one table can easily pick the same name, and almost every bit
// of match state is keyed by it: ST.picks, ST.used, and the sides inside
// fight.js. Duplicates meant one seat's pick silently overwrote another's, so
// a three hander sent the same character twice and the third seat never
// scored. Names are made unique the moment a chair is given out.
function uniqueName(want, seat){
  const base = String(want || "").trim().slice(0, 14) || "Buyer";
  const taken = new Set(seats().filter(q => q !== seat).map(q => P[q] && P[q].name));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 20; n++){
    const tag = " " + n, tryName = base.slice(0, 14 - tag.length) + tag;
    if (!taken.has(tryName)) return tryName;
  }
  return base.slice(0, 12) + " " + seat;
}

// Host clicks "Let In" for a pending knock. This is the real gate now:
// join-table only ever gets called from HERE, once, at the moment of
// actual human approval - not the instant a guest types their name. The
// atomic-seat-assignment reasoning from before still holds (join-table
// itself can't double-book a seat), it just now only runs on a real
// approval click instead of on every knock.
async function admit(cid, name, userId){
  if (!HOST) return;
  knocks.delete(cid);
  paintPending();
  // uniqueName() existed correctly but was never actually wired into this
  // flow - admit() sent the raw, unmodified name straight to join-table,
  // and join-table itself has no uniqueness check either. Two players
  // could join with identical names, which would silently corrupt the
  // entire fight system: ST.used, ST.picks, and every team built with
  // owner: P[q].name are all keyed by that string. -1 as the excluded
  // seat is intentional: this guest isn't in any seat yet, so nothing
  // should be excluded from the "already taken" check.
  //
  // Skipped entirely when this name already matches an existing seat
  // exactly, though: that's the reclaim case (see join-table's own
  // comment on this) - a returning player, admitted by a host who
  // already recognized their name, reconnecting with a new cid. That
  // case NEEDS the exact match to be recognized as a reclaim rather than
  // a fresh seat; forcing it away from itself here would defeat the one
  // situation uniqueName() actually needs to make room for. If nothing
  // matches at all, uniqueName() is a safe no-op anyway - there's
  // nothing for it to change.
  const isReclaim = seats().some(q =>
    P[q].name && P[q].name.trim().toLowerCase() === String(name).trim().toLowerCase());
  const finalName = isReclaim ? name : uniqueName(name, -1);
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const res = await fetch("https://trtccsljexjplnuhnlkz.supabase.co/functions/v1/join-table", {
      method: "POST",
      headers: { Authorization: "Bearer " + ART_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ room_code: ROOM, cid, name: finalName, user_id: userId || null }),
    });
    const data = await res.json();
    if (!res.ok){
      send({ t: data.full ? "full" : "refused", cid });
      return;
    }
    // Tell the guest their real seat - they don't have their own `backend`
    // set up yet (they were only ever knocking, not seated), so this
    // broadcast is what lets askForChair() finally build one.
    send({ t: "seat", cid, seat: data.seat, np: data.np, table_id: data.table_id });
  } catch {
    send({ t: "refused", cid });
  }
}

// Guest: an invite link lands here rather than on the host's control panel.
// Knocks and waits for the host's approval - join-table only runs once
// that approval actually happens, inside admit() above, not here.
async function askForChair(){
  const n = ($("knockName").value || "").trim().slice(0, 14);
  if (!n){ $("knockMsg").hidden = false;
           $("knockMsg").textContent = "Put your name down first."; return; }
  try { localStorage.setItem("longbox.name", n); } catch {}
  HOST = false;
  $("knockAsk").hidden = true;
  $("knockMsg").hidden = false;
  $("knockMsg").textContent = "Knocking…";
  if (!chan){
    try { await connect(); }
    catch { $("knockMsg").textContent = "Could not reach the table. Check your connection.";
            $("knockAsk").hidden = false; return; }
  }
  seatedAck = false;
  const knock = () => send({ t: "knock", name: n, cid: CID, user_id: currentUser ? currentUser.id : null });
  knock();
  clearInterval(window.__knockT);
  window.__knockT = setInterval(() => {
    if (seatedAck || !$("auction").hidden){ clearInterval(window.__knockT); return; }
    knock();                                  // the host may have only just opened the page
  }, 3000);
}

// The actual "become this seat and start talking to the backend" work,
// shared by every path that seats this browser at a real table - the
// knock/admit flow below, and reconnectByAccount() further down. Throws
// on failure rather than showing any message itself, since each caller
// has its own place to display one (knockMsg here, a different element
// for the account-reconnect flow) - this only ever does the connecting,
// never the UI around it.
async function connectToTable(seat, np, tableId){
  if (backend) backend.disconnect();
  ME = seat; NP = np; TABLE_ID = tableId;
  // The real bug behind the "blank card" flash: drawnLot/lastFx/heardBids/
  // heardFolds are module-level and only ever reset by the post-game
  // "play again" handler - never when connecting to a brand-new table.
  // Every fresh table's first lot is ALSO lotNum 1, so if this browser
  // tab has rendered any earlier test's Lot 1 this session, applyState's
  // lotChanged check reads false and skips renderLot() entirely - the
  // general fields (lot number, price, footer text) still populate via
  // render(), but the character's own name/alias/note/art never do.
  drawnLot = -1; lastFx = 0; heardBids = 0; heardFolds = 0; __closeLotDeadline = 0; clearTimeout(window.__closeLotTimer); resetMatchState(); stampHideAt = 0; clearTimeout(window.__stampDeferredRender); lastPanelBidKey = {}; pendingAction = null;
  sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
  backend = new Backend(sb, TABLE_ID, CID);
  backend.onSnapshot(s => applyState(s));
  // Separate listener, not folded into applyState() above: applyState()
  // early-returns via showFaceoff() once over===true and never reaches
  // anything past that - exactly the screen this needs to keep updating
  // through, since the fight itself happens entirely after the auction.
  backend.onSnapshot(s => applyMatchSnapshot(s.matches));
  // A reclaimed host may return while the table is still in its lobby.
  // Preserve the original auto-start behavior once every chair is filled.
  if (HOST) backend.onSnapshot(s => {
    if (!s.lot && !s.over && !window.__startingTable &&
        s.P.filter(x => x.name && x.name !== "…").length >= NP){
      window.__startingTable = true;
      backend.startTable(s.box || BOX, NP)
        .finally(() => { window.__startingTable = false; });
    }
  });
  // Wait for both together: the real table data AND the character art
  // lookup table. Connecting alone isn't enough - the whole point is
  // that the FIRST render (right after this) needs ART already
  // populated, or the card's image lookup comes up empty and nothing
  // ever re-triggers a repaint once it's ready.
  // Sequential, not Promise.all: backend.connect() fires its FIRST
  // snapshot internally, synchronously, as its own last step - which
  // calls applyState() and paints the card immediately, before
  // connect() has even formally "resolved" from here. Racing the two
  // in parallel meant that first paint could still land before
  // stockReady finished, even though we were "waiting for both" -
  // exactly the split-second no-image flash. Awaiting stockReady FIRST
  // guarantees ART is already populated before connect()'s internal
  // render ever fires.
  await stockReady;
  await backend.connect();
}

// The host's admit() sends { t: "seat", cid, seat, np, table_id } once a
// knock is actually approved - this is where the guest, only now,
// connects a real backend for the first time.
async function onSeated(m){
  clearInterval(window.__knockT);
  seatedAck = true;
  try {
    await connectToTable(m.seat, m.np, m.table_id);
    try { localStorage.setItem(MP_SAVE_KEY, JSON.stringify({ tableId: TABLE_ID, room: ROOM, host: false, me: ME })); } catch {}
  } catch (e) {
    $("knockMsg").hidden = false;
    $("knockMsg").textContent = "Could not reach the table service. Check your connection.";
    return;
  }
  $("knockMsg").textContent = "";
  // Deliberately NOT calling showScreen("auction") here. connect()'s first
  // snapshot can legitimately arrive before real lot data exists yet (a
  // race against the host's own start-table call finishing), and
  // applyState() correctly does nothing in that case. An explicit call
  // here doesn't know that, and reveals an empty, unpainted card
  // regardless - exactly the "blank box, then the real game" flash.
  // applyState() already calls showScreen("auction") itself, but only
  // once real lot data is genuinely there to paint - that's the only
  // place this screen should ever be revealed from.
}

// A signed-in account's own version of reconnecting - no knock, no host
// approval, because a real session can't be spoofed the way a typed
// name can be. This is what finally covers the case Stage 1 could only
// diagnose, not fix: a host who opened a table on one device has no way
// to get back into seat 0 from a different one, since cid is per-
// browser and every other reconnect path here (including the name-based
// guest reclaim above) only ever considers seats 1 and up. Works for a
// guest's own account just as much as a host's - whichever seat this
// account already has on that table, if any, is what comes back.
async function reconnectByAccount(roomCode){
  if (!currentUser) return;
  const code = (roomCode || "").trim().toUpperCase().slice(0, 4);
  const msgEl = $("reconnectMsg");
  if (!code){ if (msgEl) msgEl.textContent = "Enter the table's room code."; return; }
  if (msgEl) msgEl.textContent = "Reconnecting…";
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const res = await fetch("https://trtccsljexjplnuhnlkz.supabase.co/functions/v1/join-table", {
      method: "POST",
      headers: { Authorization: "Bearer " + ART_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ room_code: code, cid: CID, name: currentUser.name, user_id: currentUser.id }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "That table couldn't be found.");
    ROOM = code;
    HOST = (data.seat === 0);
    await connectToTable(data.seat, data.np, data.table_id);
    try { localStorage.setItem(MP_SAVE_KEY, JSON.stringify({ tableId: TABLE_ID, room: ROOM, host: HOST, me: ME })); } catch {}
    if (msgEl) msgEl.textContent = "";
    // No explicit showScreen() call here either, same reasoning as
    // onSeated() above - connectToTable()'s own backend.connect() already
    // triggers applyState(), which is the only place that correctly knows
    // whether real lot data exists yet to reveal the auction screen for,
    // versus a table still sitting on the face-off screen, versus one
    // that's already finished. Calling it explicitly here would risk
    // exactly the same blank-flash bug that comment already explains.
  } catch (e) {
    if (msgEl) msgEl.textContent = e.message || "Could not reconnect - check the room code.";
  }
}

/* ---------------------------- tables ---------------------------- */
function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealDeck(){
  deck = shuffle(STOCK
    .map((c, i) => ({
      name: c[0], pub: c[1], alias: c[2], note: c[3], tier: c[4], prep: c[5],
      fit: c[6], bad: c[7], lines: c[8] || null,
      no: 1 + ((i * 37 + 11) % 480)
    }))
    .filter(c => BOX.u.includes(c.pub)));
  deck = deck.slice(0, perSale());
  lotNum = 0; over = false;
}

async function openTable(){
  const n = myName();
  if (!n) return nudge("Put your name on the tab first.");
  if (boxCount() < MIN_BOX()) return nudge("The box is too thin for that many buyers. Add a universe.");
  HOST = true; ME = 0; started = false;
  ROOM = code4();
  P = seats().map(q => ({ name: q === 0 ? n : "…", purse: PURSE, roster: [], locked: false }));
  $("setupMsg").textContent = "Opening the table…";
  try { await connect(); } catch { return nudge("Could not reach the table service. Check your connection and try again."); }
  // Stage B: the real database row. Everything the lobby UI does above
  // (ROOM, P, the broadcast channel) is unchanged - this just gives
  // place-bid something real to check bids against once the sale starts.
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const res = await fetch("https://trtccsljexjplnuhnlkz.supabase.co/functions/v1/create-table", {
      method: "POST",
      headers: { Authorization: "Bearer " + ART_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ room_code: ROOM, host_cid: CID, host_name: n, np: NP, box: BOX, host_user_id: currentUser ? currentUser.id : null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "create-table failed");
    TABLE_ID = data.table_id;
    // Same reset as the guest path in onSeated() - a reused tab can
    // otherwise carry a previous test table's rendering state into this
    // brand-new one and cause renderLot() to be silently skipped.
    drawnLot = -1; lastFx = 0; heardBids = 0; heardFolds = 0; __closeLotDeadline = 0; clearTimeout(window.__closeLotTimer); resetMatchState(); stampHideAt = 0; clearTimeout(window.__stampDeferredRender); lastPanelBidKey = {}; pendingAction = null;
    backend = new Backend(sb, TABLE_ID, CID);
    backend.onSnapshot(s => {
      applyState(s);
      // Auto-start once every chair is filled - replaces the old
      // "!started" check inside handle()'s "join" case, which used to
      // fire the moment the host's own local seatOf map filled up.
      // guardStart avoids calling start-table twice if two snapshots
      // land in quick succession before `started` flips.
      if (!started && !window.__startingTable &&
          s.P.filter(x => x.name && x.name !== "…").length >= NP){
        window.__startingTable = true;
        backend.startTable(BOX, NP)
          .then(() => { window.__startingTable = false; })
          .catch(() => { window.__startingTable = false; });
      }
    });
    // Separate listener, same reasoning as the guest-side registration -
    // applyState() never reaches the fight screen's own update path.
    backend.onSnapshot(s => applyMatchSnapshot(s.matches));
    await backend.connect();
    try { localStorage.setItem(MP_SAVE_KEY, JSON.stringify({ tableId: TABLE_ID, room: ROOM, host: true, me: 0 })); } catch {}
  } catch (e) {
    return nudge("Could not open the table (" + e.message + "). Try again.");
  }
  $("setupMsg").textContent = "";
  $("lobbyCode").textContent = ROOM;
  knocks.clear(); paintPending();
  $("lobbyBox").textContent = boxSummary();
  $("shareLink").value = location.origin + location.pathname + "?r=" + ROOM;
  showScreen("lobby");
}

// The same opening as openTable, minus every part that involves anybody
// else: no room code, no channel, no lobby, no waiting. The sale starts on
// the spot.
function openSolo(){
  const n = myName();
  if (!n) return nudge("Put your name on the tab first.");
  if (boxCount() < MIN_BOX()) return nudge("The box is too thin for that many buyers. Add a universe.");
  HOST = true; ME = 0; started = true; ROOM = "";
  const face = ["Ada", "Vex", "Rook"];
  P = seats().map(q => ({
    name: q === 0 ? n : face[q - 1] + " (" + BOT_LEVEL + ")",
    purse: PURSE, roster: [], locked: false
  }));
  BOTS = {};
  const helpers = { POINTS, effTier, roleShift, slots: SLOTS, purse: PURSE };
  seats().forEach(q => {
    if (q === 0) return;
    BOTS[q] = createBot({ level: BOT_LEVEL,
      helpers: { ...helpers, seed: (Math.random() * 2 ** 31) | 0 } });
  });
  dealDeck(); nextLot();
  showScreen("auction");
  botTick();
}

/* Every bot decision the sale needs, driven off the same state pushes the
   rules already make. Nothing here reaches past what a person sitting in
   that chair could see: the lot on the block, its own purse, and rosters
   that are on screen for everybody once the auction ends. */
function botThink(fn, ms){
  if (botBusy) return;
  botBusy = true;
  clearTimeout(botIdle);
  setTimeout(() => { botBusy = false; fn(); }, ms);
}

// State pushes are not enough on their own. The last push of the auction
// happens before the face-off screen is on show, so a tick driven only by
// pushes looks at a hidden board, finds nothing to do, and never runs again.
// A slow idle beat covers every gap like that without the bots ever acting
// twice, since botThink still gates on botBusy.
let botIdle = null;
function botWait(){
  clearTimeout(botIdle);
  botIdle = setTimeout(botTick, 700);
}

function botTick(){
  clearTimeout(botIdle);
  // Deliberately not gated on `over`: that flag means the AUCTION has
  // finished, not the game. Gating on it here made the bots go silent at
  // exactly the moment the role board appeared, which is the first thing
  // they are needed for after the sale.
  if (!SOLO || !HOST) return;
  if (botBusy) return botWait();

  // 1. the auction
  if (!over && lot && !lot.sold && !$("auction").hidden){
    const seat = seats().find(q => q !== 0 && BOTS[q] && inPlay(q) && !lot.passed[q] && lot.high !== q);
    if (seat !== undefined){
      const b = BOTS[seat];
      const d = b.bid({
        char: lot.char, mode: "random", ask: askPrice(), ceiling: ceiling(seat),
        purse: P[seat].purse, slotsLeft: slotsLeft(seat), mustBuy: obliged() === seat
      });
      const wait = 700 + Math.random() * 700;
      return botThink(() => {
        if (!lot || lot.sold) return botTick();
        if (d.act === "bid") bid(seat, d.amount); else pass(seat);
        botTick();
      }, wait);
    }
  }

  // 2. the role board
  if (!$("faceoff").hidden && P.some((x, q) => q !== 0 && BOTS[q] && !x.locked)){
    const seat = seats().find(q => q !== 0 && BOTS[q] && !P[q].locked);
    return botThink(() => {
      const keys = BOTS[seat].assignRoles(P[seat].roster, chosenMode());
      keys.forEach((k, i) => setRole(seat, i, k));
      lockRoles(seat);
      paintRoles();
      botTick();
    }, 900);
  }

  // 3. the encounter, when a bot kept the most money
  if (!$("faceoff").hidden && allLocked() && !ST && BOTS[caller()]){
    const seat = caller();
    return botThink(() => {
      const mode = BOTS[seat].encounter(P[seat].roster);
      const radio = document.querySelector(`input[name="encounter"][value="${mode}"]`);
      if (radio) radio.checked = true;
      if (modeLeft(mode)) startStory(mode);
      botTick();
    }, 1100);
  }

  // 4. sending a fighter
  if (ST && !ST.end && MATCH){
    const avail = MATCH.available();
    const seat = seats().find(q => q !== 0 && BOTS[q] && !ST.picks[P[q].name]);
    if (seat !== undefined){
      const mine = (avail.find(a => a.owner === P[seat].name) || { names: [] }).names;
      if (!mine.length) return;
      const tierOf = name => {
        const r = P[seat].roster.find(x => x.char.name === name);
        return r ? effTier(r.char, ST.mode, r.role) : "E";
      };
      const rivals = seats().filter(q => q !== seat).map(q =>
        ((avail.find(a => a.owner === P[q].name) || { names: [] }).names).map(nm => {
          const r = P[q].roster.find(x => x.char.name === nm);
          return { name: nm, tier: r ? effTier(r.char, ST.mode, r.role) : "E" };
        }));
      return botThink(() => {
        const choice = BOTS[seat].pick({
          mine: mine.map(nm => ({ name: nm, tier: tierOf(nm) })), rivals, mode: ST.mode
        });
        if (choice) takePick(P[seat].name, choice);
        botTick();
      }, 1200 + Math.random() * 600);
    }
  }

  // nothing to do this instant: the human is still thinking, or a screen has
  // not appeared yet. Come back shortly rather than going silent for good.
  if (!ST || !ST.end) botWait();
}

async function joinTable(){
  const c = ($("joinCode").value || "").trim().toUpperCase();
  if (c.length !== 4) return nudge("A table code is four letters.");

  // First ask only whether this browser/account ALREADY owns a seat. This
  // lets the table's host reclaim seat 0 directly without accidentally
  // admitting a genuinely new player who still needs host approval.
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const savedName = (() => { try { return localStorage.getItem("longbox.name") || ""; } catch { return ""; } })();
    const res = await fetch("https://trtccsljexjplnuhnlkz.supabase.co/functions/v1/join-table", {
      method: "POST",
      headers: { Authorization: "Bearer " + ART_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        room_code: c, cid: CID,
        name: currentUser?.name || savedName || myName(),
        user_id: currentUser?.id || null,
        reconnect_only: true,
      }),
    });
    if (res.ok){
      const data = await res.json();
      ROOM = c; HOST = data.seat === 0; ME = data.seat; NP = data.np; started = false;
      await connect();
      if (HOST){
        $("lobbyCode").textContent = ROOM;
        $("shareLink").value = location.origin + location.pathname + "?r=" + ROOM;
        showScreen("lobby");
      }
      await connectToTable(data.seat, data.np, data.table_id);
      try { localStorage.setItem(MP_SAVE_KEY, JSON.stringify({ tableId: TABLE_ID, room: ROOM, host: HOST, me: ME })); } catch {}
      return;
    }
  } catch {
    // A failed reconnect probe falls through to the normal knock flow.
  }

  ROOM = c;
  $("knockCode").textContent = c;
  try { $("knockName").value = localStorage.getItem("longbox.name") || myName() || ""; } catch {}
  showScreen("knock");
  connect().catch(() => {
    $("knockMsg").hidden = false;
    $("knockMsg").textContent = "Could not reach that table.";
  });
}
function nudge(msg){ $("setupMsg").textContent = msg; showScreen("setup"); }

// In-game equivalent of nudge() - a rejected bid/pass shouldn't navigate
// the player anywhere. nudge() was built for lobby-flow errors (can't
// open/join a table), where the player genuinely IS on that screen
// already; reusing it inside bid()/pass()'s error handling was the bug -
// it yanked players back to the homepage on every rejected action, even
// perfectly normal ones (someone else's action or the auto-timeout
// resolved the lot a moment before this click landed). Most of these
// rejections are self-correcting the instant the next real snapshot
// arrives anyway, so this only needs to be a brief, non-navigating note,
// not a full-screen error.
function gameNudge(msg){
  // The auction screen's own status line was the only target here, which
  // is invisible once past the auction - an error from startMatch()/
  // submitPick() on the face-off/fight screen had nowhere to show at
  // all, so it failed completely silently. Target whichever of the two
  // status lines is actually on screen right now.
  const auctionVisible = !$("auction").hidden;
  const el = auctionVisible ? $("call") : $("writeHint");
  if (!el) return;
  el.textContent = msg;
  clearTimeout(window.__gameNudgeTimer);
  window.__gameNudgeTimer = setTimeout(() => {
    if (auctionVisible){ if (lot) render(); }
    else if (ST) stPaint();
  }, 1800);
}

function resumeTable(){
  // Real multiplayer: reconnect via the actual backend, the same way any
  // fresh connect works - a reload loses nothing, because the real state
  // was never sitting in this browser to begin with, it's in the
  // database. No local reconstruction needed at all; just point a fresh
  // Backend at the saved table_id and let the current state arrive.
  let mp;
  try { mp = JSON.parse(localStorage.getItem(MP_SAVE_KEY) || "null"); } catch {}
  if (mp && mp.tableId){
    HOST = mp.host; ME = mp.me; ROOM = mp.room; TABLE_ID = mp.tableId;
    resetMatchState();
    drawnLot = -1; lastFx = 0; heardBids = 0; heardFolds = 0; __closeLotDeadline = 0; clearTimeout(window.__closeLotTimer);
    (async () => {
      try {
        await connect();   // re-establish chan too: presence, roles, and the knock/admit flow still run on it
        sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
        backend = new Backend(sb, TABLE_ID, CID);
        backend.onSnapshot(s => applyState(s));
        backend.onSnapshot(s => applyMatchSnapshot(s.matches));
        if (HOST){
          // applyState() itself early-returns whenever no lot exists yet
          // (a table still waiting on more players to join) - meaning it
          // NEVER shows the lobby screen at all on its own. The original
          // openTable() flow only ever reached the lobby through its own
          // direct showScreen("lobby") call right after creating the
          // table; resuming skipped that entirely, reconnecting chan and
          // backend correctly in the background while the host's own
          // screen just sat on setup with no way to see or accept a
          // guest's knock. Runs once (the flag guards against every
          // later poll re-firing this and wiping out real pending
          // knocks that arrived over chan in the meantime).
          let lobbyShown = false;
          backend.onSnapshot(s => {
            if (lobbyShown || s.lot) return;
            lobbyShown = true;
            BOX = s.box; NP = s.np;
            $("setupMsg").textContent = "";
            $("lobbyCode").textContent = ROOM;
            knocks.clear(); paintPending();
            $("lobbyBox").textContent = boxSummary();
            $("shareLink").value = location.origin + location.pathname + "?r=" + ROOM;
            showScreen("lobby");
          });
        }
        await stockReady;
        await backend.connect();
      } catch {
        nudge("Could not reopen that table. Check your connection.");
      }
    })();
    return;
  }

  // SOLO only from here down: no backend ever existed for it, so this
  // browser genuinely was the only place the state lived, and rebuilding
  // it from localStorage is correct here - unlike the multiplayer branch
  // above, where doing the same thing used to reconstruct a stale,
  // database-disconnected copy of a game that had actually moved on.
  let sv;
  try { sv = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch {}
  if (!sv) return;
  HOST = true; ME = 0; started = true;
  ROOM = sv.ROOM; deck = sv.deck; P = sv.P; lot = sv.lot; lotNum = sv.lotNum; over = sv.over;
  // A saved lot's bidDeadline is just a timestamp from before the reload; the
  // actual JS timer that would act on it is gone with the old page. Without
  // this, the countdown UI could reappear (rebuilt from that stale
  // timestamp) with nothing behind it to ever resolve the lot.
  if (lot && !lot.sold && lot.bidDeadline) scheduleBidTimer();
  connect().then(() => { pushState(); }).catch(() => nudge("Could not reopen that table."));
}

/* ------------------------- rules helpers ------------------------- */
const slotsLeft = p => SLOTS - P[p].roster.length;
const inPlay    = p => slotsLeft(p) > 0;
// Must always keep $1 in reserve for every slot that stays empty after this buy.
const ceiling   = p => P[p].purse - (slotsLeft(p) - 1);
const soloRun   = () => seats().filter(inPlay).length === 1;
const askPrice  = () => lot.high === null ? 1 : lot.price + 1;

/* Host only from here down, the guest never runs the rules. */

// A sale is ten characters per buyer. Five each get bought, the rest pass in.
// Everything else is passed in, so the number of passes left is simply the
// lots remaining minus the buys still owed. When that reaches zero the rest
// are compulsory, which is what stops anyone passing their way out of a roster.
const bought      = () => P.reduce((n, x) => n + x.roster.length, 0);
const buysOwed    = () => (SLOTS * NP) - bought();
const lotsLeft    = () => perSale() - lotNum + 1;          // counting the one on the block
const passesLeft  = () => Math.max(0, lotsLeft() - buysOwed());
const compulsory  = () => passesLeft() <= 0;

// Once one buyer is finished, walking away costs a dollar. Before that it is free.
const passCost = p => (soloRun() && inPlay(p)) ? 1 : 0;

// Who is on the hook when a lot cannot be passed in.
function obliged(){
  if (!compulsory()) return null;
  // The opener carries it, but a buyer holding five cannot buy a sixth. Walk
  // on to the next seat that still has a slot. With two buyers a full seat
  // always left exactly one other in play, so this never showed; with three,
  // one can be full while two are still buying, and naming the full one put
  // nobody on the hook and passed a compulsory lot in unsold.
  for (let i = 0; i < NP; i++){
    const p = (lot.opener + i) % NP;
    if (inPlay(p)) return p;
  }
  return null;
}

function canPass(p){
  if (over || !lot || lot.sold || !inPlay(p) || lot.passed[p]) return false;
  if (lot.high === p) return false;                       // you are winning it
  if (lot.high !== null) return true;                     // dropping out is always allowed
  if (obliged() === p) return false;                      // somebody has to buy this one
  const cost = passCost(p);
  return P[p].purse - cost >= slotsLeft(p);               // must still be able to fill up
}

function nextLot(){
  clearTimeout(window.__bidTimer);
  if (bought() >= SLOTS * NP) return finish();
  if (lotNum >= perSale() || !deck.length) return finish();
  lotNum++;
  lot = { char: deck.shift(), price: 0, high: null, opener: (lotNum - 1) % NP,
          passed: seats().map(() => false) };
  // Same clock, running from lot zero: nobody has to open it, but if
  // neither buyer does within the window, something still has to happen
  // (see scheduleBidTimer's own comment for which outcome it picks).
  lot.bidDeadline = Date.now() + BID_TIMER_MS;
  scheduleBidTimer();
  pushState();
}

// Host only: 8 seconds after a bid lands, if nobody has answered it, the
// lot just sells itself to whoever is standing. The same clock also covers
// the lot BEFORE anyone has bid at all (see nextLot() above): running out
// with no bids either passes it in unsold (same as both buyers declining
// by hand) or, if the lot is compulsory and somebody has to buy it anyway,
// sells it to that buyer at the $1 opening price rather than leaving it
// unresolved forever - obliged() below is exactly the rule the "Pass"
// button already enforces for a compulsory lot, just applied here to a
// buyer who never acted at all. Re-armed on every fresh bid (bid() calls
// this again, and the clearTimeout below drops the old one), and harmless
// to fire late: the lot/high/price check below means a stale timer from a
// bid that has since been outbid or resolved does nothing.
function scheduleBidTimer(){
  clearTimeout(window.__bidTimer);
  if (!lot || lot.sold) return;
  const ref = lot, high = lot.high, price = lot.price;
  // Normally this runs right after lot.bidDeadline was just set to
  // "now + BID_TIMER_MS", so wait works out the same either way. It only
  // matters after resumeTable() restores a deadline stamped before a
  // reload: waiting out whatever time is actually left (possibly already
  // past, which just resolves it on the next tick) instead of handing out
  // a fresh 8 seconds nobody asked for.
  const wait = lot.bidDeadline ? Math.max(0, lot.bidDeadline - Date.now()) : BID_TIMER_MS;
  window.__bidTimer = setTimeout(() => {
    if (lot !== ref || lot.sold) return;
    if (high === null){
      const ob = obliged();
      if (ob !== null) return award(ob, 1);
      // Same gap close-lot's server-side twin had until earlier today:
      // letting the clock run out instead of clicking Pass yourself was
      // hardcoded straight to passIn(0), skipping the solo-run $1 charge
      // entirely regardless of whether one was actually owed - unlike
      // passLocalSolo() (an explicit click), which already deducts this
      // correctly via passCost() before ever calling passIn(). The
      // deduction has to happen HERE, not inside passIn() itself - that
      // function only ever builds the display text, it was never the
      // one responsible for touching a purse.
      const soloSeat = seats().find(inPlay);
      const cost = soloSeat !== undefined ? passCost(soloSeat) : 0;
      if (cost) P[soloSeat].purse -= cost;
      return passIn(cost);
    }
    if (lot.high === high && lot.price === price) award(high, price);
  }, wait);
}

/* ---------------------------- actions ---------------------------- */
// Stage B: bid()/pass() no longer decide anything - they just ask
// place-bid to. Every rule that used to live here (min bid, ceiling, the
// ACK_MS lockout, who's obliged to buy) is enforced server-side now,
// against the real database, not against this browser's own copy of
// `lot`/`P` - see place-bid/index.ts. The local checks below are only a
// fast "don't even bother sending an obviously-illegal request" filter;
// place-bid re-checks everything regardless; SOLO mode (bots, no
// backend) keeps its old local behaviour untouched, since there's nobody
// to cheat against there.
// Tracks a bid/pass this client just sent but hasn't heard confirmed
// back yet - see resolveLotForDisplay() for how applyState() uses this
// to avoid a routine snapshot (one that simply hasn't caught up to this
// action yet) flashing the display back to the stale pre-action state
// for a moment before the real confirmation arrives a beat later.
let pendingAction = null;

function bid(p, amount){
  if (SOLO || !backend) return bidLocalSolo(p, amount);
  if (over || !lot || lot.sold || !inPlay(p)) return;
  const min = (lot.high === p) ? lot.price + 1 : askPrice();
  amount = Math.floor(amount);
  if (!(amount >= min)) return;
  seats().forEach(q => { const el = $("other" + q); if (el) el.value = ""; });
  // Optimistic: show the bid registering the instant it's clicked, the
  // same way solo mode already does, rather than waiting for a full
  // round trip to the server and back before anything visibly changes -
  // that round trip is real and necessary (nothing here can be trusted
  // to resolve itself locally the way solo mode's bots can), but the
  // WAIT for it doesn't have to be visible for the common, successful
  // case. Mutates the same `lot` object render() already reads from, so
  // this is a genuine preview of the real result, not a separate,
  // parallel display.
  pendingAction = { lotNum, type: "bid", seat: p, amount };
  lot.high = p; lot.price = amount;
  lot.bidDeadline = Date.now() + BID_TIMER_MS;
  render();
  backend.bid(p, amount, lotNum).catch(err => {
    // A real rejection, not just a slow response - the guess was wrong,
    // so clear it immediately rather than leaving something on screen
    // the server never actually agreed to. The very next routine
    // snapshot corrects the display to whatever's really true.
    if (pendingAction && pendingAction.type === "bid" && pendingAction.seat === p && pendingAction.amount === amount) {
      pendingAction = null;
    }
    gameNudge(err.message);
  });
}

function pass(p){
  if (SOLO || !backend) return passLocalSolo(p);
  if (!canPass(p)) return;
  // Same optimistic reasoning as bid() above.
  pendingAction = { lotNum, type: "pass", seat: p };
  if (!lot.passed) lot.passed = [];
  lot.passed[p] = true;
  render();
  backend.pass(p, lotNum).catch(err => {
    if (pendingAction && pendingAction.type === "pass" && pendingAction.seat === p) pendingAction = null;
    gameNudge(err.message);
  });
}

// Reconciles an incoming, authoritative snapshot's lot against whatever
// this client is still waiting to hear confirmed, if anything. Three
// outcomes: the pending action is now genuinely confirmed (adopt the
// real data, clear the guess - they agree exactly, so there's nothing
// to keep guessing about); it's been superseded by something else that
// actually happened first (someone else's bid landing before this one
// did, or the lot resolving some other way entirely - adopt the real
// data, clear the guess, since the guess is now simply wrong); or the
// snapshot just hasn't caught up yet (a routine poll that started
// before the server finished processing this action) - keep showing
// the optimistic guess rather than flashing back to the stale
// pre-action state for one frame before the real confirmation arrives.
function resolveLotForDisplay(incoming){
  if (!pendingAction || !incoming) return incoming;
  if (incoming.lotNum !== pendingAction.lotNum) { pendingAction = null; return incoming; }

  if (pendingAction.type === "bid"){
    if (incoming.high === pendingAction.seat && incoming.price === pendingAction.amount){
      pendingAction = null;
      return incoming;
    }
    if (incoming.high !== null && incoming.high !== pendingAction.seat && incoming.price >= pendingAction.amount){
      pendingAction = null;
      return incoming;
    }
    if (incoming.sold){ pendingAction = null; return incoming; }
    return { ...incoming, high: pendingAction.seat, price: pendingAction.amount, bidDeadline: lot.bidDeadline };
  }

  if (pendingAction.type === "pass"){
    if (incoming.passed && incoming.passed[pendingAction.seat]){
      pendingAction = null;
      return incoming;
    }
    if (incoming.sold){ pendingAction = null; return incoming; }
    const passed = incoming.passed ? incoming.passed.slice() : [];
    passed[pendingAction.seat] = true;
    return { ...incoming, passed };
  }

  return incoming;
}

// The exact original bid()/pass() bodies, kept only for SOLO mode (vs.
// bots, entirely local, nothing to protect against). Renamed so the
// networked bid()/pass() above can delegate to them without recursing.
function bidLocalSolo(p, amount){
  if (over || lot.sold || !inPlay(p)) return;
  const min = (lot.high === p) ? lot.price + 1 : askPrice();
  const amt = Math.floor(amount);
  if (!(amt >= min) || amt > ceiling(p)) return;
  if (Date.now() < (lot.lockUntil || 0)) return;
  lot.price = amt;
  lot.high = p;
  lot.history = (lot.history || []).concat({ p, amt });
  lot.lockUntil = Date.now() + ACK_MS;
  seats().forEach(q => { const el = $("other" + q); if (el) el.value = ""; });
  if (!rivals(p).some(q => inPlay(q) && !lot.passed[q])) return award(p, amt);
  lot.bidDeadline = Date.now() + BID_TIMER_MS;
  scheduleBidTimer();
  pushState();
}

function passLocalSolo(p){
  if (!canPass(p)) return;
  const cost = passCost(p);
  if (cost) P[p].purse -= cost;
  lot.passed[p] = true;

  if (lot.high !== null){
    const contenders = rivals(lot.high).filter(q => inPlay(q) && !lot.passed[q]);
    if (!contenders.length) return award(lot.high, lot.price);
    return pushState();
  }

  const stillIn = seats().filter(q => inPlay(q) && !lot.passed[q]);
  if (!stillIn.length) return passIn(cost);
  pushState();
}

function passIn(cost){
  lot.sold = true; lot.passedIn = true;
  pushState({ id: ++fxSeq, word: "Passed",
    line: `${lot.char.name}, nobody wanted it` + (cost ? `, ${money(cost)} to walk away` : ""),
    tone: "grey" });
  setTimeout(nextLot, 1000);
}

function award(p, price){
  // A lot settles exactly once. Controls stay on screen through the stamp
  // animation, so without this a second click resells the same issue.
  if (lot.sold) return;
  clearTimeout(window.__bidTimer);
  lot.sold = true;
  lot.high = p; lot.price = price;
  P[p].purse -= price;
  P[p].roster.push({ char: lot.char, price });
  // Character purchase-price tracking, same reasoning and same guard as
  // the round-result tracking in takePick(): solo auctions never touch
  // award_seat (the multiplayer path) at all, so without this hook
  // nothing here ever recorded a sale price for the leaderboard,
  // regardless of how many solo games got played.
  if (SOLO){
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    sb.rpc("record_character_purchase", { p_name: lot.char.name, p_price: price })
      .then(({ error }) => { if (error) console.error("record_character_purchase failed:", error); });
  }
  pushState({ id: ++fxSeq, word: "Sold",
    line: `${lot.char.name} to ${P[p].name} for ${money(price)}`,
    tone: p === 0 ? "red" : "blue" });
  setTimeout(() => {
    if (seats().every(q => P[q].roster.length === SLOTS)) finish();
    else nextLot();
  }, 1250);
}

/* ---------------------------- stamp ---------------------------- */
// Tracked so applyState() can tell whether a stamp announcing the
// PREVIOUS lot is still visible when a new lot's data arrives - see the
// comment at its one call site in applyState() for the actual bug this
// closes (the stamp ending up on top of the wrong card).
let stampHideAt = 0;
function releaseStamp(delay = 250){
  const layer = $("stampLayer"), mark = $("stampMark");
  stampHideAt = Date.now() + delay;
  clearTimeout(window.__stampHideTimer);
  window.__stampHideTimer = setTimeout(() => {
    layer.hidden = true;
    mark.classList.remove("hit");
  }, delay);
}

function stamp(word, line, tone, persist = false){
  const layer = $("stampLayer"), mark = $("stampMark");
  $("smWord").textContent = word;
  $("smLine").textContent = line;
  mark.className = "stamp-mark tone-" + tone;
  layer.hidden = false;
  mark.style.animation = "none";
  void mark.offsetWidth;
  mark.style.animation = "";
  mark.classList.add("hit");
  clearTimeout(window.__stampHideTimer);
  if (persist){
    // Keep the preview over the current card until the Edge Function or the
    // matching Realtime result confirms that the lot really settled.
    stampHideAt = Date.now() + 30000;
    window.__stampHideTimer = setTimeout(() => releaseStamp(0), 30000);
  } else {
    releaseStamp(1100);
  }
}


/* ---------------------- seats on screen ---------------------- */
// Ledgers, bid panels and face-off columns are all drawn from the seat count,
// so two and three buyers use one code path and one set of styles.
function buildSeats(){
  const led = $("ledgers"), pan = $("panels");
  if (led.dataset.n === String(NP)) return;
  led.dataset.n = pan.dataset.n = String(NP);
  led.innerHTML = ""; pan.innerHTML = "";

  for (const p of seats()){
    const key = SEATS[p].key;

    const a = document.createElement("aside");
    a.className = `ledger ledger-${key}`;
    a.id = "ledger" + p;
    a.classList.add("seat-" + p);
    a.innerHTML =
      `<div class="ledger-tab"><span class="lt-name" id="name${p}"></span></div>` +
      `<p class="purse-line">Purse remaining</p>` +
      `<p class="purse-figure" id="purse${p}">$${PURSE}</p>` +
      `<ol class="slots" id="slots${p}"></ol>` +
      `<p class="ledger-foot"><span id="spent${p}"></span> &middot; <span id="left${p}"></span></p>`;
    led.appendChild(a);

    const d = document.createElement("div");
    d.className = `panel panel-${key}`;
    d.id = "panel" + p;
    d.innerHTML =
      `<p class="pn-name" id="pn${p}"></p>` +
      `<div class="pn-bids" id="bids${p}"></div>` +
      `<div class="pn-row">` +
        `<label class="pn-other"><span>Other</span>` +
          `<input type="number" id="other${p}" min="1" step="1" inputmode="numeric" ` +
          `aria-label="Custom bid"></label>` +
        `<button class="pn-go" type="button" data-go="${p}">Bid</button>` +
        `<button class="pn-pass" type="button" data-pass="${p}">Pass</button>` +
      `</div>` +
      `<p class="pn-state" id="state${p}"></p>`;
    pan.appendChild(d);
  }

  $("auction").className = "screen auction-screen np-" + NP;
  pan.querySelectorAll(".pn-pass[data-pass]").forEach(b =>
    b.addEventListener("click", () => { if (Number(b.dataset.pass) === ME) act("pass"); }));
  // A phone keyboard has no Enter for a number field, so the amount needs a button.
  pan.querySelectorAll(".pn-go[data-go]").forEach(b =>
    b.addEventListener("click", () => {
      const p = Number(b.dataset.go);
      if (p !== ME) return;
      const v = Number($("other" + p).value);
      if (v) act("bid", v);
    }));
  for (const p of seats()){
    $("other" + p).addEventListener("keydown", e => {
      if (e.key === "Enter"){
        e.preventDefault();
        const v = Number(e.currentTarget.value);
        if (v && p === ME) act("bid", v);
      }
    });
  }
}

function buildFoSides(){
  const box = $("foSides");
  box.innerHTML = "";
  box.className = "fo-sides np-" + NP;
  for (const p of seats()){
    const sec = document.createElement("section");
    sec.className = `fo-side fo-${SEATS[p].key}`;
    sec.innerHTML =
      `<div class="ledger-tab"><span class="lt-name" id="foName${p}"></span></div>` +
      `<ol class="fo-list" id="foList${p}"></ol>` +
      `<p class="fo-total" id="foTotal${p}"></p>`;
    box.appendChild(sec);
  }
}


/* ==================================================================
 *  SOUND
 *  Every noise here is generated by the browser at the moment it plays.
 *  Nothing is sampled, downloaded or hosted, so there is no recording to
 *  licence and no file to ship. It also means the whole kit is about a
 *  hundred lines and costs nothing to load.
 * ================================================================== */
let actx = null, sfxOn = true;
try { sfxOn = localStorage.getItem("superdrafts.sfx") !== "off"; } catch {}

// Browsers refuse to make noise until the user has interacted, so the audio
// engine is built on the first click rather than at load.
function audio(){
  if (actx) return actx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  actx = new Ctx();
  actx.addEventListener("statechange", () => {
    if (actx.state !== "running" && musicTimer){    // stop scheduling into a dead context
      clearInterval(musicTimer); musicTimer = null;
    }
    reviveAudio();
  });
  return actx;
}
// Unlocking audio on a phone is fussier than on a laptop. iOS only lets a
// context start inside a real gesture, it wants a buffer actually played in
// that same gesture, and it suspends everything again when you leave the tab.
// So this listens broadly, stays attached, and re-arms on return.
let audioUnlocked = false;
function unlockAudio(){
  const ctx = audio(); if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  try {                                   // a silent tick, played in-gesture
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  } catch {}
  if (!audioUnlocked && ctx.state === "running"){
    audioUnlocked = true;
    if (musicOn) startMusic();
  }
}
for (const evt of ["pointerdown", "touchend", "click", "keydown"])
  addEventListener(evt, unlockAudio, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) reviveAudio();
});
addEventListener("focus", reviveAudio);
addEventListener("pageshow", reviveAudio);

// iOS parks the audio context for all sorts of reasons that never produce an
// error: the screen dimming, a notification, Siri, another app taking the
// audio session, or Safari simply throttling a long-lived tab. Safari also has
// an "interrupted" state that nothing recovers from on its own. So rather than
// trusting any single event, this checks every couple of seconds and restarts
// whatever has died. It is cheap and it is the only thing that reliably keeps
// sound alive across a twenty minute draft on a phone.
function reviveAudio(){
  if (!actx || document.hidden) return;
  if (actx.state !== "running") actx.resume().catch(() => {});
  if (musicOn && audioUnlocked && actx.state === "running" && !musicTimer) startMusic();
}
setInterval(reviveAudio, 2500);

function noiseBuffer(ctx, seconds){
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// A burst of filtered noise: the basis of paper, felt and rubber sounds.
function hiss({ dur = .2, type = "bandpass", from = 1800, to = 500, q = 1, gain = .18, delay = 0 }){
  const ctx = audio(); if (!ctx || !sfxOn) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, dur);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t); src.stop(t + dur);
}

// A pitched body: the knock of wood, the boom under a stamp, a bell note.
function tone({ freq = 440, dur = .18, type = "triangle", gain = .16, bend = 0, delay = 0 }){
  const ctx = audio(); if (!ctx || !sfxOn) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + bend), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + .012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + .02);
}

const SFX = {
  // a bagged issue sliding out of the longbox
  pull(){ hiss({ dur:.34, from:2600, to:420, q:.7, gain:.13 }); },
  // knuckle on the counter: someone is in
  bid(){ tone({ freq:320, dur:.10, type:"square", gain:.09, bend:-120 });
         hiss({ dur:.05, from:3200, to:1400, gain:.10 }); },
  // stepping back, quieter and lower
  pass(){ tone({ freq:180, dur:.13, type:"sine", gain:.08, bend:-60 }); },
  // the rubber stamp landing, then the counter thump under it
  sold(){ hiss({ dur:.09, from:5200, to:900, gain:.24 });
          tone({ freq:96, dur:.30, type:"sine", gain:.26, bend:-38 });
          tone({ freq:660, dur:.16, type:"triangle", gain:.07, delay:.05 }); },
  // nobody wanted it: a flat, dead thud
  passedIn(){ hiss({ dur:.12, from:900, to:220, gain:.14 });
              tone({ freq:70, dur:.20, type:"sine", gain:.13 }); },
  // the second buyer sits down
  join(){ [523, 659, 784].forEach((f, i) =>
            tone({ freq:f, dur:.16, type:"triangle", gain:.10, delay:i * .07 })); },
  // sale closed
  finish(){ [392, 523, 659, 880].forEach((f, i) =>
              tone({ freq:f, dur:.34, type:"triangle", gain:.12, delay:i * .11 })); },
  // a character dropped into a role that suits them: a bright rising major
  // arpeggio with a little shine of noise on top, the "yes, that one" sound
  roleFit(){ [523.25, 659.25, 987.77].forEach((f, i) =>
               tone({ freq:f, dur:.20, type:"triangle", gain:.13, delay:i * .045 }));
             hiss({ dur:.16, type:"highpass", from:5200, to:9000, q:.8, gain:.05, delay:.05 }); },
  // dropped into a role they are plainly wrong for: a two-pulse buzzer, the
  // unmistakable "wrong" sound. Harsh detuned square and sawtooth a minor
  // second apart so they beat against each other, a noise crunch on each hit,
  // and the second pulse sags in pitch as it dies. Pitched in the mid range
  // on purpose: the first version sat at 92-196Hz, which laptop and phone
  // speakers roll off almost entirely, so it was inaudible on the machines
  // this actually gets played on. Square and sawtooth are harmonic-rich, so
  // even a small speaker reproduces them through their upper partials.
  roleBad(){
    const blat = (at, dur, bend) => {
      tone({ freq:207.65, dur, type:"square",   gain:.20, bend, delay:at });
      tone({ freq:196.00, dur, type:"sawtooth", gain:.18, bend, delay:at + .004 });
      tone({ freq:415.30, dur, type:"sawtooth", gain:.09, bend:bend * 2, delay:at });
      hiss({ dur:Math.min(.07, dur), from:2600, to:600, q:1.1, gain:.13, delay:at });
    };
    blat(0,   .15, -12);
    blat(.19, .30, -70);
  },
  // dropped somewhere that neither suits them nor hurts: a flat, neutral set
  // down. Most pairings are neither good nor bad, so without this the board
  // would stay silent on the majority of moves and feel unresponsive.
  roleSet(){ tone({ freq:262, dur:.09, type:"triangle", gain:.07 });
             hiss({ dur:.05, from:2600, to:1200, gain:.06 }); }
};


/* ------------------------------------------------------------------ *
 *  MUSIC
 *  A slow generative bed, written by the browser as it plays: walking
 *  bass, soft chords, brushed percussion and the occasional pentatonic
 *  note that never repeats the same way twice. Same reasoning as the
 *  effects, nothing sampled means nothing to licence.
 * ------------------------------------------------------------------ */
let musicOn = true, musicBus = null, musicTimer = null, musicStep = 0, musicClock = 0;
try { musicOn = localStorage.getItem("superdrafts.music") !== "off"; } catch {}

const BPM = 132;
const EIGHTH = 60 / BPM / 2;
// Tense rather than jaunty. No melody line and no square waves: those two
// together are what made it sound like a cartoon. What is left is a low
// ostinato, a filtered pad and a pulse, which is the sound of a clock running.
const CHART = [
  { bass: 55.00, chord: [220.00, 261.63, 329.63] },   // A minor
  { bass: 55.00, chord: [220.00, 261.63, 329.63] },   // A minor, held
  { bass: 36.71, chord: [174.61, 220.00, 293.66] },   // D minor
  { bass: 41.20, chord: [207.65, 246.94, 329.63] }    // E, the G# leaning back
];

// Everything pitched goes through a lowpass, which is the difference between
// a synth lead and something that sits under the room.
function musicVoice(freq, at, dur, gain, type, cutoff, detune){
  const ctx = actx;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.Q.value = .6;
  f.frequency.setValueAtTime(cutoff || 900, at);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(.05, dur * .25));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  f.connect(g); g.connect(musicBus);
  // Perfectly tuned single oscillators are what make a synth sound like a toy.
  // Two of them a few cents apart beat against each other and thicken up.
  const cents = detune === undefined ? 7 : detune;
  for (const d of (cents ? [-cents, cents] : [0])){
    const o = ctx.createOscillator();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, at);
    o.detune.setValueAtTime(d, at);
    o.connect(f);
    o.start(at); o.stop(at + dur + .05);
  }
}

// a dry tick, not a hiss
function musicBrush(at, gain, hp){
  const ctx = actx;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, .04);
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.value = hp || 3400; f.Q.value = 1.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + .004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + .04);
  src.connect(f); f.connect(g); g.connect(musicBus);
  src.start(at); src.stop(at + .05);
}

// One noise buffer, reused. At sixteenth notes this fires nine times a second,
// and rebuilding the buffer each time would churn memory for no benefit.
let hatBuf = null;
function musicHat(at, gain, open){
  const ctx = actx;
  if (!hatBuf) hatBuf = noiseBuffer(ctx, .35);
  const dur = open ? .15 : .034;
  const src = ctx.createBufferSource(); src.buffer = hatBuf;
  src.playbackRate.value = 1.6;
  const f = ctx.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = open ? 7200 : 8600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + .003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f); f.connect(g); g.connect(musicBus);
  src.start(at); src.stop(at + dur + .02);
}

function musicKick(at){
  const ctx = actx;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(105, at);
  o.frequency.exponentialRampToValueAtTime(40, at + .13);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(.30, at + .006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + .2);
  o.connect(g); g.connect(musicBus);
  o.start(at); o.stop(at + .22);
}

function musicAir(at, dur){
  const ctx = actx;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, dur);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 620;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(.014, at + .4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f); f.connect(g); g.connect(musicBus);
  src.start(at); src.stop(at + dur);
}

function scheduleMusic(){
  const ctx = actx; if (!ctx || !musicBus) return;

  // If the tab was throttled or the phone slept, musicClock is now far behind
  // real time. Without this the loop below would dump a minute of notes into
  // the past all at once, which is heard as a burst and then silence.
  if (musicClock < ctx.currentTime - .2) musicClock = ctx.currentTime + .05;

  while (musicClock < ctx.currentTime + .3){
    const barAbs = Math.floor(musicStep / 8);
    const bar = barAbs % CHART.length;
    const beat = musicStep % 8;
    const { bass, chord } = CHART[bar];

    // A sixteen bar arrangement in four sections, so the loop keeps moving
    // instead of repeating the same bar until you notice it.
    const section = Math.floor(barAbs / 4) % 4;
    const lastBarOfPhrase = barAbs % 4 === 3;

    // 2 = the breakdown: kick thins out and the pad comes forward
    const kickOn = section === 2 ? (beat === 0) : (beat === 0 || beat === 4);
    if (kickOn) musicKick(musicClock);
    if (section === 3 && beat === 6) musicKick(musicClock);       // extra push

    // the low ostinato, sparser in the breakdown, doubled in the drive
    if (section !== 2 || beat % 2 === 0)
      musicVoice(bass, musicClock, .17, beat % 2 === 0 ? .26 : .15, "triangle", 320, 0);
    if (section >= 1 && (beat === 3 || beat === 7))
      musicVoice(bass * 2, musicClock, .12, .12, "triangle", 520, 0);

    // pad, louder and longer when the drums pull back
    if (beat === 0){
      const padGain = section === 2 ? .042 : .024;
      chord.forEach((f, i) =>
        musicVoice(f, musicClock + i * .012, EIGHTH * 8.2, padGain, "sawtooth", 620));
      musicAir(musicClock, EIGHTH * 8);
    }
    // an upper voicing every other phrase, so the harmony is not identical each time
    if (beat === 0 && section >= 1 && bar % 2 === 1)
      musicVoice(chord[0] * 2, musicClock, EIGHTH * 7, .020, "sawtooth", 900);

    // hats: eighths in the breakdown, sixteenths elsewhere
    musicHat(musicClock, beat % 2 === 0 ? .052 : .036);
    if (section !== 2)
      musicHat(musicClock + EIGHTH / 2, section === 3 ? .032 : .024, beat === 7);

    if (beat === 2 || beat === 6) musicBrush(musicClock, section === 2 ? .04 : .06);

    // a fill across the last half bar of every four, which is what actually
    // signals that something is about to change
    if (lastBarOfPhrase && beat >= 6){
      musicBrush(musicClock + EIGHTH / 2, .05, 2600);
      musicVoice(bass * 4, musicClock + EIGHTH / 2, .09, .10, "triangle", 700, 0);
    }

    musicClock += EIGHTH;
    musicStep++;
  }
}

function startMusic(){
  const ctx = audio(); if (!ctx || musicTimer) return;
  musicBus = ctx.createGain();
  musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(.5, ctx.currentTime + 2.5);
  musicBus.connect(ctx.destination);
  musicClock = ctx.currentTime + .15;
  musicTimer = setInterval(scheduleMusic, 60);
  scheduleMusic();
}

function stopMusic(){
  if (musicTimer){ clearInterval(musicTimer); musicTimer = null; }
  if (musicBus && actx){
    const b = musicBus;
    b.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + .6);
    setTimeout(() => { try { b.disconnect(); } catch {} }, 900);
    musicBus = null;
  }
}

function setMusic(on){
  musicOn = on;
  try { localStorage.setItem("superdrafts.music", on ? "on" : "off"); } catch {}
  const el = $("musicToggle");
  if (el){ el.textContent = on ? "music on" : "music off";
           el.setAttribute("aria-pressed", on ? "true" : "false");
           el.classList.toggle("off", !on); }
  on ? startMusic() : stopMusic();
}

function setSfx(on){
  sfxOn = on;
  try { localStorage.setItem("superdrafts.sfx", on ? "on" : "off"); } catch {}
  const el = $("sfxToggle");
  if (el){ el.textContent = on ? "sound on" : "sound off";
           el.setAttribute("aria-pressed", on ? "true" : "false");
           el.classList.toggle("off", !on); }
  if (on) SFX.bid();
}

/* ---------------------------- render ---------------------------- */
function initials(name){
  return (name.match(/[A-Za-z]+/g) || [])
    .filter(w => !/^(the|of|al)$/i.test(w))
    .map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

/* Ultra is a very wide face and the stock runs from "Hulk" to "Drax the
   Destroyer", so the cover name is measured and shrunk to fit rather than
   guessed from character count. */
function fitName(){
  const el = $("cvName"), cover = $("cover");
  if (!el || !cover.clientWidth || !cover.clientHeight) return;
  // A short name gets sized up, which on a small cover can eat two fat lines
  // and push the footer off the card. So the name gets a height budget too,
  // smaller when a picture is sharing the cover with it.
  const hasArt = !$("cvArt").hidden;
  const maxH = cover.clientHeight * (hasArt ? 0.19 : 0.36);
  // Cap and multiplier both lowered from 52/0.163: a short name like
  // "Hulk" never needed to shrink at all under the old numbers, so it
  // rendered at the full starting size while a longer name like
  // "Red Hood" had to shrink down just to fit the available width -
  // making short names inconsistently BIGGER than longer ones instead of
  // every name sharing one comfortable default. This lowers the ceiling
  // itself so short names stop at roughly the same size longer ones
  // settle at anyway, rather than only long names ever being constrained.
  let s = Math.min(38, Math.max(18, cover.clientWidth * 0.13));
  el.style.fontSize = s + "px";
  // A name that CAN read as one line always should. -webkit-line-clamp:2
  // in the CSS exists purely as the backstop for a name that genuinely
  // cannot fit even at the size floor (a long single word, or three
  // words) - it was never meant to be a first-choice layout.
  //
  // fitsOneLine measures this directly rather than calculating an
  // expected line height mathematically (fontSize * line-height): a
  // first attempt at that math was subtly stricter than this font's real
  // rendered line box, so even a genuinely single-line name never
  // satisfied it and got shrunk all the way to the floor regardless - a
  // short, easy single word like "Ultron" ended up tiny for no reason.
  // Forcing white-space:nowrap for the measurement gets the name's TRUE
  // natural width at this size regardless of what the container would
  // otherwise wrap it to; scrollWidth alone (without nowrap) can't tell
  // "fits on one line" from "wrapped to two lines that both happen to
  // fit," since wrapped lines never exceed the container's width either.
  const fitsOneLine = () => {
    el.style.whiteSpace = "nowrap";
    const natural = el.scrollWidth;
    el.style.whiteSpace = "";
    return natural <= el.clientWidth + 1;
  };
  const fitsHeight = () => el.getBoundingClientRect().height <= maxH;
  while (s > 10 && (!fitsOneLine() || !fitsHeight())){ s -= 1; el.style.fontSize = s + "px"; }
}



function renderLot(){
  const c = lot.char;
  const cover = $("cover"), issue = $("issue");
  cover.dataset.pub = c.pub;
  cover.dataset.grp = (UNIVERSES[c.pub] || {}).group || "Other";
  $("cvPub").textContent = (UNIVERSES[c.pub] || {}).name || c.pub;
  $("cvNo").textContent = "No. " + c.no;
  $("cvName").textContent = c.name;
  $("cvInit").textContent = initials(c.name);
  const artUrl = ART.get(c.name);
  $("cvArt").hidden = !artUrl;
  cover.classList.toggle("has-art", !!artUrl);
  fitName();                       // measured after we know if art is present
  $("cvAlias").textContent = c.alias;
  $("cvNote").textContent = c.note;
  // The universe is already the masthead, so the colophon carries the tier
  // instead. With no picture the corner box still has it, so fall back there.
  const showTier = !!artUrl && BOX.tiers;
  $("cvPubFoot").textContent = showTier
    ? "Tier " + c.tier
    : ((UNIVERSES[c.pub] || {}).name || c.pub);
  $("cvPubFoot").classList.toggle("is-tier", showTier);
  $("cvPubFoot").dataset.t = showTier ? c.tier : "";
  $("cvTier").textContent = c.tier;
  $("cvTier").dataset.t = c.tier;
  $("cvTier").hidden = !BOX.tiers;
  const art = ART.get(c.name);
  $("cvArt").hidden = !art;
  if (art && $("cvImage").getAttribute("src") !== art) $("cvImage").src = art;
  const nextUp = deck && deck[0] && ART.get(deck[0].name);
  if (nextUp) { const pre = new Image(); pre.src = nextUp; }
  $("cvLot").textContent = String(lotNum).padStart(2, "0");
  $("lotNo").textContent = "Lot " + lotNum;
  $("passLeft").textContent = passesLeft() + (passesLeft() === 1 ? " pass left" : " passes left");
  $("stockLeft").textContent = lotsLeft() + " of " + perSale() + " left";
  issue.classList.remove("pulled");
  void issue.offsetWidth;
  issue.classList.add("pulled");
}

function render(){
  buildSeats();
  for (const p of seats()){
    const label = P[p].name + (ME === p ? " (you)" : "");
    $("name" + p).textContent = label;
    $("pn" + p).textContent = label;
  }
  for (const p of seats()){
    const me = P[p];
    $("purse" + p).textContent = money(me.purse);
    $("spent" + p).textContent = money(PURSE - me.purse) + " spent";
    const sl = slotsLeft(p);
    $("left" + p).textContent = sl === 0 ? "roster full" : sl + (sl === 1 ? " slot open" : " slots open");

    const ol = $("slots" + p);
    ol.innerHTML = "";
    for (let i = 0; i < SLOTS; i++){
      const li = document.createElement("li");
      const pick = me.roster[i];
      if (pick){
        li.className = "slot filled";
        li.innerHTML = `<span class="sl-name"></span><span class="sl-price"></span>`;
        li.querySelector(".sl-name").textContent = pick.char.name;
        li.querySelector(".sl-price").textContent = money(pick.price);
      } else {
        li.className = "slot empty";
        li.innerHTML = `<span class="sl-name">&nbsp;</span>`;
      }
      ol.appendChild(li);
    }
  }
  renderPanels();
  renderSticker();
  renderLadder();
}

function renderLadder(){
  const el = $("ladder");
  const h = (lot && lot.history) || [];
  if (!h.length){ el.innerHTML = ""; el.classList.remove("held"); return; }
  el.innerHTML = h.map((b, i) =>
    `<span class="rung rung-${SEATS[b.p].key}${i === h.length - 1 ? " last" : ""}">` +
    `<b></b><i></i></span>`).join("");
  [...el.children].forEach((c, i) => {
    c.querySelector("b").textContent = P[h[i].p].name;
    c.querySelector("i").textContent = money(h[i].amt);
  });
  const held = locked();
  el.classList.toggle("held", held);
  if (held){
    const last = h[h.length - 1];
    const note = document.createElement("span");
    note.className = "rung-note";
    note.textContent = `${P[last.p].name} bid ${money(last.amt)}`;
    el.appendChild(note);
  }
}

function renderSticker(){
  const solo = soloRun();
  const lbl = $("stLabel"), pr = $("stPrice"), who = $("stWho"), st = $("sticker");
  st.className = "sticker" + (lot.high === null ? "" : lot.high === 0 ? " tone-red" : " tone-blue");
  if (lot.passedIn){
    lbl.textContent = "Passed";
    pr.textContent = "--";
    who.textContent = "unsold";
    $("call").textContent = `${lot.char.name} passes in. Nobody wanted it.`;
  } else if (lot.sold){
    lbl.textContent = "Sold";
    pr.textContent = money(lot.price);
    who.textContent = P[lot.high].name;
    $("call").textContent = `${lot.char.name} goes to ${P[lot.high].name} for ${money(lot.price)}.`;
  } else if (lot.high === null){
    lbl.textContent = "Opening";
    pr.textContent = money(1);
    who.textContent = "no bids yet";
    const ob = obliged();
    $("call").textContent = ob === null
      ? "Open at $1, or pass and let it go by."
      : `${P[ob].name} has to buy this one. No passes left.`;
  } else {
    lbl.textContent = solo ? "Unopposed" : "Standing bid";
    pr.textContent = money(lot.price);
    who.textContent = P[lot.high].name;
    const waiting = rivals(lot.high).filter(q => inPlay(q) && !lot.passed[q]);
    $("call").textContent = waiting.length
      ? `${nameList(waiting)}, raise to ${money(askPrice())} or pass and let it go.`
      : "Going once…";
  }
}

const setGo = (panel, off) => { const g = panel.querySelector(".pn-go"); if (g) g.disabled = off; };

// Polled on an interval (see setInterval(driveBidTimer, ...) below) rather
// than scheduled per-second: bidDeadlineLocal can be rebuilt at any moment
// by a fresh state push (a new bid resets it, a sale resolving clears it),
// so a plain countdown that only recomputes when told to would drift or
// miss the reset. Cheap enough to just re-derive the digit every tick.
function driveBidTimer(){
  const el = $("bidTimer"), issue = $("issue");
  if (!el || $("auction").hidden){ if (el) el.hidden = true; return; }
  const numEl = $("bidTimerNum");
  const active = lot && !lot.sold && bidDeadlineLocal > 0;
  const msLeft = active ? bidDeadlineLocal - Date.now() : -1;
  const urgent = msLeft > 0 && msLeft <= BID_URGENT_MS;
  if (issue) issue.classList.toggle("timer-urgent", urgent);
  if (!urgent){
    el.hidden = true;
    bidTimerShown = 0;
    return;
  }
  const n = Math.min(3, Math.max(1, Math.ceil(msLeft / 1000)));
  el.hidden = false;
  if (n !== bidTimerShown){
    bidTimerShown = n;
    numEl.textContent = n;
    // Same reflow-restart trick as stamp() above: forces the pop animation
    // to replay from the start for each new digit rather than the browser
    // treating an already-running animation as unchanged.
    numEl.style.animation = "none";
    void numEl.offsetWidth;
    numEl.style.animation = "";
  }
}
setInterval(driveBidTimer, 100);

// Tracks the last set of bid-amount values shown per seat, so
// renderPanels() only rebuilds those buttons when they've actually
// changed - see the guard inside for the exact bug this closes.
let lastPanelBidKey = {};

function renderPanels(){
  const solo = soloRun();
  for (const p of seats()){
    const panel = $("panel" + p), bids = $("bids" + p), state = $("state" + p),
          other = $("other" + p), passBtn = panel.querySelector(".pn-pass"),
          passBtn2 = null;
    // No unconditional bids.innerHTML="" here anymore - see the guarded
    // clear-and-rebuild right before the actual button loop below for
    // why. The early-return branches below each clear it themselves
    // when transitioning OUT of "showing buttons" (a real, meaningful,
    // low-frequency change) - what this specifically avoids is
    // destroying and recreating the SAME buttons on every routine
    // re-render where nothing about the bid situation changed at all,
    // which is the overwhelming majority of calls to this function
    // (every 3-second background poll runs it, whether or not anything
    // actually changed). If a click landed on a button in the exact
    // instant one of those redundant rebuilds tore it out of the DOM,
    // the click was simply lost - "press it again and it works" was
    // this, not a real responsiveness problem.
    panel.classList.toggle("out", !inPlay(p));
    panel.classList.toggle("standing", lot.high === p);
    // Their panel is a window, not a control surface.
    panel.classList.toggle("remote", p !== ME);
    panel.classList.toggle("mine", p === ME);

    const ob = obliged(), mustBuy = lot.high === null && ob === p;
    const myTurn = p === ME && !lot.sold && inPlay(p) && lot.high !== p && !lot.passed[p];
    // Dim whoever is not being waited on, so the turn is never in doubt.
    panel.classList.toggle("idle", !myTurn);
    $("ledger" + p).classList.toggle("idle", !(inPlay(p) && !lot.sold && lot.high !== p && !lot.passed[p]));

    if (lot.sold){
      if (bids.innerHTML) bids.innerHTML = "";
      state.textContent = lot.passedIn ? "Passed in." : (lot.high === p ? "Sold to you." : "Gone.");
      other.disabled = true; passBtn.disabled = true; setGo(panel, true);
      continue;
    }

    if (p !== ME){
      if (bids.innerHTML) bids.innerHTML = "";
      state.textContent =
        !inPlay(p)      ? "Roster full. Done buying." :
        lot.passed[p]   ? "Out on this one." :
        lot.high === p  ? `Standing bid ${money(lot.price)}. Over to you.` :
        mustBuy         ? "Has to buy this one…" :
                          "Deciding…";
      other.disabled = true; passBtn.disabled = true; setGo(panel, true);
      continue;
    }

    if (!inPlay(p)){
      if (bids.innerHTML) bids.innerHTML = "";
      state.textContent = "Roster full. Done buying.";
      other.disabled = true; passBtn.disabled = true; setGo(panel, true);
      continue;
    }
    if (lot.passed[p]){
      if (bids.innerHTML) bids.innerHTML = "";
      state.textContent = "You are out on this one.";
      other.disabled = true; passBtn.disabled = true; setGo(panel, true);
      continue;
    }
    if (lot.high === p){
      if (bids.innerHTML) bids.innerHTML = "";
      state.textContent = `Standing bid ${money(lot.price)}. Waiting on the other side.`;
      other.disabled = true; passBtn.disabled = true; setGo(panel, true);
      continue;
    }

    const ask = askPrice(), cap = ceiling(p);

    if (ask > cap){
      if (bids.innerHTML) bids.innerHTML = "";
      state.textContent = `Tapped out. ${money(cap)} is your ceiling with ${slotsLeft(p)} slots to fill.`;
      other.disabled = true; passBtn.disabled = !canPass(p);
      continue;
    }

    // Only rebuild the bid-amount buttons if the actual set of values
    // has genuinely changed since the last time this panel rendered -
    // this is the specific fix for the "press it twice" report. Before,
    // this loop ran unconditionally on every call to renderPanels(),
    // including the routine 3-second background poll firing while
    // nothing about YOUR bidding options had changed at all - if a
    // click landed on one of these buttons in the exact instant a
    // redundant rebuild tore it out of the DOM and put a brand new one
    // in its place, the click simply never reached anything. Same root
    // cause, same fix shape, as the drag-and-drop and stamp bugs fixed
    // earlier today - a routine re-render destroying an element a user
    // was actively interacting with.
    const values = [ask, ask + 1, ask + 2].filter((v) => v <= cap);
    const key = values.join(",");
    // Also checks bids.innerHTML directly, not just the tracked key -
    // several of the early-return branches above clear bids.innerHTML
    // themselves (a genuinely empty state) but never touched
    // lastPanelBidKey, so it kept saying whatever value set was last
    // built. The very next lot needing that SAME set (extremely common
    // - "1,2,3" is the ordinary opening range) read as "unchanged,
    // skip it" even though the container was actually empty - the
    // buttons just silently never came back. Checking the real DOM
    // state here closes that gap without needing every early-return
    // branch to also remember to reset the tracked key correctly.
    if (lastPanelBidKey[p] !== key || !bids.innerHTML){
      lastPanelBidKey[p] = key;
      bids.innerHTML = "";
      for (const v of values){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "bid-btn";
        b.textContent = money(v);
        b.addEventListener("click", () => act("bid", v));
        bids.appendChild(b);
      }
    }
    other.disabled = false; setGo(panel, false);
    other.min = ask; other.max = cap;
    other.placeholder = `${ask} to ${cap}`;
    const cost = passCost(p);
    passBtn.disabled = !canPass(p);
    passBtn.textContent = cost ? `Pass ${money(cost)}` : "Pass";
    state.textContent = mustBuy
      ? "No passes left. This one is yours, bid at least $1."
      : lot.high !== null
        ? `Ceiling ${money(cap)} · pass and ${P[lot.high].name} takes it.`
        : cost
          ? `Ceiling ${money(cap)} · passing now costs ${money(cost)}.`
          : `Ceiling ${money(cap)} · ${passesLeft()} pass${passesLeft() === 1 ? "" : "es"} left in this sale.`;
  }
}

/* ---------------------------- finish ---------------------------- */
function finish(){
  over = true;
  pushState();
}

let faceoffSoundPlayed = false;
function showFaceoff(){
  // showFaceoff() gets called every time applyState() sees over===true -
  // which includes the 3-second polling safety net that keeps running
  // for as long as backend stays connected (indefinitely, even on this
  // screen). Nothing used to stop SFX.finish() from firing on every
  // single one of those repeated calls - this guard makes it play once
  // per transition into the screen, not once per poll. Re-armed inside
  // applyState() itself (see "Re-arm the face-off finish sound" above)
  // rather than at scattered connect-time call sites, so it can't be
  // silently lost again the way it was the first time this was fixed.
  if (!faceoffSoundPlayed){ faceoffSoundPlayed = true; SFX.finish(); }
  $("foTitle").textContent = NP === 3 ? "Five Against Five Against Five" : "Five Against Five";
  paintRoles();
  showScreen("faceoff");
  buildFoSides();
  $("againBtn").hidden = !HOST;
  $("foBox").hidden = !HOST;
  if (HOST) refreshFoBox();
  for (const p of seats()){
    $("foName" + p).textContent = P[p].name;
    const ol = $("foList" + p);
    ol.innerHTML = "";
    P[p].roster.forEach(r => {
      const li = document.createElement("li");
      li.className = "fo-item";
      li.innerHTML = `<span class="fi-name"></span><span class="fi-pub"></span><span class="fi-price"></span>`;
      li.querySelector(".fi-name").textContent = r.char.name;
      li.querySelector(".fi-pub").textContent = (UNIVERSES[r.char.pub] || {}).name || r.char.pub;
      li.querySelector(".fi-price").textContent = money(r.price);
      ol.appendChild(li);
    });
    $("foTotal" + p).textContent = `${money(PURSE - P[p].purse)} spent · ${money(P[p].purse)} unspent`;
  }
}


/* ---------------------- assigning the five roles ---------------------- */
// Everyone assigns their own five, one role each. Locked once confirmed, and
// the fight cannot be written until every buyer has locked.
const rolesDone = p => P[p].roster.length === SLOTS &&
  P[p].roster.every(r => r.role) &&
  new Set(P[p].roster.map(r => r.role)).size === SLOTS;
const allLocked = () => seats().every(p => P[p].locked);
// Whoever kept the most money calls the encounter. A tie goes to the earlier seat.
const caller = () => seats().reduce((best, p) => P[p].purse > P[best].purse ? p : best, 0);

function setRole(p, i, key){
  const r = P[p].roster[i]; if (!r || P[p].locked) return;
  const had = r.role;
  // one each: whoever held this role gives it up
  P[p].roster.forEach((x, j) => { if (j !== i && x.role === key) x.role = null; });
  r.role = key || null;
  // Sound only on my own genuinely new placement into a role: a repaint, a
  // re-drop into the slot it already sat in, or clearing back to the bench
  // should all stay silent, or every render would chime.
  if (p === ME && key && key !== had){
    if ((r.char.fit || "").includes(key)){      SFX.roleFit(); roleFlash = { role:key, kind:"fit" }; }
    else if ((r.char.bad || "").includes(key)){ SFX.roleBad(); roleFlash = { role:key, kind:"bad" }; }
    // Neither suits nor hurts, which is most pairings: acknowledge the drop
    // so the board always answers, but with no colour and no verdict.
    else SFX.roleSet();
  }
}

// Fills whatever's left unassigned with a random one-role-each pairing, for
// the 21-second role timer running out. Plain Math.random, not the seeded
// fight RNG: this happens before the match/seed exist at all, purely local
// setup, same as any other UI randomness in this file.
function lockRoles(p){
  if (!rolesDone(p) || P[p].locked) return;
  if (SOLO || !backend){
    P[p].locked = true;
    SFX.sold();
    paintRoles();
    return;
  }
  // Optimistic: locks immediately on this browser, same instant feel as
  // before - the real, validated lock (see lock-roles' own comment on
  // exactly what it checks and why) arrives moments later via the
  // normal backend snapshot, the same path as every other server-
  // confirmed change now. Rolled back if the server actually rejects it -
  // unlikely, since the client-side rolesDone() check just above already
  // agrees this is a legal assignment, but the server is still the one
  // that actually decides, not this browser.
  P[p].locked = true;
  SFX.sold();
  paintRoles();
  const roles = P[p].roster.map(r => ({ name: r.char.name, role: r.role }));
  backend.lockRoles(p, roles).catch(err => {
    P[p].locked = false;
    gameNudge(err.message);
    paintRoles();
  });
}

/* -------------------- drag & drop between bench and slots -------------------- */
// Pointer Events, not the HTML5 Drag and Drop API: DnD has no reliable touch
// support (iOS Safari has never implemented it for arbitrary elements), while
// Pointer Events unify mouse, touch and pen and work everywhere this game
// runs. A pointer that never moves is treated as tap-select-then-tap-place
// instead of a drag, which is far easier to land precisely on a phone than a
// true drag gesture, so both work side by side.
let roleDrag = null;     // { idx, chip, ghost, startX, startY, moved, pointerId }
let roleSelected = null; // { idx } while a chip is picked up by tap
// Set by setRole() when I land a character in a role, read once by the next
// paintRoles() to play the burst on that row only. A plain repaint (a peer's
// move arriving, a name change) leaves it null, so nothing flashes.
let roleFlash = null;    // { role, kind: "fit" | "bad" }

function roleDragCleanup(){
  if (roleDrag){
    roleDrag.chip.classList.remove("dragging-source");
    if (roleDrag.ghost) roleDrag.ghost.remove();
  }
  document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  roleDrag = null;
}

// The chip is just the character's name now. It used to carry small green and
// red role letters, but the row itself lights up on a good or bad placement,
// so the badges were saying the same thing twice and cluttering the chip.
function roleChipHtml(p, i){
  const selected = roleSelected && roleSelected.idx === i ? " selected" : "";
  return `<div class="role-chip${selected}" data-idx="${i}">
    <span class="rc-name"></span>
  </div>`;
}

function onRolePointerDown(e){
  if (!P || P[ME].locked) return;
  const chip = e.target.closest(".role-chip");
  if (chip){
    const idx = Number(chip.dataset.idx);
    roleDrag = { idx, chip, ghost: null, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
    try { chip.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  // Not a chip: with something already picked up by tap, tapping a slot or
  // the bench places or unassigns it immediately, no drag gesture needed.
  if (!roleSelected) return;
  const slot = e.target.closest(".rs-drop");
  const bench = e.target.closest(".role-bench");
  if (slot){ setRole(ME, roleSelected.idx, slot.dataset.role); roleSelected = null; paintRoles(); }
  else if (bench){ setRole(ME, roleSelected.idx, null); roleSelected = null; paintRoles(); }
}

function onRolePointerMove(e){
  if (!roleDrag) return;
  const dx = e.clientX - roleDrag.startX, dy = e.clientY - roleDrag.startY;
  if (!roleDrag.moved && Math.hypot(dx, dy) > 6){
    roleDrag.moved = true;
    roleSelected = null;                       // a real drag replaces any pending tap-select
    roleDrag.chip.classList.add("dragging-source");
    const ghost = roleDrag.chip.cloneNode(true);
    ghost.className = "role-chip role-chip-ghost";
    document.body.appendChild(ghost);
    roleDrag.ghost = ghost;
  }
  if (!roleDrag.moved) return;
  roleDrag.ghost.style.left = e.clientX + "px";
  roleDrag.ghost.style.top = e.clientY + "px";
  document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const target = under && (under.closest(".rs-drop") || under.closest(".role-bench"));
  if (target) target.classList.add("drag-over");
}

function onRolePointerUp(e){
  if (!roleDrag) return;
  const { idx, moved } = roleDrag;
  if (!moved){
    // A plain tap: pick this character up for a follow-up tap on a target,
    // or put it back down if it was already the one selected.
    roleSelected = (roleSelected && roleSelected.idx === idx) ? null : { idx };
    roleDragCleanup();
    paintRoles();
    return;
  }
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const slot = under && under.closest(".rs-drop");
  const bench = under && under.closest(".role-bench");
  roleDragCleanup();
  if (slot) setRole(ME, idx, slot.dataset.role);
  else if (bench) setRole(ME, idx, null);
  // dropped anywhere else: no change, the chip just snaps back on repaint
  paintRoles();
}

function onRolePointerCancel(){ roleDragCleanup(); }

function paintRoles(){
  const box = $("roleBox"); if (!box) return;
  // Skip the repaint entirely while a drag is in progress, rather than
  // cancelling the drag (the old behavior here). paintRoles() now fires
  // on every routine 3-second backend poll, not just when a peer's move
  // genuinely arrives - the poll carries no new information about MY OWN
  // roles at all (those only ever change via my own actions), so there
  // is nothing here worth interrupting a drag for. The longer a drag is
  // held, the more likely it overlaps a poll; cancelling on every one of
  // them made anything slower than ~3 seconds effectively impossible to
  // complete - "snaps back if you hold it too long" was this, precisely.
  // Same protection extended to tap-to-select, not just drag: tapping a
  // bench chip once (setting roleSelected, waiting for a second tap to
  // place it) never touches roleDrag at all, so it was still exposed to
  // exactly the same bug - a routine poll landing between the two taps
  // could destroy the very chip just tapped before the second tap ever
  // registered on it.
  if (roleDrag || roleSelected) return;
  box.innerHTML = "";
  for (const p of seats()){
    const mine = p === ME, locked = P[p].locked;
    const sec = document.createElement("section");
    sec.className = `role-side role-${SEATS[p].key}` + (mine ? " mine" : "");

    if (mine && !locked){
      // Editable view: a bench of unassigned characters above five fixed
      // role slots. Dropping a character onto an already-filled slot bumps
      // its previous occupant back to the bench (setRole already enforces
      // one character per role); dropping onto the bench, or anywhere that
      // is not a slot, unassigns it.
      const bench = P[p].roster.map((r, i) => ({ r, i })).filter(({ r }) => !r.role);
      sec.innerHTML = `<div class="ledger-tab"><span class="lt-name"></span></div>
        <div class="role-bench" data-drop="bench">${
          bench.length ? bench.map(({ i }) => roleChipHtml(p, i)).join("")
                        : `<span class="role-bench-empty">All five assigned</span>`
        }</div>
        <ul class="role-slots">${
          ROLES.map(ro => {
            const i = P[p].roster.findIndex(r => r.role === ro.k);
            // A character sitting in a role they suit lights the whole row up;
            // one sitting in a role they are bad at marks it instead. Same
            // source of truth the tier maths uses (roleShift), so what the
            // board shows and what the fight scores can never disagree.
            const occupant = i > -1 ? P[p].roster[i].char : null;
            const fit = occupant && (occupant.fit || "").includes(ro.k);
            const bad = occupant && (occupant.bad || "").includes(ro.k);
            return `<li class="role-slot${fit ? " is-fit" : ""}${bad ? " is-bad" : ""}${
              roleFlash && roleFlash.role === ro.k ? " just-" + roleFlash.kind : ""}">
              <div class="rs-badge">
                ${roleIconHtml(ro.k)}
                <span class="rs-name">${ro.name}</span>
              </div>
              <div class="rs-drop${i > -1 ? " filled" : " empty"}" data-role="${ro.k}">
                ${i > -1 ? roleChipHtml(p, i) : `<span class="rs-placeholder">Drop a character here</span>`}
              </div>
            </li>`;
          }).join("")
        }</ul>`;
      sec.querySelectorAll(".role-chip").forEach(chip => {
        chip.querySelector(".rc-name").textContent = P[p].roster[Number(chip.dataset.idx)].char.name;
      });
    } else {
      sec.innerHTML = `<div class="ledger-tab"><span class="lt-name"></span></div>
                       <ul class="role-list"></ul>`;
      const ul = sec.querySelector(".role-list");
      P[p].roster.forEach(r => {
        const li = document.createElement("li");
        li.className = "role-row";
        li.innerHTML = `<span class="role-char"></span><span class="role-shown"></span>`;
        li.querySelector(".role-char").textContent = r.char.name;
        li.querySelector(".role-shown").textContent =
          locked && r.role ? ROLE[r.role].name : (r.role ? "…" : "unassigned");
        ul.appendChild(li);
      });
    }

    sec.querySelector(".lt-name").textContent =
      P[p].name + (mine ? " (you)" : "") + (locked ? " · locked" : "");

    if (mine && !locked){
      const b = document.createElement("button");
      b.type = "button"; b.className = "stamp-btn stamp-btn-sm role-lock";
      b.innerHTML = `<span>Lock the Roles</span>`;
      b.disabled = !rolesDone(p);
      b.addEventListener("click", () => lockRoles(p));
      sec.appendChild(b);
    }
    box.appendChild(sec);
  }

  roleFlash = null;   // consumed: the burst plays on this paint only

  // Arm once, the first repaint that finds me unlocked - not on every
  // repaint, or a drag mid-countdown (which also calls paintRoles()) would
  // keep resetting my own clock. Cleared in lockRoles() above the moment I
  // lock, and naturally re-arms for the next deal since .locked goes back
  // to false there too.
  // No clock on the role board. Choosing five roles is the one genuinely
  // considered decision in the game and it does not want a countdown over it.

  paintEncounter();

  const ready = allLocked();
  if (ST){ stPaint(); return; }
  const iCall = caller() === ME;
  $("writeBtn").disabled = !ready || !iCall;
  $("writeHint").textContent = !ready
    ? "Waiting on " + seats().filter(p => !P[p].locked).map(p => P[p].name).join(" and ") + "."
    : iCall ? "Every role is locked. Start it."
            : `Every role is locked. ${P[caller()].name} calls the encounter.`;
  // The mode-selection clock only ever applies to me, only once everyone's
  // roles are locked and it's actually my call to make.
  // and none on the encounter choice either, for the same reason.
}

/* ------------------------- the writer ------------------------- */
const MODE_NAME = { random: "Random encounter", prep: "A week of prep" };

// A round number past the roster size is sudden death, not a sixth regular
// round: "Round 6 of 5" would read as a bug even though it is not one. Every
// place that prints a round number goes through this so the label and the
// actual picking rules (myRemaining(), MATCH's own eligible()) never say
// two different things about which phase the match is in.
const roundLabel = n => n <= SLOTS ? `Round ${n}` : `Overtime ${n - SLOTS}`;

// Each draft is worth two issues, one of each encounter. Writing the same one
// twice would cost tokens to tell the same story, so a used encounter closes.
const runsDone = () => (ST && ST.runs) || [];
const modeLeft = m => !runsDone().includes(m);

function paintEncounter(){
  const boss = caller(), iCall = boss === ME;
  const busy = !!(ST && ST.busy) || (ST && !ST.end && !ST.err);

  document.querySelectorAll('input[name="encounter"]').forEach(el => {
    const used = !modeLeft(el.value);
    el.disabled = !iCall || used || busy;
    const opt = el.closest(".enc-opt");
    if (opt) opt.classList.toggle("enc-used", used);
  });

  // Never leave the used one selected, or Write the Fight has nothing to do.
  const cur = document.querySelector('input[name="encounter"]:checked');
  if (cur && !modeLeft(cur.value)){
    const free = [...document.querySelectorAll('input[name="encounter"]')]
      .find(el => modeLeft(el.value));
    if (free) free.checked = true;
  }

  $("encounter").classList.toggle("not-yours", !iCall);
  const left = 2 - runsDone().length;
  $("encWho").textContent =
    left === 0 ? "Both encounters have been fought. This draft is finished."
    : runsDone().length === 1
      ? (iCall ? "One encounter left. Run the other to see how it would have gone."
               : `${P[boss].name} has one encounter left to call.`)
    : iCall ? `You kept the most money (${money(P[ME].purse)}), so the encounter is your call.`
            : `${P[boss].name} kept the most money (${money(P[boss].purse)}), so it is their call.`;
}

function chosenMode(){
  const el = document.querySelector('input[name="encounter"]:checked');
  return el ? el.value : "random";
}

// The fight is written a beat at a time so the people playing get to steer it.
// Two paragraphs, then the player whose turn it is picks what their side does,
// then two more. Only the host ever talks to the writer, so a beat is never
// written twice, and every call after the first carries a one sentence recap
// instead of the whole transcript, which is what keeps this cheap.
let ST = null;

const escTxt = s => String(s == null ? "" : s)
  .replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]));

// Which round's reveal has already played its flip animation. Keyed by a
// signature of the names involved rather than a round number, since both
// browsers need to agree on "have I shown this one yet" independently and a
// name list is a simpler thing for two clients to agree on than bookkeeping
// an index through every network hop. Re-rendering an already-seen round
// (a resize, an unrelated repaint) shows the cards already face up, no
// second flip.
let revealedRound = "";
// True while a flip animation is actually mid-flight. stPaint() can be
// re-invoked (the 3-second backend poll, an unrelated Realtime event) in
// the exact window between a flip being queued and its requestAnimationFrame
// callbacks actually firing - that second call used to rebuild storyBody's
// entire innerHTML, destroying the pending animation's DOM element before
// it ever got to flip. The card just appeared already face-up, and whether
// that happened depended purely on exact timing - sometimes a poll landed
// in that window, sometimes it didn't. This flag makes stPaint() skip
// rebuilding storyBody while a flip it already started is still playing,
// rather than letting a second call race the first one's animation.
let flipInFlight = false;

// Builds the two (or three) face-down cards that flip to reveal who actually
// fought this round, with a stamped VS between each pair. Pulls the art and
// universe the same way the main lot card does, from the roster each owner
// already has, so nothing new has to be fetched for this.
//
// opts.historic marks a round that already resolved on an EARLIER render:
// every round but the very latest one, once there is more than one. Those
// always render already flipped, with the win/lose treatment already on,
// since there is nothing left to wait for or animate; only the current
// round still needs the flip and the delayed effects in opts.effectsReady.
function revealHtml(ranked, opts){
  const { effectsReady, historic } = opts || {};
  if (!ranked || !ranked.length) return "";
  const sig = ranked.map(x => x.owner + ":" + x.name).join("|");
  // revealedRound only ever tracks the CURRENT round's own flip: a historic
  // round is never fresh (it already played its flip on an earlier render)
  // and must not touch this, or rendering an older round after the newest
  // one would overwrite the bookkeeping the newest round still needs.
  const fresh = historic ? false : sig !== revealedRound;
  if (!historic) revealedRound = sig;
  const shown = historic || effectsReady;
  // A draw has no single winner ONLY when the top spot itself is shared:
  // two or three seats tied for place 1. A fighter can carry x.draw
  // without that being true - in a three-seat round, two fighters can tie
  // with each other for a WORSE spot while a third stands alone in first,
  // and that third fighter is a perfectly real, undisputed winner even
  // though the other two are drawn cards in the very same round.
  const topPlace = ranked.filter(x => x.place === 1);
  const roundWinner = topPlace.length === 1 ? topPlace[0].name : null;
  const drawNames = topPlace.length > 1 ? topPlace.map(x => x.name) : [];
  const maxPlace = Math.max(...ranked.map(x => x.place));
  const n = ranked.length;

  // Display order only - NOT the ranking. `ranked` comes straight from
  // fight.js sorted best-to-worst, so mapping it onto columns in that same
  // order put the winner in column 1, i.e. the left seat, every single
  // time. Every place/draw/eff value already lives on each entry, so
  // reordering the array for display cannot touch who actually won; it
  // only changes which column a given card prints in. Seeded off `sig`
  // (identical on both browsers for the same round) rather than
  // Math.random, so host and guest still render the same layout for the
  // same round instead of disagreeing about where each card sits. A plain
  // multiply-add LCG's low bits are not random enough to feed straight
  // into `% (i+1)` here - it kept landing the shuffle back on the same
  // slot far more than chance allowed - so this mixes the seed the same
  // way fight.js's own rng() does before drawing from it.
  let hSeed = 0;
  for (let i = 0; i < sig.length; i++) hSeed = (Math.imul(hSeed, 31) + sig.charCodeAt(i)) | 0;
  let a = hSeed >>> 0;
  const shuffleRng = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = ranked.slice();
  for (let i = shuffled.length - 1; i > 0; i--){
    const j = Math.floor(shuffleRng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // A grid, not a flex row: a fighter column for every card, an auto-width
  // column for every VS between them, so the tier chip underneath a given
  // card can be placed in that SAME numbered column (see tierChips below)
  // and land directly under its own card instead of the row of chips just
  // centering itself independently of where the cards actually sit.
  const gridCols = Array.from({ length: n * 2 - 1 },
    (_, i) => i % 2 === 0 ? "minmax(0,1fr)" : "auto").join(" ");

  const cards = shuffled.map((x, i) => {
    const seat = seats().find(q => P[q].name === x.owner);
    const entry = seat != null && P[seat].roster.find(r => r.char.name === x.name);
    const c = entry && entry.char;
    const artUrl = c && ART.get(c.name);
    const pub = c ? ((UNIVERSES[c.pub] || {}).name || c.pub) : "";
    // Last place is the only one that actually lost: in a three-seat round,
    // second still scored a point, and giving them the droop-and-grayscale
    // treatment alongside the real loser overstated it. Only whoever holds
    // the WORST place actually present this round gets it - place numbers
    // can skip a slot now that ties share one (two tied for 1st means the
    // next place is 2, not 3), so this checks against the real maximum
    // rather than assuming it always equals the seat count.
    // A draw overrides both: any fighter who shares a tier with at least
    // one other fighter this round gets the combined win-and-lose
    // treatment instead, regardless of where in the ranking that tie
    // landed - win or lose language does not apply to a card that did
    // neither.
    const isLast = x.place === maxPlace;
    const cardClass = x.draw ? " reveal-draw" : x.place === 1 ? " reveal-win" : isLast ? " reveal-lose" : "";
    return `
      <div class="reveal-card${cardClass}" style="grid-column:${2 * i + 1};grid-row:1">
        <div class="reveal-card-inner" style="transition-delay:${i * 0.14}s">
          <div class="reveal-face reveal-back"><div class="reveal-face-clip"><span class="reveal-back-mark">SD</span></div></div>
          <div class="reveal-face reveal-front">
            <div class="reveal-face-clip">
              ${artUrl ? `<img class="reveal-front-img" src="${artUrl}" alt="">`
                       : `<span class="reveal-front-blank">?</span>`}
              ${x.draw ? `<span class="reveal-draw-badge">=</span>`
                       : x.place === 1 ? `<span class="reveal-win-badge">★</span>` : ""}
              <span class="reveal-front-scrim"></span>
              <span class="reveal-front-info">
                <span class="reveal-front-pub">${escTxt(pub)}</span>
                <span class="reveal-front-name">${escTxt(x.name)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>`;
  });

  // A VS badge between every adjacent pair, so three-seat rounds get two,
  // each sitting in its own auto-width column between the two cards it
  // separates.
  const vsBadges = [];
  for (let i = 0; i < n - 1; i++)
    vsBadges.push(`<span class="reveal-vs" style="grid-column:${2 * i + 2};grid-row:1">VS</span>`);

  // is-fresh/is-shown govern only the flip itself, which always happens
  // right away. is-effects is separate and arrives up to 3 seconds later:
  // it is what actually switches on the winner's glow and the loser's droop
  // and grayscale, see the matching rules in styles.css.
  // The tier chips: name, a material medallion, then "Tier", one per
  // fighter column so each chip sits directly under its own card - same
  // column number the card above it used, row 3 rather than row 1. Gated
  // on the same effects timer as the win/lose glow so it lands with the
  // reveal rather than before it.
  const tierChips = shuffled.map((x, i) =>
    `<span class="tier-chip" style="grid-column:${2 * i + 1};grid-row:3">`
    + `<span class="tier-chip-name">${escTxt(x.name)}</span>${tierIconHtml(x.eff)}`
    + `<span class="tier-chip-label">Tier</span></span>`).join("");

  const winnerLine = roundWinner
    ? `Winner: <b>${escTxt(roundWinner)}</b>`
    : `Stalemate: <b>${escTxt(drawNames.join(" & "))}</b>`;

  return `<div class="round-reveal${ranked.length > 2 ? " is-three" : ""}${historic ? " round-reveal-historic" : ""}${fresh ? " is-fresh" : " is-shown"}${shown ? " is-effects" : ""}"
    style="grid-template-columns:${gridCols}">
    ${cards.join("")}
    ${vsBadges.join("")}
    <p class="round-winner${shown ? " is-effects" : ""}" style="grid-column:1/-1;grid-row:2">${winnerLine}</p>
    ${tierChips}
  </div>`;
}

// The end-of-match winner board and the mid-match corner tally, see below.

// The cards, the VS badge and the flip itself all happen the instant a round
// resolves, same as always: that is the reveal, and nothing about it waits.
// What waits is the PAYOFF on top of it, the win/lose treatment (the gold
// glow, the loser's droop and grayscale) and the scoreboard update, both
// held back 3 seconds so they land after a beat rather than spoiling the
// reveal instantly.
const EFFECT_DELAY_MS = 3000;
let pendingEffects = null;             // { sig, showAt } for a round's effects still waiting
let shownSig = "";                     // signature of the round whose effects have fired
let shownStandings = null, shownWinner = null, shownRoundWinners = [];

function revealSig(ranked){
  return ranked ? ranked.map(x => x.owner + ":" + x.name).join("|") : "";
}

// The end-of-match winner board: a stamped "WINNER" badge, then each side's
// points as a proportional bar. Only ever called once the match has ended
// (winner is truthy) - the running score during rounds 1-4 lives in the
// small #matchTally corner readout instead, not a big centered box, so this
// no longer needs to track "did this row just gain a point" the way the old
// every-round version did.
function scoreboardHtml(standings, winner){
  if (!standings || !standings.length || !winner) return "";
  const top = Math.max(1, ...standings.map(x => x.points));

  const rows = standings
    .slice()
    .sort((a, b) => b.points - a.points)
    .map(x => {
      const isTop = x.owner === winner;
      const pct = Math.round((x.points / top) * 100);
      return `<li class="fb-row${isTop ? " fb-row-win" : ""}">
        <span class="fb-name">${escTxt(x.owner)}${isTop ? ` <b class="fb-crown">★</b>` : ""}</span>
        <span class="fb-bar"><span class="fb-bar-fill" style="width:${pct}%"></span></span>
        <span class="fb-pts">${x.points}</span>
      </li>`;
    }).join("");

  return `<div class="final-board is-final">
    <div class="fb-stamp">
      <span class="fb-stamp-label">Winner</span>
      <span class="fb-stamp-name">${escTxt(winner)}</span>
    </div>
    <ul class="fb-standings">${rows}</ul>
  </div>`;
}

// The small running score shown in the corner during rounds 1 to 4, in the
// exact same spot and styling as the "Round X of 5" counter on the other
// side of the same line. Plain text, not the big stamped board: that is
// reserved for the finish, once there is an actual winner to declare rather
// than just a lead.
function matchTallyText(standings){
  if (!standings || !standings.length) return "";
  return standings.slice().sort((a, b) => b.points - a.points)
    .map(x => `${x.owner} ${x.points}`).join("   ·   ");
}

// The small line under the mode name at the very end, reusing #storyScore's
// existing styling (already small, red toned, uppercase) rather than adding
// a new element: that field only ever shows the round counter during the
// match and sits empty once it ends, so it is free to repurpose here.
function tierScoreCaption(){
  if (!ST.v) return "";
  const basis = ST.mode === "prep" ? "with a week of prep" : "on raw capability";
  const parts = seats().map(p => `${escTxt(P[p].name)} ${Math.round(ST.v.scores[p])}`).join(", ");
  const tail = ST.v.close ? "Close enough that the choices decide it."
    : "Not especially close, on paper.";
  return `Tier score, ${basis}, roles counted: ${parts}. ${tail}`;
}

function stPaint(){
  const box = $("story"), cw = $("storyChoice");
  if (!ST){ box.hidden = true; cw.hidden = true; return; }
  box.hidden = false;

  let html = "", plain = [];
  if (ST.title){
    html += `<h2 class="story-title">${escTxt(ST.title)}</h2>`;
    plain.push(ST.title.toUpperCase());
  }

  // The win/lose effect and the scoreboard both wait 3 seconds from when
  // this round's cards first appeared, so they land after there has been
  // time to read, not the instant the round resolves. The cards, VS and flip
  // are not gated by this at all, see the ST.beats loop below.
  const curSig = revealSig(ST.lastRound);
  if (curSig && curSig !== shownSig && (!pendingEffects || pendingEffects.sig !== curSig)){
    pendingEffects = { sig: curSig, showAt: Date.now() + EFFECT_DELAY_MS };
    clearTimeout(window.__effectDelayTimer);
    window.__effectDelayTimer = setTimeout(stPaint, EFFECT_DELAY_MS + 30);
  }
  if (pendingEffects && Date.now() >= pendingEffects.showAt){
    shownSig = pendingEffects.sig;
    shownStandings = ST.standings;
    shownWinner = ST.end && ST.end.winner;
    // .slice(), not a bare reference: ST.standings gets reassigned to a
    // fresh array every round, so a reference to it is safe, but
    // ST.roundWinners is grown with .push() on the SAME array across the
    // whole match. A bare reference here would silently keep growing after
    // this "freeze", showing the very next round's winner in the pie before
    // its own 3 second wait had even started.
    shownRoundWinners = ST.roundWinners.slice();
    pendingEffects = null;
  }

  ST.beats.forEach((b, i) => {
    // A small subheading per round, ahead of that round's reveal.
    // Deliberately an h4 with its own class, not another h3: .story-body h3
    // already carries the big bold styling used for "Winner"/"The Draft
    // Read", and reusing it here would make every round number shout as
    // loud as those, rather than sit under them as a sub-heading should.
    html += `<h4 class="round-head">${roundLabel(i + 1)}</h4>`;
    // Every resolved round gets its reveal now, not just the latest: the
    // point is to be able to look back over the whole match and see who
    // fought and who won each round, not just the one that just happened.
    // Only the newest one is still time-gated (see historic in
    // revealHtml's own comment); everything earlier renders already
    // flipped, with the win/lose treatment already settled.
    const isLast = i === ST.beats.length - 1;
    if (b.ranked)
      html += revealHtml(b.ranked, isLast
        ? { effectsReady: revealSig(b.ranked) === shownSig }
        : { historic: true });
    plain.push(roundLabel(i + 1));
  });

  // Live from round 1's result onward, not just at the very end: it always
  // reflects the running score. Gated on shownStandings, the 10-second
  // delayed value, not ST.standings directly, so the score does not
  // visibly jump before the paragraph explaining the jump has been read.
  // scoreboardHtml() only actually returns anything once shownWinner is set,
  // so this only ever shows in the body after round 5, not every round.
  if (shownStandings){
    html += scoreboardHtml(shownStandings, shownWinner);
    if (shownWinner) plain.push(`Winner: ${shownWinner}`);
    plain.push(shownStandings.map(x => `${x.owner} ${x.points}`).join("  ·  "));
  }
  if (ST.err) html += `<p class="story-err">${escTxt(ST.err)}</p>`;
  // Only rebuild storyBody if nothing is still mid-flip. Everything else
  // in stPaint() (encounter picker, write button, score) still runs
  // normally either way - this guard is scoped to just this one DOM
  // mutation, the one a racing second call could destroy an in-flight
  // animation by replacing.
  if (!flipInFlight){
    $("storyBody").innerHTML = html;
    window.__story = plain.join("\n\n");

    // The reveal is inserted face down (see .is-fresh in the CSS); flipping it
    // here, one frame after it first paints, is what makes it read as a
    // reveal rather than the cards just appearing already face up. Only for a
    // freshly-built one: an already-seen round painted again (a resize, an
    // unrelated repaint) rendered face up from the start and has nothing to
    // flip. Selected by class, not id: with every past round now rendered
    // alongside the current one, .round-reveal is no longer a single element,
    // and at most one of them ever carries .is-fresh at a time anyway.
    const fresh = $("storyBody").querySelector(".round-reveal.is-fresh");
    if (fresh){
      flipInFlight = true;
      const clearFlight = () => { flipInFlight = false; };
      // transitionend is the real signal the flip actually finished; the
      // timeout is only a safety net in case that event never fires for
      // some reason (element removed mid-transition, etc.) - without it,
      // a missed event would leave storyBody frozen, never rebuilding
      // again for the rest of the match.
      fresh.addEventListener("transitionend", clearFlight, { once: true });
      setTimeout(clearFlight, 1200);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fresh.classList.add("is-flipping");
        SFX.pull();
      }));
    }
  }

  // The round counter stays on the left exactly as before. The right side is
  // new: the live running score during rounds 1 to 4, in the same small
  // red-toned styling, mirrored to the opposite edge of the same line. Once
  // the match ends the right side clears, since the stamp and bars above
  // already show the final score, and the left side switches to the tier
  // caption the same way it always has.
  const leftText = shownWinner ? tierScoreCaption()
    : (ST.end || !ST.standings) ? "" : roundLabel(ST.round || 1);
  const rightText = shownWinner ? "" : matchTallyText(shownStandings);
  $("storyScoreLeft").textContent = leftText;
  $("storyScoreRight").textContent = rightText;
  $("storyScore").hidden = !leftText && !rightText;
  $("storyFoot").textContent = shownWinner ? (MODE_NAME[ST.mode] || "") : "";

  // The pick panel. Each side sends one character a round and sees only its
  // own hand, which is the whole point of the format. Also waits on the
  // same 3 second effects delay as the reveal above: without this, a fast
  // player could send round 2's pick, and even see round 2 begin, before
  // round 1's win/lose treatment and scoreboard had actually shown up.
  const effectsShown = !ST.lastRound || revealSig(ST.lastRound) === shownSig;
  const eliminated = ST.contenders && !ST.contenders.includes(P[ME].name);
  const picking = !ST.end && !ST.busy && MATCH && effectsShown && !eliminated;
  cw.hidden = ST.end || ST.busy || !MATCH;
  if (eliminated && !ST.end && !ST.busy && MATCH){
    // A partial tie sent only the genuinely tied sides to overtime -
    // this seat's own finish is already locked in, nothing left for
    // them to send. Showing a clear reason here instead of just an
    // empty or disabled picker, which would otherwise look like a bug
    // rather than the actual, correct outcome of how the tie broke.
    $("scWho").textContent = "Your side didn't make the tiebreak. Watching to see who does.";
    $("scOpts").innerHTML = ""; lastPickOptionsKey = null;
  } else if (!ST.end && !ST.busy && MATCH && !effectsShown){
    $("scWho").textContent = "Reading the last round…";
    $("scOpts").innerHTML = ""; lastPickOptionsKey = null;
  } else if (picking){
    const mine = myRemaining();
    const sent = ST.picks && ST.picks[P[ME].name];
    const waiting = (ST.locked || []).filter(n => n !== P[ME].name);
    // Arm the 5-second clock the moment this becomes a live, unmade choice;
    // clear it once sent. Keyed on the round (and overtime phase) rather
    // than just "sent or not", so a repaint mid-countdown (another player's
    // bid... pick landing, a resize, anything that calls stPaint again)
    // never restarts a clock that is already running for this same round.
    // Sending a fighter is untimed. A five second clock that fired a random
    // card on your behalf took the round away from whoever was still deciding.
    // textContent escapes on its own; escTxt here would show the entities.
    $("scWho").textContent = sent
      ? `${sent} is in. Waiting on the others.`
      : ST.overtime
        ? `${roundLabel(ST.round || 1)}. Sudden death — send anyone but a card that already drew. They will not see who until it lands.`
        : `${roundLabel(ST.round || 1)}. Send one of yours. They will not see who until it lands.`;
    const opts = $("scOpts");
    // Same fix, same reasoning, as the bid buttons in renderPanels():
    // this used to rebuild every fight-pick card unconditionally on
    // every call, including the routine 3-second poll firing while a
    // pick was simply sitting there unmade - if a tap landed in the
    // instant one of those redundant rebuilds tore a card out of the
    // DOM, the tap was lost. This arguably matters MORE than the bid
    // buttons: every single round of every fight needs exactly one of
    // these taps to register the first time. Key includes `sent` too,
    // not just the card list, so the one legitimate rebuild that SHOULD
    // happen (disabling the cards the instant you actually pick) still
    // does - that transition is driven by your own click, not an
    // incidental background poll, so there's no reason to guard it.
    const optKey = mine.map(c => c.name).join(",") + "|" + (sent || "");
    // Also checks opts.innerHTML directly, not just the tracked key -
    // same defensive reasoning as the bid-button guard's identical
    // check: this already resets lastPickOptionsKey correctly in both
    // branches that clear opts.innerHTML above, so it isn't currently
    // exposed to that exact bug, but checking the real DOM state here
    // too means it can't regress the same way even if a future branch
    // ever clears the container without remembering to reset the key.
    if (lastPickOptionsKey !== optKey || !opts.innerHTML){
      lastPickOptionsKey = optKey;
      opts.innerHTML = "";
      mine.forEach(c => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sc-opt sc-send sc-card";
        b.disabled = !!sent;
        const artUrl = ART.get(c.name);
        b.innerHTML = `
          ${artUrl ? `<img class="sc-card-img" src="${artUrl}" alt="" loading="lazy">`
                    : `<span class="sc-card-blank">?</span>`}
          <span class="sc-card-scrim"></span>
          <span class="sc-card-info">
            <span class="sc-card-pub"></span>
            <span class="sc-card-name"></span>
          </span>`;
        b.querySelector(".sc-card-pub").textContent = (UNIVERSES[c.pub] || {}).name || c.pub;
        b.querySelector(".sc-card-name").textContent = c.name;
        if (!sent) b.addEventListener("click", () => sendPick(c.name));
        opts.appendChild(b);
      });
    }
    if (!mine.length) $("scWho").textContent = "Nobody left to send.";
  }

  // Only the person who called the encounter can start it, and only once.
  const done = !!ST.end || !!ST.err;
  const spent = ST.runs && ST.runs.length >= 2 && !ST.err;
  const iCall = caller() === ME;
  paintEncounter();
  $("writeBtn").disabled = ST.busy || !done || spent;
  $("writeHint").textContent = ST.err
    ? "Something went wrong. You can run it again."
    : spent ? "Both encounters are done. Run it again for a fresh draft."
    : done ? "Run the other encounter to see how the same five would have done."
           : "Five rounds, one character each, nobody sees the other pick. A tied score after five forces sudden death.";
  // No clock between matches either.
}

// Guests send the intent, the host owns the state. Same shape as bidding.
// The fight has its own state path, separate from pushState, so the bots
// need waking here too or they would sit out every round.
function stSend(){
  if (HOST) send({ t: "st", st: ST });
  if (SOLO) botTick();
}

// The five round match. Each side sends one character, nobody sees the other
// pick until both are in, and every character fights exactly once. Resolved
// locally by fight.js, so no writer, no tokens and no rate limit.
let MATCH = null;

// Wipes every trace of whatever match last ran on THIS browser: the synced
// ST itself, the local MATCH built from it, and the handful of plain
// module-level timers/flags (revealedRound, shownSig, pendingEffects,
// shownStandings, shownWinner, shownRoundWinners) that track the reveal
// animation and the delayed win/lose payoff. All of those live outside ST
// on purpose (see their own comments above), which also means none of them
// get cleared just by ST being replaced or nulled elsewhere - they have to
// be reset here explicitly, on both browsers, or a name that repeats in the
// next deal reads as "already sent" from a fight that finished games ago,
// and the previous game's win/lose glow or scoreboard can flash for a
// moment before the new match's own effects arrive.
// Tracks the last set of fight-pick card options shown (plus whether a
// pick has been sent), so the picker only rebuilds when that actually
// changes - see the guard inside stPaint() for the exact bug this closes.
let lastPickOptionsKey = null;

function resetMatchState(){
  ST = null; MATCH = null; matchRuns = []; lastSeenSeed = null;
  pendingEffects = null; shownSig = ""; shownStandings = null; shownWinner = null;
  shownRoundWinners = []; revealedRound = ""; flipInFlight = false;
  lastPickOptionsKey = null;
  clearTimeout(window.__effectDelayTimer);
}

// runs isn't part of the backend's matches.state at all - it's a
// per-face-off-session concept ("has random and/or prep been fought
// yet"), not something a single match row tracks. Kept module-level
// rather than inside ST, so it survives ST being rebuilt fresh on every
// snapshot; only resetMatchState() (a genuinely new draft) clears it.
let matchRuns = [];
let lastSeenSeed = null;

// Stage 3: builds ST from the real matches row instead of from a locally
// resolved MATCH.resolve() call. Called from a dedicated backend.onSnapshot
// listener (see openTable()/onSeated()) whenever match data changes -
// separate from applyState()'s own listener, since applyState() early-
// returns via showFaceoff() once over===true and never reaches anything
// past that, which is exactly the screen this needs to keep updating.
//
// MATCH itself is still rebuilt locally via createMatch(), same as
// before Stage 3 - that was never the trust problem. createMatch() is a
// pure function: given the same seed/teams/mode, every browser produces
// the identical match, so a host lying about it is caught the instant a
// guest's own copy disagrees. What actually needed to move server-side
// was WHERE the seed comes from (so a host can't grind many privately
// before ever broadcasting one) and WHO combines two hidden picks (so a
// host can't read a guest's pick before "submitting" their own) - both
// now live entirely in start-match/submit-pick. MATCH here is rebuilt
// purely for display (the headline, roundLabel-adjacent helpers) from
// data that was never secret in the first place.
//
// Takes the WHOLE matches object now (keyed by mode: "random"/"prep"),
// not a single row - a table can hold one finished/active row per
// encounter type at once, see start-match's own comment for why. A
// guest never calls startStory() themselves (only the host does,
// whether acting directly or via the "startstory" broadcast relay), so
// there's no message telling a guest which mode is "the current one" -
// this picks it from the data itself instead: whichever match exists
// and isn't done yet, or the most recently-touched one if both are
// finished (or neither has started). Works identically for host and
// guest without needing any extra coordination.
// Set right when "Run it again" is clicked - see that handler for why.
// A poll can already be in flight (fetching pre-restart data) at the
// exact moment the click happens, completely independent of when the
// click itself occurs; if that poll's result arrives AFTER the local
// reset already ran, it would silently repopulate ST from the OLD,
// still-finished match for one render - exactly what made the flip
// animation briefly replay before the real new auction took over.
// Reordering the server-side deletes never touched this, because the
// race was never about the order server-side writes happened in - it
// was between an unrelated, independently-timed poll and the click.
let suppressMatchSnapshotUntil = 0;

function applyMatchSnapshot(matches){
  if (SOLO || !backend) return;   // SOLO never reads from the matches table at all
  if (Date.now() < suppressMatchSnapshotUntil) return;
  const modes = Object.keys(matches || {});
  const activeMode = modes.find(m => matches[m] && !matches[m].state.done) || modes[modes.length - 1] || null;
  const match = activeMode ? matches[activeMode] : null;
  if (!match){
    // resetMatchState() only ever clears the underlying JS variables -
    // it never touches the DOM at all. Without an explicit stPaint()
    // here, the actual HTML from the PREVIOUS match's last real render
    // (the story text, the scoreboard, the "who won" banner) just sat
    // there untouched, visually unchanged, for as long as no match
    // existed - which is the entire second auction after "Run it
    // again," right up until a genuinely new match's first real
    // stPaint() call finally overwrote it. stPaint() already handles a
    // null ST correctly (hides the story/storyChoice containers) - it
    // just was never actually being invoked in this specific path.
    if (ST){ resetMatchState(); stPaint(); }
    return;
  }

  const state = match.state;
  const teams = seats().map(q => ({
    owner: P[q].name, purse: P[q].purse,
    fighters: P[q].roster.map(r => ({ ...r.char, role: r.role, price: r.price })),
  }));
  MATCH = createMatch({ teams, mode: state.mode, seed: Number(match.seed), roleShift, rivalries: RIVALRIES });

  // A genuinely new match (different seed than the last one we built ST
  // from) means this encounter mode just got fought - record it once,
  // not on every repeated snapshot for the SAME still-running match.
  if (match.seed !== lastSeenSeed){
    lastSeenSeed = match.seed;
    matchRuns = matchRuns.concat(state.mode);
  }

  const standings = seats().map((q, i) => ({ owner: P[q].name, points: (state.points || [])[i] || 0 }));
  const lastRound = state.beats.length ? state.beats[state.beats.length - 1].ranked : null;
  const roundWinners = state.beats.map(b => {
    const top = b.ranked.filter(x => x.place === 1);
    return top.length === 1 ? top[0].owner : null;
  });

  // My own pick is local-only knowledge - the server never reveals what
  // anyone sent, only who's locked in. Carry my own optimistic entry
  // forward across repeated snapshots (a re-render, the 3-second poll)
  // as long as the round hasn't actually moved on; a genuinely new round
  // clears it, same as the server's own ST.picks reset used to.
  const samRound = ST && ST.round === state.round && ST.overtime === state.overtime;
  const picks = samRound ? ST.picks : {};

  ST = {
    mode: state.mode, v: verdict(state.mode), seed: Number(match.seed),
    beats: state.beats, turn: 0, runs: matchRuns,
    awaiting: null, options: null, busy: false, err: "",
    end: state.done ? { winner: state.champion, standings } : null,
    picks, locked: state.locked || [],
    standings, lastRound, round: state.round,
    used: state.used || {}, drawnOut: state.drawnOut || {},
    overtime: state.overtime, roundWinners,
    // null/absent means everyone's still contending - always true in a
    // 2-player game, and true for the whole regular five rounds even in
    // a 3-player one. Only set once regular rounds end in a PARTIAL tie
    // (two sides tied for first, one clearly behind): from that point
    // on, only these owners are still fighting for the win. sendPick()
    // uses this to stop offering a picker to a seat that's already out,
    // instead of relying on the server to just reject a pick that
    // should never have been possible to attempt in the first place.
    contenders: state.contenders || null,
    title: MATCH.title(),
  };
  stPaint();
}

// Stage 3: real multiplayer now goes through start-match/submit-pick,
// closing the two things this local version could never fully close -
// a host free to grind seeds against known rosters before ever
// broadcasting one, and a host who could read a guest's pick the instant
// it arrived, before "submitting" their own. SOLO (vs bots, one human,
// nobody to cheat against) keeps the exact original local flow below.
function startStory(mode){
  if (!allLocked() || !modeLeft(mode)) return;
  if (SOLO || !backend){
    if (!HOST) return;
    startStoryLocalSolo(mode);
    return;
  }
  if (!HOST) return;
  backend.startMatch(mode).catch(err => gameNudge(err.message));
  // No local ST/MATCH built here at all - applyMatchSnapshot() builds it
  // once the real matches row (with the server-committed seed) arrives.
}

function startStoryLocalSolo(mode){
  const runs = runsDone();
  const nextST = { mode, v: verdict(mode), beats: [], turn: 0, runs: runs.concat(mode),
         awaiting: null, options: null, busy: false, err: "", end: null,
         // One seed, made here and synced, so both browsers narrate the same
         // match. fight.js never calls Math.random.
         seed: (Math.random() * 2 ** 31) | 0,
         picks: {}, locked: [], standings: null, lastRound: null, round: 1,
         // Which of each owner's characters have already been sent. This has
         // to live here, in the state that actually gets sent over the wire,
         // not just in MATCH's own internal .used flags: MATCH.resolve() is
         // only ever called on the host, so a guest's own local MATCH copy
         // never learns anything was used and would show all five forever.
         used: {},
         // Same reasoning again, this time for which characters have been
         // part of a draw and are barred from ever being resent: MATCH's own
         // per-side drawnOut set is host-only internal state, never reaches
         // the guest on its own, so the guest's own myRemaining() needs a
         // synced copy to compute overtime eligibility correctly.
         drawnOut: {},
         // Flips true the moment regular rounds end tied and stays true for
         // the rest of the match. Read by myRemaining() (which pool of
         // cards is legal) and by the round-label code (Round N vs
         // Overtime N), both of which need to agree with fight.js's own
         // internal phase without querying a host-only MATCH object.
         overtime: false,
         // Who won each round, in order, one entry per resolved round. Same
         // reasoning as .used: MATCH's own internal history never reaches
         // the guest, so the scoreboard's pie chart needs its own synced
         // copy of this rather than reading fight.js's history directly.
         roundWinners: [] };
  resetMatchState();
  ST = nextST;
  buildMatch();
  stPaint(); stSend();
}


// Rebuilt from ST on whichever browser needs it. The host drives it, but a
// guest that reloads can reconstruct the same match from the same seed.
function buildMatch(){
  const teams = seats().map(q => ({
    owner: P[q].name, purse: P[q].purse,
    fighters: P[q].roster.map(r => ({ ...r.char, role: r.role, price: r.price }))
  }));
  MATCH = createMatch({ teams, mode: ST.mode, seed: ST.seed, roleShift, rivalries: RIVALRIES });
  ST.title = MATCH.title();
  ST.standings = MATCH.standings();
}

// Who this player still has in hand. Derived from ST.used/ST.drawnOut
// (synced to both browsers) rather than MATCH.available(): MATCH's own
// internal .used flags and per-side drawnOut sets only ever get updated on
// the host, inside takePick(), so a guest reading its own local MATCH
// instance would see all five as available forever, and this was exactly
// the "only one player's cards ever disappear" bug. ST.used/ST.drawnOut are
// plain data that travel with every state push, so both sides agree.
// Two different pools depending on phase, mirroring fight.js's own
// eligible(): before overtime, only cards never yet sent; once ST.overtime
// is set, every card except the ones that have drawn is legal again,
// including cards a regular round already used - sudden death replays the
// same five, it does not deal a fresh hand. A side with nothing left
// un-drawn falls back to its full roster, same reasoning as fight.js's own
// fallback, so the two never disagree about what is legal to offer.
function myRemaining(){
  if (!ST || !P[ME]) return [];
  const drawnOut = new Set(ST.drawnOut && ST.drawnOut[P[ME].name] || []);
  if (ST.overtime){
    const elig = P[ME].roster.filter(r => !drawnOut.has(r.char.name));
    return (elig.length ? elig : P[ME].roster).map(r => r.char);
  }
  const used = new Set(ST.used && ST.used[P[ME].name] || []);
  return P[ME].roster.filter(r => !used.has(r.char.name)).map(r => r.char);
}

function sendPick(name){
  if (!ST || ST.end || ST.picks[P[ME].name]) return;
  // Once contenders narrows the field (a partial tie in a 3+ player
  // game sent the tied sides to overtime, leaving someone out), a seat
  // that isn't in that list has nothing left to send - guard here so
  // the UI can't even attempt it, not just rely on submit-pick's own
  // server-side rejection of the same case.
  if (SOLO !== true && ST.contenders && !ST.contenders.includes(P[ME].name)) return;
  SFX.bid();
  if (SOLO || !backend){
    if (HOST) takePick(P[ME].name, name);
    else send({ t: "pick", cid: CID, p: ME, name });
    return;
  }
  // Optimistic: shows "X is in, waiting on the others" immediately on
  // THIS browser, same instant feel as before. The server never reveals
  // what was picked to anyone but the seat that sent it - this is purely
  // local memory of my own choice, not something read back from the
  // snapshot. Rolled back if the actual submit-pick call fails.
  ST.picks[P[ME].name] = name;
  stPaint();
  backend.submitPick(ME, name, ST.mode).catch(err => {
    delete ST.picks[P[ME].name];
    gameNudge(err.message);
    stPaint();
  });
}

// Host only. Holds each pick until every side is in, then resolves once.
function takePick(owner, name){
  if (!HOST || !ST || ST.end || !MATCH) return;
  if (ST.picks[owner]) return;                       // one pick per round
  const side = MATCH.available().find(a => a.owner === owner);
  if (!side || !side.names.includes(name)) return;   // not theirs to send
  ST.picks[owner] = name;
  // Say who has locked in, never what they sent.
  ST.locked = seats().map(q => P[q].name).filter(n => ST.picks[n]);
  if (ST.locked.length < seats().length){ stPaint(); stSend(); return; }

  const res = MATCH.resolve(seats().map(q => ({ owner: P[q].name, name: ST.picks[P[q].name] })));
  if (!res){ ST.picks = {}; ST.locked = []; stPaint(); stSend(); return; }
  // Record who was sent this round into the synced state, not just into
  // MATCH's own local .used flags, since those never reach the guest.
  for (const q of seats()){
    const owner = P[q].name, sent = ST.picks[owner];
    if (!sent) continue;
    ST.used[owner] = ST.used[owner] || [];
    if (!ST.used[owner].includes(sent)) ST.used[owner].push(sent);
  }
  // Same again for whoever just drew: MATCH's own per-side drawnOut set is
  // host-only, so it has to be copied out into synced state the same way
  // .used already is, or the guest's own myRemaining() never learns a card
  // is barred from overtime and offers it again.
  res.ranked.forEach(x => {
    if (!x.draw) return;
    ST.drawnOut[x.owner] = ST.drawnOut[x.owner] || [];
    if (!ST.drawnOut[x.owner].includes(x.name)) ST.drawnOut[x.owner].push(x.name);
  });
  ST.overtime = res.overtimeNow;
  // Each beat carries its own round's ranked result now, not just an empty
  // placeholder: stPaint renders every past round's cards from this, not
  // only the latest, so the whole match stays visible as it goes rather
  // than only ever showing whatever just happened. Draw status and whether
  // the round was fought in overtime both live inside b.ranked itself
  // (each fighter's own .draw flag) or are derivable from the round's
  // position against SLOTS (see roundLabel) - nothing else needs storing
  // here.
  ST.beats.push({ ranked: res.ranked });
  ST.standings = res.standings;
  ST.lastRound = res.ranked;
  // The pie chart's per-round wedge colours read from this, not from
  // MATCH's own history, for the same reason .used lives on ST: only ST
  // actually reaches the guest. Whoever holds place 1 ALONE is the winner;
  // if two or three share it, nobody has a single winner to record - null
  // rather than arbitrarily picking one of the tied names.
  const topPlace = res.ranked.filter(x => x.place === 1);
  const winner = topPlace.length === 1 ? topPlace[0] : null;
  ST.roundWinners.push(winner && winner.owner);
  ST.picks = {}; ST.locked = [];
  ST.round = MATCH.roundNo();
  if (res.done) ST.end = { winner: res.champion, standings: res.standings };
  // Character-level stats, genuinely per round the same way as the
  // multiplayer path (see submit-pick's own comment) - and player-level
  // bot stats once the match itself concludes, but only for a signed-in
  // player; a guest playing solo has nothing to attribute a win/loss to.
  // Guarded on SOLO specifically since takePick() is also reachable from
  // a couple of legacy broadcast-message handlers that real multiplayer
  // no longer uses - this is the one place that should ever fire these
  // calls, regardless of how many paths still technically lead here.
  if (SOLO){
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    Promise.all(
      res.ranked.map(f =>
        sb.rpc("record_character_round", { p_name: f.name, p_won: f.place === 1 && !f.draw, p_drew: f.draw })
      )
    ).catch(e => console.error("record_character_round failed:", e));
    if (res.done && res.champion && currentUser){
      sb.rpc("record_bot_match_stats", { p_user_id: currentUser.id, p_won: res.champion === P[ME].name })
        .then(({ error }) => { if (error) console.error("record_bot_match_stats failed:", error); });
    }
  }
  res.isDraw ? SFX.pass() : SFX.sold();
  stPaint(); stSend();
}

function writeFight(){
  if (ME !== caller()) return;
  const mode = chosenMode();
  if (!modeLeft(mode) || runsDone().length >= 2) return;
  if (!HOST){ send({ t: "startstory", cid: CID, p: ME, mode }); return; }
  startStory(mode);
}

function rosterText(){
  const side = p => P[p].roster
    .map((r, i) => `${i + 1}. ${r.char.name} (${(UNIVERSES[r.char.pub] || {}).name || r.char.pub}${r.char.tier ? ", tier " + r.char.tier : ""}), ${money(r.price)}`)
    .join("\n");
  const SEP = "\n\n";
  const block = p => `${P[p].name}: ${money(PURSE - P[p].purse)} spent, ${money(P[p].purse)} unspent
${side(p)}`;
  return `SUPER DRAFTS / FINAL ROSTERS
Base versions. ${NP === 3 ? "Three-way free for all." : "Head to head."} $${PURSE} purse each.

${seats().map(block).join(SEP)}

Write the ${seats().map(() => 5).join(" v ")} as a comic-book scenario.`;
}

/* ---------------------------- wiring ---------------------------- */
// Stage B: kept as a real promise (not fire-and-forget) so askForChair()
// can await it - a guest reaching the auction screen before this finishes
// is exactly what caused the card to render with no picture: the image
// lookup (ART.get(c.name)) depends entirely on this having populated
// ART first, and nothing re-renders once it finishes late.
const stockReady = loadStock();
$("sfxToggle").addEventListener("click", () => setSfx(!sfxOn));
$("musicToggle").addEventListener("click", () => {
  setMusic(!musicOn);
  // If the ringer switch is off, iOS silences Web Audio with no error at all,
  // so the only honest thing is to say so.
  if (musicOn && /iPhone|iPad|iPod/.test(navigator.userAgent)){
    const hint = $("audioHint");
    if (hint){ hint.hidden = false; clearTimeout(window.__hintT);
               window.__hintT = setTimeout(() => { hint.hidden = true; }, 6000); }
  }
});
setSfx(sfxOn);
// paints the label only; the sound itself waits for the first gesture above
if (!musicOn) setMusic(false); else $("musicToggle").textContent = "music on";
$("openBox").addEventListener("click", () => SOLO ? openSolo() : openTable());
$("joinBtn").addEventListener("click", joinTable);
$("knockBtn").addEventListener("click", askForChair);
$("knockName").addEventListener("keydown", e => { if (e.key === "Enter") askForChair(); });
$("joinCode").addEventListener("keydown", e => { if (e.key === "Enter") joinTable(); });
$("myName").addEventListener("keydown", e => { if (e.key === "Enter") openTable(); });

$("shareBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("shareLink").value); $("shareBtn").textContent = "Copied"; }
  catch { $("shareLink").select(); }
  setTimeout(() => { $("shareBtn").textContent = "Copy"; }, 1600);
});

$("cancelBtn").addEventListener("click", () => {
  send({ t: "closed" });
  if (chan) sb.removeChannel(chan);
  if (backend) backend.disconnect();
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  try { localStorage.removeItem(MP_SAVE_KEY); } catch {}
  started = false;
  showScreen("setup");
});

try { $("myName").value = localStorage.getItem("longbox.name") || ""; } catch {}
$("showTiers").addEventListener("change", refreshSetupBox);
refreshSetupBox();

// A code in the link means they were invited, prefill it and say so.
const invited = new URLSearchParams(location.search).get("r");

// Computed early so the initial screen choice below can use it - the
// actual "Reopen table X" button text/click-handler still gets wired up
// in its own block further down, unchanged; this only needs to know
// whether one exists yet, not populate the button itself.
let hasResumable = false;
try {
  const mpCheck = JSON.parse(localStorage.getItem(MP_SAVE_KEY) || "null");
  const svCheck = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  hasResumable = !!((mpCheck && mpCheck.tableId) || (svCheck && svCheck.ROOM && !svCheck.over));
} catch {}

// A deliberate, just-clicked "sign in" action always wins over a
// leftover resumable-table flag from some earlier, unrelated session.
// Without this, hasResumable stays permanently true for anyone who has
// EVER played a multiplayer game and not explicitly closed the table -
// nothing clears MP_SAVE_KEY just because a game finished normally -
// which silently hijacked every future sign-in redirect (a real OAuth
// sign-in is a full page reload, wiping all JS state and re-running
// this exact boot sequence from scratch) straight past the profile
// screen it was actually supposed to land on, landing on the setup
// screen instead and looking exactly like signing in did nothing at
// all. sessionStorage specifically, not localStorage - this only needs
// to survive the one redirect round-trip in this same tab, set right
// before the redirect in beginGoogleSignIn(), and is consumed (read
// once, then removed) the moment this boot checks it, so it can never
// incorrectly persist into some later, unrelated page load.
let justSigningIn = false;
try {
  justSigningIn = sessionStorage.getItem("longbox.justSigningIn") === "1";
  sessionStorage.removeItem("longbox.justSigningIn");
} catch {}
if (justSigningIn) hasResumable = false;

if (invited){
  ROOM = invited.toUpperCase().slice(0, 4);
  $("knockCode").textContent = ROOM;
  try { $("knockName").value = localStorage.getItem("longbox.name") || ""; } catch {}
  showScreen("knock");
  // open the line straight away so the knock lands the moment they ask
  connect().catch(() => {
    $("knockMsg").hidden = false;
    $("knockMsg").textContent = "Could not reach the table service. Check your connection.";
  });
} else if (hasResumable){
  // Reopening an existing table is its own clear intent - skip the
  // gate/profile detour entirely and land straight on the setup screen,
  // same as an invite link skips it. The actual "Reopen table X" button
  // still gets wired up in its own block further down.
  showScreen("setup");
}

// Optional Google sign-in - entirely separate from the cid-based guest
// identity every seat has always had. A signed-in player still gets a
// cid too (used for the same realtime/broadcast plumbing every guest
// already relies on); user_id just ADDS a real, stable identity
// alongside it, passed through to create-table/join-table so their seat
// links back to a real account instead of only a device-generated id
// that a cleared cache or a new device could lose.
let currentUser = null;   // { id, name } | null - null means "playing as a guest"
let currentProfile = null; // full profiles row for currentUser, or null

async function refreshAuthUI(){
  sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
  const { data: { session } } = await sb.auth.getSession();
  const linkRow = $("profileLinkRow"), nameEl = $("authSignedInName"), avatarEl = $("authAvatar");
  const guestRow = $("guestSignInRow");
  const wasSignedIn = !!currentUser;
  if (session && session.user){
    // profiles.display_name is the REAL name once it's been set - that's
    // the "fixed name, set by you, that you can change" from the
    // profile screen. The raw Google name is only ever a one-time
    // fallback, used before the player has chosen anything of their
    // own (see the profile screen's own name field/save handler).
    const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    currentProfile = profile || null;

    const googleName = session.user.user_metadata?.full_name
      || session.user.user_metadata?.name
      || session.user.email
      || "your account";
    const displayName = currentProfile?.display_name || googleName;
    const justSignedIn = !wasSignedIn;
    currentUser = { id: session.user.id, name: displayName };

    if (linkRow) linkRow.hidden = false;
    if (guestRow) guestRow.hidden = true;
    if (nameEl) nameEl.textContent = displayName;

    // Google's own picture is always the fallback - a custom upload
    // (avatar_url) only ever overrides it, never the other way around.
    const avatarSrc = currentProfile?.avatar_url || session.user.user_metadata?.avatar_url || null;
    if (avatarEl){
      if (avatarSrc){ avatarEl.src = avatarSrc; avatarEl.hidden = false; }
      else avatarEl.hidden = true;
    }

    // The FIXED name for a signed-in player - set on the profile screen,
    // not editable on the setup screen itself. A guest's #myName stays
    // fully free-typed, untouched by any of this.
    if ($("myName")){ $("myName").value = displayName.slice(0, 14); $("myName").readOnly = true; }
    if ($("knockName")){ $("knockName").value = displayName.slice(0, 14); $("knockName").readOnly = true; }

    // A saved favorite-universes preference only ever pre-fills the box
    // picker, and only if the player hasn't already touched it this
    // session - see boxTouchedByUser's own comment.
    if (!boxTouchedByUser && currentProfile?.favorite_universes?.length && typeof refreshSetupBox === "function"){
      BOX.u = currentProfile.favorite_universes;
      refreshSetupBox();
    }

    // Only navigate on the actual moment of signing in (including the
    // OAuth redirect landing back here) - never on every subsequent
    // refreshAuthUI() call, or a signed-in player would get yanked back
    // to their profile screen every time this re-runs for an unrelated
    // reason (onAuthStateChange firing, a routine re-check). invited and
    // hasResumable both still take priority, same as they do for a fresh
    // gate/profile decision - reconnecting to a specific table is a
    // clearer intent than a generic "welcome back" landing.
    if (justSignedIn && !invited && !hasResumable && $("gate").hidden === false){
      showScreen("profile");
      paintProfileScreen();
    }
  } else {
    currentUser = null;
    currentProfile = null;
    if (linkRow) linkRow.hidden = true;
    if (guestRow) guestRow.hidden = false;
    if (avatarEl) avatarEl.hidden = true;
    if ($("myName")) $("myName").readOnly = false;
    if ($("knockName")) $("knockName").readOnly = false;
  }
}

/* --------------------- profile screen --------------------- */
let statsView = "overall"; // "overall" | "mp" | "bot"

function paintProfileScreen(){
  if (!currentUser) return;
  $("profileNameInput").value = currentUser.name;
  const img = $("profileAvatarImg");
  const src = currentProfile?.avatar_url || null;
  if (src){ img.src = src; img.hidden = false; } else img.hidden = true;

  paintStatsView();
  paintFavChips();
}

// Three separate views of the same underlying columns rather than one
// fixed number - multiplayer stats (games_played/wins/losses) and bot
// stats (bot_games_played/bot_wins/bot_losses) are already tracked as
// entirely separate counters (see record_match_stats vs
// record_bot_match_stats), specifically so a player's real competitive
// record never gets padded by beating an AI. "Overall" is just the sum
// of both, computed here at display time rather than stored as its own
// column - nothing needs to write to it directly, so there is nothing
// to keep in sync.
function paintStatsView(){
  const mpGames = currentProfile?.games_played || 0;
  const mpWins = currentProfile?.wins || 0;
  const mpLosses = currentProfile?.losses || 0;
  const botGames = currentProfile?.bot_games_played || 0;
  const botWins = currentProfile?.bot_wins || 0;
  const botLosses = currentProfile?.bot_losses || 0;

  let games, wins, losses;
  if (statsView === "mp"){ games = mpGames; wins = mpWins; losses = mpLosses; }
  else if (statsView === "bot"){ games = botGames; wins = botWins; losses = botLosses; }
  else { games = mpGames + botGames; wins = mpWins + botWins; losses = mpLosses + botLosses; }

  $("statGames").textContent = games;
  $("statWins").textContent = wins;
  $("statLosses").textContent = losses;
  $("statRate").textContent = games ? Math.round((wins / games) * 100) + "%" : "—";
}

$("statsViewChips")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  statsView = btn.dataset.view;
  $("statsViewChips").querySelectorAll("[data-view]").forEach(b => {
    b.classList.toggle("on", b === btn);
    b.setAttribute("aria-pressed", b === btn ? "true" : "false");
  });
  paintStatsView();
});

function paintFavChips(){
  const chipsEl = $("favChips");
  chipsEl.innerHTML = "";
  const favs = new Set(currentProfile?.favorite_universes || []);
  let group = "";
  for (const [code, u] of Object.entries(UNIVERSES)){
    if (!STOCK.some(c => c[1] === code)) continue;
    if (u.group !== group){
      group = u.group;
      const h = document.createElement("span");
      h.className = "chip-group"; h.textContent = group;
      chipsEl.appendChild(h);
    }
    const on = favs.has(code);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (on ? " on" : "");
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.dataset.code = code;
    b.textContent = u.name;
    b.addEventListener("click", () => {
      // Reads favs.has() fresh here, not the `on` captured above at
      // render time - that value is fixed the moment this chip was
      // created and never updates, so relying on it would make every
      // click after the first behave as if nothing had changed yet,
      // and a favorite could never actually be toggled back off.
      if (favs.has(code)) favs.delete(code); else favs.add(code);
      paintFavChipsFromSet(favs);
    });
    chipsEl.appendChild(b);
  }
}
// Re-renders just the on/off state after a click, without rebuilding the
// whole list from currentProfile - the click already knows the new set,
// there's no reason to throw away and rebuild every chip to reflect one
// toggle.
function paintFavChipsFromSet(favs){
  $("favChips").querySelectorAll(".chip").forEach(b => {
    const on = favs.has(b.dataset.code);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $("favSaveBtn").dataset.pending = JSON.stringify([...favs]);
}

$("profileLinkBtn")?.addEventListener("click", () => { showScreen("profile"); paintProfileScreen(); });

$("profileNameSaveBtn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const newName = $("profileNameInput").value.trim().slice(0, 14);
  if (!newName){ $("nameMsg").textContent = "Name can't be empty."; return; }
  $("nameMsg").textContent = "Saving…";
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const { error } = await sb.from("profiles").update({ display_name: newName }).eq("id", currentUser.id);
    if (error) throw error;
    currentUser = { ...currentUser, name: newName };
    currentProfile = { ...(currentProfile || {}), display_name: newName };
    // Saved to the database instantly, but #myName/#knockName only ever
    // get their VALUE set inside refreshAuthUI() - which doesn't run
    // again just because this save happened. Without this, the fields
    // kept showing the old name until something else (a sign-out, a
    // fresh page load) happened to trigger refreshAuthUI() on its own -
    // the data was never actually delayed, only what was visibly shown.
    if ($("myName")) $("myName").value = newName;
    if ($("knockName")) $("knockName").value = newName;
    $("nameMsg").textContent = "Saved.";
  } catch (e) {
    $("nameMsg").textContent = "Could not save - try again.";
  }
});

$("reconnectBtn")?.addEventListener("click", () => { reconnectByAccount($("reconnectCode").value); });

$("profileContinueBtn")?.addEventListener("click", () => {
  // The FIXED name from the profile carries straight into the setup
  // screen's own (read-only, for a signed-in player) name field -
  // refreshAuthUI() already keeps #myName in sync with currentUser.name
  // any time it changes, so there's nothing left to copy here beyond
  // just navigating.
  showScreen("setup");
});

$("favSaveBtn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const pending = $("favSaveBtn").dataset.pending;
  const favorite_universes = pending ? JSON.parse(pending) : (currentProfile?.favorite_universes || []);
  $("favMsg").textContent = "Saving…";
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    const { error } = await sb.from("profiles").update({ favorite_universes }).eq("id", currentUser.id);
    if (error) throw error;
    currentProfile = { ...(currentProfile || {}), favorite_universes };
    $("favMsg").textContent = "Saved.";
  } catch (e) {
    $("favMsg").textContent = "Could not save - try again.";
  }
});

/* --------------------- avatar cropper --------------------- */
// Opens the moment a file is picked, before anything is ever uploaded -
// nothing reaches Storage until the person confirms exactly what's
// inside the circle. cropState tracks the CURRENT pan/zoom in canvas
// pixel space; the canvas itself is both the live preview AND the exact
// thing exported on save, so there's no separate "export resolution"
// to keep in sync with what's actually being shown.
let cropImg = null;
let cropState = { scale: 1, offsetX: 0, offsetY: 0 };
let cropBaseScale = 1;   // the "fully zoomed out, still fills the circle" scale
let cropDragging = false, cropDragStart = null;

function cropClamp(){
  const size = $("cropCanvas").width;
  const w = cropImg.width * cropState.scale, h = cropImg.height * cropState.scale;
  // Never lets a pan reveal empty space past the image's own edges -
  // the max offset in either direction is exactly how far the scaled
  // image overhangs the canvas on that axis; once scale<=canvas size on
  // an axis, that max is 0 and panning on that axis is locked entirely.
  const maxX = Math.max(0, (w - size) / 2);
  const maxY = Math.max(0, (h - size) / 2);
  cropState.offsetX = Math.max(-maxX, Math.min(maxX, cropState.offsetX));
  cropState.offsetY = Math.max(-maxY, Math.min(maxY, cropState.offsetY));
}

function renderCrop(){
  const canvas = $("cropCanvas"), ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  const w = cropImg.width * cropState.scale, h = cropImg.height * cropState.scale;
  ctx.drawImage(cropImg, size / 2 - w / 2 + cropState.offsetX, size / 2 - h / 2 + cropState.offsetY, w, h);
  ctx.restore();
}

function openCropModal(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    cropImg = img;
    const size = $("cropCanvas").width;
    // "Fit to fill" - the smallest scale where the image still fully
    // covers the circle on both axes, same idea as CSS object-fit:cover.
    // This is the zoom slider's own minimum (value 1 = this scale).
    cropBaseScale = Math.max(size / img.width, size / img.height);
    cropState = { scale: cropBaseScale, offsetX: 0, offsetY: 0 };
    $("cropZoom").value = "1";
    URL.revokeObjectURL(url);
    renderCrop();
    $("cropModal").hidden = false;
  };
  img.src = url;
}

function closeCropModal(){
  $("cropModal").hidden = true;
  cropImg = null;
  // Cleared so choosing the exact same file again still fires a fresh
  // 'change' event - a browser won't re-fire change for an unchanged
  // file list otherwise, silently doing nothing on a second attempt.
  $("avatarFileInput").value = "";
}

$("cropCanvas")?.addEventListener("pointerdown", (e) => {
  cropDragging = true;
  cropDragStart = { x: e.clientX, y: e.clientY, offsetX: cropState.offsetX, offsetY: cropState.offsetY };
  e.target.setPointerCapture(e.pointerId);
});
$("cropCanvas")?.addEventListener("pointermove", (e) => {
  if (!cropDragging || !cropImg) return;
  cropState.offsetX = cropDragStart.offsetX + (e.clientX - cropDragStart.x);
  cropState.offsetY = cropDragStart.offsetY + (e.clientY - cropDragStart.y);
  cropClamp();
  renderCrop();
});
$("cropCanvas")?.addEventListener("pointerup", () => { cropDragging = false; });
$("cropCanvas")?.addEventListener("pointercancel", () => { cropDragging = false; });

$("cropZoom")?.addEventListener("input", () => {
  if (!cropImg) return;
  cropState.scale = cropBaseScale * Number($("cropZoom").value);
  cropClamp();
  renderCrop();
});

$("cropCancelBtn")?.addEventListener("click", closeCropModal);

$("cropSaveBtn")?.addEventListener("click", () => {
  if (!cropImg || !currentUser) return;
  $("cropCanvas").toBlob(async (blob) => {
    if (!blob){ $("avatarMsg").textContent = "Could not process that image."; closeCropModal(); return; }
    closeCropModal();
    await uploadAvatarBlob(blob, "jpg");
  }, "image/jpeg", 0.92);
});

// The actual upload, unchanged from before except that it now always
// receives the CROPPED result, never the raw original file straight off
// disk - the crop modal is the only caller now.
async function uploadAvatarBlob(blob, ext){
  $("avatarMsg").textContent = "Uploading…";
  try {
    sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
    // Path MUST start with the uploader's own user id - the Storage
    // policies from Stage 1 check exactly this (auth.uid() against the
    // first path segment) to decide who's allowed to write here at all.
    // A different path shape doesn't get ignored, it gets rejected
    // outright by every one of those policies.
    const path = `${currentUser.id}/avatar.${ext}`;
    const { error: upErr } = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
    // Cache-bust: the path is always the same for a given user (upsert
    // overwrites it in place), so without a changing query string the
    // browser would just keep showing the OLD cached image forever after
    // a re-upload, even though the file on the server genuinely changed.
    const avatar_url = pub.publicUrl + "?t=" + Date.now();
    const { error: dbErr } = await sb.from("profiles").update({ avatar_url }).eq("id", currentUser.id);
    if (dbErr) throw dbErr;
    currentProfile = { ...(currentProfile || {}), avatar_url };
    paintProfileScreen();
    if ($("authAvatar")){ $("authAvatar").src = avatar_url; $("authAvatar").hidden = false; }
    $("avatarMsg").textContent = "Updated.";
  } catch (err) {
    // Show the real error, not a guessed cause - "try a smaller file"
    // was a guess that this would only ever fail on size, which
    // swallows the actual reason (a missing bucket, an RLS rejection, a
    // real size limit, or something else) exactly when it matters most
    // for actually diagnosing what went wrong.
    $("avatarMsg").textContent = "Could not upload: " + (err?.message || String(err));
  }
}

$("avatarFileInput")?.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file || !currentUser) return;
  openCropModal(file);
});

async function beginGoogleSignIn(){
  sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
  // Marks this specific redirect round-trip so the NEXT boot (after the
  // full page reload the OAuth flow causes) knows to prioritize landing
  // on the profile screen over a leftover resumable-table flag - see
  // that check's own comment for the full reasoning.
  try { sessionStorage.setItem("longbox.justSigningIn", "1"); } catch {}
  // Deliberately NOT window.location.href - confirmed via debug logging
  // that this URL can carry a stray leftover "#" fragment (from wherever
  // exactly - Supabase's own internal processing, a prior redirect, it
  // doesn't matter which). Supabase's redirect construction appends its
  // own #access_token=... onto whatever redirectTo already had, without
  // ever replacing an existing fragment first - one stray "#" already
  // there becomes a malformed "##access_token=..." on return, which its
  // OWN detectSessionInUrl logic then fails to parse at all, silently
  // reporting no session despite a perfectly valid token sitting right
  // there. Building this explicitly hash-free removes the possibility
  // entirely, regardless of how the leftover fragment would have formed.
  const cleanRedirect = window.location.origin + window.location.pathname + window.location.search;
  // Full-page redirect, not a popup - simplest, most reliable option,
  // and works identically on mobile, where popups are often blocked
  // anyway. An invited guest's room code lives in the query string,
  // which cleanRedirect above preserves untouched.
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: cleanRedirect },
  });
}
$("gateSignInBtn")?.addEventListener("click", beginGoogleSignIn);
// Same handler, same redirect-back-to-here behavior - a guest signing in
// from the setup screen instead of the gate doesn't need different
// treatment, just a second way to reach the same action.
$("setupSignInBtn")?.addEventListener("click", beginGoogleSignIn);

$("gateGuestBtn")?.addEventListener("click", () => { showScreen("setup"); });

$("googleSignOutBtn")?.addEventListener("click", async () => {
  sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
  await sb.auth.signOut();
  showScreen("gate");
  await refreshAuthUI();
});

(async () => {
  sb = sb || window.supabase.createClient(ART_URL, ART_KEY);
  // Attached BEFORE anything else runs, specifically before the first
  // refreshAuthUI() call below - a genuine race, not a hypothetical one:
  // Supabase's own internal processing of an OAuth token sitting in the
  // URL runs asynchronously and can complete WHILE that first call is
  // still awaiting its own getSession() response (especially when
  // Google skips its consent screen entirely for an already-authorized
  // account, making the whole redirect round-trip nearly instant). If
  // the "signed in" event fires before this listener exists to catch
  // it, it's simply gone - nothing replays a missed event later. This
  // was the actual reason a second sign-in click was needed: the second
  // click's own fresh redirect happened to let the timing line up by
  // coincidence, not because anything was actually fixed.
  sb.auth.onAuthStateChange(() => { refreshAuthUI(); });
  // The initial gate/setup decision for a fresh, non-invited,
  // non-resumable visit - invited and hasResumable were already handled
  // synchronously above (they don't need to wait on a session check at
  // all), so this only ever runs for the remaining, genuinely-undecided
  // case: show the gate until we know whether a session already exists.
  //
  // Skipped specifically when justSigningIn is true - this boot IS the
  // OAuth redirect landing back from a deliberate sign-in click, so a
  // real session is about to be confirmed a moment later regardless.
  // Showing "Sign in with Google" for that one brief instant, only to
  // immediately replace it with the profile screen once the session
  // check resolves, is exactly the kind of visible flash-then-correct
  // that reads as janky rather than instant - the fix is not showing
  // the wrong screen in the first place, not showing it faster.
  if (!invited && !hasResumable && !justSigningIn) showScreen("gate");
  await refreshAuthUI();
  // Strips the OAuth hash fragment out of the visible URL right after
  // refreshAuthUI()'s getSession() call has had its chance to read it -
  // left in place, it sat in window.location.href indefinitely (this is
  // a single-page app; nothing else ever navigates or reloads to clear
  // it), meaning the NEXT sign-in click captured this exact stale,
  // already-consumed token data as ITS OWN redirectTo target, since
  // beginGoogleSignIn() builds that from window.location.href directly.
  // First sign-in always worked because the URL was still clean at that
  // point; every sign-in after it was quietly corrupted by garbage left
  // over from the one before. Only the hash is touched - the query
  // string (an invited link's own room code) is left completely alone.
  if (window.location.hash) {
    try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
  }
  // A session already existed on load (a returning signed-in visitor,
  // not a fresh sign-in click) - land them straight on their profile
  // rather than the generic gate screen. Checking currentUser directly
  // here, not gate's own visibility - justSigningIn's whole point above
  // was to make sure gate was NEVER shown for that path, so gating this
  // on "was gate visible" would silently fail for the exact case this
  // was built to fix.
  if (!invited && !hasResumable && currentUser){
    showScreen("profile");
    paintProfileScreen();
  } else if (!invited && !hasResumable && justSigningIn){
    // The redirect landed but no session actually materialized (the
    // sign-in was cancelled partway, or genuinely failed) - gate was
    // never shown for this path, so show it now rather than leaving
    // every screen hidden with nothing for the person to do.
    showScreen("gate");
  }
  // Checked here specifically, AFTER refreshAuthUI() has actually
  // resolved - this whole IIFE is never awaited by its own caller (it's
  // a fire-and-forget top-level call), so anything checking currentUser
  // from OUTSIDE this function, right after invoking it, would read a
  // stale null every time regardless of whether a session genuinely
  // exists - the async fetch inside refreshAuthUI() simply wouldn't have
  // finished yet at that point.
  checkResumable();
})();

// Offer to reopen a table this browser was hosting or seated at (a
// refresh loses nothing - multiplayer reconnects to the real backend,
// solo rebuilds its own local state same as always).
//
// A signed-in player already has room-code-based rejoin on their
// profile screen, which works from ANY device - showing this SAME-
// DEVICE-ONLY shortcut on the home screen too, right next to their own
// profile chip, was pure redundant clutter specifically for them. A
// guest has no such alternative at all (there's no profile screen for
// them to reach), so this one-click resume stays exactly where it
// always was, completely unchanged, for that case.
function checkResumable(){
  try {
    const mp = JSON.parse(localStorage.getItem(MP_SAVE_KEY) || "null");
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    let room = null;
    if (mp && mp.tableId && !invited) room = mp.room;
    else if (sv && sv.ROOM && !sv.over && !invited) room = sv.ROOM;
    if (!room) return;
    const btn = currentUser ? $("profileResumeBtn") : $("resumeBtn");
    if (!btn) return;
    btn.hidden = false;
    btn.textContent = "Reopen table " + room;
    btn.addEventListener("click", resumeTable);
  } catch {}
}

// Ultra arrives after first paint, so re-measure once the webfont lands.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
  if (lot) fitName();
});
let fitTimer;
addEventListener("resize", () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => { if (lot) fitName(); }, 120);
});

// Bid and pass controls are wired by buildSeats(), which creates them.

// Role drag & drop: delegated once from the stable #roleBox container rather
// than re-attached on every paintRoles() repaint. pointermove/up/cancel sit
// on document so a fast drag that leaves the box mid-gesture still tracks.
$("roleBox").addEventListener("pointerdown", onRolePointerDown);
document.addEventListener("pointermove", onRolePointerMove);
document.addEventListener("pointerup", onRolePointerUp);
document.addEventListener("pointercancel", onRolePointerCancel);

$("writeBtn").addEventListener("click", writeFight);

$("copyBtn").addEventListener("click", async () => {
  const text = rosterText() + (window.__story ? "\n\n" + window.__story : "");
  try {
    await navigator.clipboard.writeText(text);
    $("copyHint").textContent = window.__story
      ? "Copied. Rosters and the issue."
      : "Copied.";
  } catch {
    // Clipboard is blocked on file:// in some browsers, fall back to a selectable box.
    const ta = document.createElement("textarea");
    ta.className = "fallback-ta";
    ta.value = text;
    ta.setAttribute("aria-label", "Final rosters, select and copy");
    $("copyHint").textContent = "Clipboard blocked here. Select the text below and copy it.";
    $("copyHint").after(ta);
    ta.select();
  }
});

// Host only, a fresh sale at the same table, so nobody has to swap links again.
// Simple navigation, no side effects on the table itself - the game
// keeps running in the background exactly as "Continue to Homepage" on
// the profile screen does; this just lets a player glance at the home
// screen (check the leaderboard, say) without needing to leave the
// table to do it.
$("faceoffHomeBtn")?.addEventListener("click", () => { showScreen("setup"); });

$("againBtn").addEventListener("click", () => {
  if (!HOST) return;
  document.querySelectorAll(".fallback-ta").forEach(n => n.remove());
  $("copyHint").textContent = "";
  // No foSides/roleBox clearing here anymore - restart-table now writes
  // everything in one atomic Postgres transaction (see its migration's
  // own comment), so there is no intermediate, half-emptied server state
  // for any client to observe at all. The old game's results genuinely
  // stay on screen, unchanged, until the whole restart lands together
  // and this screen gets replaced outright by the new auction - clearing
  // anything here would only re-introduce a flash the fix above removed
  // at the source.
  // A poll can already be in flight, independent of this click, carrying
  // pre-restart matches data that would otherwise arrive AFTER the reset
  // below and briefly repopulate ST from the old, finished match - see
  // applyMatchSnapshot()'s own comment for the full race this closes.
  // 2s comfortably covers the whole restart round-trip; nothing
  // legitimate should be arriving about matches during it anyway, since
  // a fresh game's first fight is still screens away at this point.
  suppressMatchSnapshotUntil = Date.now() + 2000;
  // Wipe the finished match everywhere, not just here: without the send()
  // below, only the host's own ST clears, and a guest's browser keeps the
  // last game's ST (including which characters were already sent to a
  // fight) live all the way into the next one. If this new deal happens to
  // draw the same character again for the same guest, myRemaining() reads
  // that stale ST.used and refuses to offer it, i.e. exactly "I already
  // used this one" from a fight that ended games ago.
  resetMatchState();
  stSend();
  stPaint(); window.__story = null;
  $("writeBtn").disabled = false;
  $("writeHint").textContent = "One issue, fought by the ten characters above.";
  if (boxCount() < MIN_BOX()) return;
  // The real fix: this used to reset P locally and call the old local
  // dealDeck()/nextLot() - never touching the database, so backend's
  // still-active polling would pull the OLD finished game right back
  // over whatever was just reset on screen (a stale "all five assigned"
  // role board next to a freshly-reset "$0 spent" purse line - two
  // sources of truth fighting over one screen). Now the actual reset
  // happens server-side in one call, and the client just waits for the
  // real snapshot to arrive and paint it - same as every other backend
  // action today.
  if (backend){
    $("writeHint").textContent = "Opening a fresh box…";
    backend.restartTable(BOX).catch(err => {
      $("writeHint").textContent = "Could not restart the table (" + err.message + "). Try again.";
    });
    return;
  }
  // SOLO mode has no backend at all - the original local reset is still
  // correct and necessary here.
  P = seats().map(q => ({ name: P[q].name, purse: PURSE, roster: [], locked: false }));
  lot = null; lastFx = 0; drawnLot = -1;
  dealDeck();
  nextLot();
});

// Debug-only: module-scoped variables aren't visible from the console
// directly (ES modules don't attach top-level bindings to window). This
// gives console access to the current values without changing anything -
// call DEBUG() in DevTools to see live values. Safe to leave in; it does
// nothing unless explicitly called.
window.DEBUG = () => ({ TABLE_ID, backend, ROOM, HOST, ME, NP, started, over, lot, P, ST, matchRuns, lastSeenSeed, MATCH, knocks });
