import type { getSupabaseServerClient } from "./supabase";
import { getLeagueEntriesByPuuid, getMatchById, getMatchIdsByPuuid, getTopChampionMasteries } from "./riot";
import { championNameById, runeNameById, summonerSpellNameById } from "./ddragon";

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>;

/** Minimum time between Riot API pulls for the same summoner via the manual "Actualizar ahora" button. */
export const MANUAL_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

/** Pulls fresh LP + new ranked matches for one summoner and appends them to Supabase. */
export async function refreshOne(supabase: SupabaseClient, puuid: string) {
  const entries = await getLeagueEntriesByPuuid(puuid);
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  if (solo) {
    // Only insert when something actually changed since the last snapshot — otherwise
    // repeated refreshes (cron + manual clicks) with no new games pile up identical
    // rows, and since the chart plots the last N snapshots, those duplicates crowd
    // out real history and flatten the whole trend into a long plateau.
    const { data: lastSnapshot } = await supabase
      .from("lp_snapshots")
      .select("tier, division, lp, wins, losses")
      .eq("puuid", puuid)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const unchanged =
      lastSnapshot &&
      lastSnapshot.tier === solo.tier &&
      lastSnapshot.division === solo.rank &&
      lastSnapshot.lp === solo.leaguePoints &&
      lastSnapshot.wins === solo.wins &&
      lastSnapshot.losses === solo.losses;

    if (!unchanged) {
      await supabase.from("lp_snapshots").insert({
        puuid,
        tier: solo.tier,
        division: solo.rank,
        lp: solo.leaguePoints,
        wins: solo.wins,
        losses: solo.losses,
      });
    }
  }

  const { data: existing } = await supabase.from("matches").select("match_id").eq("puuid", puuid);
  const known = new Set((existing ?? []).map((m) => m.match_id));

  const matchIds = await getMatchIdsByPuuid(puuid, 20);
  for (const matchId of matchIds) {
    if (known.has(matchId)) continue;

    const match = await getMatchById(matchId);
    const me = match.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;

    const teammates = match.info.participants.filter((p) => p.teamId === me.teamId);
    const teamDamage = teammates.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
    const teamKills = teammates.reduce((sum, p) => sum + p.kills, 0);
    const teamObjDamage = teammates.reduce((sum, p) => sum + p.damageDealtToObjectives, 0);
    const cs = me.totalMinionsKilled + me.neutralMinionsKilled;
    const durationMin = match.info.gameDuration / 60;

    // Runes travel in the same Match-V5 payload we already fetch — no extra Riot
    // call. Name lookup is Data Dragon (keyless); non-fatal if it fails, we just
    // store the match without rune names rather than losing the whole match.
    let primaryRune: string | null = null;
    let primaryStyle: string | null = null;
    let secondaryStyle: string | null = null;
    try {
      const primaryStyleEntry = me.perks.styles.find((s) => s.description === "primaryStyle");
      const subStyleEntry = me.perks.styles.find((s) => s.description === "subStyle");
      const keystoneId = primaryStyleEntry?.selections[0]?.perk;
      [primaryRune, primaryStyle, secondaryStyle] = await Promise.all([
        keystoneId != null ? runeNameById(keystoneId) : Promise.resolve(null),
        primaryStyleEntry ? runeNameById(primaryStyleEntry.style) : Promise.resolve(null),
        subStyleEntry ? runeNameById(subStyleEntry.style) : Promise.resolve(null),
      ]);
    } catch {
      // ignore — match still gets saved, just without rune names
    }

    // Riot computes these itself (challenges.*) — prefer them over our own
    // team-pool math when present, per your ask to replace duplicated logic.
    // Not guaranteed on every match (older games, edge cases), so fall back.
    const dmgShare =
      me.challenges?.teamDamagePercentage != null
        ? Number((me.challenges.teamDamagePercentage * 100).toFixed(1))
        : teamDamage > 0
          ? Number(((100 * me.totalDamageDealtToChampions) / teamDamage).toFixed(1))
          : 0;
    const killParticipation =
      me.challenges?.killParticipation != null
        ? Number((me.challenges.killParticipation * 100).toFixed(1))
        : teamKills > 0
          ? Number(((100 * (me.kills + me.assists)) / teamKills).toFixed(1))
          : 0;

    let summoner1: string | null = null;
    let summoner2: string | null = null;
    try {
      [summoner1, summoner2] = await Promise.all([
        summonerSpellNameById(me.summoner1Id),
        summonerSpellNameById(me.summoner2Id),
      ]);
    } catch {
      // ignore — match still gets saved, just without spell names
    }

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
      dmg_share: dmgShare,
      kill_participation: killParticipation,
      obj_share:
        teamObjDamage > 0 ? Number(((100 * me.damageDealtToObjectives) / teamObjDamage).toFixed(1)) : 0,
      primary_rune: primaryRune,
      primary_style: primaryStyle,
      secondary_style: secondaryStyle,
      double_kills: me.doubleKills,
      triple_kills: me.tripleKills,
      quadra_kills: me.quadraKills,
      penta_kills: me.pentaKills,
      champ_level: me.champLevel,
      damage_taken: me.totalDamageTaken,
      damage_mitigated: me.damageSelfMitigated,
      wards_placed: me.wardsPlaced,
      wards_killed: me.wardsKilled,
      control_wards: me.visionWardsBoughtInGame,
      turret_kills: me.turretKills,
      dragon_kills: me.dragonKills,
      baron_kills: me.baronKills,
      inhibitor_kills: me.inhibitorKills,
      first_blood: me.firstBloodKill || me.firstBloodAssist,
      first_tower: me.firstTowerKill || me.firstTowerAssist,
      summoner1,
      summoner2,
      solo_kills: me.challenges?.soloKills ?? null,
      skillshots_hit: me.challenges?.skillshotsHit ?? null,
      damage_per_min: me.challenges?.damagePerMinute != null ? Number(me.challenges.damagePerMinute.toFixed(1)) : null,
      team_position: me.teamPosition,
      game_duration_s: match.info.gameDuration,
      played_at: new Date(match.info.gameCreation).toISOString(),
    });
  }

  // Champion Mastery reflects Riot's whole-career view, not just what we've
  // stored — better "main champion" signal than counting our own match cache.
  // Non-fatal: if this or the Data Dragon name lookup fails, we keep whatever
  // main_champ was already there instead of failing the whole refresh.
  try {
    const [top] = await getTopChampionMasteries(puuid, 1);
    if (top) {
      const champName = await championNameById(top.championId);
      if (champName) {
        await supabase.from("summoners").update({ main_champ: champName }).eq("puuid", puuid);
      }
    }
  } catch {
    // ignore — main_champ falls back to lib/mock-data.ts's most-played-in-stored-matches logic
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
