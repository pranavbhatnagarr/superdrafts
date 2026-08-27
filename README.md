# Super Drafts

A comic-shop back-issue auction for two or three players, on any devices, anywhere
in the world. Draft a roster out of a shared box, then watch it fight.

The browser side lives in `site/`, deployed as-is with no build step. Everything
that actually decides the outcome of a game — the auction, the deck, the fight
itself — is resolved server-side, in Supabase Postgres and a set of Edge
Functions in `supabase/functions/`. The browser is a client of that backend,
not the source of truth for it: no player's own tab can fabricate a bid, deal
itself a favorable card, grind a fight seed, or read an opponent's hidden pick.
The `api/` folder holds a serverless LLM writer that exists but isn't currently
wired up — narration for a resolved fight is generated locally by `fight.js`,
from data the backend has already decided.

```
superdrafts/
├── site/                    ← this whole folder is what gets deployed to Vercel
│   ├── index.html           the shell: screens, structure, one <script> tag
│   ├── game.js              the whole app - auction UI, role UI, fight UI, sound
│   ├── backend.js           thin client for the real backend - one function per action
│   ├── fight.js             narration only now - turns an already-resolved round into prose
│   ├── styles.css           everything visual
│   └── api/
│       └── scenario.mjs     server-side LLM fight writer - present, not called by game.js
├── supabase/
│   ├── functions/           the actual game logic - see "The backend" below
│   │   ├── _shared/
│   │   │   └── fight-engine.ts   the fight's decision logic, shared by start-match/submit-pick
│   │   ├── create-table/    seats the host, once, when a table opens
│   │   ├── join-table/      seats a guest - reconnect-by-cid, or by name if the table's full
│   │   ├── start-table/     shuffles and deals the deck server-side, deals lot 1
│   │   ├── place-bid/       every bid and pass, with every anti-cheat check below
│   │   ├── lock-roles/      validates and locks one seat's five role assignments
│   │   ├── start-match/     commits a real random seed before a fight begins
│   │   ├── submit-pick/     holds both sides' picks until both are in, then resolves the round
│   │   └── restart-table/   "Run it again" - one atomic transaction, fresh deck, same seats
│   └── migrations/          schema + the Postgres functions the Edge Functions call into
├── build_lines.mjs          regenerates characters' taunt/reply/falling dialogue
├── dev-server.mjs           local static server, for looking at it yourself
├── package.json             deps for the two scripts above only - not for site/
├── package-lock.json
└── README.md
```

Nothing in `site/` depends on `package.json` — it's static files (plus the
currently-dormant `api/`) that talk to the real Supabase backend over HTTP and
Realtime. `package.json` and its two `.mjs` scripts exist purely so *you* can
regenerate dialogue or preview the game locally; they never run in production,
and neither one touches the backend.


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
   **Start the Fight**. That commits a real, unpredictable seed on the
   server before either player sees it. The two (or three) rosters fight it
   out five rounds, one character sent blind per round — held server-side
   until both sides are in, so nobody, host included, can see the other
   side's pick before submitting their own — and the match is decided.

Keep a call open while you play. The app relays bids and fight results, not
voices.

Since real game state lives in the backend rather than in any browser tab,
closing or reloading the page mid-game isn't fatal: the homepage offers a
**"Reopen table"** button whenever your browser remembers a table it was
part of, reconnecting straight back into whatever state the table's
actually in — host or guest.

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
doesn't costs them one. Locked in once confirmed — locking is validated and
persisted server-side (`lock-roles`), not just trusted from the browser: the
server checks the five roles are real, distinct, and actually line up with
that seat's roster before accepting them, and a fight can't start at all
until every seat has genuinely locked.

## The fight

Base versions only, no cosmic gods. Five blind rounds: each side sends one
character, nobody sees who the other side sent until both picks are locked
in, and every character fights exactly once. Whoever holds the strictly
better tier wins the round outright — there's no dice roll once tiers are
set, so the draft, the roles, and the prep choice are the whole game.
Landing on the exact same tier is a draw: nobody scores, and neither of
those two cards can be sent again.

