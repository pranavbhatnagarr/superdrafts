import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (body.type === "purchase") {
      const name = String(body.name || "").trim();
      const price = Number(body.price);
      if (!name || !Number.isInteger(price) || price < 0 || price > 20)
        return json({ error: "invalid purchase" }, 400);

      const { data: character } = await service.from("characters").select("name").eq("name", name).maybeSingle();
      if (!character) return json({ error: "unknown character" }, 400);
      const { error } = await service.rpc("record_character_purchase", { p_name: name, p_price: price });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.type === "round") {
      const fighters = Array.isArray(body.fighters) ? body.fighters : [];
      if (!fighters.length || fighters.length > 6) return json({ error: "invalid round" }, 400);
      const names = [...new Set(fighters.map((f: any) => String(f?.name || "").trim()))];
      if (names.some((name) => !name)) return json({ error: "invalid fighter" }, 400);

      const { data: known, error: knownError } = await service.from("characters").select("name").in("name", names);
      if (knownError) throw knownError;
      if ((known || []).length !== names.length) return json({ error: "unknown character" }, 400);

      for (const fighter of fighters) {
        const { error } = await service.rpc("record_character_round", {
          p_name: String(fighter.name),
          p_won: !!fighter.won,
          p_drew: !!fighter.drew,
        });
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (body.type === "match") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: authData, error: authError } = await service.auth.getUser(token);
      if (authError || !authData.user) return json({ error: "sign in to record bot match statistics" }, 401);
      const { error } = await service.rpc("record_bot_match_stats", {
        p_user_id: authData.user.id,
        p_won: !!body.won,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "unknown statistic type" }, 400);
  } catch (error) {
    console.error("record-solo-stats failed", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
