import { NextResponse } from "next/server";
import { getAccountByRiotId, getLeagueEntriesByPuuid } from "@/lib/riot";

/**
 * POST /api/summoners — { gameName, tagLine } → adds a Riot ID to the tracked group.
 *
 * This is the one route that's already wired to the REAL Riot API (via
 * lib/riot.ts) rather than mock data, since resolving a Riot ID → puuid is
 * cheap (one Account-V1 call + one League-V4 call) and doesn't need caching
 * yet. Try it once RIOT_API_KEY is set in .env.local:
 *
 *   curl -X POST http://localhost:3000/api/summoners \
 *     -H "Content-Type: application/json" \
 *     -d '{"gameName":"Faker","tagLine":"KR1"}'
 *
 * TODO(db): once supabase/schema.sql is applied, insert the resolved
 * account (puuid, gameName, tagLine, platform) into `summoners` here via
 * getSupabaseServerClient(), instead of just returning it. That's what
 * turns "add a friend" into something that survives a refresh.
 */
export async function POST(req: Request) {
  let body: { gameName?: string; tagLine?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }

  const { gameName, tagLine } = body;
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Faltan gameName y/o tagLine." }, { status: 400 });
  }

  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    const entries = await getLeagueEntriesByPuuid(account.puuid);
    const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null;
    return NextResponse.json({ account, soloQueue: solo });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido consultando la Riot API.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
