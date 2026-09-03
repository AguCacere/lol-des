import type { getSupabaseServerClient } from "./supabase";
import {
  getLeagueEntriesByPuuid,
  getMatchById,
  getMatchIdsByPuuid,
  getMatchTimeline,
  getSummonerByPuuid,
  getTopChampionMasteries,
  type RiotLeagueEntry,
} from "./riot";
import { championNameById, runeNameById, summonerSpellNameById } from "./ddragon";
import { extractTimelineStats } from "./timeline";
import { sendDiscordNotification } from "./discord";
import { tierFor } from "./ladder";
import { divisionFromRiot, tierKeyFromRiot } from "./mapping";

type SupabaseClient = ReturnType<typeof getSupabaseServerClient>;

/** Minimum time between Riot API pulls for the same summoner via the manual POST /api/refresh (no UI button — the cron every ~15min is what actually keeps the ladder fresh, see app/api/cron/refresh/route.ts). */
export const MANUAL_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

export const RANKED_SOLO_QUEUE_ID = 420;
/** Match-V5 queueId for Clash — see lib/clash.ts for how these get grouped into "tournaments" once stored. */
export const CLASH_QUEUE_ID = 700;
/** Below this, a win/loss streak doesn't get a Discord ping — see checkStreakAndNotify. */
const STREAK_NOTIFY_THRESHOLD = 3;

/** "Nombre#TAG" for a puuid — only looked up on the rare path that's actually about to send a Discord message, not on every refresh. */
async function summonerLabel(supabase: SupabaseClient, puuid: string): Promise<string | null> {
  const { data } = await supabase.from("summoners").select("game_name, tag_line").eq("puuid", puuid).maybeSingle();
  return data ? `${data.game_name}#${data.tag_line}` : null;
}

/**
 * Higher = better rank. Tier order (Iron..Master, see tierFor's TIERS table)
 * dominates; division only breaks ties WITHIN a tier, and lower division
 * number is better (I beats IV) so it's subtracted rather than added.
 * Deliberately ignores LP — going up LP within the same division is normal
 * progress already visible in the profile's own chart, not a "subiste de
 * rango" moment worth a Discord ping.
 */
function rankOrdinal(tier: string, rank: string): number {
  return tierFor(tierKeyFromRiot(tier)).rank * 10 - divisionFromRiot(rank);
}

async function notifyPromotion(supabase: SupabaseClient, puuid: string, entry: RiotLeagueEntry) {
  const label = await summonerLabel(supabase, puuid);
  if (!label) return;
  const t = tierFor(tierKeyFromRiot(entry.tier));
  const division = divisionFromRiot(entry.rank);
  await sendDiscordNotification(`📈 **${label}** subió a **${t.name} ${division}**!`);
}

/** Only for a genuine LEAGUE drop (e.g. Esmeralda → Platino) — a division drop within the same tier (Platino 2 → Platino 3) never calls this, see the tier-rank-only check in upsertRankSnapshot. */
async function notifyDemotion(supabase: SupabaseClient, puuid: string, entry: RiotLeagueEntry) {
  const label = await summonerLabel(supabase, puuid);
  if (!label) return;
  const t = tierFor(tierKeyFromRiot(entry.tier));
  const division = divisionFromRiot(entry.rank);
  await sendDiscordNotification(`😭 **${label}** bajó a **${t.name} ${division}**...`);
}

/**
 * Fires once per refresh cycle (not once per newly-inserted match — with
 * several new ranked games in one cycle that would send one message per
 * game, each describing an earlier/smaller streak than the last, out of
 * order) — call after every new ranked match for this puuid is already
 * stored. Reads the last 20 ranked matches back from the DB (not Riot) so
 * this reflects the exact same data currentStreak() in lib/ladder.ts would
 * compute from player.matches, just server-side.
 */
