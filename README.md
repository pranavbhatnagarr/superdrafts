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
│   └── migrations/          schema, RPCs, timer removal, and relationship data
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
3. **The auction runs.** Fifteen lots for two buyers, twenty-five for three —
   each buyer drafts at least three and at most five characters. Characters
   come out of the box one at a
   time, in a random order shared by everyone at the table, and go to open
   outcry: bid against each other in dollars, hit **Pass** when you're done.
   There is no auction timer: the standing bid takes the lot only when every
   other eligible buyer passes. Everyone passes before anyone opens it, and that
   character is gone for good — that's how the other half of the box leaves
   unsold.
4. **Give everyone a job.** Assign every drafted character a different role
   (see below) — a good fit adds 10 power and a bad fit subtracts 10.
5. **Pick how they meet** — a random encounter or a week of prep — and hit
   **Start the Fight**. That commits a real, unpredictable seed on the
   server before either player sees it. The two (or three) rosters fight it
   out over three rounds, with one or two unused characters sent blind per
   round — held server-side
   until both sides are in, so nobody, host included, can see the other
   side's pick before submitting their own — and the match is decided.

Keep a call open while you play. The app relays bids and fight results, not
voices.

Since real game state lives in the backend rather than in any browser tab,
closing or reloading the page mid-game isn't fatal. The rejoin area remembers
the room as **"Last table joined was: CODE"**, so its code can be entered in
the room-code field above. Direct invite links and explicit reconnects restore
the real backend state for the host or guest.

## The auction rules

- $20 purse each, three-to-five characters each, $1 minimum bid.
- **Fifteen lots** (two buyers) or **twenty-five lots** (three buyers).
  Whatever doesn't sell passes in and is gone for the rest of that draft.
- **Open outcry.** Bid against each other; **Pass** locks in the standing bid
  only after every other eligible contender has folded. There is no countdown
  and no automatic `close-lot` action.
- **Passing runs out on its own.** Once the lots still to come equal the buys
  everyone still owes, passing stops — from that point on, whatever comes up
  gets bought by somebody.
- You can never bid so deep you can't cover $1 for every character still
  needed to reach the minimum roster size of three.
- The auction ends immediately when every roster is full or every player with
  roster space has less than the $1 minimum bid. It never deals an impossible
  lot with no eligible buyer.
- **Once any player's roster is full, each pass by a player who can still buy
  costs that player $1**, provided it does not prevent them reaching three.
- Sold/Passed feedback appears immediately and remains over the old card until
  the next card is presented, even while the client reconciles with the backend.
- Each request carries the lot number visible when the player acted. A delayed
  bid for an old lot is rejected instead of landing on the next card.

## Roles

Once a roster is set, every drafted character gets a different role. A full
five-character roster uses all five; a roster of three or four uses that many:

| Role | What it means |
|---|---|
| **Strategist** | Reads the fight before it starts. Comes alive with a week of prep. |
| **Wildcard** | Magic, cosmic, rules that don't apply. Deadliest when nobody saw it coming. |
| **Powerhouse** | Hits hardest, takes the most. |
| **Anchor** | Keeps the other four standing. |
| **Executioner** | Ends people — villains, and heroes willing to kill. |

A role that suits the character gives **+10 power**; a bad role gives **-10**.
Strategist has no separate team effect. In Prep Time, `prep_shift` is also
applied at ten power per level (`1` = +10, `2` = +20, and negative values are
penalties). Locked assignments are validated and persisted by `lock-roles`:
the server checks the roles are real, unique, and line up with that seat's
stored roster. A fight cannot start until every seat is genuinely locked.

## The fight

Base versions only, no cosmic gods. A match lasts exactly **three blind
rounds**. Each side sends one or two unused characters each round, and all
drafted characters must be used by the end. The valid team sizes therefore
depend on what remains: three characters means 1/1/1, four means 1/1/2 in
any order, and five means 1/2/2 in any order.

The current result formula is:

```text
adjusted character power = base Power_lvl
                         + role modifier
                         + Prep modifier
                         + relationship modifier

solo team score = adjusted character power
duo team score = sum of both adjusted powers / 1.58
```

