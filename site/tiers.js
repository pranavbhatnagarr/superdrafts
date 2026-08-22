/* ------------------------------------------------------------------ *
 *  tiers.js, the public tier guide.
 *
 *  Read-only. It never opens a channel, never writes anything, and never
 *  touches a game: it fetches the roster once and prints it. Everything
 *  it prints is computed with rules.js, the same module the sale and the
 *  fight run on, so the guide cannot quietly disagree with the game. If a
 *  tier is retuned in the table, this page is right the next time it loads.
 *
 *  Three states per character, which is the whole page:
 *
 *    printed   what is on the card
 *    role      printed with a role that suits them, worth one rung
 *    ceiling   that plus a week of prep, worth their prep rating on top
 *
 *  All three come out of effTier(), never out of arithmetic written here.
 *  The one thing this page does NOT print is the fall: a role that does
 *  not suit costs a rung, and showing four columns of decline alongside
 *  three of climb made the chart unreadable. The note under step two says
 *  so rather than pretending the penalty is not there.
 * ------------------------------------------------------------------ */

import {
  ROLES, ROLE_ICON_PATH, UNIVERSES, LADDER, effTier, DB_URL, DB_KEY
} from "./rules.js";

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Every character is measured against a role that suits them, so the guide
// needs one such role to hand to effTier. Which one does not matter: a fit
// is worth exactly one rung whatever the job, so the first is as good as any.
// Where a character fits nothing at all the climb is simply not available,
// and the row says so rather than printing the printed tier twice.
const firstFit = ch => (ch.fit || "")[0] || null;

const tierOf   = (ch, mode, role) => effTier(ch, mode, role);
const rungsUp  = (from, to) => LADDER.indexOf(from) - LADDER.indexOf(to);

// ---------------------------------------------------------------- state

let ROWS = [];                       // every character, already graded
let worldsOn = new Set();            // empty means every world
let ceilOn   = new Set();            // empty means every ceiling
let sortBy   = "tier";               // "tier" or "name"
let query    = "";

// ---------------------------------------------------------------- data

