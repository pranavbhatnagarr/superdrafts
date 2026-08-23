/* ------------------------------------------------------------------ *
 *  backend.js - Stage A of the Supabase migration.
 *
 *  What this replaces: the host's own browser used to be the only
 *  source of truth (lot/P/ST built in memory) and pushState() broadcast
 *  a full snapshot of it over a Realtime *broadcast* channel every time
 *  something changed. That's the part with no real authority behind it -
 *  a modified host client could just... not agree with its own snapshot.
 *
 *  What this does NOT replace, on purpose: `chan`, presence tracking,
 *  and the knock/join lobby flow (seatOf, knocks) in game.js stay
 *  exactly as they are. Who's currently connected isn't money- or
 *  outcome-sensitive, so there's no reason to move it off the existing
 *  broadcast channel.
 *
 *  How it works: instead of the host manually broadcasting a snapshot,
 *  every real action (bid, pass, a fight pick, starting the table) goes
 *  through an Edge Function, which writes to Postgres. This module
 *  subscribes to postgres_changes on the real tables (tables/seats/
 *  lots/matches) for the joined table_id, and on every change re-shapes
 *  the current rows into the exact snapshot shape applyState() already
 *  expects - so applyState() itself never has to change, only where its
 *  input comes from.
 *
 *  Usage from game.js (Stage B/C/D wire the actual call sites):
 *
 *    import { Backend } from "./backend.js";
 *    const backend = new Backend(sb, TABLE_ID, CID);
 *    backend.onSnapshot(s => applyState(s));
 *    await backend.connect();
 *    await backend.bid(seat, amount);
 *    await backend.pass(seat);
 *    await backend.submitPick(seat, name);
 * ------------------------------------------------------------------ */

const FUNCTIONS_BASE = "https://trtccsljexjplnuhnlkz.supabase.co/functions/v1";
// Same key already used for ART_URL/ART_KEY elsewhere in game.js - the
// publishable/anon key is meant to be public, this is not a secret.
const ANON_KEY = "sb_publishable_3Yt4Gih8Ta_co31EDqy7Jw_-R5sBxMK";

