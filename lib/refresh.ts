import type { getSupabaseServerClient } from "./supabase";
import {
  getLeagueEntriesByPuuid,
  getMatchById,
  getMatchIdsByPuuid,
  getMatchTimeline,
  getTopChampionMasteries,
  type RiotLeagueEntry,
} from "./riot";
import { championNameById, runeNameById, summonerSpellNameById } from "./ddragon";
import { extractTimelineStats } from "./timeline";

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>;

/** Minimum time between Riot API pulls for the same summoner via the manual "Actualizar ahora" button. */
export const MANUAL_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * Inserts a new lp_snapshots row for one queue (SoloQ or Flex) — but only
 * when something actually changed since that queue's last snapshot.
 * Otherwise repeated refreshes (cron + manual clicks) with no new games pile
 * up identical rows, and since the chart plots the last N snapshots, those
 * duplicates crowd out real history and flatten the whole trend into a long
 * plateau. Scoped to `queueType` on both the dedup check and the insert —
 * mixing SoloQ and Flex rows together here would corrupt both queues' history.
 */
async function upsertRankSnapshot(supabase: SupabaseClient, puuid: string, entry: RiotLeagueEntry, queueType: string) {
  const { data: lastSnapshot } = await supabase
    .from("lp_snapshots")
    .select("tier, division, lp, wins, losses")
    .eq("puuid", puuid)
    .eq("queue_type", queueType)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const unchanged =
    lastSnapshot &&
    lastSnapshot.tier === entry.tier &&
    lastSnapshot.division === entry.rank &&
    lastSnapshot.lp === entry.leaguePoints &&
    lastSnapshot.wins === entry.wins &&
    lastSnapshot.losses === entry.losses;

  if (!unchanged) {
    await supabase.from("lp_snapshots").insert({
      puuid,
      queue_type: queueType,
      tier: entry.tier,
      division: entry.rank,
      lp: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
    });
  }
}

/** Pulls fresh LP + new ranked matches for one summoner and appends them to Supabase. */
export async function refreshOne(supabase: SupabaseClient, puuid: string) {
  const entries = await getLeagueEntriesByPuuid(puuid);
  const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  if (solo) await upsertRankSnapshot(supabase, puuid, solo, "RANKED_SOLO_5x5");
  const flex = entries.find((e) => e.queueType === "RANKED_FLEX_SR");
  if (flex) await upsertRankSnapshot(supabase, puuid, flex, "RANKED_FLEX_SR");

  const { data: existing, error: existingError } = await supabase
    .from("matches")
    .select("match_id")
    .eq("puuid", puuid);
  // Don't silently treat a failed read as "no matches known yet" — that would
  // make refreshOne try to re-insert matches we already have, which fails on
  // the match_id primary key and masks the real problem.
  if (existingError) throw new Error(`No se pudo leer matches existentes: ${existingError.message}`);
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

    // Timeline is a separate, second Match-V5 call per match — gold diff vs.
    // the enemy in the same lane (teamPosition) at 10/15/20 min, plus first
    // blood/tower timing. Non-fatal: an older match or a transient failure
    // here shouldn't lose the rest of the match's real-time stats above.
    let timelineStats: Awaited<ReturnType<typeof extractTimelineStats>> | null = null;
    try {
      const enemy = match.info.participants.find(
        (p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition && me.teamPosition !== ""
      );
      const timeline = await getMatchTimeline(matchId);
      timelineStats = extractTimelineStats(
        timeline,
        me.participantId,
        enemy?.participantId ?? null,
        match.info.gameDuration
      );
    } catch {
      // ignore — match still gets saved, just without timeline-derived stats
    }

    const { error: insertError } = await supabase.from("matches").insert({
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
      gold_diff_10: timelineStats?.goldDiff10 ?? null,
      gold_diff_15: timelineStats?.goldDiff15 ?? null,
      gold_diff_20: timelineStats?.goldDiff20 ?? null,
      first_blood_time_s: timelineStats?.firstBloodTimeS ?? null,
      first_tower_time_s: timelineStats?.firstTowerTimeS ?? null,
      dragon_types: timelineStats?.dragonTypes ?? [],
      team_position: me.teamPosition,
      game_duration_s: match.info.gameDuration,
      played_at: new Date(match.info.gameCreation).toISOString(),
    });
    // Fail loud instead of silently dropping the match — if this is a schema
    // mismatch (e.g. a migration that hasn't run yet), every remaining
    // matchId in this loop would fail identically anyway, so stop here
    // rather than silently losing all of them one by one.
    if (insertError) throw new Error(`No se pudo guardar match_id=${matchId}: ${insertError.message}`);
  }

  // Champion Mastery reflects Riot's whole-career view, not just what we've
  // stored — better "main champion" signal than counting our own match cache,
  // and also feeds the "Maestría de campeón" pool (top 5). Non-fatal: if this
  // or the Data Dragon name lookup fails, we keep whatever main_champ/pool
  // was already there instead of failing the whole refresh.
  try {
    const top5 = await getTopChampionMasteries(puuid, 5);
    const resolved = await Promise.all(
      top5.map(async (m) => ({ ...m, name: await championNameById(m.championId) }))
    );

    if (resolved[0]?.name) {
      await supabase.from("summoners").update({ main_champ: resolved[0].name }).eq("puuid", puuid);
    }

    // Replace-not-upsert: a champion that fell out of the top 5 this refresh
    // (someone else's points overtook it) shouldn't linger as a stale row.
    await supabase.from("champion_mastery").delete().eq("puuid", puuid);
    const rows = resolved
      .filter((m): m is typeof m & { name: string } => m.name != null)
      .map((m) => ({
        puuid,
        champion_id: m.championId,
        champion: m.name,
        level: m.championLevel,
        points: m.championPoints,
      }));
    if (rows.length > 0) {
      await supabase.from("champion_mastery").insert(rows);
    }
  } catch {
    // ignore — main_champ falls back to lib/mock-data.ts's most-played-in-stored-matches logic,
    // masteryPool just stays whatever it already was (or empty)
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
