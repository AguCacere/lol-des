import { NextResponse, after } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { backfillOne } from "@/lib/refresh";

// A deep pull (default 200 matches, 2 Riot calls each) comfortably finishes
// within this, but give it the same headroom as the other refresh routes.
export const maxDuration = 300;

/**
 * POST /api/backfill — { gameName, tagLine, maxMatches? } → one-time deep
 * pull of ranked match history for ONE already-tracked summoner, well past
 * the last-20-per-refresh window the cron normally keeps up with. Meant to
 * be run once per summoner (right after adding them, or whenever you want
 * more history) — "Mayor winrate por campeón" needs 50+ locally-stored
 * matches on a single champion to show someone at all, and that only
 * accumulates 20-ids-at-a-time otherwise.
 *
 *   curl -X POST http://localhost:3000/api/backfill \
 *     -H "Content-Type: application/json" \
 *     -d '{"gameName":"Simiestro","tagLine":"Arg"}'
 *
 * Responds immediately and runs in the background via after() — same
 * reasoning as /api/cron/refresh, just for a single summoner's much bigger
 * pull instead of everyone's small one.
 */
export async function POST(req: Request) {
  let body: { gameName?: string; tagLine?: string; maxMatches?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }

  const { gameName, tagLine, maxMatches } = body;
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Faltan gameName y/o tagLine." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: summoner, error } = await supabase
    .from("summoners")
    .select("puuid")
    .eq("game_name", gameName)
    .eq("tag_line", tagLine)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!summoner) {
    return NextResponse.json(
      { error: "Invocador no encontrado — agregalo primero con POST /api/summoners." },
      { status: 404 }
    );
  }

  after(async () => {
    try {
      const result = await backfillOne(supabase, summoner.puuid, maxMatches);
      console.log(`backfill(${gameName}#${tagLine}):`, result);
    } catch (err) {
      console.error(`backfill(${gameName}#${tagLine}) failed:`, err instanceof Error ? err.message : err);
    }
  });

  return NextResponse.json({ status: "started" });
}