async function load(){
  const cols = "name,universe,real_name,tier,prep_shift,fit_roles,bad_roles";
  const r = await fetch(
    `${DB_URL}/rest/v1/characters?select=${cols}&universe=not.is.null`,
    { headers: { apikey: DB_KEY, Authorization: "Bearer " + DB_KEY } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const raw = await r.json();
  if (!raw.length) throw new Error("empty roster");

  ROWS = raw.map(x => {
    // The shape rules.js expects, which is the shape the game builds too.
    const ch = {
      name: x.name, tier: x.tier, prep: x.prep_shift || 0,
      fit: x.fit_roles || "", bad: x.bad_roles || ""
    };
    const fit     = firstFit(ch);
    const printed = ch.tier;
    const role    = fit ? tierOf(ch, "random", fit) : printed;
    const ceiling = fit ? tierOf(ch, "prep",   fit) : tierOf(ch, "prep", null);
    return {
      name: x.name, real: /^unknown$/i.test(x.real_name || "") ? "" : (x.real_name || ""),
      world: x.universe,
      printed, role, ceiling, prep: ch.prep, fit: ch.fit, bad: ch.bad,
      hasFit: !!fit,
      climb: rungsUp(printed, ceiling),
      hay: (x.name + " " + (x.real_name || "")).toLowerCase()
    };
  });
}

// ---------------------------------------------------------------- chrome

function paintStrip(){
  const worlds = new Set(ROWS.map(r => r.world));
  const top = ROWS.filter(r => r.ceiling === "S+").length;
  $("tgCount").textContent  = ROWS.length + " Characters";
  $("tgWorlds").textContent = worlds.size + " Worlds";
  $("tgTop").textContent    = top + " Can Reach S+";
}

function paintRoleHeads(){
  $("tgRoleHeads").innerHTML = ROLES.map(r =>
    `<span class="tg-rolehead" title="${esc(r.name)}">
       <svg viewBox="0 0 512 512" role="img" aria-label="${esc(r.name)}">
         <path d="${ROLE_ICON_PATH[r.k]}"/>
       </svg>
     </span>`).join("");
}

function paintChips(){
  // Worlds keep the box's own grouping and its own order, so a player who
  // ticked "Naruto" on the cover finds it in the same place here.
  const counts = ROWS.reduce((m, r) => (m[r.world] = (m[r.world] || 0) + 1, m), {});
  const order = Object.keys(UNIVERSES).filter(k => counts[k]);
  $("tgWorldChips").innerHTML = order.map(k =>
    `<button type="button" class="chip" data-world="${k}" aria-pressed="false">
       ${esc(UNIVERSES[k].name)}<span class="chip-n">${counts[k]}</span>
     </button>`).join("");

  const reached = LADDER.filter(t => ROWS.some(r => r.ceiling === t));
  $("tgCeilChips").innerHTML = reached.map(t =>
    `<button type="button" class="chip" data-ceil="${esc(t)}" aria-pressed="false">
       ${esc(t)}<span class="chip-n">${ROWS.filter(r => r.ceiling === t).length}</span>
     </button>`).join("");

  $("tgSortChips").innerHTML =
    `<button type="button" class="chip on" data-sort="tier" aria-pressed="true">Ceiling</button>
     <button type="button" class="chip" data-sort="name" aria-pressed="false">A to Z</button>`;

  $("tgKey").innerHTML = ROLES.map(r =>
    `<div class="tg-keyrow">
       <dt><svg class="tg-keyicon" viewBox="0 0 512 512" aria-hidden="true"><path d="${ROLE_ICON_PATH[r.k]}"/></svg>${esc(r.name)}</dt>
       <dd>${esc(r.blurb)}</dd>
     </div>`).join("") +
    `<div class="tg-keyrow tg-keyrow-marks">
       <dt><i class="tg-mark tg-mark-fit"></i>Suits them</dt>
       <dd>Worth a rung. Every climb on this page is one of these.</dd>
     </div>
     <div class="tg-keyrow tg-keyrow-marks">
       <dt><i class="tg-mark tg-mark-bad"></i>Does not</dt>
       <dd>Costs a rung, and is not printed in the columns above.</dd>
     </div>`;
}

// ---------------------------------------------------------------- rows

const gradeHtml = (t, extra) =>
  `<span class="tg-grade${extra || ""}" data-t="${esc(t)}">${esc(t)}</span>`;

function rowHtml(r){
  const marks = ROLES.map(role => {
    const fits = r.fit.includes(role.k), bad = r.bad.includes(role.k);
    const state = fits ? "fit" : bad ? "bad" : "none";
    const says  = fits ? "suits them" : bad ? "does not suit them" : "no effect";
    return `<span class="tg-mark-cell" role="cell">
      <i class="tg-mark tg-mark-${state}" role="img" aria-label="${esc(role.name)}: ${says}"></i>
    </span>`;
  }).join("");

  // A character who suits nothing cannot buy the role rung, so the column
  // holds a rule rather than a repeat of the printed tier: an empty cell is
  // information here, and a duplicated letter would read as a climb.
  const roleCell = r.hasFit
    ? gradeHtml(r.role)
    : `<span class="tg-nofit" title="No role suits them">&mdash;</span>`;

  return `<div class="tg-row" role="row"${r.ceiling === "S+" ? ' data-top="1"' : ""}>
    <span class="tg-c-name" role="cell">
      <b class="tg-name">${esc(r.name)}</b>
      ${r.real && r.real !== r.name ? `<span class="tg-real">${esc(r.real)}</span>` : ""}
    </span>
    <span class="tg-c-grade" role="cell">${gradeHtml(r.printed)}</span>
    <span class="tg-c-grade" role="cell">${roleCell}</span>
    <span class="tg-c-prep"  role="cell"><b class="tg-prep" data-p="${r.prep}">${r.prep}</b></span>
    <span class="tg-c-grade tg-c-ceil" role="cell">${gradeHtml(r.ceiling, " tg-grade-lg")}</span>
    <span class="tg-c-roles" role="cell">${marks}</span>
  </div>`;
}

const byTier = (a, b) =>
  LADDER.indexOf(a.ceiling) - LADDER.indexOf(b.ceiling) ||
  LADDER.indexOf(a.printed) - LADDER.indexOf(b.printed) ||
  a.name.localeCompare(b.name);
const byName = (a, b) => a.name.localeCompare(b.name);

function visible(){
  return ROWS.filter(r =>
    (!worldsOn.size || worldsOn.has(r.world)) &&
    (!ceilOn.size   || ceilOn.has(r.ceiling)) &&
    (!query         || r.hay.includes(query)));
}

function paintRows(){
  const rows = visible().sort(sortBy === "name" ? byName : byTier);
  const body = $("tgBody");

  // Grouped under the box's own divider tabs, unless a search is running:
  // once you are hunting one name, fourteen headings are in the way.
  const grouped = !query;
  let html = "";
  if (grouped){
    // Seeded in the cover's own order so a player who ticked Naruto on the
    // box finds it in the same place here. Sorting the rows first and letting
    // the groups fall out in encounter order put whichever world happened to
    // own the strongest character at the top of the page.
    let tab = 0;
    const seen = new Map(Object.keys(UNIVERSES).map(k => [k, []]));
    for (const r of rows){
      if (!seen.has(r.world)) seen.set(r.world, []);
      seen.get(r.world).push(r);
    }
    for (const [k, list] of seen){
      if (!list.length) continue;
      html += `<div class="tg-divider" role="row" style="--i:${tab++}">
        <span class="tg-divtab" role="cell">
          ${esc((UNIVERSES[k] || {}).name || k)}
          <span class="tg-divn">${list.length}</span>
        </span>
      </div>` + list.map(rowHtml).join("");
    }
  } else {
    html = rows.map(rowHtml).join("");
  }

  body.innerHTML = html;
  $("tgNone").hidden = rows.length > 0;
  $("tgTable").hidden = rows.length === 0;

  const all = rows.length === ROWS.length;
  $("tgResult").textContent = all
    ? `All ${ROWS.length} characters, ordered by ${sortBy === "name" ? "name" : "ceiling"}.`
    : `${rows.length} of ${ROWS.length} characters.`;
}

// ---------------------------------------------------------------- events

function wire(){
  let t = null;
  $("tgQ").addEventListener("input", e => {
    // Debounced because a keystroke rebuilds three hundred rows, and doing
    // that on every character makes a phone feel like it is thinking.
    clearTimeout(t);
    const v = e.target.value.trim().toLowerCase();
    t = setTimeout(() => { query = v; paintRows(); }, 110);
  });

  const toggle = (set, key, btn) => {
    if (set.has(key)) set.delete(key); else set.add(key);
    btn.classList.toggle("on", set.has(key));
    btn.setAttribute("aria-pressed", set.has(key) ? "true" : "false");
    paintRows();
  };

  $("tgWorldChips").addEventListener("click", e => {
    const b = e.target.closest("[data-world]"); if (b) toggle(worldsOn, b.dataset.world, b);
  });
  $("tgCeilChips").addEventListener("click", e => {
    const b = e.target.closest("[data-ceil]"); if (b) toggle(ceilOn, b.dataset.ceil, b);
  });
  $("tgSortChips").addEventListener("click", e => {
    const b = e.target.closest("[data-sort]"); if (!b) return;
    sortBy = b.dataset.sort;
    for (const x of $("tgSortChips").children){
      const on = x === b;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    }
    paintRows();
  });

  $("tgClear").addEventListener("click", () => {
    worldsOn.clear(); ceilOn.clear(); query = ""; $("tgQ").value = "";
    for (const b of document.querySelectorAll(".chip[data-world], .chip[data-ceil]")){
      b.classList.remove("on");
      b.setAttribute("aria-pressed", "false");
    }
    paintRows();
    $("tgQ").focus();
  });
}

// ---------------------------------------------------------------- boot

(async () => {
  try {
    await load();
    paintStrip();
    paintRoleHeads();
    paintChips();
    paintRows();
    wire();
    // The one authored moment: the guide settles onto the counter and the
    // dividers drop in behind it. Runs once, then the class comes off so a
    // filter never replays it.
    document.body.classList.add("tg-in");
    setTimeout(() => document.body.classList.remove("tg-in"), 1400);
  } catch (e){
    $("tgCount").textContent = "Roster unavailable";
    $("tgResult").textContent =
      "Could not load the roster. Check your connection and refresh.";
    $("tgTable").hidden = true;
  }
})();
