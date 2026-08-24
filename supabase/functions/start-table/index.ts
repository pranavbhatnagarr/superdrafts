// supabase/functions/start-table/index.ts
//
// Replaces dealDeck()/shuffle() from game.js. Those used to run in the
// host's own browser, which meant the host could see (or edit) the deck
// order before anyone else. This runs here instead, using the service-role
// key, which is never shipped to any client.
//
// Input (POST body):  { table_id: string, box: { u: string[] }, np: number }
// Effect: writes a shuffled `deck` and `started: true` onto the matching
//         row in `tables`. Nothing about the deck's order is returned to
//         the caller - the client re-reads `tables` itself afterward,
//         same as any other player would.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS: adjust the origin below to your actual deployed site before going
// to production - "*" is fine for local testing only.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const { table_id, box, np } = await req.json();
    if (!table_id || !box?.u?.length || !np) {
      return new Response(JSON.stringify({ error: "table_id, box.u, and np are required" }),
        { status: 400, headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Make sure this table hasn't already been started - calling this
    // twice on the same table_id should not re-shuffle a deck that's
    // already in play.
    const { data: existing, error: fetchErr } = await sb
      .from("tables")
      .select("started")
      .eq("id", table_id)
      .single();
    if (fetchErr) return new Response(JSON.stringify({ error: fetchErr.message }), { status: 400, headers: CORS });
    if (existing?.started) {
      return new Response(JSON.stringify({ error: "table already started" }), { status: 409, headers: CORS });
    }

    // Same source table your loadStock() reads today. Pulling it here too
    // (rather than trusting a deck the client might send) is what actually
    // closes the loophole - the shuffle AND the source data both happen
    // server-side.
    const { data: rows, error: stockErr } = await sb
      .from("characters")
      .select("name,universe,real_name,blurb,tier,prep_shift,fit_roles,bad_roles")
      .not("universe", "is", null);
    if (stockErr) return new Response(JSON.stringify({ error: stockErr.message }), { status: 400, headers: CORS });
    if (!rows?.length) return new Response(JSON.stringify({ error: "empty roster" }), { status: 400, headers: CORS });

    const deck = shuffle(
      rows
        .map((c, i) => ({
          name: c.name, pub: c.universe, alias: c.real_name, note: c.blurb || "",
          tier: c.tier, prep: c.prep_shift || 0, fit: c.fit_roles || "", bad: c.bad_roles || "",
          no: 1 + ((i * 37 + 11) % 480),
        }))
        .filter((c) => box.u.includes(c.pub))
    ).slice(0, perSale(np));

    if (!deck.length) {
      return new Response(JSON.stringify({ error: "no characters match this box" }), { status: 400, headers: CORS });
    }

    const firstCard = deck[0];
    const remainingDeck = deck.slice(1);

    // Both the tables update (deck/box/started/current_lot) and the
    // lot-1 insert now happen inside ONE atomic transaction via this RPC,
    // not as two separate sequential writes. See that migration's own
    // comment: this was never just a speed concern - two independent
    // writes meant a real, if narrow, window where a client could
    // observe started=true before lot 1 actually existed, the same
    // class of gap restart_table's own atomic rewrite closed earlier.
    const { error: rpcErr } = await sb.rpc("start_table_deal", {
      p_table_id: table_id, p_np: np, p_box: box, p_deck: remainingDeck, p_first_card: firstCard,
    });
    if (rpcErr) return new Response(JSON.stringify({ error: rpcErr.message }), { status: 400, headers: CORS });

    return new Response(JSON.stringify({ ok: true, dealt: deck.length }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