async function callFunction(name, body){
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${name} failed (${res.status})`);
  return data;
}

export class Backend {
  constructor(sb, tableId, cid){
    this.sb = sb;
    this.tableId = tableId;
    this.cid = cid;
    this.rtChannel = null;
    this._listeners = [];
    // Cached rows, kept current by postgres_changes - re-shaped into a
    // snapshot on every change rather than re-fetched from scratch, so a
    // burst of changes (e.g. a bid immediately followed by an award and
    // an advance-lot) doesn't need three separate round trips.
    this._table = null;
    this._seats = [];
    this._lot = null;
    this._matches = {};  // keyed by mode: {random: row|undefined, prep: row|undefined}
  }

  onSnapshot(fn){ this._listeners.push(fn); }
  _emit(){
    const snap = this._buildSnapshot();
    if (snap) this._listeners.forEach(fn => fn(snap));
  }

  // Re-shapes whatever's currently cached into the exact object shape
  // applyState() in game.js already expects - see snapshot()/pushState()
  // in game.js for the original shape this mirrors.
  _buildSnapshot(){
    if (!this._table || !this._seats.length) return null;
    const P = this._seats
      .slice().sort((a, b) => a.seat - b.seat)
      .map(s => ({ name: s.name, purse: s.purse, roster: s.roster || [], locked: s.locked, cid: s.cid }));

    const lot = this._lot ? {
      char: this._lot.card,
      price: this._lot.high_amount,
      high: this._lot.high_seat,
      opener: this._lot.opener,
      passed: this._lot.passed_by || [],
      sold: this._lot.sold,
      // renderSticker() in game.js branches on lot.passedIn specifically
      // (camelCase) to distinguish "nobody wanted it" from a real sale -
      // this was missing entirely, so a passed-in lot fell through to the
      // "Sold" branch instead, which tries to read P[lot.high].name -
      // lot.high is genuinely null when nobody ever bid, so that threw,
      // and since this happens inside render() (which runs before the
      // stamp-triggering code in applyState()), the whole rest of that
      // function silently never ran - the Pass stamp never had a chance
      // to fire, not because of a stamp bug, but because of a crash
      // upstream of it.
      passedIn: this._lot.passed_in || false,
      lockUntil: this._lot.lock_until ? new Date(this._lot.lock_until).getTime() : 0,
      bidDeadline: this._lot.bid_deadline ? new Date(this._lot.bid_deadline).getTime() : 0,
      history: this._lot.history || [],
    } : null;

    const now = Date.now();
    return {
      P, lot,
      // Derived from the LOT itself, not the table's separate current_lot
      // pointer. Those two are updated by two different Realtime
      // subscriptions landing at slightly different times - if the
      // table's pointer arrives a beat before the new lot ROW itself,
      // lotNum would briefly pair with the OLD lot's data, and game.js
      // would mark that lot number as "already drawn" before the real
      // new card ever got rendered - silently skipping it when the
      // actual data arrived moments later. Keeping lotNum and lot
      // sourced from the same object makes that pairing impossible.
      lotNum: this._lot ? this._lot.lot_num : this._table.current_lot,
      over: this._table.finished,
      box: this._table.box,
      np: this._table.np,
      lockLeft: lot && lot.lockUntil ? Math.max(0, lot.lockUntil - now) : 0,
      bidLeft: lot && lot.bidDeadline ? Math.max(0, lot.bidDeadline - now) : 0,
      deckLeft: this._table.deck ? this._table.deck.length : 0,
      fx: this._lot ? (this._lot.fx || null) : null,   // top-level, not nested in `lot` - applyState() reads s.fx directly
      matches: this._matches, // keyed by mode - a table can hold a "random" row and a "prep" row at once, see start-match's own comment for why
    };
  }

  // Pulls the current rows once, then subscribes to keep them current.
  // Call this once, right after the player is seated at a real table_id.
  // Pulled out of connect() so it can also run as a safety-net re-sync,
  // not just on first load. The postgres_changes subscription is fast
  // when it's working, but nothing guarantees it never misses a beat -
  // a tab losing focus, a brief network blip, anything that interrupts
  // the websocket for even a moment means whatever happened during that
  // gap is just gone, with nothing built in to notice. This is what
  // actually explained "no open lot" while the screen still showed a
  // biddable card: the client's cached copy of the current lot had
  // fallen behind the server's real state and nothing ever forced it
  // back in sync.
  async _resync(){
    const [{ data: table }, { data: seats }, { data: lots }, { data: matches }] = await Promise.all([
      this.sb.from("tables").select("*").eq("id", this.tableId).single(),
      this.sb.from("seats").select("*").eq("table_id", this.tableId).order("seat"),
      this.sb.from("lots").select("*").eq("table_id", this.tableId).order("lot_num", { ascending: false }).limit(1),
      // No .single()/.maybeSingle() here on purpose: a table can hold up
      // to two rows now (one per encounter mode), and either of those
      // would throw the moment a second row actually exists.
      this.sb.from("matches").select("*").eq("table_id", this.tableId),
    ]);
    this._table = table;
    this._seats = seats || [];
    this._lot = (lots && lots[0]) || null;
    this._matches = Object.fromEntries((matches || []).map(m => [m.mode, m]));
    this._emit();
  }

  async connect(){
    await this._resync();

    this.rtChannel = this.sb
      .channel(`db-${this.tableId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tables", filter: `id=eq.${this.tableId}` },
        (payload) => { this._table = payload.new; this._emit(); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "seats", filter: `table_id=eq.${this.tableId}` },
        (payload) => {
          const i = this._seats.findIndex(s => s.seat === payload.new.seat);
          if (i === -1) this._seats.push(payload.new); else this._seats[i] = payload.new;
          this._emit();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "lots", filter: `table_id=eq.${this.tableId}` },
        (payload) => {
          // A DELETE needs its own branch, same reasoning as the matches
          // handler's DELETE case below. Without it, a restart broke a
          // silent assumption baked into the >= guard: that lot_num only
          // ever increases. A restart intentionally resets it back to 1,
          // LOWER than whatever the previous game ended on - so the new
          // lot 1's INSERT event was being rejected outright by that
          // guard, leaving this._lot stuck on the old game's final lot
          // until the next 3-second poll happened to force a correction.
          // That's exactly what showed as "the last card from the
          // previous game" briefly appearing on the new auction screen.
          if (payload.eventType === "DELETE") {
            if (this._lot && payload.old && payload.old.lot_num === this._lot.lot_num) {
              this._lot = null;
            }
          } else if (!this._lot || payload.new.lot_num >= this._lot.lot_num) {
            this._lot = payload.new;
          }
          this._emit();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `table_id=eq.${this.tableId}` },
        (payload) => {
          // A DELETE's payload.new is empty - without handling that
          // specifically, the old mode's key would just sit there
          // unchanged until the next 3-second poll's full _resync()
          // happened to correct it, a residual window where a client
          // could still briefly find and render an already-deleted
          // match (see restart-table's own comment for the bug this
          // caused - deleting the row server-side closes most of it,
          // this closes the rest by reacting to the delete immediately
          // instead of waiting on the next poll to notice).
          if (payload.eventType === "DELETE") {
            const deletedMode = payload.old && payload.old.mode;
            if (deletedMode) delete this._matches[deletedMode];
          } else {
            this._matches[payload.new.mode] = payload.new;
          }
          this._emit();
        })
      .subscribe();

    // The safety net itself: force a full re-sync whenever the tab
    // regains focus/visibility, or the browser reports it's back online.
    // If the subscription missed something while backgrounded (which it
    // can, silently, with no error to catch), this is what actually
    // recovers - not a fix for why events get missed, just a guarantee
    // this client can never stay stale for longer than "however long the
    // tab was hidden."
    this._onVisible = () => { if (document.visibilityState === "visible") this._resync(); };
    this._onOnline = () => this._resync();
    document.addEventListener("visibilitychange", this._onVisible);
    window.addEventListener("online", this._onOnline);

    // Unconditional safety net, on top of the visibility/online triggers
    // above. Those only fire on a specific event (tab switch, network
    // recovery) - but a websocket message can silently drop with no
    // such event at all, no tab-switching required. This guarantees the
    // client can never stay stale for more than a few seconds under ANY
    // circumstance, not just the ones we happen to have a listener for.
    // Cheap enough to run this often - it's one small batch of reads,
    // not a re-render unless something actually changed.
    this._pollTimer = setInterval(() => this._resync(), 3000);

    this._emit();
  }

  disconnect(){
    if (this.rtChannel) this.sb.removeChannel(this.rtChannel);
    this.rtChannel = null;
    if (this._onVisible) document.removeEventListener("visibilitychange", this._onVisible);
    if (this._onOnline) window.removeEventListener("online", this._onOnline);
    clearInterval(this._pollTimer);
  }

  // ---- actions: thin wrappers, all the real logic lives server-side ----
  startTable(box, np){
    return callFunction("start-table", { table_id: this.tableId, box, np });
  }
  // "Run it again" used to just reset the host's own local P array and
  // call the old local dealDeck()/nextLot() - never touching the
  // database, so backend's still-active polling would pull the OLD
  // finished game right back over whatever was just reset on screen.
  // This properly wipes seats/lots server-side and deals a fresh sale in
  // one call, matching the original UX of restarting immediately rather
  // than returning to a waiting lobby.
  restartTable(box){
    return callFunction("restart-table", { table_id: this.tableId, host_cid: this.cid, box });
  }
  // lotNum is the lot THIS CLIENT believes is current, captured at the
  // moment of the click - not trusted blindly, but given to the server
  // so it can check "is this still the same lot you think you're
  // bidding on." Without this, a bid delayed by network latency past
  // the point where the lot had already resolved and advanced would
  // silently get applied to whatever the NEW current lot happened to
  // be - the exact bug where a late bid appeared to land on the next
  // card instead of failing outright.
  bid(seat, amount, lotNum){
    return callFunction("place-bid", { table_id: this.tableId, seat, cid: this.cid, kind: "bid", amount, lotNum });
  }
  pass(seat, lotNum){
    return callFunction("place-bid", { table_id: this.tableId, seat, cid: this.cid, kind: "pass", lotNum });
  }
  startMatch(mode){
    return callFunction("start-match", { table_id: this.tableId, mode });
  }
  // Called once, at the moment a seat actually locks in - not per
  // individual drag. roles must list all 5 of this seat's characters,
  // IN ROSTER ORDER, each paired with the role key chosen for them; the
  // name is included so the server can verify it against the real
  // roster rather than trusting position alone. All real validation
  // (legal keys, all 5 used exactly once) happens server-side in the
  // lock_role Postgres function - this is a thin wrapper, same as every
  // other action here.
  lockRoles(seat, roles){
    return callFunction("lock-roles", { table_id: this.tableId, seat, cid: this.cid, roles });
  }
  submitPick(seat, name, mode){
    return callFunction("submit-pick", { table_id: this.tableId, seat, cid: this.cid, name, mode });
  }
  // Client-driven timeout resolution: close-lot re-validates everything
  // server-side (it re-checks bid_deadline itself, doesn't trust the
  // caller), so any connected client - host or guest - can safely call
  // this the instant its own local countdown hits zero. This is what
  // gives back the ORIGINAL instant-feeling UX (a real setTimeout firing
  // exactly on deadline, like the old scheduleBidTimer()) instead of
  // waiting on either another player's next action or cron's 1-minute
  // backstop.
  closeLot(){
    return callFunction("close-lot", { table_id: this.tableId });
  }
}