The 1.58 duo divisor stops two average characters from automatically beating
an elite solo character. The highest team score wins the round and receives
one point. Exactly equal team scores draw and award no point; the older 1–5
probabilistic stalemate rule is not used by this three-round team resolver.
After round three, most points wins. A points tie is broken by total adjusted
roster power; an exact remaining tie is resolved reproducibly from the seed
committed by the backend.

When exactly two characters deploy together, `submit-pick` loads their pair
from `rivalries` in either name order. Recognized relationships affect **both**
characters: friends/allies/partners, teammates, family, and mentor pairs get
**+5 each**; rivals/enemies/nemeses get **-5 each**. Strategist adds no extra
synergy beyond its normal role-fit modifier.

Tiers remain visible in results but do not decide them. Power badges use the
following visual bands: **S+** for 100+ (square), **S** for 90–99, **A** for
80–89, **B** for 70–79, **C** for 60–69, **D** for 50–59, and plain styling
below 50. Selected deployment cards receive a shiny gold treatment, and **VS**
is rendered only between opposing teams—not between teammates.

**Who actually decides this:** `fight-engine.ts` performs the authoritative
calculation. `start-match` creates and commits a cryptographically random seed
before either player sees it, while `submit-pick` stores choices in database
rows neither client can read and resolves only after all sides submit. The
browser's `fight.js` mirrors the calculation for presentation and creates prose
from the resolved result; it is not trusted as the source of truth.

A table can run both encounter types—Random and Prep—against the same drafted
rosters without redrafting. The first is the canonical match for saved stats;
the other is a non-canon rematch.

## The backend

Every action that affects the outcome of a game — bidding, dealing the deck,
locking roles, resolving a fight round — runs as a real Supabase Edge
Function writing to real Postgres tables (`tables`, `seats`, `lots`,
`matches`, `picks`) and reading the `characters` and `rivalries` datasets,
not in any player's own browser. The browser is a
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
- Relationship bonuses and penalties are loaded by `submit-pick`, so a client
  cannot invent or hide a pairing modifier.
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

This cleanup job is unrelated to the removed `close-expired-lots` job. Auction
lots are never closed by a timer now, so `close-lot` should not appear in the
deployed Edge Function list.

Room codes are four characters. In principle a stranger could guess a live
code and try to knock — the host still has to see the name and manually let
them in, same as any other knock, so this doesn't grant a seat by itself.

### Authentication and images

Google sign-in is optional. Signed-in players can use their Google identity and
profile picture or upload a custom avatar; guests can still play by typing a
name. Seat actions are protected separately by the browser's stable client ID
(`cid`), which every outcome-sensitive Edge Function checks against the seat.

Character art and avatars use Supabase Storage. Public object URLs remain
readable without a broad `SELECT` policy that would let clients enumerate every
object in a public bucket. See `site/privacy.html` for the user-facing account
and image-data explanation.

The latest rule migrations include `0006_remove_auction_timer.sql`, which removes
the obsolete close-lot schedule/function, and
`0007_complete_character_relationships.sql`, which inserts curated missing
relationships with valid `lines` values, skips existing `(a, b)` keys, and
removes reverse-order duplicates while preserving older authored rows.
`0010_fix_avatar_storage_policies.sql` gives every authenticated player
owner-only access to create or replace the avatar inside their own user-ID
folder, without restoring a bucket-wide object-listing policy.

### Deploying backend changes

Schema and function changes don't ship through Vercel — they need to be
applied to the Supabase project directly:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push

npx supabase functions deploy create-table
npx supabase functions deploy join-table
npx supabase functions deploy start-table
npx supabase functions deploy place-bid
npx supabase functions deploy lock-roles
npx supabase functions deploy start-match
npx supabase functions deploy submit-pick
npx supabase functions deploy restart-table
```

Only changed functions need redeploying. The current fight/relationship changes
require at least `npx supabase db push` and
`npx supabase functions deploy submit-pick`. Do **not** deploy `close-lot`; it
is intentionally removed. If migrations are managed manually, run the relevant
files in `supabase/migrations/` in order through the Supabase SQL editor instead
of `db push`. None of this happens automatically on a `git push` — only the
`site/` frontend redeploys that way through Vercel.

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
- **The LLM fight writer** in `site/api/scenario.mjs` is present but not called
  from anywhere; live narration is generated locally from the backend-resolved
  three-round result.

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
