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
- THE OWNERS ARE NOT IN THE FIGHT. Each side is labelled with the name of the
  person who drafted it. Those people are readers. They are not characters,
  they have no powers, they are not present, they never appear in a scene, they
  never speak, they are never hit and they never act. Use an owner name ONLY as
  a possessive label for the side: "Pranav's team", "Pranav's five", "Pranav's
  Anchor". NEVER write "Pranav charges", "Pranav orders", "send Pranav in", or
  give an owner a pronoun. Every action in the story is taken by one of the ten
  drafted characters, by name. NEVER write "Team One", "Team Two", "the first
  team" or "the second team" either.
- THE TEN DRAFTED CHARACTERS ARE THE ONLY CHARACTERS THAT EXIST. Do not add
  allies, soldiers, bystanders or reinforcements with names.
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

Never write a title, a heading, or a section label. You are writing the
middle of an issue, not a whole one.`;

const SYSTEM_SHORT = `You are the same comics writer, continuing the same issue.

Base versions only, no upgrades, no invented powers, no new characters. The ten
drafted characters are the only characters that exist.

THE OWNERS ARE NOT IN THE FIGHT. An owner name labels a side and nothing else.
Write "Pranav's five" or "Pranav's Anchor", never "Pranav charges", never "send
Pranav in", and never give an owner a pronoun. Every action belongs to a named
character.

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

