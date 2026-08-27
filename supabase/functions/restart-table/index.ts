// supabase/functions/restart-table/index.ts
//
// Replaces the local-only reset inside the "Run it again" click handler
// in game.js. That handler reset the host's own P array and called
// dealDeck()/nextLot() - the original pre-migration, purely-local deck
// functions - which never touched the database at all.
//
// All the actual writes here now go through the restart_table Postgres
// function in one atomic transaction, rather than several separate,
// sequentially awaited calls the way this function used to do it - see
// that migration's own comment for the exact observable glitch that
// caused (seats reset arriving well before the table stopped being
// "finished", a visible window of an emptied face-off screen for
// however long the gap between those two separate commits happened to
// be). Everything here that ISN'T a write - loading the table/seats,
// checking the host, fetching and shuffling the character pool - stays
// exactly as it was; only the actual writes moved into the one RPC call.
//
// Input: { table_id, host_cid, box: { u: string[] } }
// Only the seat-0 (host) cid may call this - the face-off screen's own
// "Run it again" button is already hidden for guests, this is the
// server-side half of that same rule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const perSale = (np: number) => (np === 3 ? 25 : 15);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { table_id, host_cid, box } = await req.json();
    if (!table_id || !host_cid || !box?.u?.length) {
      return json({ error: "table_id, host_cid, and box.u are required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: table, error: tErr }, { data: seats, error: sErr }] = await Promise.all([
      sb.from("tables").select("*").eq("id", table_id).single(),
      sb.from("seats").select("*").eq("table_id", table_id).order("seat"),
    ]);
    if (tErr) return json({ error: tErr.message }, 400);
    if (sErr) return json({ error: sErr.message }, 400);

    const hostSeat = seats.find((s) => s.seat === 0);
    if (!hostSeat || hostSeat.cid !== host_cid) {
      return json({ error: "only the host may restart the table" }, 403);
    }

    const NP = table.np;

    // Same deck-building logic as start-table - see that function for
    // the full reasoning on why this runs server-side rather than
    // trusting a client-built deck. Purely a read (characters) plus
    // in-memory shuffling; no writes happen until the RPC call below.
    const { data: rows, error: stockErr } = await sb
      .from("characters")
      .select("name,universe,real_name,blurb,tier,prep_shift,fit_roles,bad_roles")
      .not("universe", "is", null);
    if (stockErr) return json({ error: stockErr.message }, 400);
    if (!rows?.length) return json({ error: "empty roster" }, 400);

    const deck = shuffle(
      rows
        .map((c, i) => ({
          name: c.name, pub: c.universe, alias: c.real_name, note: c.blurb || "",
          tier: c.tier, prep: c.prep_shift || 0, fit: c.fit_roles || "", bad: c.bad_roles || "",
          no: 1 + ((i * 37 + 11) % 480),
        }))
        .filter((c) => box.u.includes(c.pub))
    ).slice(0, perSale(NP));
    if (deck.length < perSale(NP)) return json({ error: "not enough characters match this box" }, 400);

    const firstCard = deck[0];
    const remainingDeck = deck.slice(1);

    // Every write - deleting the old matches/picks/lots, resetting
    // seats, updating the table, dealing the new lot 1 - happens inside
    // this single call, as one Postgres transaction. See the migration's
    // own comment for why that matters: no client can ever observe a
    // half-done restart, because there is no moment where it half-exists
    // from the database's own perspective.
    const { error: rpcErr } = await sb.rpc("restart_table", {
      p_table_id: table_id, p_np: NP, p_box: box, p_deck: remainingDeck, p_first_card: firstCard,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    return json({ ok: true, dealt: deck.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
