// One time authoring pass. Asks a model for voice lines for every character
// and writes them into characters.lines, so the game never calls a model again.
//
//   node build_lines.mjs            # all characters missing lines
//   node build_lines.mjs --limit 20 # a first batch, to read before committing
//   node build_lines.mjs --force    # redo characters that already have lines
//
// Why this exists: paying tokens once at authoring time instead of on every
// fight is the whole point of the template path. It also means you can use a
// good, expensive model here, which gives better voices than the weak free
// tier model the live game was falling back to.
//
// READ THE OUTPUT BEFORE TRUSTING IT. A model will happily invent a catchphrase
// or get a civilian name wrong, and unlike the live path there is no validator
// behind this. That is the trade: wrong once, wrong forever, so check it once.

import { createClient } from "@supabase/supabase-js";

const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;   // service role: this writes
const LLM  = process.env.GROQ_API_KEY;
const ENDPOINT = process.env.LLM_ENDPOINT || "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = process.env.LLM_MODEL    || "llama-3.3-70b-versatile";

if (!URL || !KEY || !LLM){
  console.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and GROQ_API_KEY first.");
  process.exit(1);
}
const db = createClient(URL, KEY);
const args  = process.argv.slice(2);
const limit = Number((args.find(a => a.startsWith("--limit")) || "").split("=")[1] || 0)
           || (args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 0);
const force = args.includes("--force");

const SYSTEM = `You write dialogue for a superhero card game. For one character you
return short spoken lines in that character's own voice.

You already know this character. Write only what THIS one would actually say,
using their real personality, methods, and history. Generic fight-movie talk
that could belong to anyone is a failure, not a safe default.

REJECT lines like these on sight. They are the exact wrong output, seen too
many times already, and fit no one in particular:
  "You're going down." / "I'll hold back." / "No way." / "I am eternal."
  "Not... possible." / "This ends now." / "You cannot stop me." /
  "Your darkness will fail." / "Hope endures still."
Aim instead for lines this specific, where the voice alone gives the
character away with no name attached:
  "Doom permits you one more breath."
  "Ooh, is this the part where you monologue?"
  "I did the math. You lose in four moves."

Rules:
- The blurb you are given is the whole point, not flavour text. If it says
  they refuse to fight anyone weaker, or knew something for years and said
  nothing, that fact should visibly shape at least one line, not sit unused
  while you write something generic instead.
- Under twelve words each. Spoken out loud, mid fight.
- No names of other characters: these lines are reused against any opponent.
- No long dashes. Plain apostrophes. No quotation marks around the lines.
- Nothing that only makes sense in one specific fight.
- Before returning a line, ask: could any other character in any other
  franchise have said this exact sentence? If yes, it is wrong. Rewrite it
  until only this one could have said it.

Return JSON only:
{"taunt":[3 lines, opening on an enemy],
 "reply":[3 lines, answering an enemy who spoke first],
 "teammate":[2 lines, to someone on their own side, mid fight],
 "overDown":[2 lines, standing over an enemy they just beat],
 "falling":[2 lines, as they are beaten and going down],
 "lastStand":[2 lines, last one standing, certain to lose, refusing anyway],
 "lastStandReply":[2 lines, answering an enemy making a last stand]}`;

async function linesFor(c){
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + LLM },
    body: JSON.stringify({
      model: MODEL, temperature: 0.9, max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content:
          `Character: ${c.name}${c.real_name ? " (" + c.real_name + ")" : ""}. ` +
          `From: ${c.universe}. Tier ${c.tier}. ` +
          `What actually makes them who they are, build every line around this: ` +
          `${c.blurb || "(no notes for this one, rely on what you already know of them)"}` }
      ]
    })
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content || "";
  const obj = JSON.parse(txt);
  // Shape check. A missing key would silently fall back to the generic pool
  // forever, which is exactly the sort of thing you notice six months later.
  for (const k of ["taunt","reply","teammate","overDown","falling","lastStand","lastStandReply"])
    if (!Array.isArray(obj[k]) || !obj[k].length) throw new Error("missing " + k);
  return obj;
}

// A cheap, dumb net under the prompt: exact phrases that showed up as
// generic fallback fluff in practice. Catching these by keyword costs
// nothing and does not need the model to cooperate, unlike the prompt
// instructions above, which it can and sometimes will ignore. This is not
// a substitute for reading the output, just a way to make the worst lines
// impossible to miss while skimming two hundred characters' worth of it.
const GENERIC = [
  "you're going down", "you are going down", "i'll hold back", "i will hold back",
  "no way", "i am eternal", "this ends now", "you cannot stop me",
  "you can't stop me", "not possible", "not... possible", "it cannot be",
  "it can't be", "give up", "you'll pay for this", "you will pay for this",
  "prepare yourself", "is that all you've got", "is that all you have got",
  "hope endures", "darkness will fail", "you're no match", "you are no match",
  "i am the storm"
];
function flagGeneric(line){
  const low = line.toLowerCase().replace(/[.,!?]/g, "");
  return GENERIC.some(g => low.includes(g)) ? "  ⚠ generic?" : "";
}

const main = async () => {
  let q = db.from("characters").select("name,real_name,universe,tier,blurb,lines").order("name");
  if (!force) q = q.is("lines", null);
  const { data, error } = await q;
  if (error){ console.error(error.message); process.exit(1); }
  const todo = limit ? data.slice(0, limit) : data;
  console.log(`${todo.length} characters to do.\n`);

  let done = 0, failed = [], flagged = [];
  for (const c of todo){
    try {
      const lines = await linesFor(c);
      const { error: e2 } = await db.from("characters").update({ lines }).eq("name", c.name);
      if (e2) throw new Error(e2.message);
      done++;
      const tauntFlag = flagGeneric(lines.taunt[0]), fallFlag = flagGeneric(lines.falling[0]);
      if (tauntFlag || fallFlag) flagged.push(c.name);
      console.log(`${c.name}\n   taunt: ${lines.taunt[0]}${tauntFlag}\n   fall:  ${lines.falling[0]}${fallFlag}\n`);
    } catch (err){
      failed.push(`${c.name}: ${err.message}`);
      console.log(`${c.name}  FAILED, ${err.message}`);
    }
    // Free tiers meter per minute as well as per day. This costs a few minutes
    // once and nothing ever again.
    await new Promise(ok => setTimeout(ok, 1500));
  }
  console.log(`\nWrote lines for ${done} characters.`);
  if (failed.length){
    console.log(`${failed.length} failed, rerun to pick them up:`);
    failed.forEach(f => console.log("  " + f));
  }
  if (flagged.length){
    console.log(`\n${flagged.length} flagged as possibly generic, worth a manual look:`);
    flagged.forEach(f => console.log("  " + f));
    console.log(`To redo just these, run with --force and check them by name in the`);
    console.log(`printed output above, or open the characters table and clear .lines`);
    console.log(`for these specific rows before rerunning without --force.`);
  }
};

main();
