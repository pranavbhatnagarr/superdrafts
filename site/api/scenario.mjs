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
- THESE CHARACTERS COME FROM DIFFERENT FICTIONAL WORLDS. Adjudicate honestly:
  use each character's typical showings, not their single best feat, and never a
  composite or peak "end of series" version. A tier letter is given for each
  (S is world-threatening, E is a capable human); treat two characters within a
  tier of each other as a real contest that tactics can swing, and a gap of three
  or more tiers as decided unless the weaker side has a specific, named reason.
  Never rebalance a world upward because it is someone's favourite.
- Abilities that simply erase an opponent (instant kills, mind control, absolute
  barriers) only land on a target who is unaware or unprepared. In an open fight
  the opposition knows they are in a fight, so these must be worked around, not
  used as an off switch.
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

// The tier maths is settled before the writer sees anything. Its job is to make
// the result convincing, not to decide it, otherwise the tiers mean nothing.
function ruling(r, body){
  if (!r || typeof r.a !== "number") return "";
  const na = String((body.a && body.a.name) || "one side").slice(0, 20);
  const nb = String((body.b && body.b.name) || "the other").slice(0, 20);
  const head = `TIER SCORE (already calculated, not your decision): ${na} ${r.a}, ${nb} ${r.b}.`;
  if (r.close) return head + `
These two are close enough that the tiers do not settle it. YOU decide the winner
on tactics, matchups, terrain and nerve, and say plainly that it was close.`;
  return head + `
THE WINNER IS ${String(r.winner).slice(0, 20)}. This is decided and you may not
change it. Do not hedge it, do not make it a draw, do not have the other side
win on a technicality. Your job is to make this outcome feel earned: show the
stronger characters mattering, and give the losing side real moments before it
turns. If a lower tier character does something decisive, it must be in service
of the result above, never against it.`;
}

function roster(team){
  if (!team || !Array.isArray(team.picks)) return null;
  const picks = team.picks.slice(0, 5).map(p => {
    const world = String(p.world || p.pub || "").slice(0, 24);
    const tier = /^[SABCDE]$/.test(String(p.tier)) ? `, tier ${p.tier}` : "";
    return `- ${String(p.name).slice(0, 40)} (${world}${tier}), bought for $${Number(p.price) | 0}`;
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
  const r = body && body.ruling;
  const mode = MODES[body && body.mode] ? body.mode : "random";
  if (!a || !b) return res.status(400).json({ error: "Two full rosters are required." });

  const messages = [
    { role: "system", content: SYSTEM + FINISH_RULE },
    { role: "user", content:
`${ruling(r, body)}

${MODES[mode]}

These are the two sides. Refer to them by these owner names throughout, never as
"Team One" or "Team Two".

${a}

${b}

Write the issue.` }
  ];

  try {
    let raw = "", used = "", lastErr = "", lastStatus = 0;

    // Each model has its own daily token allowance, so a model that has run dry
    // is not the end of the night. Walk down the list until one answers.
    const ask = async (model, msgs) => {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model, temperature: 0.9, max_tokens: MAX_TOKENS, messages: msgs })
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
          { role: "system", content: SYSTEM + FINISH_RULE +
            "\n\nYour previous attempt was cut off. Use at most FOUR short story " +
            "paragraphs this time and make certain you reach the end." },
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

    // Asking a model not to use em dashes is a suggestion; this makes it a fact.
    const text = raw
      .replace(/^[ \t]*[—–][ \t]*/gm, "")     // a dash opening a line is a bullet
      .replace(/[ \t]*[—–][ \t]*/g, ", ");    // anything else becomes a comma

    return res.status(200).json({ text, model: used });
  } catch (e){
    return res.status(502).json({ error: "Could not reach the writer: " + (e && e.message) });
  }
}
