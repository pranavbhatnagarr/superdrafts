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
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM = `You are a veteran comics writer scripting a crossover one-shot.

You will be given two teams of five characters drafted in an auction, with the
dollar price each was bought for, and an encounter type.

Rules you must respect:
- BASE VERSIONS ONLY. No Infinity Gauntlet, no Phoenix Force, no cosmic
  upgrades, no future or alternate-universe variants. Thanos has no gauntlet.
  Characters have only the powers they normally carry.
- Do not invent powers a character does not have. Do not add characters.
- The prices are real information: a character bought for $1 was thought
  worthless, one bought for $9 was fought over. Use that as texture.
- Pick a decisive winner. No draws, no "both sides learned something".
- CALL EACH SIDE BY ITS OWNER'S NAME, exactly as it is given to you. If the
  sides are owned by Pranav and Marcus, write "Pranav's team", "Pranav's five"
  or simply "Pranav". NEVER write "Team One", "Team Two", "the first team" or
  "the second team". The two people reading this are the two owners, and they
  want to read their own names.
- PUNCTUATION: never use long dashes of any kind (em dash or en dash) anywhere
  in your answer. Use commas, full stops, colons or semicolons in their place.
  Ordinary short hyphens inside words such as "back-issue" are fine.

Write it as an actual comic story, not an analysis. Concrete beats, real
dialogue, specific locations. Give characters their own voices.

Structure your answer in markdown exactly like this:

## <a title for the issue>
**<one line naming the setting and the moment>**

<4 to 7 paragraphs of story. Comic Style. This is the bulk. Show the fight
unfolding: who would fight who, who would fall first. Name characters constantly.>

## The turn
<one short paragraph on the single moment the fight was decided>

## Winner: <the owner's name, exactly as given to you>
<two or three sentences on why that side took it. Name the character who made the difference.>

## The draft read
<two or three sentences on which characters actually earned their price and
which were traps, referring to the dollar amounts and to each side by its owner's name>`;

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

function roster(team){
  if (!team || !Array.isArray(team.picks)) return null;
  const picks = team.picks.slice(0, 5).map(p =>
    `- ${String(p.name).slice(0, 40)} (${p.pub === "D" ? "DC" : "Marvel"}), bought for $${Number(p.price) | 0}`
  );
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
  const a = roster(body && body.a), b = roster(body && body.b);
  const mode = MODES[body && body.mode] ? body.mode : "random";
  if (!a || !b) return res.status(400).json({ error: "Two full rosters are required." });

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.9,
        max_tokens: 2200,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content:
`${MODES[mode]}

These are the two sides. Refer to them by these owner names throughout, never as
"Team One" or "Team Two".

${a}

${b}

Write the issue.` }
        ]
      })
    });

    const data = await r.json().catch(() => null);
    if (!r.ok){
      const msg = (data && data.error && data.error.message) || `Upstream returned ${r.status}.`;
      return res.status(502).json({ error: msg });
    }
    const raw = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : "";
    if (!raw) return res.status(502).json({ error: "The writer came back empty. Try again." });

    // Asking a model not to use em dashes is a suggestion; this makes it a fact.
    const text = raw
      .replace(/^[ \t]*[—–][ \t]*/gm, "")     // a dash opening a line is a bullet
      .replace(/[ \t]*[—–][ \t]*/g, ", ");    // anything else becomes a comma

    return res.status(200).json({ text, model: MODEL });
  } catch (e){
    return res.status(502).json({ error: "Could not reach the writer: " + (e && e.message) });
  }
}
