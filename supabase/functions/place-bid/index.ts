// supabase/functions/place-bid/index.ts
//
// Replaces bid(), pass(), passIn(), award(), and nextLot() from game.js.
// Those all ran in the host's own browser - this is the actual fix for
// "what stops the host from just deciding they won." Every rule below is
// ported line-for-line from the client functions of the same name, not
// reinvented, so behaviour should match exactly.
//
// Input (POST body): { table_id, seat, cid, kind: "bid" | "pass", amount? }
//
// One thing that did NOT come along: the setTimeout(..., 1250) delay
// award() used before calling nextLot(), and the setTimeout(..., 1000)
// passIn() used. Those existed purely so the "Sold!" stamp animation had
// time to play on screen - they were never a game rule. Here, the lot
// advances immediately; the client is responsible for holding the stamp
// animation on screen for ~1.2s using the fx data in the response, while
// the new lot (already written via this call) arrives over Realtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MIN_SLOTS = 3;
const SLOTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { table_id, seat, cid, kind, amount, lotNum } = await req.json();
    if (!table_id || seat === undefined || !cid || !kind) {
      return json({ error: "table_id, seat, cid, and kind are required" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- load everything we need in one go ----
    const [{ data: table, error: tErr }, { data: seats, error: sErr }] = await Promise.all([
      sb.from("tables").select("*").eq("id", table_id).single(),
      sb.from("seats").select("*").eq("table_id", table_id).order("seat"),
    ]);
    if (tErr) return json({ error: tErr.message }, 400);
    if (sErr) return json({ error: sErr.message }, 400);
    if (!table || table.finished) return json({ error: "table not active" }, 409);

    // Every seat, including seat 0 (the host), has a real cid owner.
    // Skipping this check for seat 0 let any caller bid as the host.
    const mySeat = seats.find((s) => s.seat === seat);
    if (!mySeat || mySeat.cid !== cid) {
      return json({ error: "you may only act for your own seat" }, 403);
    }

    const { data: lot, error: lErr } = await sb
      .from("lots")
      .select("*")
      .eq("table_id", table_id)
      .eq("lot_num", table.current_lot)
      .maybeSingle();
    if (lErr) return json({ error: lErr.message }, 400);
    if (!lot) return json({ error: "no open lot" }, 409);

    // The real fix for a "late bid landing on the next card": lotNum is
    // the lot the CLIENT believed was current when it clicked, captured
    // at click time - not this request's own current_lot lookup, which
    // reflects whatever the server considers current RIGHT NOW. Without
    // this check, a request delayed by network latency past the point
    // where the ORIGINAL lot had already resolved and the table had
    // already advanced would silently get processed against the NEW
    // current lot instead - the bid didn't fail, it just quietly landed
    // on a card the player never intended to act on. Reject outright
    // instead: the player's own screen will catch up via Realtime and
    // show them the real current lot to decide on fresh.
    if (lotNum !== undefined && lotNum !== table.current_lot) {
      return json({ error: "that lot has already moved on" }, 409);
    }
    if (lot.sold) return json({ error: "no open lot" }, 409);

    const NP = table.np;
    // seats() in game.js is really just "0..NP-1" - reproduce that directly
    const allSeats = Array.from({ length: NP }, (_, i) => i);

    const slotsLeft = (p: number) => SLOTS - (seats.find((s) => s.seat === p)?.roster?.length || 0);
    const inPlay = (p: number) => slotsLeft(p) > 0;
    const minimumLeft = (p: number) => Math.max(0, MIN_SLOTS - (seats.find((s) => s.seat === p)?.roster?.length || 0));
    const rivals = (p: number) => allSeats.filter((q) => q !== p);
    const ceiling = (p: number) => (seats.find((s) => s.seat === p)?.purse || 0) - Math.max(0, minimumLeft(p) - 1);
    const askPrice = () => (lot.high_seat === null ? 1 : lot.high_amount + 1);
    const bought = () => seats.reduce((n, s) => n + (s.roster?.length || 0), 0);
    const buysOwed = () => allSeats.reduce((n, p) => n + minimumLeft(p), 0);
    const perSale = () => (NP === 3 ? 25 : 15);
    const lotsLeft = () => perSale() - table.current_lot + 1;
    const passesLeft = () => Math.max(0, lotsLeft() - buysOwed());
    const compulsory = () => passesLeft() <= 0;
    const soloRun = () => allSeats.filter(inPlay).length === 1;
    const passCost = (p: number) => (allSeats.some((q) => !inPlay(q)) && inPlay(p) ? 1 : 0);

    const obliged = (): number | null => {
      if (!compulsory()) return null;
      for (let i = 0; i < NP; i++) {
        const p = (lot.opener + i) % NP;
        if (minimumLeft(p) > 0) return p;
      }
      return null;
    };

    const passedArr: boolean[] = lot.passed_by || [];
    const canPass = (p: number) => {
      if (lot.sold || !inPlay(p) || passedArr[p]) return false;
      if (lot.high_seat === p) return false;
      if (lot.high_seat !== null) return true;
      if (obliged() === p) return false;
      const cost = passCost(p);
      return (seats.find((s) => s.seat === p)?.purse || 0) - cost >= minimumLeft(p);
    };

    // ---- award: settle a lot to a winning seat ----
    async function award(p: number, price: number) {
      // Atomically claim this lot before doing anything else so duplicate
      // pass requests cannot settle it twice.
      const fx = { id: Date.now(), word: "Sold", line: `${lot.card.name} to seat ${p} for $${price}`, tone: p === 0 ? "red" : "blue" };
      const { data: claimed, error: claimErr } = await sb
        .from("lots")
        .update({ sold: true, high_seat: p, high_amount: price, fx })
        .eq("table_id", table_id).eq("lot_num", lot.lot_num).eq("sold", false)
        .select();
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) return { fx: null, finished: false, alreadyResolved: true };

      // Atomic append via a Postgres function, not a stale read-modify-
      // write. The old version read `winner.roster` once from the SAME
      // `seats` array fetched at the top of this whole request, then
      // blindly wrote a brand-new array back - if a second award() call
      // for this SAME seat (a different lot, resolved moments apart by
      // a different trigger) read its own equally-stale copy before this
      // write landed, its write would silently overwrite this one. A
      // real, observed bug: a seat that legitimately won 5 lots ended
      // up with only 4 in its roster, no error, no trace except the
      // lots table itself still correctly showing the 5th sale.
      // award_seat does the purse deduction and roster append in ONE
      // atomic SQL statement - there is no gap for a second call to land in.
      const { error: awardErr } = await sb.rpc("award_seat", {
        p_table_id: table_id, p_seat: p, p_price: price, p_card: lot.card,
      });
      if (awardErr) throw awardErr;

      // Re-fetch the real total fresh rather than trusting the in-memory
      // `seats` snapshot from the top of this request - that snapshot is
      // exactly what caused the bug above, so "is everyone actually
      // full" needs the CURRENT database state, not a number built on
      // data that predates this very award.
      const { data: freshSeats, error: fsErr } = await sb.from("seats").select("roster").eq("table_id", table_id);
      if (fsErr) throw fsErr;
      const totalBought = (freshSeats || []).reduce((n, s) => n + (s.roster?.length || 0), 0);
      if (totalBought >= SLOTS * NP) {
        await sb.from("tables").update({ finished: true }).eq("id", table_id);
        return { fx, finished: true };
      }
      await advanceLot();
      return { fx, finished: false };
    }

    // ---- passIn: nobody wanted it, no sale ----
    async function passIn(cost: number) {
      const fx = {
        id: Date.now(), word: "Passed",
        line: `${lot.card.name}, nobody wanted it` + (cost ? `, $${cost} to walk away` : ""),
        tone: "grey",
      };
      // Same atomic claim as award() above - see the comment there.
      const { data: claimed, error: claimErr } = await sb
        .from("lots")
        .update({ sold: true, passed_in: true, fx })
        .eq("table_id", table_id).eq("lot_num", lot.lot_num).eq("sold", false)
        .select();
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) return { fx: null, finished: false, alreadyResolved: true };
      await advanceLot();
      return { fx, finished: false };
    }

    // ---- nextLot: deal the next card from the table's deck ----
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
        sold: false,
      });
    }

    // ==== the actual action ====
    if (kind === "bid") {
      if (lot.sold) return json({ error: "lot already sold" }, 409);
      const min = lot.high_seat === seat ? lot.high_amount + 1 : askPrice();
      const amt = Math.floor(amount);
      if (!(amt >= min) || amt > ceiling(seat)) return json({ error: "invalid bid amount" }, 400);
      // The ACK_MS pacing lock was removed per request rather than
      // continuing to debug it - both the client-side freeze in
      // renderPanels() and this server-side check are gone together, so
      // a bid a freed-up client sends immediately after another one
      // never gets rejected for a reason the UI no longer explains.

      const contenders = rivals(seat).filter((q) => inPlay(q) && !passedArr[q]);
      if (!contenders.length) {
        const result = await award(seat, amt);
        return json({ ok: true, ...result });
      }

      // Only update a lot that is still open; simultaneous actions are
      // reconciled by the sold guard.
      const { data: claimed, error: claimErr } = await sb
        .from("lots")
        .update({
          high_seat: seat, high_amount: amt,
          history: [...(lot.history || []), { p: seat, amt }],
        })
        .eq("table_id", table_id).eq("lot_num", lot.lot_num).eq("sold", false)
        .select();
      if (claimErr) return json({ error: claimErr.message }, 400);
      if (!claimed || claimed.length === 0) {
        return json({ error: "that lot was just closed" }, 409);
      }

      return json({ ok: true });
    }

    if (kind === "pass") {
      if (!canPass(seat)) return json({ error: "cannot pass right now" }, 409);
      const newPassed = [...passedArr]; newPassed[seat] = true;

      // Only update a lot that is still open.
      const { data: claimed, error: claimErr } = await sb
        .from("lots")
        .update({ passed_by: newPassed })
        .eq("table_id", table_id).eq("lot_num", lot.lot_num).eq("sold", false)
        .select();
      if (claimErr) return json({ error: claimErr.message }, 400);
      if (!claimed || claimed.length === 0) {
        return json({ error: "that lot was just closed" }, 409);
      }

      const cost = passCost(seat);
      if (cost) {
        // Atomic decrement, not the old read-then-write (`me.purse -
        // cost`, computed from the seats snapshot fetched at the top of
        // this request). In the narrow window where the SAME seat sent
        // two pass requests for this lot almost simultaneously, the
        // second call could read that same pre-deduction purse and its
        // write would silently undo the first deduction instead of
        // stacking on top of it - the exact same class of bug as the
        // seats-roster award race, just far lower stakes (a $1
        // miscount, not an erased character). decrement_purse's single
        // relative UPDATE is safely atomic under concurrent calls with
        // no explicit locking needed - see its own migration comment.
        const { error: chargeErr } = await sb.rpc("decrement_purse", {
          p_table_id: table_id, p_seat: seat, p_amount: cost,
        });
        if (chargeErr) return json({ error: chargeErr.message }, 400);
      }

      if (lot.high_seat !== null) {
        const contenders = rivals(lot.high_seat).filter((q) => inPlay(q) && !newPassed[q]);
        if (!contenders.length) {
          const result = await award(lot.high_seat, lot.high_amount);
          return json({ ok: true, ...result });
        }
        return json({ ok: true });
      }

      const stillIn = allSeats.filter((q) => inPlay(q) && !newPassed[q]);
      if (!stillIn.length) {
        const result = await passIn(cost);
        return json({ ok: true, ...result });
      }
      return json({ ok: true });
    }

    return json({ error: "kind must be 'bid' or 'pass'" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
