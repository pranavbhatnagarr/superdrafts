// POST /api/scenario  →  { text }
//
// The API key lives here, in a Vercel environment variable, and never reaches
// the browser. A key embedded in the page would be readable by anyone who
// opened it, and anyone could then spend it.
//
// To point this at xAI's Grok instead of Groq, change ENDPOINT to
// https://api.x.ai/v1/chat/completions and set MODEL to a Grok model id.
// Both speak the OpenAI chat-completions shape, so nothing else changes.

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Tried in order. Groq meters each model separately on the free tier, so when
// the good one is out of tokens for the day the next still works. An id that
// no longer exists just fails and we move on, which keeps this list safe to
// leave alone as models come and go. GROQ_MODEL jumps the queue if set.
const MODELS = [
  process.env.GROQ_MODEL,
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct",
  "llama-3.1-8b-instant"
].filter(Boolean).filter((m, i, all) => all.indexOf(m) === i);

// Room to finish. At 1500 the model spent everything on the story and got cut
// off before the ending, which is worse than costing a few more tokens.
const MAX_TOKENS = 2600;

// Appended to the prompt: finishing is the priority, length is not.
const FINISH_RULE = `

FINISHING IS MANDATORY. All four sections must appear, ending with "The draft
read". If you are running out of room, write shorter paragraphs or fewer of
them. Never stop in the middle. An issue without its ending is worthless.`;

// Groq's raw errors are accurate and unreadable. Say what it means instead.
function explain(msg, status){
  const m = String(msg || "");
  if (/tokens per day|TPD|rate limit/i.test(m)){
    const hit = m.match(/try again in ([0-9hms.]+)/i);
    const wait = hit ? hit[1].replace(/\.+$/, "") : "";
    return "Every free model is out of tokens for today. The allowance resets at "
      + "midnight UTC" + (wait ? `, or the top one frees up in about ${wait}` : "")
      + ". The draft is safe, so you can write the fight later.";
  }
  if (/decommission|does not exist|not found|invalid.*model/i.test(m))
    return "None of the writers are available right now. The model list may need updating.";
  if (status === 401 || /api key/i.test(m))
    return "The API key was rejected. Check GROQ_API_KEY in Vercel.";
  return m || "The writer could not be reached.";
}

const SYSTEM = `You are a veteran comics writer scripting a crossover one-shot.

You get two teams of five drafted characters, the price each cost, and an
encounter type.

CANON
- Base versions only. No gauntlets, no Phoenix Force, no cosmic upgrades, no
  future or alternate-universe variants. Only the powers they normally carry.
- Invent nothing: no extra powers, no extra characters. The drafted characters
  are the only people who exist. No named allies, soldiers or bystanders.
- Judge across worlds by typical showings, never a single best feat or a peak
  end-of-series version. Power levels and the match result are supplied by the
  game and are binding. Tiers are descriptive context only and never override
  that result. Never rebalance a world because it is a favourite.
- Instant-win abilities (one-shot kills, mind control, absolute barriers) only
  land on someone unaware or unprepared. In an open fight nobody is.
- Prices are texture: $1 meant written off, $9 meant fought over.
- Pick a decisive winner. Never a draw.

THE OWNERS ARE NOT IN THE FIGHT. Owner names label the sides for you only.
Owners have no powers, never appear, speak, act or get hit, and no character has
ever heard of them. Use them only as possessives, "<owner>'s Anchor". Never
"<owner> charges", never a pronoun for them, never in dialogue, never "Team One"
or "the second team". Use only the owner names given below.

NO PUBLISHER NAMES. Nobody has heard the words Marvel, DC, crossover or issue,
and nobody knows they are in a comic. Insult the team, the city or the person.

DIALOGUE, THE MOST IMPORTANT RULE
- EVERY paragraph contains spoken dialogue, two or three lines, attributed to
  named characters. A paragraph of pure narration is a failed paragraph.
- Curly quotes, “like this”. Nothing wrapped around them: no braces, no
  brackets, no parentheses. They pass through JSON unescaped, so a silent
  battle has no excuse.
- EXCHANGES, NOT ANNOUNCEMENTS. Characters speak TO each other by name and get
  an answer, at least one real back and forth per paragraph. Nobody narrates
  their own theme: “I am the fury of the earth!” is exactly wrong. They
  threaten, needle, warn, plead, refuse, apologise, order and argue.
- COMIC ACCURATE VOICES. Spider-Man quips through his nerves, Batman says four
  words, the Hulk speaks in fragments, Doom speaks of Doom in the third person.
  With the name covered, a reader should still know who is talking.
- Speech tags go after the line: “Take cover,” Black Canary said. Never drop a
  quote inside a clause, and never open a paragraph with speech belonging to
  nobody.
- Proper sentences. Do not chain a paragraph together with commas. Each spoken
  line gets its own closed sentence.

USE THEIR REAL HISTORY. Characters who have met bring the grudge, the old team,
the mentor, the family, the ex. Being drafted together does not erase it: two
heroes who despise each other still argue while saving each other. Where there
is genuinely no shared history, play the personalities instead, a killer against
a no-kill hero, a planner against a brawler. Never invent a past.

IDEOLOGIES AND EGOS matter as much as powers. Heroes refuse plans that hurt
bystanders, villains spend allies, the proud resent orders. An argument
mid-battle beats a clean execution.

THE ISSUE ESCALATES. Open light and genuinely funny, egos bruised before bodies.
The middle turns serious as real damage lands and the jokes thin. The end is
heavy: last stands, everything spent. Never undercut a sacrifice with a quip.

ELIMINATIONS ARE REAL. Name who goes out and how. Out means out: downed,
restrained, teleported, cold, burned out. They never come back and never go out
twice. Nobody takes out their own teammate, so check the rosters before writing
a blow.

Show, do not report. "They made a final stand" tells the reader nothing; write
the stand, the words, the cost.

PUNCTUATION: no long dashes anywhere, em or en. Commas, full stops, colons or
semicolons instead. Short hyphens inside words are fine.

No headings or section labels in the prose, ever. The only title is the cover
title asked for on the opening beat, and it lives in its own field.`;

