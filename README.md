# Super Drafts

A comic-shop back-issue auction for two or three players, on any devices, anywhere
in the world. Draft a roster out of a shared box, then watch it fight.

Everything the browser needs lives in `site/`, deployed as-is with no build
step. The `api/` folder holds a serverless LLM writer that exists but isn't
currently wired up — the fight you'll actually see is resolved entirely
client-side by `fight.js`. Everything outside `site/` is local tooling: a dev
server and a script that regenerates character dialogue, neither of which
ships to players.

```
superdrafts/
├── site/                    ← this whole folder is what gets deployed
│   ├── index.html           the shell: screens, structure, one <script> tag
│   ├── game.js              the whole app - auction, sync, roles, scoreboard, sound
│   ├── fight.js             the fight engine - five blind rounds, resolved locally
│   ├── styles.css           everything visual
│   └── api/
│       └── scenario.mjs     server-side LLM fight writer - present, not called by game.js
├── build_lines.mjs          regenerates characters' taunt/reply/falling dialogue
├── dev-server.mjs           local static server, for looking at it yourself
├── package.json             deps for the two scripts above only - not for site/
├── package-lock.json
└── README.md
```

Nothing in `site/` depends on `package.json` — it's four static files (plus
the currently-dormant `api/`), openable straight in a browser. `package.json`
and its two `.mjs` scripts exist purely so *you* can regenerate dialogue or
preview the game locally; they never run in production.

## How a table works

1. **Open the box.** One player sets what's in the box (which universes,
   whether tiers are shown) and how many buyers — two or three — then hits
   **Open the Box**. That deals a table code and a shareable link.
2. **The others sit down.** They open the link (or type the code), pick a
   name, and knock. The host lets them in.
3. **The auction runs.** Twenty lots for two buyers, thirty for three — five
   characters per buyer either way. Characters come out of the box one at a
   time, in a random order shared by everyone at the table, and go to open
   outcry: bid against each other in dollars, hit **Pass** when you're done.
   The standing bid takes the lot. Both pass before anyone opens it, and that
   character is gone for good — that's how the other half of the box leaves
   unsold.
4. **Give everyone a job.** Once a roster is full, assign each of your five
   characters one role (see below) — a good fit is worth a tier, a bad one
   costs a tier.
5. **Pick how they meet** — a random encounter or a week of prep — and hit
   **Start the Fight**. The two (or three) rosters fight it out five rounds,
   one character sent blind per round, and the match is decided.

Keep a call open while you play. The app relays bids and fight results, not
voices.

## The auction rules

- $20 purse each, five characters each, $1 minimum bid.
- **Twenty lots, ten sold** (two buyers) or **thirty lots, fifteen sold**
  (three buyers). Whatever doesn't sell passes in and is gone for the rest
  of that draft.
- **Open outcry.** Bid against each other; **Pass** locks in the standing bid
  for whoever hasn't folded.
- **Passing runs out on its own.** Once the lots still to come equal the buys
  everyone still owes, passing stops — from that point on, whatever comes up
  gets bought by somebody.
- You can never bid so deep you can't cover $1 for every empty slot still
  left in your own roster, so every buyer always reaches five.
- **Once your roster is full, every pass still costs you $1** — a fat purse
  buys patience, not a free pass.

## Roles

Once a roster is set, each of the five characters gets exactly one role, and
all five roles get used:

| Role | What it means |
|---|---|
| **Strategist** | Reads the fight before it starts. Comes alive with a week of prep. |
| **Wildcard** | Magic, cosmic, rules that don't apply. Deadliest when nobody saw it coming. |
| **Powerhouse** | Hits hardest, takes the most. |
| **Anchor** | Keeps the other four standing. |
| **Executioner** | Ends people — villains, and heroes willing to kill. |

A role that suits the character bumps them up a tier; a role that clearly
doesn't costs them one. Locked in once confirmed.

## The fight

Base versions only, no cosmic gods. Five blind rounds: each side sends one
character, nobody sees who the other side sent until both picks are locked
in, and every character fights exactly once. Whoever holds the strictly
better tier wins the round outright — there's no dice roll once tiers are
set, so the draft, the roles, and the prep choice are the whole game.
Landing on the exact same tier is a draw: nobody scores, and neither of
those two cards can be sent again.

Tiers run **S, A, B, C, D, E**, worth **16, 8, 4, 2, 1, 0.5** points. A week
of prep re-tiers everyone before the fight starts — a Strategist with a week
to plan is a different fighter than one caught flat-footed.

If the five rounds end tied, it goes to **sudden death**: same two rosters,
replayed with anything that hasn't already drawn, until someone wins a round
outright. A matchup that stays genuinely dead-even keeps going for a while,
but it is guaranteed to end — after enough sudden-death rounds with no
result, the match forces a finish rather than drawing forever.

There's also a **tier score** shown alongside the fight — a straight sum of
both rosters' tier points (roles counted) as a sanity check on the result.
Inside a 20% gap it's called close, and the actual five-round fight is what
decides it either way.

## Multiplayer

Sync runs over Supabase Realtime — broadcast for state and picks, presence
for knowing who's still connected. No database tables, nothing persisted;
messages exist for as long as the browser tabs are open and nothing else.
The key embedded in the page is a **publishable** key, which is meant to be
public — it grants nothing beyond joining a broadcast channel.

The same Supabase project also serves the character roster and artwork
(read-only) at boot, so there's one project doing both jobs rather than two.

Room codes are four characters. In principle a stranger could guess a live
code and take an open seat — fine for a game between friends, just so you
know.

## Deploying it

The project is connected to Vercel through GitHub, so shipping a change is:

```
git add -A
git commit -m "whatever changed"
git push
```

Vercel picks up the push and redeploys automatically — nothing to run
locally. If you're setting this up fresh from the GitHub repo:

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and
   import this repo.
2. **Set Root Directory to `site`.** This is the one setting that matters —
   the deployable files live in `site/`, not the repo root, so Vercel needs
   to be told to look there or every page 404s. **Settings → General → Root
   Directory → `site`**, if you're changing it after the fact.
3. Leave the build settings alone otherwise — no framework, no build step,
   just static files.
4. No environment variables are needed to play the game. `site/api/` holds
   an LLM fight writer that game.js never calls; you only need to touch that
   if you decide to wire it up later.
5. Deploy. Vercel gives you a permanent URL immediately, and every future
   push to the main branch redeploys it automatically.

## Playing

1. Open your Vercel URL — not a local file — since the invite link is built
   from whatever address you're on.
2. Type your name, hit **Open the Box**.
3. Copy the link from the lobby screen and send it to your friend(s).
4. They open it, type a name, hit **Join**. The sale starts once everyone's
   seated.

## Local tooling

Two small scripts live at the repo root, outside `site/`, for you to use —
neither one ships to players:

```
npm install
node dev-server.mjs      # serves site/ locally so you can look at it yourself
node build_lines.mjs     # regenerates characters' taunt/reply/falling dialogue
```

A friend on another machine can't reach `dev-server.mjs`'s address — it's
only for previewing your own changes before you push.