async function checkStreakAndNotify(supabase: SupabaseClient, puuid: string) {
  const { data: recent } = await supabase
    .from("matches")
    .select("win")
    .eq("puuid", puuid)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    .order("played_at", { ascending: false })
    .limit(20);
  if (!recent || recent.length < STREAK_NOTIFY_THRESHOLD) return;

  const result = recent[0].win;
  let count = 0;
  for (const m of recent) {
    if (m.win !== result) break;
    count++;
  }
  if (count < STREAK_NOTIFY_THRESHOLD) return;

  const label = await summonerLabel(supabase, puuid);
  if (!label) return;
  const emoji = result ? "🔥" : "💀";
  const word = result ? "victorias" : "derrotas";
  await sendDiscordNotification(`${emoji} **${label}** está en racha de **${count} ${word}** seguidas.`);
}

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
    // Solo queue only — Flex promotions aren't what "subiste de rango" means
    // for this group (the whole app treats RANKED_SOLO_5x5 as the main
    // ladder). Promotion needs a real tier/division improvement (never a
    // same-division LP change). Demotion is stricter still — TIER only
    // (Esmeralda → Platino), never a division drop within the same tier
    // (Platino 2 → Platino 3, still Platino, not worth a ping) — compares
    // tierFor(...).rank directly instead of the combined rankOrdinal, which
    // conflates tier and division and would fire on both.
    if (lastSnapshot && queueType === "RANKED_SOLO_5x5") {
      const oldTierRank = tierFor(tierKeyFromRiot(lastSnapshot.tier)).rank;
      const newTierRank = tierFor(tierKeyFromRiot(entry.tier)).rank;
      if (rankOrdinal(entry.tier, entry.rank) > rankOrdinal(lastSnapshot.tier, lastSnapshot.division)) {
        await notifyPromotion(supabase, puuid, entry);
      } else if (newTierRank < oldTierRank) {
        await notifyDemotion(supabase, puuid, entry);
      }
    }
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

/**
 * Fetches full detail + timeline for one matchId and inserts it into
 * `matches`. Shared by refreshOne (last 20 ids, every ~15min) and
 * backfillOne (much deeper one-time history pull) — the actual
 * fetch/parse/insert logic is identical either way, only how the caller
 * gets its list of matchIds differs. Returns a warning string if the match
 * itself couldn't be fetched (transient Riot hiccup — non-fatal, caller just
 * skips it and tries again next time), or null on success.
 */
