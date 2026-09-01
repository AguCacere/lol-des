import { NextResponse } from "next/server";
import { getLeagueEntriesByPuuid } from "@/lib/riot";

// One-shot diagnostic — raw League-V4 entries for a puuid, to check for any
// field beyond the documented set (leagueId, queueType, tier, rank,
// leaguePoints, wins, losses, hotStreak, veteran, freshBlood, inactive,
// miniSeries) that might relate to "Aegis of Valor". Delete once checked.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const puuid = searchParams.get("puuid");
  if (!puuid) {
    return NextResponse.json({ error: "Pasá ?puuid=..." }, { status: 400 });
  }
  try {
    const entries = await getLeagueEntriesByPuuid(puuid);
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
