import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getMatchById, getMatchIdsByPuuid } from "@/lib/riot";

// One-shot diagnostic to see what Riot ACTUALLY sends in participant.challenges
// for a real recent match — our own RiotParticipant type only declares the 5
// fields we currently read (killParticipation, teamDamagePercentage,
// soloKills, skillshotsHit, damagePerMinute), but that's just our TS view;
// Riot's real JSON has many more. Checking here whether Season 2026's "Aegis
// of Valor" (double LP on an autofilled/priority-role win) shows up as a
// challenges flag, before promising a ladder column we can't actually back.
// DELETE THIS ROUTE once we've looked — it's not meant to stay.
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName");
  const tagLine = searchParams.get("tagLine");
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Pasá ?gameName=X&tagLine=Y en la URL." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo conectar con Supabase." }, { status: 500 });
  }

  const { data: summoner, error } = await supabase
    .from("summoners")
    .select("puuid")
    .eq("game_name", gameName)
    .eq("tag_line", tagLine)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!summoner) {
    return NextResponse.json({ error: "Invocador no encontrado — revisá gameName/tagLine." }, { status: 404 });
  }

  const matchIds = await getMatchIdsByPuuid(summoner.puuid, 5);
  if (matchIds.length === 0) {
    return NextResponse.json({ error: "Sin partidas recientes de ranked solo/duo para este invocador." }, { status: 404 });
  }

  const results = [];
  for (const matchId of matchIds) {
    // Riot's real JSON, not narrowed by our TS type — this is why plain
    // property access here needs a cast instead of going through RiotMatch.
    const match = (await getMatchById(matchId)) as unknown as {
      info: { queueId: number; participants: { puuid: string; win: boolean; challenges?: Record<string, unknown> }[] };
    };
    const me = match.info.participants.find((p) => p.puuid === summoner.puuid);
    results.push({
      matchId,
      queueId: match.info.queueId,
      win: me?.win ?? null,
      challenges: me?.challenges ?? null,
    });
  }

  return NextResponse.json({ results });
}