**Who actually decides this:** the deciding logic (`fight-engine.ts`) is
shared between the browser and the backend — the same pure function, so a
finished round always looks the same on both. But the two things that
genuinely couldn't be left to either client run server-side only: the
match's random seed is generated and committed by `start-match` before
either player ever sees it (nothing to grind against locally once you don't
choose the number), and each round's two picks sit in a database row with
no read access for either client — `submit-pick` only combines them once
both are actually in. `fight.js` in the browser still turns an already-
resolved round into the prose you read; it never decides anything itself.

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

A table can run **both** encounter types — random and prep — against the
same drafted rosters, one after the other, without redrafting.

## The backend

Every action that affects the outcome of a game — bidding, dealing the deck,
locking roles, resolving a fight round — runs as a real Supabase Edge
Function writing to real Postgres tables (`tables`, `seats`, `lots`,
`matches`, `picks`), not in any player's own browser. The browser is a
client of that backend: it reflects state and sends requests, but the
requests are re-validated server-side regardless of what the client claims.

**What that closes, specifically:**
- A bid, a pass, or who wins a lot can't be fabricated client-side — every
  write is re-validated against the real table state, and a claim that
  arrives late (network lag past the point a lot already resolved) is
  rejected outright rather than silently landing on the wrong card.
- The deck is shuffled and dealt entirely server-side, using the
  service-role key — no client, host included, ever sees or influences the
  order before a card is drawn.
- A fight's random seed is committed server-side, with real cryptographic
  randomness, before either client ever sees it — nothing to grind
  against locally.
- Both sides' picks for a fight round sit in a table with no read access
  for either client; the round only resolves once both are in, so neither
  player (including the host) can see the other's pick first.
- Role assignments are validated and persisted server-side before a fight
  can start — not just trusted from whichever client broadcasts them.
- A handful of Postgres functions (`award_seat`, `lock_role`,
  `decrement_purse`, `restart_table`) exist specifically to make
  multi-step writes atomic under concurrency — two things racing to update
  the same row can't silently overwrite each other's result.

**Realtime and presence** still work the way the old broadcast-only design
did: Supabase Realtime carries live state to every connected client, and a
lightweight broadcast channel handles the pre-game knock/admit lobby flow
and role-assignment UI sync — neither of those is money- or
outcome-sensitive, so there was no reason to move them off it. The
publishable key embedded in the page is meant to be public; real writes only
ever happen through the Edge Functions, using a service-role key that never
ships to any client.

A background `pg_cron` job also runs daily to delete tables (and everything
attached to them) older than a day, so testing and abandoned games don't
accumulate in the database indefinitely.

Room codes are four characters. In principle a stranger could guess a live
code and try to knock — the host still has to see the name and manually let
them in, same as any other knock, so this doesn't grant a seat by itself.

### Deploying backend changes

Schema and function changes don't ship through Vercel — they need to be
applied to the Supabase project directly:

```
supabase functions deploy <function-name>
```

for any changed Edge Function, and running the relevant file in
`supabase/migrations/` through the Supabase SQL editor (or `supabase db push`
if you're using migrations the CLI-managed way) for any schema change.
Neither of these happens automatically on a `git push` — only the `site/`
frontend redeploys that way, via Vercel.

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

## What isn't built yet

- **Matchmaking.** Every table today is a direct invite (code or link) — no
  "find an opponent" queue exists.
- **A performance pass.** The backend is correct and safe under concurrency,
  but not specifically optimized — round trips, polling frequency, and
  caching are all left at whatever fell out of getting the migration
  correct first.
- **The LLM fight writer** in `site/api/scenario.mjs` is deployed but not
  called from anywhere; the fight you see is always the deterministic
  five-round resolution, narrated locally.

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