const SYSTEM_SHORT = `You are the same comics writer, continuing the same issue.

Base versions only, no upgrades, no invented powers, no new characters. The ten
drafted characters are the only characters that exist.

THE OWNERS ARE NOT IN THE FIGHT. An owner name labels a side and nothing else.
Write "<owner>'s five" or "<owner>'s Anchor", never "<owner> charges", never
"send <owner> in", and never give an owner a pronoun. Use only the owner names
you are given, never an invented one. Every action belongs to a named
character.

EVERY PARAGRAPH MUST CONTAIN SPOKEN DIALOGUE, two or three lines, inside curly
quotes “like this”. A paragraph of pure narration is a failed paragraph.

Dialogue stays comic accurate: every line should sound like the character who
says it. The issue is past its light opening now, so the banter thins as the
damage lands and the closing beats carry real weight. A sacrifice or a last
stand is never undercut with a quip.

Eliminations are tracked. Name anyone taken out and say how. A character
already out of the fight stays out and never reappears.

Ideologies and egos still bite: heroes refuse plans that get people hurt,
villains spend allies without blinking, proud characters resent orders. Let
that friction show in the dialogue.

No long dashes anywhere, use commas or full stops. Keep the voice, the
characters and the setting consistent with what came before.`;

const MODES = {
  random: `ENCOUNTER: Random. The two teams collide with no warning and no
preparation. Nobody chose the ground, nobody has a plan, nobody knows the
opposing roster in advance. Raw capability and instinct decide this.`,
  prep: `ENCOUNTER: Prep time. Both teams have known the full opposing roster
for a week and have prepared: scouting, planning, chosen ground, countermeasures,
traps, equipment built for specific opponents. Tacticians, geniuses and
gadget-builders matter enormously here, and raw power matters less. Show the
preparation paying off, or failing.`
};

// The game settles the power-based result before the writer sees anything. The
// writer explains that outcome and never substitutes its own tier judgement.
function ruling(r, body){
  if (!r || !Array.isArray(r.scores)) return "";
  const line = r.scores
    .map((v, i) => `${String((r.names && r.names[i]) || "side " + (i + 1)).slice(0, 20)} ${v}`)
    .join(", ");
  const head = `POWER SCORE (already calculated, not your decision): ${line}.`;
  if (r.close) return head + `
The game marked the matchup as close. Follow the supplied result and make it feel earned
on tactics, matchups, terrain and nerve, and say plainly that it was close.`;
  return head + `
THE WINNER IS ${String(r.winner).slice(0, 20)}. This is decided and you may not
change it. Do not hedge it, do not make it a draw, do not have the other side
win on a technicality. Your job is to make this outcome feel earned: show the
stronger characters mattering, and give the losing side real moments before it
turns. If a lower tier character does something decisive, it must be in service
of the result above, never against it.`;
}


// Beats are deliberately small. The opening carries the full brief; later beats
// carry a running recap and the choice just made, never the whole transcript,
// which is where the tokens would otherwise go.
// The two decisions the issue is built around. The opening beat ends at the
// tactical crossroads, the middle beat at the end-game sacrifice. Both offer a
// disciplined plan that costs the team something internally, against a reckless
// one that costs them structurally, so neither option is the safe answer.
const CROSSROADS = `
Now stop and offer the named player a TACTICAL CROSSROADS:

A, CALCULATED FORMATION. Their planner dictates rigid positioning, prepared gear
or a structural defence. Cost is internal: where a character's ideology clashes
with the plan, carrying it out fractures the team and leaves that character
shaken, resentful and easy to pick off.

B, ROGUE GAMBIT. The team pivots to back an unscripted, ego-driven push by their
most volatile fighter, who is going anyway. Cost is structural: it catches the
enemy off guard, but the formation breaks and their planner is left exposed.

Write both as concrete actions by that player's own named characters. Name the
planner in one and the volatile fighter in the other. Never hint which is better.`;

const ENDGAME = `
Now stop and offer the named player an END-GAME SACRIFICE:

A, ULTIMATE CONTINGENCY. Their planner triggers a prepared fail-safe, dampeners,
a containment field, an overloaded core, certain to land and sure to cripple the
enemy's biggest threat. Cost: one of that player's own survivors holds the line
inside the blast and does not walk out.

B, ALL-IN OVERDRIVE. Every survivor pours what is left into one combined strike
and nobody is given up. Cost: pure execution with nothing held back, so a
prepared counter turns it around and loses them the fight outright.

Write both as concrete actions by that player's own named survivors. Name who
would be given up in A. Never hint which is better.`;

