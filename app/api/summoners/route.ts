import { NextResponse } from "next/server";
import { getAccountByRiotId, getLeagueEntriesByPuuid } from "@/lib/riot";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * POST /api/summoners — { gameName, tagLine } → resolves a Riot ID against
 * the real Riot API and adds it to `summoners` (upsert by puuid), plus an
 * initial `lp_snapshots` row if they have a solo queue rank, so the ladder
 * shows something before the next cron refresh runs.
 *
 *   curl -X POST http://localhost:3000/api/summoners \
 *     -H "Content-Type: application/json" \
 *     -d '{"gameName":"Faker","tagLine":"KR1"}'
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

  let account, solo;
  try {
    account = await getAccountByRiotId(gameName, tagLine);
    const entries = await getLeagueEntriesByPuuid(account.puuid);
    solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido consultando la Riot API.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { error: upsertError } = await supabase.from("summoners").upsert(
    {
      puuid: account.puuid,
      game_name: account.gameName,
      tag_line: account.tagLine,
      platform: process.env.RIOT_PLATFORM || "la2",
    },
    { onConflict: "puuid" }
  );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (solo) {
    const { error: snapshotError } = await supabase.from("lp_snapshots").insert({
      puuid: account.puuid,
      tier: solo.tier,
      division: solo.rank,
      lp: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses,
    });
    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ account, soloQueue: solo });
}