// The tier maths is settled before the writer sees anything. Its job is to make
// the result convincing, not to decide it, otherwise the tiers mean nothing.
function ruling(r, body){
  if (!r || !Array.isArray(r.scores)) return "";
  const line = r.scores
    .map((v, i) => `${String((r.names && r.names[i]) || "side " + (i + 1)).slice(0, 20)} ${v}`)
    .join(", ");
  const head = `TIER SCORE (already calculated, not your decision): ${line}.`;
  if (r.close) return head + `
The top two are close enough that the tiers do not settle it. YOU decide the winner
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
const BEAT_RULES = n => `
Write EXACTLY ${n} short paragraph${n > 1 ? "s" : ""} of story, then offer the
named player two things their team could do next. Both must be plausible and
pull in different directions: one leaning on force or speed, the other on
planning, trickery or restraint. Never hint which is better.

Each choice MUST name at least one of that player's five characters and say what
that character does. "Have Batman flood the tunnel with gas" is a choice.
"Unleash a fierce counterattack" is not, and neither is anything that puts the
owner in the fight.

Do not write a title. Do not resolve the fight. Do not name a winner.

Answer with JSON and nothing else, in exactly this shape:
{"story": [${n} string${n > 1 ? "s, one paragraph each" : ", one paragraph"}],
 "choices": ["six to twelve words", "six to twelve words"],
 "recap": "one sentence, at most 25 words, on where the fight now stands"}`;

const FINAL_RULES = n => `
Write EXACTLY ${n} short paragraph${n > 1 ? "s" : ""} resolving the fight, then
the verdict. Honour the tier ruling exactly. No title, no headings.

Answer with JSON and nothing else, in exactly this shape:
{"story": [${n} string${n > 1 ? "s, one paragraph each" : ", one paragraph"}],
 "winner": "the owner name, exactly as given",
 "mvp": "character name, then a colon, then one sentence on what they did. May be from any team, including a losing one",
 "read": "two or three sentences on which roles and which purchases earned their keep. Name every character in the form Biggest's Strategist Mister Fantastic ($6). Never write an owner name on its own as if they played."}`;

// Models drop the markers now and then and answer in prose with "A)" and "B)"
// lines. Read both shapes, and prefer the marked one when it is there.
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
    const tier = /^[SABCDE]$/.test(String(p.tier)) ? `, tier ${p.tier}` : "";
    const role = p.role ? `, ${String(p.role).slice(0, 14)}` : "";
    return `- ${String(p.name).slice(0, 40)} (${world}${tier}${role}), $${Number(p.price) | 0}`;
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

  // The rosters again, as plain names, so the answer can be checked against
  // them. A weak model will happily hand a player their opponent's characters.
  const sides = (body && Array.isArray(body.teams) ? body.teams : []).map(t => ({
    owner: String((t && t.name) || ""),
    names: (((t && t.picks) || [])).map(p => String((p && p.name) || "")).filter(Boolean)
  }));
  const mine = (sides.find(x => x.owner === forWho) || { names: [] }).names;
  const allNames = sides.flatMap(x => x.names);

  const messages = beat === "open" ? [
    { role: "system", content: SYSTEM + BEAT_RULES(paras) },
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
    { role: "system", content: SYSTEM_SHORT + BEAT_RULES(paras) },
    { role: "user", content:
`The five on each side, which are the only characters in this story:

${teams.join("\n\n")}

WHERE THE FIGHT STANDS: ${recap}
WHAT JUST HAPPENED: ${picked}

Continue. The choice at the end belongs to ${forWho}, so both options must be
actions taken by characters from ${forWho}'s five.` }
  ] : [
    { role: "system", content: SYSTEM_SHORT + FINAL_RULES(paras) },
    { role: "user", content:
`${ruling(r, body)}

${MODES[mode]}

The five on each side, which are the only characters that exist in this story.
Use these names. Do not invent units, ranks or archetypes.

${teams.join("\n\n")}

WHERE THE FIGHT STANDS: ${recap || "The two sides have just met and nothing is settled."}
${picked ? "WHAT JUST HAPPENED: " + picked : ""}

End it.` }
  ];

  try {
    let raw = "", used = "", lastErr = "", lastStatus = 0;

    // Each model has its own daily token allowance, so a model that has run dry
    // is not the end of the night. Walk down the list until one answers.
    // A beat is two paragraphs and two choices. Only the ending needs the
    // full allowance, so most calls in a game now cost a quarter of what one
    // single shot issue used to.
    const cap = beat === "final" ? 1100 : 600;
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
    const faults = t => {
      let p = null;
      try { p = JSON.parse(t); } catch (e){ return "the answer was not valid JSON"; }
      const st = Array.isArray(p.story) ? p.story : [String(p.story || "")];
      const joined = st.join(" ").trim();
      if (joined.length < 120) return "the story was too short to be finished";
      if (st.some(x => String(x).trim().length < 40)) return "a paragraph was cut off";
      if (beat !== "final"){
        const ch = Array.isArray(p.choices) ? p.choices : [];
        if (ch.length < 2) return "there were not two choices";
        if (mine.length && !ch.every(c => mine.some(n => String(c).includes(n))))
          return "the choices used characters from the wrong side";
      }
      return "";
    };

    const wrong = faults(raw);
    if (wrong){
      const again = await ask(used, [
        messages[0],
        messages[1],
        { role: "user", content:
          `Your last answer failed because ${wrong}. Write it again. Return one ` +
          `JSON object, complete, with every paragraph written out in full.` +
          (beat === "final" ? "" : ` Both choices must be actions taken by ` +
           `${forWho}'s own characters: ${mine.join(", ")}.`) }
      ]);
      if (again.ok && again.text && !faults(again.text)) raw = again.text;
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

    const story = paraList
      .map(p => String(p || "").trim())
      .filter(p => p && !/^\s*(?:[AB]|[12])[).:]\s/i.test(p))
      .slice(0, paras)
      .join("\n\n");

    const clean = v => String(v == null ? "" : v).trim();
    const choices = beat === "final" ? []
      : (j && Array.isArray(j.choices) ? j.choices.map(clean).filter(Boolean).slice(0, 2)
                                       : readChoices(text));

    return res.status(200).json({
      text: story || text.trim(),
      choices,
      // The recap is the only thing carried into the next beat, so if the writer
      // forgets it, fall back to the tail of what it just wrote.
      recap:  clean(j && j.recap) || story.split(/\s+/).slice(-30).join(" "),
      // "Pranav's five" is the house style everywhere else, so the writer tends
      // to hand back "Pranav's" here too. Snap it to the name we were given.
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
        const hit = allNames.find(n => raw2.toLowerCase().includes(n.toLowerCase()));
        if (!hit) return raw2;
        if (raw2.toLowerCase().startsWith(hit.toLowerCase())) return raw2;
        const tail = raw2.includes(":") ? raw2.slice(raw2.indexOf(":") + 1).trim() : raw2;
        return hit + ": " + tail;
      })(),
      read:   clean(j && j.read),
      model: used,
      // Set debug:true in the request to see exactly what the writer sent back.
      // Nothing in the page asks for it, so this costs a live game nothing.
      raw: body && body.debug ? raw.slice(0, 1200) : undefined
    });
  } catch (e){
    return res.status(502).json({ error: "Could not reach the writer: " + (e && e.message) });
  }
}