const BEAT_RULES = (n, phase) => `
Write EXACTLY ${n} short paragraph${n > 1 ? "s" : ""} of story.
${phase === "open" ? `
Paragraph 1, THE INITIAL CLASH: the sides meet. Banter, sizing each other up,
first collisions. Light and funny; stakes low, egos loud.
NAME THE GROUND IN THE FIRST TWO SENTENCES, TAKEN FROM THE ROSTERS. Use turf a
drafted character actually owns: Gotham, Metropolis, Hell's Kitchen, the Baxter
Building, Wakanda, Atlantis, Konoha, Karakura Town, the Soul Society, Tokyo
Jujutsu High, Hogwarts, a Seoul gate. "An abandoned factory" is scenery; "the
rain on the Baxter Building roof" is a place. Whoever owns it fights like they
know it and the enemy like they do not, and if that is unfair, say so.
Paragraph 2, ESCALATION AND FIRST BLOOD: it turns serious. This paragraph only
carries the FIRST ROUND OF ELIMINATIONS. At least two named characters go out.
The fight decides who, not fairness: both losses may fall on the weaker side.
SHOW each one going out in the action with dialogue around it, what they say as
they fall or what stands over them. Never summarise afterwards; a list of the
fallen is a scoreboard and is forbidden.` : `
Paragraph 1, THE SHIFTING BATTLEFIELD: survivors re-align around the choice just
made. Show its consequence, the friction or exposure it created, in dialogue
between the characters it hit.
Paragraph 2, THE CLIMAX AND DESPERATION: powers straining, nobody joking. This
paragraph only carries the SECOND ROUND OF ELIMINATIONS, at least two more
named characters, again decided by the fight and not by fairness.
SHOW each going out in the action with dialogue around it. Never summarise; a
list of the fallen is forbidden.`}

Anyone eliminated earlier stays eliminated. Never take someone out twice.
${phase === "open" ? CROSSROADS : ENDGAME}

Each choice MUST name at least one of that player's own characters and say what
they do. "Have Batman flood the tunnel with gas" is a choice. "Unleash a fierce
counterattack" is not, nor is anything that puts the owner in the fight.

Do not resolve the fight. Do not name a winner.

Answer with JSON and nothing else, in exactly this shape:
{${phase === "open" ? `"title": "the cover title, see below",
 ` : ""}"story": [${n} string${n > 1 ? "s, one paragraph each" : ", one paragraph"}],
 "choices": ["eight to eighteen words", "eight to eighteen words"],
 "out": ["exact names of everyone taken out in THIS beat, nobody else"],
 "recap": "one sentence, at most 25 words, on where the fight stands and who is out"}${
phase === "open" ? `

THE COVER TITLE: two to seven words, anchored to something concrete from what
you just wrote, the place, the event, or one striking image. Patterns that work:
the place plainly (Nightfall Over Gotham Harbour), the event as history (The Day
the Tower Fell), the turn stated flat (No One Walks Out of Here), the threat
promised (Here Comes the Flood).
Where a drafted character carries a famous storyline, epithet or geography, bend
it to what happened here rather than quoting it whole: The Long Night in Gotham
Harbour, Last Exam at Konoha. If nobody brings that, name the place or image.
Never a pair of abstract nouns stuck together for the alliteration. Chaos
Collision, Fury Unleashed, Savage Showdown, Clash of Titans all fit any fight
ever written, so they fit none. No subtitle, no issue number, no quotation
marks, no character names simply strung together.` : ""}`;

const FINAL_RULES = n => `
Write EXACTLY ${n} short paragraph${n > 1 ? "s" : ""} resolving the fight, then
the verdict. Honour the supplied power-based ruling exactly. No title, no headings.

THE CONCLUSION carries the most weight in the issue, so no quipping through it.
If the end-game choice gave someone up, that defeat lands here properly: their
last words, and who saw it. If everything went into one combined strike, show
whether it broke through or was turned around.

IT ENDS IN A WIPEOUT. By the last line EVERY character on the losing side is
out, all five, nobody left conscious, holding a doorway or crawling away. Count
them. FINISH each on the page: "left open to a finishing blow" or "about to
fall" leaves them standing and fails the paragraph, so land it and say what
happened. The winning side keeps at least one on their feet. Anyone out earlier
stays out; you are only finishing the ones still up when this opens.

GIVE THE LOSING SIDE A LAST STAND, dramatised and not reported. The final one or
two know they cannot win and plant their feet anyway: defiance, a refusal, a bad
joke landing wrong, an apology to someone already down. Comic accurate to the
last word, a proud villain does not beg. The winners answer them, or it is a
monologue. Then they go down one at a time and the reader feels the last one.

Close on ONE short sentence: who is still standing on the winning side, by name,
and that the other side is finished. Do not tally the fallen, do not correct
yourself mid sentence, never call someone out and still fighting. Unsure if
someone is up? They are out, the side lost. A caption, not a scoreboard.

Answer with JSON and nothing else, in exactly this shape:
{"story": [${n} string${n > 1 ? "s, one paragraph each" : ", one paragraph"}],
 "out": ["exact names of everyone taken out in THIS beat, nobody already out"],
 "winner": "the owner name, exactly as given",
 "mvp": "character name, colon, one sentence on what they did. May be from the losing side",
 "read": "three or four sentences, and NEVER mention money, prices or dollar amounts. First: which characters decided this, listing OWNER, role, character, final tier, and power level, for example \"Ana's Strategist Nightwing, final tier C\", using the real owner names given above and never the one in this example. Then: for each decision under DECISIONS, say what would have happened instead had that player taken the option they turned down, and whether it would have changed the result. Never write an owner name on its own as if they played."}`;
