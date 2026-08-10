# Cover Price

A two-player superhero back-issue auction. Two devices, anywhere in the world.

Everything lives in this folder. Nothing was installed globally on your machine -
delete this folder and it is as if it never existed..

```
site/index.html          the game (this is what gets deployed)
site/api/scenario.mjs    server-side call to the LLM that writes the fight
site/longbox-local.html  older single-screen version, for screen sharing
node_modules/            the Vercel CLI, local to this folder only
.vercel-cli/             the Vercel login, local to this folder only
```

## The fight writer

At the end of a draft you pick **Random encounter** or **A week of prep** and hit
**Write the Fight**, and the story is generated and shown to both players.

It needs a Groq API key (free, console.groq.com → API Keys). The key is stored
as a Vercel environment variable and read only by `site/api/scenario.mjs` on the
server. It is never sent to the browser, because anything in the page can be read
and spent by anyone who opens it.

```
npx vercel env add GROQ_API_KEY production --global-config .vercel-cli
npm run deploy
```

Paste the key when prompted. The redeploy is required, environment variables are
baked in at deploy time. To check it is wired up:

```
curl -s -X POST https://superherodrafts.vercel.app/api/scenario
```

A complaint about missing rosters means the key is set and the function is alive.
A complaint about a missing API key means it is not.

To change model, set `GROQ_MODEL` the same way. To use xAI's Grok instead, edit
`ENDPOINT` and `MODEL` at the top of `site/api/scenario.mjs`, both providers use
the same request shape.

The Vercel login is kept in `.vercel-cli/` rather than in your home directory,
so the account used here is independent of any Vercel account you use elsewhere
on this machine. That is what the `--global-config` flag in the scripts does.
If you run the plain `vercel` command by hand instead of `npm run ...`, it will
use your machine-wide login instead, which is probably not what you want.

## Publishing it

Once, to sign in, this opens your browser:

```
npm run login
```

Then, to put it online:

```
npm run deploy
```

It prints a URL. That URL is permanent; you only ever need to run `npm run deploy`
again if you change the game itself.

First deploy asks a few questions. Answers: set up and deploy **y** · your own
scope · link to existing project **n** · project name **Enter** · modify settings **n**.

## Playing

1. Open your Vercel URL, not a local file, since the invite link is built from
   whatever address you are on.
2. Type your name, hit **Open the Box**.
3. Copy the link from the lobby screen and send it to your friend.
4. They open it, type a name, hit **Join**. The sale starts when they sit down.

Keep a call open. The app relays bids, not voices.

## Trying it locally first

```
npm run serve
```

Then open http://localhost:8791, but note that a friend on another machine
cannot reach that address, so this is only for looking at it yourself.

## The rules

- $20 each, five characters each, minimum bid $1.
- **Nothing goes unsold.** Exactly ten characters come out of the box and all ten
  end up on a roster. There is no pass and no no-sale.
- **Someone has to open, and it alternates.** The opener must bid $1 or more. The
  other side raises, or says **Yours** and hands it over at the standing price.
- **Yours is a weapon.** Say it before anyone has bid and your opponent takes the
  character for $1 whether they wanted it or not, a slot is a slot.
- You can never bid so deep that you cannot cover $1 per empty slot, so both
  rosters always reach five.
- Once one roster is full, every remaining character goes straight to the other
  buyer at $1.

The alternating opener exists to stop both players racing to dump a dud on the
other, a race the player with the slower connection would always lose.

## Notes

- Sync runs over Supabase Realtime broadcast. No database tables, nothing stored.
  The key in the page is a publishable key, which is meant to be public.
- Room codes are four characters. In principle a stranger could guess a live code
  and take the second chair. Fine for a game between friends; just so you know.
- `npm audit` reports issues in the Vercel CLI's own dependencies. They do not
  touch the deployed page, which is a single static HTML file with no dependencies.
  Do not run `npm audit fix`, it can break the CLI.
