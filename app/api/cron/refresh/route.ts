import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getLeagueEntriesByPuuid, getMatchById, getMatchIdsByPuuid } from "@/lib/riot";

export const maxDuration = 60;

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>;

/**
 * GET /api/cron/refresh — pulls fresh LP + match data for every tracked
 * summoner and appends it to Supabase. Scheduled via vercel.json's `crons`;
 * Vercel calls this with `Authorization: Bearer $CRON_SECRET`, checked below
 * (see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: summoners, error } = await supabase.from("summoners").select("puuid");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, string> = {};
  for (const { puuid } of summoners ?? []) {
    try {
      await refreshOne(supabase, puuid);
      results[puuid] = "ok";
    } catch (err) {
      results[puuid] = err instanceof Error ? err.message : "error";
    }
  }

  return NextResponse.json({ results });
}

async function refreshOne(supabase: SupabaseClient, puuid: string) {
  const entries = await getLeagueEntriesByPuuid(puuid);
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  if (solo) {
    await supabase.from("lp_snapshots").insert({
      puuid,
      tier: solo.tier,
      division: solo.rank,
      lp: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses,
    });
  }

  const { data: existing } = await supabase.from("matches").select("match_id").eq("puuid", puuid);
  const known = new Set((existing ?? []).map((m) => m.match_id));

  const matchIds = await getMatchIdsByPuuid(puuid, 20);
  for (const matchId of matchIds) {
    if (known.has(matchId)) continue;

    const match = await getMatchById(matchId);
    const me = match.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;

    const teamDamage = match.info.participants
      .filter((p) => p.teamId === me.teamId)
      .reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
    const cs = me.totalMinionsKilled + me.neutralMinionsKilled;
    const durationMin = match.info.gameDuration / 60;

    await supabase.from("matches").insert({
      match_id: matchId,
      puuid,
      champion: me.championName,
      win: me.win,
      kills: me.kills,
      deaths: me.deaths,
      assists: me.assists,
      cs,
      cs_per_min: Number((cs / durationMin).toFixed(1)),
      vision_score: me.visionScore,
      gold_earned: me.goldEarned,
      damage_to_champs: me.totalDamageDealtToChampions,
      dmg_share:
        teamDamage > 0 ? Number(((100 * me.totalDamageDealtToChampions) / teamDamage).toFixed(1)) : 0,
      team_position: me.teamPosition,
      game_duration_s: match.info.gameDuration,
      played_at: new Date(match.info.gameCreation).toISOString(),
    });
  }

  await supabase.from("summoners").update({ last_refreshed_at: new Date().toISOString() }).eq("puuid", puuid);
}