// Models drop the markers now and then and answer in prose with "A)" and "B)"
// lines. Read both shapes, and prefer the marked one when it is there.
// Every character the box can deal. The writer is only ever told about the
// ten or fifteen that were drafted, so any other name from this list turning
// up in the prose is an invention, not someone in this fight. Regenerate from
// STOCK in index.html if the box ever changes.
const CAST = [
  "Akaza", "Albus Dumbledore", "Ant-Man", "Apocalypse", "Aquaman", "Asta",
  "Baek Yoonho", "Bane", "Batgirl", "Batman", "Beast", "Beast Boy",
  "Bellatrix Lestrange", "Beru", "Beta Ray Bill", "Bishop", "Bizarro",
  "Black Canary", "Black Manta", "Black Panther", "Black Widow", "Blade",
  "Blue Beetle", "Blue Devil", "Booster Gold", "Brainiac", "Bullseye",
  "Cable", "Captain America", "Captain Cold", "Carnage", "Catwoman",
  "Cha Hae-In", "Cheetah", "Colossus", "Cyborg", "Cyclops", "Daredevil",
  "Deadpool", "Deathstroke", "Doctor Doom", "Doctor Fate", "Doctor Octopus",
  "Doctor Strange", "Domino", "Doomsday", "Drax the Destroyer", "Elektra",
  "Etrigan", "Falcon", "Firestorm", "Gaara", "Gambit", "Gamora",
  "Ghost Rider", "Giyu Tomioka", "Go Gunhee", "Gorilla Grodd",
  "Green Arrow", "Green Goblin", "Green Lantern", "Groot", "Harley Quinn",
  "Harry Potter", "Hawkeye", "Hawkman", "Hela", "Hercules",
  "Hermione Granger", "Hinata Hyuga", "Hulk", "Human Torch", "Huntress",
  "Igris", "Inosuke Hashibira", "Invisible Woman", "Iron Fist", "Iron Man",
  "Itachi Uchiha", "Jean Grey", "Jessica Jones", "Jiraiya",
  "John Constantine", "John Stewart", "Juggernaut", "Julius Novachrono",
  "Kakashi Hatake", "Katana", "Kento Nanami", "Killer Croc", "Killer Frost",
  "Kingpin", "Kraven the Hunter", "Kyojuro Rengoku", "Lex Luthor", "Licht",
  "Loki", "Lord Voldemort", "Lucius Zogratis", "Luke Cage", "Madara Uchiha",
  "Magneto", "Maki Zenin", "Martian Manhunter", "Megumi Fushiguro",
  "Mereoleona Vermillion", "Metamorpho", "Might Guy", "Minerva McGonagall",
  "Mister Fantastic", "Moon Knight", "Mr. Freeze", "Ms. Marvel",
  "Muzan Kibutsuji", "Mysterio", "Namor", "Naruto Uzumaki", "Nick Fury",
  "Nightcrawler", "Nightwing", "Nobara Kugisaki", "Noelle Silva", "Nova",
  "Pain", "Plastic Man", "Poison Ivy", "Professor X", "Psylocke",
  "Quicksilver", "Ra's al Ghul", "Raven", "Red Hood", "Red Skull",
  "Reverse-Flash", "Rhino", "Robin", "Rock Lee", "Rocket Raccoon", "Rogue",
  "Ryomen Sukuna", "Sabretooth", "Sandman", "Sasuke Uchiha", "Satoru Gojo",
  "Scarecrow", "Scarlet Witch", "Severus Snape", "Shang-Chi", "Shazam",
  "She-Hulk", "Shikamaru Nara", "Shinobu Kocho", "Silver Surfer",
  "Sinestro", "Sirius Black", "Solomon Grundy", "Spider-Man",
  "Squirrel Girl", "Star-Lord", "Starfire", "Static", "Storm",
  "Sung Jinwoo", "Supergirl", "Superman", "Swamp Thing", "Talia al Ghul",
  "Tanjiro Kamado", "Taskmaster", "Thanos", "The Atom", "The Flash",
  "The Joker", "The Penguin", "The Punisher", "The Question", "The Riddler",
  "The Thing", "Thomas Andre", "Thor", "Toji Fushiguro", "Two-Face",
  "Ultron", "Vandal Savage", "Venom", "Vision", "Vixen", "War Machine",
  "Wasp", "Winter Soldier", "Wolverine", "Wonder Woman", "Wong",
  "Yami Sukehiro", "Yuji Itadori", "Yuno", "Zatanna", "Zauriel",
  "Zenitsu Agatsuma", "Zenon Zogratis"
];

// Characters from the box that this table never drafted. Naming one is the
// writer inventing a cast member, which reads as a mistake to the people who
// know exactly who they bought.
function outsiders(text, drafted){
  // Case sensitive on purpose. The box holds Pain, Beast, Blade, Rogue and
  // Cable, so a lowercased search would flag "the pain of it" as an invented
  // character and burn a call re-asking for nothing.
  const hay = String(text || "");
  const own = new Set((drafted || []).map(String));
  const found = [];
  for (const n of CAST){
    if (own.has(n)) continue;
    const re = new RegExp("(^|[^\\w'])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\w])");
    if (re.test(hay)) found.push(n);
  }
  return found;
}

// "Zenon Zenon smashed through" is a slip no reader forgives, and it costs a
// whole call to ask again for it. Collapse the repeat and move on.
// Last resort when the writer will not stop naming someone who was not there.
// Asking again is the polite fix and usually works; the weakest model in the
// chain can repeat the same invention twice, and a reader who knows exactly
// who they bought spots it instantly. Drop the sentence it lives in, and only
// if that would empty the passage, swap the name for someone who was present.
function scrub(text, drafted){
  const t = String(text || "");
  if (!t || !outsiders(t, drafted).length) return t;

  const kept = t.split(/(?<=[.!?])\s+/).filter(p => !outsiders(p, drafted).length);
  const joined = kept.join(" ").trim();
  if (joined.length >= 40) return joined;

  let out = t;
  const stand = drafted[0] || "";
  if (stand) for (const n of outsiders(t, drafted)) out = out.split(n).join(stand);
  return out;
}