async function fetchAndStoreMatch(supabase: SupabaseClient, puuid: string, matchId: string): Promise<string | null> {
  let match: Awaited<ReturnType<typeof getMatchById>>;
  try {
    match = await getMatchById(matchId);
  } catch (err) {
    // Riot sometimes lists a match id (via the ids endpoint) slightly before
    // the full match detail is actually fetchable — a transient 404/5xx here
    // used to blow up the WHOLE refresh for this player (no try/catch), which
    // meant every later matchId, champion mastery, and the profile icon never
    // ran either. Worse: since the match never got marked known, the NEXT
    // cron cycle hit the exact same not-yet-ready match first and failed
    // identically — a brand-new match could get stuck failing forever
    // instead of just needing one more cron tick once Riot caught up.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`fetchAndStoreMatch(${puuid}): match ${matchId} fetch failed —`, message);
    return `match ${matchId}: ${message}`;
  }
  const me = match.info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;

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

  // The lane opponent is in the match payload we ALREADY have — same
  // teamPosition, other team. Deliberately hoisted out of the timeline
  // try/catch below: it costs no extra call, so a timeline failure (they do
  // happen — see the 403 that silently emptied item_build for weeks) must
  // not also cost us the matchup. Null when Riot didn't resolve a position
  // (remakes, odd queues) or nobody matched it.
  const enemy =
    match.info.participants.find(
      (p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition && me.teamPosition !== ""
    ) ?? null;

  // Timeline is a separate, second Match-V5 call per match — gold diff vs.
  // the enemy in the same lane (teamPosition) at 10/15/20 min, plus first
  // blood/tower timing. Non-fatal: an older match or a transient failure
  // here shouldn't lose the rest of the match's real-time stats above.
  let timelineStats: Awaited<ReturnType<typeof extractTimelineStats>> | null = null;
  try {
    const timeline = await getMatchTimeline(matchId);
    timelineStats = extractTimelineStats(
      timeline,
      me.participantId,
      enemy?.participantId ?? null,
      match.info.gameDuration,
      me.teamId
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
    turret_takedowns: me.challenges?.turretTakedowns ?? 0,
    dragon_takedowns: me.challenges?.dragonTakedowns ?? 0,
    baron_takedowns: me.challenges?.baronTakedowns ?? 0,
    herald_takedowns: me.challenges?.riftHeraldTakedowns ?? 0,
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
    first_tower_mine: timelineStats?.firstTowerMine ?? null,
    first_dragon_time_s: timelineStats?.firstDragonTimeS ?? null,
    first_dragon_mine: timelineStats?.firstDragonMine ?? null,
    first_baron_time_s: timelineStats?.firstBaronTimeS ?? null,
    first_baron_mine: timelineStats?.firstBaronMine ?? null,
    dragon_types: timelineStats?.dragonTypes ?? [],
    item_build: timelineStats?.itemBuild ?? [],
    team_position: me.teamPosition,
    opponent_champion: enemy?.championName ?? null,
    queue_id: match.info.queueId,
    game_duration_s: match.info.gameDuration,
    played_at: new Date(match.info.gameCreation).toISOString(),
  });
  // Fail loud instead of silently dropping the match — if this is a schema
  // mismatch (e.g. a migration that hasn't run yet), every remaining
  // matchId in the caller's loop would fail identically anyway, so stop here
  // rather than silently losing all of them one by one.
  if (insertError) throw new Error(`No se pudo guardar match_id=${matchId}: ${insertError.message}`);
  return null;
}

/** Pulls fresh LP + new ranked matches for one summoner and appends them to Supabase. Returns non-fatal warnings from steps that failed without aborting the refresh (so callers/logs can see WHY, instead of a silent no-op). */
export async function refreshOne(supabase: SupabaseClient, puuid: string): Promise<string[]> {
  const warnings: string[] = [];
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
  let newRankedMatches = false;
  for (const matchId of matchIds) {
    if (known.has(matchId)) continue;
    const warning = await fetchAndStoreMatch(supabase, puuid, matchId);
    if (warning) warnings.push(warning);
    else newRankedMatches = true;
  }
  // Once per refresh cycle, after everything new is already stored — not
  // once per match inside the loop above, which (with several new ranked
  // games in the same cycle) would fire one Discord message per game, each
  // describing an earlier/smaller streak than the one before it.
  if (newRankedMatches) await checkStreakAndNotify(supabase, puuid);

  // Clash games are rare (a handful of days a year, at most), so this almost
  // always comes back empty — but checking the last 20 ids every ~15min
  // (same cost as one extra Riot call, no per-match cost unless something's
  // actually new) is what keeps "Clash" tab data current without needing its
  // own separate refresh trigger.
  const clashMatchIds = await getMatchIdsByPuuid(puuid, 20, 0, CLASH_QUEUE_ID);
  for (const matchId of clashMatchIds) {
    if (known.has(matchId)) continue;
    const warning = await fetchAndStoreMatch(supabase, puuid, matchId);
    if (warning) warnings.push(warning);
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
    // ignore — main_champ falls back to app/api/ladder/route.ts's most-played-in-stored-matches logic,
    // masteryPool just stays whatever it already was (or empty)
  }

  // Real Riot profile icon for the profile header avatar, instead of the
  // champion-initials placeholder — plus summonerLevel, which rides along in
  // the exact same Summoner-V4 response at no extra Riot cost. Non-fatal:
  // keep whatever was already stored (or none) if Summoner-V4 has a hiccup —
  // but surface WHY instead of swallowing it silently, since a silent failure
  // here looked from the outside like "the feature just doesn't work for this
  // player" with no way to tell a real error (rate limit, bad puuid) from
  // "not refreshed yet".
  try {
    const summoner = await getSummonerByPuuid(puuid);
    await supabase
      .from("summoners")
      .update({ profile_icon_id: summoner.profileIconId, summoner_level: summoner.summonerLevel })
      .eq("puuid", puuid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`profile icon: ${message}`);
    console.error(`refreshOne(${puuid}): profile icon fetch failed —`, message);
  }

  await supabase.from("summoners").update({ last_refreshed_at: new Date().toISOString() }).eq("puuid", puuid);
  return warnings;
}

/**
 * Runs `fn` over `items` with at most `limit` in flight at once — plain
 * worker-pool, no external dependency for something this small.
 */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// Riot caps `count` at 100 per Match-V5 ids request, so a deep pull needs
// several paginated calls (see backfillOne). Default max is 200 matches —
// comfortably finishes inside Vercel's maxDuration (2 Riot calls/match ×
// BACKFILL_CONCURRENCY in flight), while already being 10x the normal
// per-refresh window (20). Callers can ask for more via backfillOne's
// `maxMatches` param, up to BACKFILL_HARD_CAP, if 200 isn't enough to clear
// a champion's 50-game leaderboard threshold.
const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_DEFAULT_MAX = 200;
const BACKFILL_HARD_CAP = 1000;
const BACKFILL_CONCURRENCY = 3;
// Clash history is inherently small (a handful of tournament days a year, a
// few games each) — no reason to expose a tunable cap for it like ranked's
// maxMatches, 300 comfortably covers a summoner's entire Clash lifetime.
const CLASH_BACKFILL_MAX = 300;

export interface BackfillResult {
  fetched: number;
  alreadyKnown: number;
  warnings: string[];
}

/** Paginates Match-V5 ids for one queue, then fetches+stores whichever aren't already in `known`. Shared by the ranked and Clash passes of backfillOne — only the queue id and how far to page differ. */
async function backfillQueue(
  supabase: SupabaseClient,
  puuid: string,
  queue: number,
  maxMatches: number,
  known: Set<string>
): Promise<{ found: number; fetched: number; warnings: string[] }> {
  const allIds: string[] = [];
  let start = 0;
  while (allIds.length < maxMatches) {
    const page = await getMatchIdsByPuuid(puuid, BACKFILL_PAGE_SIZE, start, queue);
    if (page.length === 0) break;
    allIds.push(...page);
    if (page.length < BACKFILL_PAGE_SIZE) break; // Riot ran out of history to give us for this queue
    start += BACKFILL_PAGE_SIZE;
  }

  const toFetch = allIds.slice(0, maxMatches).filter((id) => !known.has(id));
  const warnings: string[] = [];
  await mapWithConcurrency(toFetch, BACKFILL_CONCURRENCY, async (matchId) => {
    const warning = await fetchAndStoreMatch(supabase, puuid, matchId);
    if (warning) warnings.push(warning);
  });

  return { found: allIds.length, fetched: toFetch.length - warnings.length, warnings };
}

/**
 * One-time deep pull of a summoner's ranked AND Clash match history, well
 * beyond the last-20-per-refresh window refreshOne normally keeps up with.
 * Ranked matters for champion-specific stats (see "Mayor winrate por
 * campeón" in Estadísticas) — Riot has no endpoint that hands back win/loss
 * by champion, so the only way to get there faster is to pull more history
 * ourselves. Clash matters for the "Clash" tab's tournament history — the
 * `refreshOne` cron only catches NEW Clash games going forward, this is what
 * backfills everything that happened before this feature existed.
 * Idempotent: already-known match_ids are skipped before ever hitting Riot
 * for them, so calling this again just tops up whatever's newly in range.
 */
export async function backfillOne(
  supabase: SupabaseClient,
  puuid: string,
  maxMatches = BACKFILL_DEFAULT_MAX
): Promise<BackfillResult> {
  const cappedMax = Math.min(maxMatches, BACKFILL_HARD_CAP);

  const { data: existing, error: existingError } = await supabase
    .from("matches")
    .select("match_id")
    .eq("puuid", puuid);
  if (existingError) throw new Error(`No se pudo leer matches existentes: ${existingError.message}`);
  const known = new Set((existing ?? []).map((m) => m.match_id));

  const ranked = await backfillQueue(supabase, puuid, RANKED_SOLO_QUEUE_ID, cappedMax, known);
  const clash = await backfillQueue(supabase, puuid, CLASH_QUEUE_ID, CLASH_BACKFILL_MAX, known);

  return {
    fetched: ranked.fetched + clash.fetched,
    alreadyKnown: ranked.found - ranked.fetched + (clash.found - clash.fetched),
    warnings: [...ranked.warnings, ...clash.warnings],
  };
}

// How many summoners refreshOne() runs for at once. One-at-a-time used to
// mean a group of even 8-10 people could blow past Vercel's function time
// limit (each summoner does several sequential Riot calls of its own) and
// get hard-killed mid-run — the killed function never gets to send its own
// JSON error, so the client saw Vercel's own "An error occurred..." HTML
// instead. A personal Riot API key's rate limit (roughly 20 req/s, 100 per
// 2 min) has plenty of headroom for a handful of summoners' calls
// overlapping — this is a wall-clock fix, not a rate-limit workaround.
const REFRESH_CONCURRENCY = 4;

/**
 * Refreshes every tracked summoner. With `onlyStale`, skips anyone refreshed
 * more recently than MANUAL_REFRESH_COOLDOWN_MS — used by the manual
 * POST /api/refresh so repeated calls (or several friends triggering it at
 * once) can't burn through the personal API key's rate limit.
 */
export async function refreshAllSummoners(
  supabase: SupabaseClient,
  { onlyStale = false }: { onlyStale?: boolean } = {}
): Promise<Record<string, string>> {
  const { data: summoners, error } = await supabase.from("summoners").select("puuid, last_refreshed_at");
  if (error) throw new Error(error.message);

  const now = Date.now();
  const results: Record<string, string> = {};

  const toRefresh = (summoners ?? []).filter((summoner) => {
    if (onlyStale && summoner.last_refreshed_at) {
      const age = now - new Date(summoner.last_refreshed_at).getTime();
      if (age < MANUAL_REFRESH_COOLDOWN_MS) {
        results[summoner.puuid] = "skipped (cooldown)";
        return false;
      }
    }
    return true;
  });

  await mapWithConcurrency(toRefresh, REFRESH_CONCURRENCY, async (summoner) => {
    try {
      const warnings = await refreshOne(supabase, summoner.puuid);
      results[summoner.puuid] = warnings.length > 0 ? `ok (${warnings.join("; ")})` : "ok";
    } catch (err) {
      results[summoner.puuid] = err instanceof Error ? err.message : "error";
    }
  });

  return results;
}
