import type { getSupabaseServerClient } from "./supabase";
import { getLeagueEntriesByPuuid, getMatchById, getMatchIdsByPuuid } from "./riot";

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>;

/** Minimum time between Riot API pulls for the same summoner via the manual "Actualizar ahora" button. */
export const MANUAL_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

/** Pulls fresh LP + new ranked matches for one summoner and appends them to Supabase. */
export async function refreshOne(supabase: SupabaseClient, puuid: string) {
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

/**
 * Refreshes every tracked summoner. With `onlyStale`, skips anyone refreshed
 * more recently than MANUAL_REFRESH_COOLDOWN_MS — used by the user-triggered
 * "Actualizar ahora" button so repeated clicks (or several friends clicking
 * at once) can't burn through the personal API key's rate limit.
 */
export async function refreshAllSummoners(
  supabase: SupabaseClient,
  { onlyStale = false }: { onlyStale?: boolean } = {}
): Promise<Record<string, string>> {
  const { data: summoners, error } = await supabase.from("summoners").select("puuid, last_refreshed_at");
  if (error) throw new Error(error.message);

  const now = Date.now();
  const results: Record<string, string> = {};

  for (const summoner of summoners ?? []) {
    if (onlyStale && summoner.last_refreshed_at) {
      const age = now - new Date(summoner.last_refreshed_at).getTime();
      if (age < MANUAL_REFRESH_COOLDOWN_MS) {
        results[summoner.puuid] = "skipped (cooldown)";
        continue;
      }
    }
    try {
      await refreshOne(supabase, summoner.puuid);
      results[summoner.puuid] = "ok";
    } catch (err) {
      results[summoner.puuid] = err instanceof Error ? err.message : "error";
    }
  }

  return results;
}