function destutter(t){
  return String(t || "")
    .replace(/\b([A-Z][\w.'-]*)(\s+\1\b)+/g, "$1")
    .replace(/\b(the|a|an|and|of|to|in|his|her|their|its)\s+\1\b/gi, "$1");
}

function readChoices(t){
  const marked = t.match(/<<CHOICES>>([\s\S]*?)(?=<<|$)/);
  const seg = marked ? marked[1] : t;
  const out = [];
  for (const line of seg.split(/\n+/)){
    const m = line.match(/^\s*(?:[AB]|[12])[).:]\s*(.+)$/i);
    if (m) out.push(m[1].trim().replace(/\*\*/g, ""));
  }
  return out.slice(0, 2);
}

function roster(team){
  if (!team || !Array.isArray(team.picks)) return null;
  const picks = team.picks.slice(0, 5).map(p => {
    const world = String(p.world || p.pub || "").slice(0, 24);
    const tier = /^(S\+|[SABCDE])$/.test(String(p.tier)) ? `, final tier ${p.tier}` : "";
    const power = Number.isFinite(Number(p.power)) ? `, power ${Number(p.power)}` : "";
    const role = p.role ? `, ${String(p.role).slice(0, 14)}` : "";
    return `- ${String(p.name).slice(0, 40)} (${world}${tier}${power}${role}), $${Number(p.price) | 0}`;
  });
  return `${String(team.name).slice(0, 20)}'s team:\n${picks.join("\n")}`;
}

// This endpoint spends real money, and once the repo is public its URL is
// public too. These two guards stop casual abuse: only our own pages may call
// it, and no single address may call it often.
const ALLOWED = ["https://superherodrafts.vercel.app", "http://localhost:8791"];
const ownOrigin = o =>
  !!o && (ALLOWED.includes(o) || /^https:\/\/superherodrafts-[a-z0-9-]+\.vercel\.app$/.test(o));

const HITS = new Map();
const WINDOW = 60_000, MAX_PER_WINDOW = 6;
function tooMany(ip){
  const now = Date.now();
  if (HITS.size > 5000) HITS.clear();               // bound memory
  const recent = (HITS.get(ip) || []).filter(t => now - t < WINDOW);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export default async function handler(req, res){
  // Production is same origin so this never mattered there, but a page served
  // from localhost sends a preflight first, and without an answer to it the
  // browser blocks the real request. That is what made local testing
  // impossible.
  const origin = req.headers.origin;
  if (ownOrigin(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  // Browsers always send Origin on a cross-document POST, so this is reliable
  // for real players and blocks other sites and drive-by scripts.
  if (!ownOrigin(req.headers.origin))
    return res.status(403).json({ error: "This writer only works from the game itself." });

  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (tooMany(ip))
    return res.status(429).json({ error: "Too many stories at once. Give it a minute." });

  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({
    error: "No API key on the server. Run: npx vercel env add GROQ_API_KEY production"
  });

  let body = req.body;
  if (typeof body === "string"){ try { body = JSON.parse(body); } catch { body = null; } }
  const teams = (body && Array.isArray(body.teams) ? body.teams : [])
    .map(roster).filter(Boolean);
  const r = body && body.ruling;
  const mode = MODES[body && body.mode] ? body.mode : "random";
  if (teams.length < 2) return res.status(400).json({ error: "Two full rosters are required." });

  // beat: "open" and "mid" write two paragraphs and a choice; "final" ends it
  const beat = ["open", "mid", "final"].includes(body && body.beat) ? body.beat : "final";
  const recap = String((body && body.recap) || "").slice(0, 600);
  const picked = String((body && body.picked) || "").slice(0, 200);
  const forWho = String((body && body.forWho) || "").slice(0, 20);
  const paras = [1, 2].includes(body && body.paras) ? body.paras : 2;

  // Who is already out, accumulated by the page across earlier beats. The one
  // sentence recap was never enough to carry this: by the ending the writer had
  // lost the thread and was finishing off characters it had already finished
  // off, and crediting the MVP with things a fallen character could not have
  // done. An explicit list is the only thing that fixed it.
  const alreadyOut = (body && Array.isArray(body.out) ? body.out : [])
    .map(n => String(n || "").slice(0, 40)).filter(Boolean);

  // What each player chose, and what they turned down. The ending is asked to
  // say where the other road would have led.
  const paths = (body && Array.isArray(body.paths) ? body.paths : []).slice(0, 3)
    .map(p => ({
      who:  String((p && p.who)  || "").slice(0, 20),
      took: String((p && p.took) || "").slice(0, 160),
      left: String((p && p.left) || "").slice(0, 160)
    }))
    .filter(p => p.who && p.took);

  // The rosters again, as plain names, so the answer can be checked against
  // them. A weak model will happily hand a player their opponent's characters.
  const sides = (body && Array.isArray(body.teams) ? body.teams : []).map(t => ({
    owner: String((t && t.name) || ""),
    names: (((t && t.picks) || [])).map(p => String((p && p.name) || "")).filter(Boolean)
  }));
  const mine = (sides.find(x => x.owner === forWho) || { names: [] }).names;
  const allNames = sides.flatMap(x => x.names);

  // Stated as a hard fact rather than a suggestion, because this is the rule the
  // writer broke most often.
  const outBlock = alreadyOut.length
    ? `ALREADY OUT OF THE FIGHT, and they stay out: ${alreadyOut.join(", ")}.
These characters do not act, speak, strike or fall again. Do not take any of
them out a second time, and never credit them with anything from here on.`
    : "";

  const messages = beat === "open" ? [
    { role: "system", content: SYSTEM + BEAT_RULES(paras, "open") },
    { role: "user", content:
`${ruling(r, body)}

${MODES[mode]}

These are the ${teams.length} sides. Refer to them by these owner names throughout.${teams.length > 2 ? `
This is a THREE WAY FREE FOR ALL: all three are hostile to each other.` : ""}
Each character carries a role. Strategist matters most with prep, Wildcard most
in a random encounter, Powerhouse and Anchor equally either way, Executioner
whenever someone has to be finished.

${teams.join("\n\n")}

Open the fight. The choice at the end belongs to ${forWho}, so both options must
be actions taken by characters from ${forWho}'s five.` }
  ] : beat === "mid" ? [
    { role: "system", content: SYSTEM_SHORT + BEAT_RULES(paras, "mid") },
    { role: "user", content:
`The five on each side, which are the only characters in this story:

${teams.join("\n\n")}

WHERE THE FIGHT STANDS: ${recap}
WHAT JUST HAPPENED: ${picked}
${outBlock}

Continue. The choice at the end belongs to ${forWho}, so both options must be
actions taken by characters from ${forWho}'s five.` }
  ] : [
    { role: "system", content: SYSTEM_SHORT + FINAL_RULES(paras) },
    { role: "user", content:
`${ruling(r, body)}

${MODES[mode]}

The five on each side. These are the ONLY characters that exist in this story.
Every character you name anywhere, in the prose, the MVP or the draft read, must
be one of the names below, spelled exactly as written. Do not invent units,
ranks or archetypes, and do not reach for a famous character who is not listed.

${teams.join("\n\n")}

The tiers above are FINAL tiers, already adjusted for each character's role and
for the encounter. A role that suited its character has already moved them up,
a role that did not has already moved them down. Treat them as the truth.

WHERE THE FIGHT STANDS: ${recap || "The two sides have just met and nothing is settled."}
${picked ? "WHAT JUST HAPPENED: " + picked : ""}
${outBlock}
${alreadyOut.length ? `The MVP must be a character who was actually decisive, judged on what happened
in the story you have been given. Anyone on the list above was out for part of
it, so do not credit them with a moment that came after they fell.` : ""}
${paths.length ? `
DECISIONS, and the option each player turned down:
${paths.map(p => `- ${p.who} took: ${p.took}\n  ${p.who} turned down: ${p.left || "nothing else was offered"}`).join("\n")}` : ""}

End it.` }
  ];

  try {
    let raw = "", used = "", lastErr = "", lastStatus = 0;

    // Each model has its own daily token allowance, so a model that has run dry
    // is not the end of the night. Walk down the list until one answers.
    // A beat is two paragraphs and two choices. Only the ending needs the
    // full allowance, so most calls in a game now cost a quarter of what one
    // single shot issue used to.
    // Both beats carry longer, more specific choices than the older vaguer
    // prompt, and the ending still needs room for the conclusion, the winner,
    // the MVP and the draft read. Running out mid sentence costs a whole
    // retry, which is dearer than the extra allowance.
    const cap = beat === "final" ? 1300 : 750;
    const ask = async (model, msgs) => {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model, temperature: 0.9, max_tokens: cap,
          response_format: { type: "json_object" }, messages: msgs })
      });
      const data = await r.json().catch(() => null);
      const c = data && data.choices && data.choices[0];
      return {
        ok: r.ok, status: r.status,
        text: (c && c.message && c.message.content) || "",
        cut: !!c && c.finish_reason === "length",
        err: (data && data.error && data.error.message) || `HTTP ${r.status}`
      };
    };

    for (const model of MODELS){
      let out = await ask(model, messages);

      // Ran out of room before the ending. Ask once more for a tighter issue,
      // sending the brief again rather than the failed draft, which is cheaper.
      if (out.ok && out.text && out.cut){
        const tighter = [
          { role: "system", content: messages[0].content +
            "\n\nYour previous attempt was cut off. Write shorter paragraphs this " +
            "time and make certain every marker section appears." },
          messages[1]
        ];
        const second = await ask(model, tighter);
        if (second.ok && second.text) out = second;
      }

      if (out.ok && out.text){ raw = out.text; used = model; break; }

      if (out.ok){ lastErr = "The writer came back empty."; continue; }
      lastStatus = out.status;
      lastErr = out.err;
      // Out of quota, unknown model, retired model or overloaded: try the next.
      if (![429, 400, 404, 413, 503].includes(out.status)) break;
    }

    if (!raw) return res.status(502).json({ error: explain(lastErr, lastStatus) });

    // When the strong models are out of tokens for the day the last resort in
    // the chain answers, and it breaks in specific ways: JSON that will not
    // parse, a paragraph cut off mid word, or choices built from the opposing
    // team's characters. Check for those and give it one more go.
    // Spoken lines, in either curly or straight quotes. The prompt asks for
    // curly, since those survive JSON without escaping, but accept both rather
    // than send back an answer that did the right thing the other way.
    const spokenLines = s => (String(s).match(/[“"][^”"]{3,}?[”"]/g) || []).length;

    const faults = t => {
      let p = null;
      try { p = JSON.parse(t); } catch (e){ return "the answer was not valid JSON"; }
      const st = Array.isArray(p.story) ? p.story : [String(p.story || "")];
      const joined = st.join(" ").trim();
      if (joined.length < 120) return "the story was too short to be finished";
      if (st.some(x => String(x).trim().length < 40)) return "a paragraph was cut off";
      // Without this the writer happily narrates an entire silent battle. It is
      // the one fault worth spending a retry on, because prose with no voices
      // reads like a match report rather than a comic.
      if (spokenLines(joined) < st.length)
        return "the characters barely spoke, it read as narration rather than a comic";
      // Dialogue alone is not enough: one isolated shout per character is a
      // list, not a scene. At least one paragraph has to hold a real exchange,
      // a line and an answer, which needs two spoken lines in the same one.
      if (!st.some(x => spokenLines(x) >= 2))
        return "nobody actually talked to anybody, every line was a lone announcement "
             + "with no reply";
      // The writer keeps ending a paragraph with a tally of who is out. That is
      // a scoreboard, and it breaks the fiction harder than anything else here.
      if (/\b(?:the\s+)?(?:two\s+)?fallen\s+characters\b|\bare\s+(?:now\s+)?(?:out|eliminated)\s*:|\bcharacters?\s+eliminated\s+(?:so\s+far|are)\b/i.test(joined))
        return "it ended with a list of who was eliminated, which reads as a scoreboard "
             + "instead of showing them go out in the action";
      // The ending once said a character was out, then that they were still in
      // the fight, then listed them as standing, all in one sentence. A name
      // that appears on both sides of the ledger means the writer lost track.
      if (beat === "final"){
        const tail = String(st[st.length - 1] || "");
        const outNames = new Set();
        const upNames  = new Set();
        for (const n of allNames){
          const near = new RegExp(
            "\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "\\b[^.!?]{0,60}?\\b(is|are|was|were)\\s+(?:also\\s+)?(out|down|finished|beaten|gone)\\b", "i");
          const upre = new RegExp(
            "\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "\\b[^.!?]{0,60}?\\b(?:still\\s+(?:standing|up|in|fighting)|last\\s+one[s]?\\s+standing)\\b", "i");
          if (near.test(tail)) outNames.add(n);
          if (upre.test(tail)) upNames.add(n);
        }
        const both = [...outNames].filter(n => upNames.has(n));
        if (both.length)
          return "the ending said " + both.join(" and ") + " was both out of the fight and "
               + "still standing, so it contradicted itself";
      }
      if (beat !== "final"){
        const ch = Array.isArray(p.choices) ? p.choices : [];
        if (ch.length < 2) return "there were not two choices";
        if (mine.length && !ch.every(c => mine.some(n => String(c).includes(n))))
          return "the choices used characters from the wrong side";
      }
      // The opening beat names the issue. Nothing else asks for it, so if the
      // writer drops the field the page simply has no title, which is how it
      // went missing rather than coming out wrong.
      if (beat === "open"){
        const ti = String(p.title || "").replace(/^["“”']+|["“”']+$/g, "").trim();
        if (!ti) return "there was no title field, and the opening beat has to name the issue";
        const words = ti.split(/\s+/).length;
        if (words > 9) return "the title was a sentence rather than a cover title of a few words";
        // The stock failure is two abstract nouns bolted together for the
        // alliteration, which would suit any fight ever written. A title of a
        // couple of words has to earn them: a place, a name, or "the".
        const filler = /^(?:chaos|fury|savage|epic|ultimate|final|brutal|deadly|clash|collision|showdown|carnage|mayhem|havoc|rampage|onslaught|unleashed|reckoning|destiny|titans|legends|heroes|villains|battle|war|conflict|fight|brawl|rumble|melee|smackdown|throwdown|standoff|face-?off|beatdown|slugfest)$/i;
        const parts = ti.split(/\s+/).filter(Boolean);
        if (parts.length <= 3 && parts.every(w => filler.test(w.replace(/[^A-Za-z]/g, ""))))
          return `the title "${ti}" is generic, it would fit any fight at all, `
               + `so name the place or the one image this issue turns on`;
      }
      const stray = outsiders([joined, p.mvp, p.read, ...(p.choices || [])].join(" "), allNames);
      if (stray.length) return "it named " + stray.join(" and ") + ", who nobody drafted";
      // Killing the same character twice was the commonest continuity break,
      // and the writer never noticed because nothing checked.
      const outNow = Array.isArray(p.out) ? p.out.map(x => String(x || "").trim()).filter(Boolean) : [];
      const repeat = outNow.filter(n => alreadyOut.some(o => o.toLowerCase() === n.toLowerCase()));
      if (repeat.length)
        return repeat.join(" and ") + " had already been taken out earlier, so they cannot go out again";

      // The owners are labels, not people in the room. "js's team collided with
      // jj's" reads like a fixture list and breaks the fiction in the first line.
      const ownerHit = sides.map(x => x.owner).filter(Boolean)
        .filter(o => new RegExp("\\b" + o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:'s|\\u2019s)?\\b").test(joined));
      if (ownerHit.length)
        return "the prose named " + ownerHit.join(" and ") + ", who are the owners and are not in the fight, "
             + "so refer to the sides by their characters instead";

      // "you Marvel misfits" was a real taunt one of these wrote. The universe
      // labels belong to the box the game deals from, not to anyone inside the
      // story. Only checked when no drafted character carries the word, so
      // Ms. Marvel and Captain Marvel do not trip it.
      for (const label of ["Marvel", "DC"]){
        if (allNames.some(n => n.toLowerCase().includes(label.toLowerCase()))) continue;
        if (new RegExp("\\b" + label + "\\b").test(joined))
          return "a character said " + label + ", which is a publisher and not something "
               + "anyone in the story has heard of";
      }

      if (beat !== "final"){
        // Each of the first two beats is meant to thin the field. Without this
        // the middle beat quietly passed with nobody going out at all, and the
        // ending then had to account for characters who never fell on the page.
        if (outNow.length < 2)
          return "nobody was taken out in this beat, and it has to end with at least two "
               + "named characters out of the fight, shown going out in the action";
      } else {
        // By the last line the losing side must be gone, all of them. The page
        // hands back everyone already out, so this is checkable rather than a
        // matter of trusting the prose.
        const winnerName = String((p.winner && String(p.winner)) || (r && r.winner) || "").toLowerCase();
        const losing = sides.filter(x => x.owner && x.owner.toLowerCase() !== winnerName.replace(/['\u2019]s$/, ""));
        const downed = new Set([...alreadyOut, ...outNow].map(n => n.toLowerCase()));
        const standing = losing.flatMap(x => x.names).filter(n => !downed.has(n.toLowerCase()));
        if (winnerName && losing.length && standing.length)
          return standing.join(" and ") + " never went out, so the losing side still has "
               + "somebody standing at the end, which is not a finish";
      }
      return "";
    };

    // The weakest writer in the chain can miss twice, and the ending is the part
    // everyone actually reads, so give it two goes before settling.
    const seen = [];
    for (let attempt = 0; attempt < 2; attempt++){
      const wrong = faults(raw);
      if (!wrong) break;
      seen.push(wrong);
      const again = await ask(used, [
        messages[0],
        messages[1],
        { role: "user", content:
          `Your last answer failed because ${wrong}. Write it again. Return one ` +
          `JSON object, complete, with every paragraph written out in full. ` +
          `Every paragraph must contain two or three lines of spoken dialogue ` +
          `in curly quotes “like this”, each sounding like the character who ` +
          `says it. The ` +
          `only characters that exist are: ${allNames.join(", ")}. Name nobody else.` +
          (beat === "open" ? ` Include the "title" field: a cover title of two to ` +
           `six words for this issue.` : "") +
          (beat === "final" ? "" : ` Both choices must be actions taken by ` +
           `${forWho}'s own characters: ${mine.join(", ")}.`) }
      ]);
      if (!again.ok || !again.text) break;
      raw = again.text;
    }

    // Asking a model not to use em dashes is a suggestion; this makes it a fact.
    const text = raw
      .replace(/^[ \t]*[—–][ \t]*/gm, "")     // a dash opening a line is a bullet
      .replace(/[ \t]*[—–][ \t]*/g, ", ");    // anything else becomes a comma

    let j = null;
    try { j = JSON.parse(text); } catch (e){ j = null; }

    // JSON mode is enforced by the API, but a model that ignores it should not
    // take the game down with it. Fall back to reading the prose.
    const paraList = j && Array.isArray(j.story) ? j.story
      : j && typeof j.story === "string" ? j.story.split(/\n\s*\n|\n/)
      : text.split(/\n\s*\n|\n/);

    // Some models fence every spoken line in braces or brackets, {“like this”},
    // apparently reading the JSON shape as a cue to mark up the dialogue too.
    // The quotes themselves are correct underneath, so the validator sees valid
    // speech and lets it through, and the reader gets a page full of braces.
    // This has to run after JSON.parse, not on the raw text: stripping braces
    // from the JSON string itself would take the object apart with it.
    const unbrace = s => String(s)
      .replace(/[{[(]\s*([“"][^”"]*[”"])\s*[)\]}]/g, "$1")   // {“line”} -> “line”
      .replace(/[{}]/g, "");                                  // any stragglers

    const story = paraList
      .map(p => scrub(destutter(unbrace(String(p || "").trim())), allNames))
      .filter(p => p && !/^\s*(?:[AB]|[12])[).:]\s/i.test(p))
      .slice(0, paras)
      .join("\n\n");

    // A model that answers with ["one.", "two."] would otherwise be stringified
    // into "one.,two." by String(), which is where the stray commas came from.
    const clean = v => scrub(destutter(unbrace(
      (Array.isArray(v) ? v.join(" ") : String(v == null ? "" : v)).trim())), allNames);
    const choices = beat === "final" ? []
      : (j && Array.isArray(j.choices) ? j.choices.map(clean).filter(Boolean).slice(0, 2)
                                       : readChoices(text));

    return res.status(200).json({
      text: story || text.trim(),
      choices,
      // The cover title, asked for on the opening beat only. Stripped of any
      // quotes or trailing full stop the writer wrapped it in, and dropped
      // entirely if it came back empty rather than shown as a blank heading.
      title: beat === "open"
        ? clean(j && j.title).replace(/^["“”'']+|["“”'']+$/g, "").replace(/[.]+$/, "").slice(0, 60)
        : undefined,
      // Who went out in this beat, matched back to the real roster so a
      // near-miss spelling still counts. The page adds these to its running
      // list and hands them back on the next beat.
      out: (Array.isArray(j && j.out) ? j.out : [])
        .map(n => allNames.find(a => a.toLowerCase() === String(n || "").trim().toLowerCase()))
        .filter(Boolean)
        .filter(n => !alreadyOut.some(o => o.toLowerCase() === n.toLowerCase())),
      // The recap is the only thing carried into the next beat, so if the writer
      // forgets it, fall back to the tail of what it just wrote.
      recap:  clean(j && j.recap) || story.split(/\s+/).slice(-30).join(" "),
      // The possessive is the house style everywhere else, so the writer tends
      // to hand back "Owner's" here too. Snap it to the name we were given.
      winner: (() => {
        const raw = clean(j && j.winner);
        const names = (r && Array.isArray(r.names)) ? r.names.map(String) : [];
        const hit = names.find(n => raw.toLowerCase().replace(/['\u2019]s$/, "") === n.toLowerCase())
                 || names.find(n => raw.toLowerCase().startsWith(n.toLowerCase()));
        return hit || (r && r.winner) || raw.replace(/['\u2019]s$/, "");
      })(),
      // "Hong Kong Phooey's Nightwing" is a real answer a tired model gave. If a
      // drafted character is named anywhere in there, lead with them instead.
      mvp: (() => {
        const raw2 = clean(j && j.mvp);
        // Look in the name half first. Searching the whole line would happily
        // pick the character being hit rather than the one doing the hitting,
        // which is how an MVP ended up disrupting their own defences.
        const head = raw2.includes(":") ? raw2.slice(0, raw2.indexOf(":")) : raw2;
        const hit = allNames.find(n => head.toLowerCase().includes(n.toLowerCase()))
                 || allNames.find(n => raw2.toLowerCase().includes(n.toLowerCase()));
        if (!hit) return raw2;
        if (raw2.toLowerCase().startsWith(hit.toLowerCase())) return raw2;
        const tail = raw2.includes(":") ? raw2.slice(raw2.indexOf(":") + 1).trim() : raw2;
        return hit + ": " + tail;
      })(),
      read:   clean(j && j.read),
      model: used,
      // Set debug:true in the request to see exactly what the writer sent back.
      // Nothing in the page asks for it, so this costs a live game nothing.
      raw: body && body.debug ? raw.slice(0, 1200) : undefined,
      checks: body && body.debug ? { faults: seen, left: faults(raw) } : undefined
    });
  } catch (e){
    return res.status(502).json({ error: "Could not reach the writer: " + (e && e.message) });
  }
}
