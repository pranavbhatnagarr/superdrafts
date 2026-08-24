// supabase/functions/close-lot/index.ts
//
// Replaces the setTimeout callback inside scheduleBidTimer() in game.js -
// the part that fires when nobody acts before the clock runs out. That
// used to be a plain JS timer sitting in the host's tab, which meant it
// could stall if the host's phone backgrounded the page, or, worse, a
// modified host client could simply not run it. This has no client at
// all: either pg_cron calls it on a schedule, or place-bid calls it first
// thing (see the note in that file) before processing whatever action
// just came in.
//
// Input: { table_id }
// Only acts if the table's current lot's bid_deadline has actually
// passed and the lot isn't sold yet - calling this on a lot with time
// still on the clock is a harmless no-op, same as the original
// "if (lot !== ref || lot.sold) return" guard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SLOTS = 5;
const BID_TIMER_MS = 8000;
// Same grace buffer as place-bid's lazy-check, for the same reason - see
// the comment there. Both files need to agree on what "expired" means,
// or a bid could pass one check and fail the other depending on which
// path resolves it first.
const GRACE_MS = 1500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { table_id } = await req.json();
    if (!table_id) return json({ error: "table_id is required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: table, error: tErr } = await sb.from("tables").select("*").eq("id", table_id).single();
    if (tErr) return json({ error: tErr.message }, 400);
    if (!table || table.finished) return json({ ok: true, action: "none" });

    const { data: lot, error: lErr } = await sb
      .from("lots").select("*").eq("table_id", table_id).eq("lot_num", table.current_lot).maybeSingle();
    if (lErr) return json({ error: lErr.message }, 400);
    if (!lot || lot.sold) return json({ ok: true, action: "none" });
    if (!lot.bid_deadline || Date.now() < new Date(lot.bid_deadline).getTime() + GRACE_MS) {
      return json({ ok: true, action: "none" }); // clock hasn't actually run out yet
    }

    const { data: seats, error: sErr } = await sb.from("seats").select("*").eq("table_id", table_id).order("seat");
    if (sErr) return json({ error: sErr.message }, 400);

    const NP = table.np;
    const allSeats = Array.from({ length: NP }, (_, i) => i);
    const slotsLeft = (p: number) => SLOTS - (seats.find((s) => s.seat === p)?.roster?.length || 0);
    const inPlay = (p: number) => slotsLeft(p) > 0;
    const bought = () => seats.reduce((n, s) => n + (s.roster?.length || 0), 0);
    const perSale = () => (NP === 3 ? 25 : 15);
    // The exact gap this file didn't have until now: soloRun/passCost
    // exist in place-bid (an explicit pass click correctly charges $1
    // when you're the only seat still buying, so a lone remaining buyer
    // can't just wait out every lot for free with nobody left to
    // compete against them) but this file's own timeout path had no
    // concept of the rule at all - letting the SAME clock run out
    // instead of clicking Pass yourself resolved as a free pass, every
    // time, regardless of whether the $1 rule was actually in effect.
    const soloRun = () => allSeats.filter(inPlay).length === 1;
    const passCost = (p: number) => (soloRun() && inPlay(p) ? 1 : 0);

    const obliged = (): number | null => {
      const buysOwed = SLOTS * NP - bought();
      const lotsLeft = perSale() - table.current_lot + 1;
      if (Math.max(0, lotsLeft - buysOwed) > 0) return null; // not compulsory
      for (let i = 0; i < NP; i++) {
        const p = (lot.opener + i) % NP;
        if (inPlay(p)) return p;
      }
      return null;
    };

    async function award(p: number, price: number) {
      // Same atomic claim as place-bid's award() - see the detailed
      // comment there. Two independent triggers (this cron/client call
      // and place-bid's own lazy-check) can race to resolve the same
      // expired lot; only the one whose update actually matches a
      // still-unsold row should proceed.
      const fx = { id: Date.now(), word: "Sold", line: `${lot.card.name} to seat ${p} for $${price}`, tone: p === 0 ? "red" : "blue" };
      const { data: claimed, error: claimErr } = await sb
        .from("lots")
        .update({ sold: true, high_seat: p, high_amount: price, fx })
        .eq("table_id", table_id).eq("lot_num", lot.lot_num).eq("sold", false)
        .select();
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) return;

      // Atomic append via the same award_seat Postgres function place-bid
      // uses - see that migration's own comment for the exact race this
      // closes.
      const { error: awardErr } = await sb.rpc("award_seat", {
        p_table_id: table_id, p_seat: p, p_price: price, p_card: lot.card,
      });
      if (awardErr) throw awardErr;

      const { data: freshSeats, error: fsErr } = await sb.from("seats").select("roster").eq("table_id", table_id);
      if (fsErr) throw fsErr;
      const totalBought = (freshSeats || []).reduce((n, s) => n + (s.roster?.length || 0), 0);
      if (totalBought >= SLOTS * NP) {
        await sb.from("tables").update({ finished: true }).eq("id", table_id);
        return;
      }
      await advanceLot();
    }

    // Now takes the seat that's actually passing and charges the same
    // solo-run cost place-bid's explicit pass already did, via the same
    // atomic decrement_purse RPC - a plain read-then-write here would
    // reintroduce the exact race that function exists to close, just for
    // a new call site.
    async function passIn(p: number, cost: number) {
      const fx = {
        id: Date.now(), word: "Passed",
        line: `${lot.card.name}, nobody wanted it` + (cost ? `, $${cost} to walk away` : ""),
        tone: "grey",
      };
      const { data: claimed, error: claimErr } = await sb
        .from("lots")
        .update({ sold: true, passed_in: true, fx })
        .eq("table_id", table_id).eq("lot_num", lot.lot_num).eq("sold", false)
        .select();
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) return;

      if (cost) {
        const { error: chargeErr } = await sb.rpc("decrement_purse", {
          p_table_id: table_id, p_seat: p, p_amount: cost,
        });
        if (chargeErr) throw chargeErr;
      }
      await advanceLot();
    }

    async function advanceLot() {
      const deck: unknown[] = table.deck || [];
      if (table.current_lot >= perSale() || !deck.length) {
        await sb.from("tables").update({ finished: true }).eq("id", table_id);
        return;
      }
      const nextCard = deck[0];
      const remaining = deck.slice(1);
      const nextLotNum = table.current_lot + 1;
      await sb.from("tables").update({ deck: remaining, current_lot: nextLotNum }).eq("id", table_id);
      await sb.from("lots").insert({
        table_id, lot_num: nextLotNum, card: nextCard,
        high_seat: null, high_amount: 0,
        opener: (nextLotNum - 1) % NP,
        passed_by: allSeats.map(() => false),
        bid_deadline: new Date(Date.now() + BID_TIMER_MS).toISOString(),
        sold: false,
      });
    }

    if (lot.high_seat === null) {
      const ob = obliged();
      if (ob === null) {
        // Nobody's obliged to buy - this is the timeout-pass-in case
        // that was missing the solo charge. Whichever seat is still
        // in play (soloRun only ever applies with exactly one) is the
        // one this cost, if any, applies to.
        const soloSeat = allSeats.find(inPlay);
        const cost = soloSeat !== undefined ? passCost(soloSeat) : 0;
        await passIn(soloSeat ?? -1, cost);
      } else {
        await award(ob, 1);
      }
      return json({ ok: true, action: ob === null ? "passed_in" : "awarded_obliged" });
    }
    await award(lot.high_seat, lot.high_amount);
    return json({ ok: true, action: "awarded_timeout" });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
