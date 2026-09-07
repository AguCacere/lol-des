import { NextResponse } from "next/server";
import { detectTilt } from "@/lib/tilt";
import { itemMap } from "@/lib/ddragon";
import { agruparCompra, computeBuildStats, recorridoCore, type BuildSample } from "@/lib/builds";
import { getSupabaseServerClient } from "@/lib/supabase";
import { peakFromHistory, ROLES, tierScore } from "@/lib/ladder";
import { divisionFromRiot, normalizeRole, roleFromTeamPosition, tierKeyFromRiot } from "@/lib/mapping";
import { historialDeLineas, type PartidaConLinea } from "@/lib/lineas";
import { getLiveGamesByPuuid } from "@/lib/live";
import { getLatestVersion, profileIconUrl, runeIconUrlByName, summonerSpellIconUrlByName } from "@/lib/ddragon";
import { RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import { computeAegisStats } from "@/lib/aegis";
import { computeRecentForm, type FormSample } from "@/lib/form";
import { computeRadar, metricasPropias, RADAR_METRICS, type MetricStats, type RadarMetric } from "@/lib/radar";
import { computeMatchups, type MatchupSample } from "@/lib/matchups";
import { computeChampionInsights } from "@/lib/champion-insights";
import { computeMatchFlag, STATS_WINDOW_SIZE, type StatSample } from "@/lib/matchflags";
import type { AegisStats, ChampionLeaderboardEntry, ChampionPoolEntry, DuoPair, DuoSharedMatch, FlexRank, LpHistoryPoint, MasteryEntry, Match, PersonalRecords, Player, RoleAverages, RoleKey } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LadderRow {
  puuid: string;
  game_name: string;
  tag_line: string;
  role: string | null;
  main_champ: string | null;
  is_you: boolean;
  profile_icon_id: number | null;
  summoner_level: number | null;
  last_refreshed_at: string | null;
  tier: string | null;
  division: string | null;
  lp: number | null;
  wins: number | null;
  losses: number | null;
}

interface MatchRow {
  match_id: string;
  puuid: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  cs_per_min: number;
  dmg_share: number | null;
  damage_to_champs: number;
  gold_earned: number;
  vision_score: number;
  kill_participation: number | null;
  obj_share: number | null;
  primary_rune: string | null;
  primary_style: string | null;
  secondary_style: string | null;
  double_kills: number | null;
  triple_kills: number | null;
  quadra_kills: number | null;
  penta_kills: number | null;
  champ_level: number | null;
  damage_taken: number | null;
  damage_mitigated: number | null;
  heal_teammates: number | null;
  shield_teammates: number | null;
  wards_placed: number | null;
  wards_killed: number | null;
  control_wards: number | null;
  turret_takedowns: number | null;
  dragon_takedowns: number | null;
  dragon_types: string[] | null;
  item_build: number[] | null;
  baron_takedowns: number | null;
  herald_takedowns: number | null;
  inhibitor_kills: number | null;
  first_blood: boolean | null;
  first_tower: boolean | null;
  summoner1: string | null;
  summoner2: string | null;
  solo_kills: number | null;
  skillshots_hit: number | null;
  damage_per_min: number | null;
  gold_diff_10: number | null;
  gold_diff_15: number | null;
  gold_diff_20: number | null;
  first_blood_time_s: number | null;
  first_tower_time_s: number | null;
  first_tower_mine: boolean | null;
  first_dragon_time_s: number | null;
  first_dragon_mine: boolean | null;
  first_baron_time_s: number | null;
  first_baron_mine: boolean | null;
  team_position: string | null;
  opponent_champion: string | null;
  game_duration_s: number;
  played_at: string;
}

/**
 * Cuántos CAMPEONES propios se mandan con sus enfrentamientos. Van ordenados
 * por cantidad de partidas, así que cortar acá deja afuera los campeones de
 * los que menos sabemos — justo los que menos hay que mostrar. Ahora que
 * cada uno colapsa a una fila, entran más que cuando era una lista plana.
 */
const MATCHUPS_SHOWN = 8;

/**
 * GET /api/ladder — reads the `ladder` view (summoners joined with their
 * latest lp_snapshots row, see supabase/schema.sql) plus the last 20 LP
 * snapshots (for the spark chart) and last 5 matches per summoner.
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: ladderRows, error: ladderError } = await supabase
    .from("ladder")
    .select("*")
    .returns<LadderRow[]>();

  if (ladderError) {
    return NextResponse.json({ error: ladderError.message }, { status: 500 });
  }

  const puuids = (ladderRows ?? []).map((r) => r.puuid);
  if (puuids.length === 0) {
    return NextResponse.json({ players: [], duoSynergy: [], championLeaderboard: [] });
  }

  const dbQueries = Promise.all([
    supabase
      .from("lp_snapshots")
      .select("puuid, lp, captured_at, tier, division, wins, losses, queue_type")
      .in("puuid", puuids)
      .order("captured_at", { ascending: true }),
    supabase
      .from("matches")
      .select(
        "match_id, puuid, champion, win, kills, deaths, assists, cs, cs_per_min, dmg_share, damage_to_champs, gold_earned, vision_score, kill_participation, obj_share, primary_rune, primary_style, secondary_style, double_kills, triple_kills, quadra_kills, penta_kills, champ_level, damage_taken, damage_mitigated, heal_teammates, shield_teammates, wards_placed, wards_killed, control_wards, turret_takedowns, dragon_takedowns, dragon_types, item_build, baron_takedowns, herald_takedowns, inhibitor_kills, first_blood, first_tower, summoner1, summoner2, solo_kills, skillshots_hit, damage_per_min, gold_diff_10, gold_diff_15, gold_diff_20, first_blood_time_s, first_tower_time_s, first_tower_mine, first_dragon_time_s, first_dragon_mine, first_baron_time_s, first_baron_mine, team_position, opponent_champion, game_duration_s, played_at"
      )
      .in("puuid", puuids)
      // Ranked solo/duo only — this table also holds Clash games (queueId
      // 700, see lib/clash.ts's own separate query), which used to leak into
      // every stat computed below (champion pool, personal records, role
      // averages, duo synergy) since this query never filtered by queue_id
      // at all. Clash has its own dedicated tab; mixing a 5-stack premade's
      // numbers into "partida más larga"/"mejor KDA"/etc. was silently
      // comparing two different populations.
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .order("played_at", { ascending: false })
      .returns<MatchRow[]>(),
    supabase
      .from("champion_mastery")
      .select("puuid, champion, level, points")
      .in("puuid", puuids)
      .order("points", { ascending: false }),
  ]);

  // Spectator V5 — checked live, right now, not read from the DB (a cron-batched
  // "in game" status would be stale garbage by the next scheduled refresh). Runs
  // concurrently with the DB queries above so it doesn't add its own latency on
  // top. Same helper backs /api/live, the lighter poll target app/page.tsx uses
  // every 60s so a full ladder reload isn't needed just to catch someone
  // starting a game.
  const activeGames = getLiveGamesByPuuid(puuids);

  // Resolved here (in parallel with everything above) instead of right
  // before it's first used — the matches loop below needs it too now, for
  // rune/summoner-spell icon URLs, and that runs well before the point this
  // used to be declared at.
  const ddragonVersionPromise = getLatestVersion();
  // El mapa de ítems (nombres + cuáles son "core") para el recorrido de build
  // y las estadísticas de arranque. Si Data Dragon falla se sigue sin eso: es
  // una sección del perfil, no el ladder.
  const itemsPromise = itemMap().catch(() => new Map());

  const [
    [
      { data: snapshots, error: snapshotsError },
      { data: matchRows, error: matchesError },
      { data: masteryRows, error: masteryError },
    ],
    liveGameByPuuid,
    ddragonVersion,
    items,
  ] = await Promise.all([dbQueries, activeGames, ddragonVersionPromise, itemsPromise]);
  const esCore = (id: number) => items.get(id)?.core ?? false;
  const nombreDeItem = (id: number) => items.get(id)?.name ?? `Ítem ${id}`;

  // A query error here (e.g. a migration that hasn't run yet — missing
  // column/table) must NOT be treated the same as "no rows" — silently
  // falling back to an empty array made a broken query look identical to an
  // empty ladder, which is exactly what happened: matches "disappearing"
  // was actually the `matches` select failing because gold_diff_* columns
  // didn't exist yet, and nobody surfaced the error.
  const dbError = snapshotsError ?? matchesError ?? masteryError;
  if (dbError) {
    return NextResponse.json({ error: `Error leyendo datos de Supabase: ${dbError.message}` }, { status: 500 });
  }

  const masteryPoolByPuuid = new Map<string, MasteryEntry[]>();
  for (const row of masteryRows ?? []) {
    const arr = masteryPoolByPuuid.get(row.puuid) ?? [];
    arr.push({ champ: row.champion, level: row.level, points: row.points });
    masteryPoolByPuuid.set(row.puuid, arr);
  }

  const lpHistoryByPuuid = new Map<string, LpHistoryPoint[]>();
  // Snapshots come ordered captured_at ascending, so the last .set() for a
  // puuid here is always its most recent Flex snapshot — no separate query.
  const flexByPuuid = new Map<string, FlexRank>();
  for (const row of snapshots ?? []) {
    if (row.queue_type === "RANKED_FLEX_SR") {
      flexByPuuid.set(row.puuid, {
        tier: tierKeyFromRiot(row.tier),
        division: divisionFromRiot(row.division),
        lp: row.lp,
        wins: row.wins,
        losses: row.losses,
      });
      continue;
    }

    const history = lpHistoryByPuuid.get(row.puuid) ?? [];
    history.push({
      lp: row.lp,
      capturedAt: row.captured_at,
      tier: tierKeyFromRiot(row.tier),
      division: divisionFromRiot(row.division),
      wins: row.wins,
      losses: row.losses,
    });
    lpHistoryByPuuid.set(row.puuid, history);
  }

  const matchesByPuuid = new Map<string, Match[]>();
  const buildSamplesByPuuid = new Map<string, BuildSample[]>();
  // Campeón propio vs. campeón del rival de línea, sobre TODO el historial
  // (no solo las últimas 5 mostradas) — ver lib/matchups.ts.
  const matchupSamplesByPuuid = new Map<string, MatchupSample[]>();
  // Every ranked match this player has stored, built straight from matchRows
  // (already queue_id=420-only per the query above) since the two consumers
  // need the FULL history, not just the last 5 kept in matchesByPuuid:
  // computeAegisStats (lib/aegis.ts) reads playedAt/win, computeRecentForm
  // (lib/form.ts) reads the per-match stats. Una sola lista para los dos —
  // recorrer matchRows otra vez para armar un segundo mapa idéntico no
  // agregaba nada.
  const rankedMatchesByPuuid = new Map<string, (FormSample & { playedAt: string })[]>();
  // This player's own last STATS_WINDOW_SIZE matches (cs/min, vision/min,
  // kda) — the baseline "para repasar" flags each match against, see
  // lib/matchflags.ts. Own recent form, not the role average used elsewhere.
  const statsWindowByPuuid = new Map<string, StatSample[]>();
  // Champion / role frequency across ALL stored matches (not just the last 5
  // shown) — used as the "most played" fallback when main_champ/role aren't
  // set manually. `summoners.role` has no UI to set it yet, so in practice
  // this IS the role source — team_position comes straight from Riot.
  const champFreqByPuuid = new Map<string, Map<string, number>>();
  const roleFreqByPuuid = new Map<string, Map<RoleKey, number>>();
  /** Cada partida con línea resuelta, más nueva primero — la entrada de historialDeLineas. */
  const partidasConLineaByPuuid = new Map<string, PartidaConLinea[]>();
  // Per-ROLE totals (kda/cs/dmg/killPart/objShare), tagged by each match's OWN
  // real team_position — not by any player's single declared/majority role.
  // `roleAggByRole` pools every tracked player's matches actually played in
  // that role; `roleAggByPuuid` mirrors the same per player, so a given
  // player's own contribution can be subtracted out of the group total to
  // get a fair "everyone else" comparison (see roleAveragesFor below). This
  // is what makes role comparisons work for someone who rotates roles
  // constantly — the pool is every REAL game in that role from the whole
  // group, not just players whose overall role also happens to match.
  //
  // Se acumula por MÉTRICA y no con un solo `count` global porque no toda
  // partida tiene todas: kill_participation y obj_share nacieron con
  // `not null default 0` y sin backfill (ver el ALTER de a336cae), así que
  // ~130 partidas viejas traen un 0 que nunca se midió. Contarlas hundía el
  // promedio del rol de esas dos métricas. Con un n propio por métrica, esas
  // partidas simplemente no aportan al eje que no tienen y sí a los demás.
  //
  // Y además de la suma se guarda la suma de cuadrados: el radar necesita el
  // desvío estándar del rol, no solo el promedio (ver lib/radar.ts), y sale
  // de la misma pasada sin recorrer las partidas otra vez.
  type RoleAgg = Record<RadarMetric, { n: number; sum: number; sumSq: number }>;
  function emptyRoleAgg(): RoleAgg {
    return Object.fromEntries(RADAR_METRICS.map((k) => [k, { n: 0, sum: 0, sumSq: 0 }])) as RoleAgg;
  }
  /**
   * Los siete números de UNA partida, o null en la métrica que esa partida no
   * tenga.
   *
   * Sobre los ceros: hay columnas que se agregaron con `not null default 0` y
   * nunca se rellenaron hacia atrás, así que un 0 puede significar "no hay
   * dato" en vez de cero de verdad. Descartar TODOS los ceros sesga al revés
   * —se pierden los ceros reales—, así que donde se puede se distingue con
   * otra columna de la misma fila:
   *
   * - participación en kills: si el jugador tuvo alguna kill o asistencia, su
   *   participación no puede ser 0. Ahí el 0 es un dato faltante. Si no tuvo
   *   ninguna, el 0 es verdadero y cuenta.
   * - % de daño: si hizo daño a campeones, su porcentaje no puede ser 0.
   * - participación en objetivos: no guardamos el daño a objetivos por fila,
   *   así que acá no hay con qué distinguir y se descartan todos los ceros.
   */
  function radarMetricsOf(row: MatchRow): Record<RadarMetric, number | null> {
    const minutes = Math.max(1, row.game_duration_s / 60);
    const killPart = Number(row.kill_participation ?? 0);
    const objShare = Number(row.obj_share ?? 0);
    const dmgShare = Number(row.dmg_share ?? 0);
    const tuvoTakedowns = row.kills + row.assists > 0;
    return {
      kda: (row.kills + row.assists) / Math.max(1, row.deaths),
      killParticipation: killPart === 0 && tuvoTakedowns ? null : killPart,
      dmgShare: dmgShare === 0 && row.damage_to_champs > 0 ? null : dmgShare,
      objShare: objShare === 0 ? null : objShare,
      goldPerMin: row.gold_earned / minutes,
      csPerMin: Number(row.cs_per_min),
      visionPerMin: row.vision_score / minutes,
    };
  }
  const roleAggByRole = new Map<RoleKey, RoleAgg>();
  const roleAggByPuuid = new Map<string, Map<RoleKey, RoleAgg>>();
  function addRoleAgg(map: Map<RoleKey, RoleAgg>, role: RoleKey, row: MatchRow) {
    const agg = map.get(role) ?? emptyRoleAgg();
    const values = radarMetricsOf(row);
    for (const key of RADAR_METRICS) {
      const v = values[key];
      if (v === null || !Number.isFinite(v)) continue;
      agg[key].n += 1;
      agg[key].sum += v;
      agg[key].sumSq += v * v;
    }
    map.set(role, agg);
  }
  /** El resto del grupo en `role`: el total global menos lo que aportó este jugador, métrica por métrica. */
  function peerStatsFor(puuid: string, role: RoleKey): Partial<Record<RadarMetric, MetricStats>> {
    const global = roleAggByRole.get(role);
    if (!global) return {};
    const own = roleAggByPuuid.get(puuid)?.get(role);
    const out: Partial<Record<RadarMetric, MetricStats>> = {};
    for (const key of RADAR_METRICS) {
      const n = global[key].n - (own?.[key].n ?? 0);
      if (n <= 1) continue;
      const sum = global[key].sum - (own?.[key].sum ?? 0);
      const sumSq = global[key].sumSq - (own?.[key].sumSq ?? 0);
      const mean = sum / n;
      // Varianza poblacional a partir de sumas, con piso en 0: la resta de
      // acumuladores en punto flotante puede dar un negativo minúsculo
      // cuando la dispersión real es prácticamente nula, y Math.sqrt de eso
      // devuelve NaN, que se propagaría a todo el eje.
      out[key] = { n, mean, sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
    }
    return out;
  }
  /** Lo propio en `role`, en el mismo formato — el sd no se usa, pero sale gratis. */
  function ownStatsFor(puuid: string, role: RoleKey): Partial<Record<RadarMetric, MetricStats>> {
    const own = roleAggByPuuid.get(puuid)?.get(role);
    if (!own) return {};
    const out: Partial<Record<RadarMetric, MetricStats>> = {};
    for (const key of RADAR_METRICS) {
      const { n, sum, sumSq } = own[key];
      if (n <= 0) continue;
      const mean = sum / n;
      out[key] = { n, mean, sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
    }
    return out;
  }

  // Best/most-extreme single-game numbers across ALL stored matches — feeds
  // "Récords personales". matchRows arrives sorted played_at DESCENDING, so
  // a per-puuid subsequence pulled out of it (stable filter) stays in that
  // same chronological order — enough to track a running win streak
  // correctly without a separate sort (direction doesn't matter for "longest
  // run of consecutive wins", only true adjacency does).
  interface RecordsAgg {
    longestGameS: number;
    bestKda: number;
    bestKdaChamp: string;
    mostKills: number;
    mostDamage: number;
    mostCs: number;
    currentWinStreak: number;
    maxWinStreak: number;
  }
  const recordsByPuuid = new Map<string, RecordsAgg>();
  function trackRecords(row: MatchRow) {
    const rec = recordsByPuuid.get(row.puuid) ?? {
      longestGameS: 0,
      bestKda: -1,
      bestKdaChamp: "",
      mostKills: 0,
      mostDamage: 0,
      mostCs: 0,
      currentWinStreak: 0,
      maxWinStreak: 0,
    };
    if (row.game_duration_s > rec.longestGameS) rec.longestGameS = row.game_duration_s;
    const kda = (row.kills + row.assists) / Math.max(1, row.deaths);
    if (kda > rec.bestKda) {
      rec.bestKda = kda;
      rec.bestKdaChamp = row.champion;
    }
    if (row.kills > rec.mostKills) rec.mostKills = row.kills;
    if (row.damage_to_champs > rec.mostDamage) rec.mostDamage = row.damage_to_champs;
    if (row.cs > rec.mostCs) rec.mostCs = row.cs;
    if (row.win) {
      rec.currentWinStreak += 1;
      if (rec.currentWinStreak > rec.maxWinStreak) rec.maxWinStreak = rec.currentWinStreak;
    } else {
      rec.currentWinStreak = 0;
    }
    recordsByPuuid.set(row.puuid, rec);
  }

  // Per-champion win/loss + KDA totals across ALL stored matches — feeds the
  // "Campeones más jugados" card. Kept separate from champFreqByPuuid (which
  // only needs a count) since this also needs sums to average later.
  interface ChampAgg {
    games: number;
    wins: number;
    kSum: number;
    dSum: number;
    aSum: number;
    csMinSum: number;
  }
  const champStatsByPuuid = new Map<string, Map<string, ChampAgg>>();
  // Which tracked players showed up in each match_id, with their own win
  // result — feeds "Sinergia de dúo" below. No teamId needed: two tracked
  // players sharing a match_id are teammates iff their win result matches
  // (a match has exactly one winning side), opponents otherwise.
  const trackedByMatchId = new Map<
    string,
    {
      matchId: string;
      puuid: string;
      win: boolean;
      playedAt: string;
      role: RoleKey | null;
      champion: string;
      kills: number;
      deaths: number;
      assists: number;
      durationS: number;
    }[]
  >();
  for (const row of matchRows ?? []) {
    const tracked = trackedByMatchId.get(row.match_id) ?? [];
    tracked.push({
      matchId: row.match_id,
      puuid: row.puuid,
      win: row.win,
      playedAt: row.played_at,
      role: roleFromTeamPosition(row.team_position),
      champion: row.champion,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      durationS: row.game_duration_s,
    });
    trackedByMatchId.set(row.match_id, tracked);
    trackRecords(row);

    // Sobre todas las partidas y no solo las cinco que se muestran: la
    // estadística de arranques necesita la muestra entera para significar
    // algo.
    if (row.item_build && row.item_build.length > 0) {
      const muestras = buildSamplesByPuuid.get(row.puuid) ?? [];
      muestras.push({ champion: row.champion, win: row.win, itemBuild: row.item_build });
      buildSamplesByPuuid.set(row.puuid, muestras);
    }

    const matchupList = matchupSamplesByPuuid.get(row.puuid) ?? [];
    matchupList.push({
      champ: row.champion,
      opponent: row.opponent_champion,
      win: row.win,
      goldDiff15: row.gold_diff_15,
    });
    matchupSamplesByPuuid.set(row.puuid, matchupList);

    const rankedList = rankedMatchesByPuuid.get(row.puuid) ?? [];
    rankedList.push({
      playedAt: row.played_at,
      win: row.win,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      csPerMin: Number(row.cs_per_min),
      visionScore: row.vision_score,
      goldEarned: row.gold_earned,
      damageToChamps: row.damage_to_champs,
      killParticipation: row.kill_participation === null ? null : Number(row.kill_participation),
      durationS: row.game_duration_s,
    });
    rankedMatchesByPuuid.set(row.puuid, rankedList);

    // Same cap-while-iterating trick as matchesByPuuid below, just a bigger
    // window (25 vs. 5) — matchRows is globally played_at DESC, so a stable
    // per-puuid subsequence of it stays in that player's own DESC order.
    // MUST run before the `continue` a few lines down, or matches past the
    // 5th (most of this window) would never get collected.
    const statsWindow = statsWindowByPuuid.get(row.puuid) ?? [];
    if (statsWindow.length < STATS_WINDOW_SIZE) {
      statsWindow.push({
        csPerMin: Number(row.cs_per_min),
        visionPerMin: row.vision_score / Math.max(1, row.game_duration_s / 60),
        kda: (row.kills + row.assists) / Math.max(1, row.deaths),
      });
      statsWindowByPuuid.set(row.puuid, statsWindow);
    }

    const freq = champFreqByPuuid.get(row.puuid) ?? new Map<string, number>();
    freq.set(row.champion, (freq.get(row.champion) ?? 0) + 1);
    champFreqByPuuid.set(row.puuid, freq);

    const role = roleFromTeamPosition(row.team_position);
    if (role) {
      // Para el historial por línea. matchRows viene played_at DESC a nivel
      // global, así que la subsecuencia de cada jugador queda igual de
      // ordenada — y ese orden es lo que hace que "las últimas 20" sean de
      // verdad las últimas 20 (ver lib/lineas.ts).
      const conLinea = partidasConLineaByPuuid.get(row.puuid) ?? [];
      conLinea.push({ role, win: row.win, kills: row.kills, deaths: row.deaths, assists: row.assists });
      partidasConLineaByPuuid.set(row.puuid, conLinea);

      const roleFreq = roleFreqByPuuid.get(row.puuid) ?? new Map<RoleKey, number>();
      roleFreq.set(role, (roleFreq.get(role) ?? 0) + 1);
      roleFreqByPuuid.set(row.puuid, roleFreq);

      addRoleAgg(roleAggByRole, role, row);
      const ownRoleAgg = roleAggByPuuid.get(row.puuid) ?? new Map<RoleKey, RoleAgg>();
      addRoleAgg(ownRoleAgg, role, row);
      roleAggByPuuid.set(row.puuid, ownRoleAgg);
    }

    const champStats = champStatsByPuuid.get(row.puuid) ?? new Map<string, ChampAgg>();
    const agg = champStats.get(row.champion) ?? { games: 0, wins: 0, kSum: 0, dSum: 0, aSum: 0, csMinSum: 0 };
    agg.games += 1;
    agg.wins += row.win ? 1 : 0;
    agg.kSum += row.kills;
    agg.dSum += row.deaths;
    agg.aSum += row.assists;
    agg.csMinSum += Number(row.cs_per_min);
    champStats.set(row.champion, agg);
    champStatsByPuuid.set(row.puuid, champStats);

    const arr = matchesByPuuid.get(row.puuid) ?? [];
    if (arr.length >= 5) continue;
    const durationMin = row.game_duration_s / 60;
    // Real icon art for the "Build" section — resolved here, not for every
    // stored match, since only these first-5-per-player actually get shown.
    // Version-agnostic for runes (Data Dragon quirk, see lib/ddragon.ts),
    // versioned for spells like champion/profile icons.
    const [primaryRuneIconUrl, summoner1IconUrl, summoner2IconUrl] = await Promise.all([
      row.primary_rune ? runeIconUrlByName(row.primary_rune) : Promise.resolve(null),
      row.summoner1 ? summonerSpellIconUrlByName(ddragonVersion, row.summoner1) : Promise.resolve(null),
      row.summoner2 ? summonerSpellIconUrlByName(ddragonVersion, row.summoner2) : Promise.resolve(null),
    ]);
    arr.push({
      win: row.win,
      champ: row.champion,
      k: row.kills,
      d: row.deaths,
      a: row.assists,
      cs: row.cs,
      csmin: Number(row.cs_per_min).toFixed(1),
      dur: Math.round(durationMin),
      dmgShare: Math.round(Number(row.dmg_share ?? 0)),
      damageToChamps: row.damage_to_champs,
      gold: Math.round(row.gold_earned / durationMin),
      goldTotal: row.gold_earned,
      visionScore: row.vision_score,
      killParticipation: Math.round(Number(row.kill_participation ?? 0)),
      objShare: Math.round(Number(row.obj_share ?? 0)),
      playedAt: row.played_at,
      primaryRune: row.primary_rune,
      primaryRuneIconUrl,
      primaryStyle: row.primary_style,
      secondaryStyle: row.secondary_style,
      doubleKills: row.double_kills ?? 0,
      tripleKills: row.triple_kills ?? 0,
      quadraKills: row.quadra_kills ?? 0,
      pentaKills: row.penta_kills ?? 0,
      champLevel: row.champ_level ?? 0,
      damageTaken: row.damage_taken ?? 0,
      damageMitigated: row.damage_mitigated ?? 0,
      healTeammates: row.heal_teammates ?? null,
      shieldTeammates: row.shield_teammates ?? null,
      role: roleFromTeamPosition(row.team_position),
      wardsPlaced: row.wards_placed ?? 0,
      wardsKilled: row.wards_killed ?? 0,
      controlWards: row.control_wards ?? 0,
      turretTakedowns: row.turret_takedowns ?? 0,
      dragonTakedowns: row.dragon_takedowns ?? 0,
      dragonTypes: row.dragon_types ?? [],
      compra: agruparCompra(row.item_build ?? [], (id) => items.get(id)),
      coreBuild: recorridoCore(row.item_build ?? [], esCore).map((id) => ({ id, nombre: nombreDeItem(id) })),
      baronTakedowns: row.baron_takedowns ?? 0,
      heraldTakedowns: row.herald_takedowns ?? 0,
      inhibitorKills: row.inhibitor_kills ?? 0,
      firstBlood: row.first_blood ?? false,
      firstTower: row.first_tower ?? false,
      summoner1: row.summoner1,
      summoner2: row.summoner2,
      summoner1IconUrl,
      summoner2IconUrl,
      soloKills: row.solo_kills,
      skillshotsHit: row.skillshots_hit,
      damagePerMin: row.damage_per_min,
      goldDiff10: row.gold_diff_10,
      goldDiff15: row.gold_diff_15,
      goldDiff20: row.gold_diff_20,
      firstBloodTimeS: row.first_blood_time_s,
      firstTowerTimeS: row.first_tower_time_s,
      firstTowerMine: row.first_tower_mine,
      firstDragonTimeS: row.first_dragon_time_s,
      firstDragonMine: row.first_dragon_mine,
      firstBaronTimeS: row.first_baron_time_s,
      firstBaronMine: row.first_baron_mine,
      // Set below, once statsWindowByPuuid has this player's FULL window —
      // matchRows is globally DESC across every player, so this player's
      // 6th-25th matches (needed for the baseline) can still be ahead in the
      // loop when their 1st-5th (the ones that become Match objects) are
      // processed. Same order as statsWindowByPuuid's per-puuid array, so
      // zipping them by index after the loop lines them up correctly.
      flag: null,
    });
    matchesByPuuid.set(row.puuid, arr);
  }

  for (const [puuid, matches] of matchesByPuuid) {
    const window = statsWindowByPuuid.get(puuid) ?? [];
    matches.forEach((match, i) => {
      match.flag = computeMatchFlag(window, window[i]);
    });
  }

  /**
   * "Everyone else's" average for `role`, excluding `puuid`'s own games in
   * it — global per-role totals minus this player's own per-role totals,
   * both built from every stored match's real team_position (see
   * roleAggByRole/roleAggByPuuid above). Never falls back to a different
   * role or fabricates a number: sampleSize 0 (no peer games in this role
   * yet) means the caller shows "sin datos", same contract as before.
   */
  function roleAveragesFor(puuid: string, role: RoleKey): RoleAverages {
    const empty: RoleAverages = { kda: null, csPerMin: null, dmgShare: null, killParticipation: null, objShare: null, sampleSize: 0 };
    const peer = peerStatsFor(puuid, role);
    if (!peer.kda) return empty;
    return {
      kda: peer.kda.mean,
      csPerMin: peer.csPerMin?.mean ?? null,
      dmgShare: peer.dmgShare?.mean ?? null,
      // Estas dos ahora salen de su propio n (ver radarMetricsOf): las
      // partidas viejas con el 0 falso de kill_participation/obj_share ya no
      // las hunden. El número que muestra "Comparación con tu rol" sube un
      // poco respecto de antes, y ese de ahora es el correcto.
      killParticipation: peer.killParticipation?.mean ?? null,
      objShare: peer.objShare?.mean ?? null,
      // El KDA lo tiene toda partida guardada, así que su n es el total de
      // partidas del rol — la misma "cantidad de partidas comparadas" que
      // este campo significaba antes.
      sampleSize: peer.kda.n,
    };
  }

  function mostPlayedChamp(puuid: string): string | null {
    const freq = champFreqByPuuid.get(puuid);
    if (!freq) return null;
    let best: string | null = null;
    let bestCount = 0;
    for (const [champ, count] of freq) {
      if (count > bestCount) {
        best = champ;
        bestCount = count;
      }
    }
    return best;
  }

  /** Top 5 champions by games played, from ALL stored matches — real stats, not fabricated. */
  /**
   * TODOS los campeones jugados, no el top 5. El pool que viaja al cliente sí
   * va recortado (championPool), pero el cruce con la maestría necesita la
   * lista entera: sin ella, un campeón de mucha maestría que quedó sexto en
   * partidas se vería igual que uno que nunca jugó, y computeChampionInsights
   * afirmaría "no lo jugaste" sobre alguien que lo jugó cuatro veces.
   */
  function championPoolAll(puuid: string): ChampionPoolEntry[] {
    const stats = champStatsByPuuid.get(puuid);
    if (!stats) return [];
    return [...stats.entries()]
      .map(([champ, s]): ChampionPoolEntry => ({
        champ,
        games: s.games,
        wins: s.wins,
        losses: s.games - s.wins,
        winrate: Math.round((100 * s.wins) / s.games),
        avgKda: Number(((s.kSum + s.aSum) / Math.max(1, s.dSum)).toFixed(2)),
        avgCsPerMin: Number((s.csMinSum / s.games).toFixed(1)),
      }))
      .sort((a, b) => b.games - a.games);
  }

  function championPool(puuid: string): ChampionPoolEntry[] {
    return championPoolAll(puuid).slice(0, 5);
  }

  const CHAMPION_LEADERBOARD_MIN_GAMES = 50;
  const CHAMPION_LEADERBOARD_SIZE = 7;

  /**
   * "Mayor winrate por campeón" — top 7 (jugador, campeón) por winrate,
   * exigiendo al menos CHAMPION_LEADERBOARD_MIN_GAMES partidas CON ESE
   * CAMPEÓN específico (no partidas totales del jugador). Un mismo jugador
   * puede aparecer más de una vez si tiene varios campeones que califican —
   * es un ranking de campeones, no de jugadores. Recorre TODO
   * champStatsByPuuid, no el top-5-por-partidas de championPool(): un
   * campeón puede superar el piso de partidas de este ranking sin ser el
   * más jugado de ese jugador.
   */
  function computeChampionLeaderboard(): ChampionLeaderboardEntry[] {
    const entries: ChampionLeaderboardEntry[] = [];
    for (const [puuid, champStats] of champStatsByPuuid) {
      const player = nameByPuuid.get(puuid);
      if (!player) continue;
      // El promedio propio del jugador sobre el MISMO universo (sus partidas
      // guardadas), que es contra lo que tiene sentido comparar el winrate de
      // un campeón: "52% con Shen" dice poco hasta saber si en general está
      // en 47 o en 55.
      let totalGames = 0;
      let totalWins = 0;
      for (const s of champStats.values()) {
        totalGames += s.games;
        totalWins += s.wins;
      }
      const playerWinrate = totalGames > 0 ? Number(((100 * totalWins) / totalGames).toFixed(1)) : 0;
      for (const [champ, s] of champStats) {
        if (s.games < CHAMPION_LEADERBOARD_MIN_GAMES) continue;
        entries.push({
          playerName: player.name,
          playerTag: player.tag,
          profileIconUrl: player.profileIconUrl,
          champion: champ,
          games: s.games,
          wins: s.wins,
          losses: s.games - s.wins,
          winrate: Math.round((100 * s.wins) / s.games),
          playerWinrate,
          avgKda: Number(((s.kSum + s.aSum) / Math.max(1, s.dSum)).toFixed(2)),
        });
      }
    }
    // Por el winrate exacto: 49,6% y 50,4% redondean los dos a 50 y el orden
    // entre ellos quedaría librado al azar del sort.
    return entries
      .sort((a, b) => b.wins / b.games - a.wins / a.games)
      .slice(0, CHAMPION_LEADERBOARD_SIZE);
  }

  /** Pairs of tracked players who were teammates in at least one stored match, ranked by games together. */
  function computeDuoSynergy(): DuoPair[] {
    interface DuoPlayerAgg {
      kSum: number;
      dSum: number;
      aSum: number;
      champFreq: Map<string, number>;
    }
    function emptyAgg(): DuoPlayerAgg {
      return { kSum: 0, dSum: 0, aSum: 0, champFreq: new Map() };
    }
    function addToAgg(agg: DuoPlayerAgg, entry: { champion: string; kills: number; deaths: number; assists: number }) {
      agg.kSum += entry.kills;
      agg.dSum += entry.deaths;
      agg.aSum += entry.assists;
      agg.champFreq.set(entry.champion, (agg.champFreq.get(entry.champion) ?? 0) + 1);
    }
    function bestChamp(agg: DuoPlayerAgg): string | null {
      let best: string | null = null;
      let bestCount = 0;
      for (const [champ, count] of agg.champFreq) {
        if (count > bestCount) {
          best = champ;
          bestCount = count;
        }
      }
      return best;
    }

    const pairStats = new Map<
      string,
      {
        aPuuid: string;
        bPuuid: string;
        games: number;
        wins: number;
        lastPlayedAt: string;
        // Counts how often each (aRole, bRole) combo showed up together —
        // someone's role in a shared game with THIS partner can differ from
        // their overall main role (role swaps for a duo are common), so this
        // is tracked per-pair rather than reusing mostPlayedRole(puuid).
        roleCombos: Map<string, number>;
        // Each one's own KDA/champion, but only counting the games THEY
        // SHARED as teammates — a broader "career" average would answer a
        // different question than "how does this pair do together".
        aAgg: DuoPlayerAgg;
        bAgg: DuoPlayerAgg;
        // Every shared game, trimmed to the last 5 (most recent) once the
        // pair is finalized below — kept unsorted here since matches arrive
        // grouped by match_id, not in playedAt order across the whole map.
        recentMatches: DuoSharedMatch[];
      }
    >();
    for (const entries of trackedByMatchId.values()) {
      if (entries.length < 2) continue;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          if (entries[i].win !== entries[j].win) continue; // opposite results = opposite teams, not a duo
          const [first, second] = entries[i].puuid < entries[j].puuid ? [entries[i], entries[j]] : [entries[j], entries[i]];
          const key = `${first.puuid}|${second.puuid}`;
          const cur = pairStats.get(key) ?? {
            aPuuid: first.puuid,
            bPuuid: second.puuid,
            games: 0,
            wins: 0,
            lastPlayedAt: first.playedAt,
            roleCombos: new Map<string, number>(),
            aAgg: emptyAgg(),
            bAgg: emptyAgg(),
            recentMatches: [],
          };
          cur.games += 1;
          cur.wins += first.win ? 1 : 0;
          if (first.playedAt > cur.lastPlayedAt) cur.lastPlayedAt = first.playedAt;
          const comboKey = `${first.role ?? ""}|${second.role ?? ""}`;
          cur.roleCombos.set(comboKey, (cur.roleCombos.get(comboKey) ?? 0) + 1);
          addToAgg(cur.aAgg, first);
          addToAgg(cur.bAgg, second);
          cur.recentMatches.push({
            matchId: first.matchId,
            playedAt: first.playedAt,
            durationS: first.durationS,
            win: first.win,
            aChamp: first.champion,
            aK: first.kills,
            aD: first.deaths,
            aA: first.assists,
            bChamp: second.champion,
            bK: second.kills,
            bD: second.deaths,
            bA: second.assists,
          });
          pairStats.set(key, cur);
        }
      }
    }
    const pairs: DuoPair[] = [];
    for (const p of pairStats.values()) {
      const a = nameByPuuid.get(p.aPuuid);
      const b = nameByPuuid.get(p.bPuuid);
      if (!a || !b) continue;
      let bestCombo = "";
      let bestCount = 0;
      for (const [combo, count] of p.roleCombos) {
        if (count > bestCount) {
          bestCombo = combo;
          bestCount = count;
        }
      }
      const [aRole, bRole] = bestCombo.split("|") as [string, string];
      pairs.push({
        aName: a.name,
        aTag: a.tag,
        bName: b.name,
        aAvgKda: Number(((p.aAgg.kSum + p.aAgg.aSum) / Math.max(1, p.aAgg.dSum)).toFixed(2)),
        bAvgKda: Number(((p.bAgg.kSum + p.bAgg.aSum) / Math.max(1, p.bAgg.dSum)).toFixed(2)),
        aMainChamp: bestChamp(p.aAgg),
        bMainChamp: bestChamp(p.bAgg),
        bTag: b.tag,
        aProfileIconUrl: a.profileIconUrl,
        bProfileIconUrl: b.profileIconUrl,
        games: p.games,
        wins: p.wins,
        winrate: Math.round((100 * p.wins) / p.games),
        lastPlayedAt: p.lastPlayedAt,
        aRole: (aRole || null) as RoleKey | null,
        bRole: (bRole || null) as RoleKey | null,
        recentMatches: [...p.recentMatches].sort((x, y) => (x.playedAt < y.playedAt ? 1 : -1)).slice(0, 5),
      });
    }
    return pairs.sort((x, y) => y.games - x.games);
  }

  function mostPlayedRole(puuid: string): RoleKey | null {
    const freq = roleFreqByPuuid.get(puuid);
    if (!freq) return null;
    let best: RoleKey | null = null;
    let bestCount = 0;
    for (const [role, count] of freq) {
      if (count > bestCount) {
        best = role;
        bestCount = count;
      }
    }
    return best;
  }

  const ALL_ROLES = Object.keys(ROLES) as RoleKey[];

  /**
   * % of ALL this player's stored matches played in each role — always all 5
   * roles (0 for one never played), from the same roleFreqByPuuid built off
   * every match's real team_position. Empty array (not five zeros) when
   * there's no resolved-role match at all yet, so the UI can show an actual
   * empty state instead of a row of 0%s.
   */
  function roleDistributionFor(puuid: string): { role: RoleKey; pct: number }[] {
    const freq = roleFreqByPuuid.get(puuid);
    if (!freq) return [];
    const total = [...freq.values()].reduce((s, c) => s + c, 0);
    if (total === 0) return [];
    return ALL_ROLES.map((role) => ({ role, pct: Math.round((100 * (freq.get(role) ?? 0)) / total) }));
  }

  function personalRecordsFor(puuid: string): PersonalRecords | null {
    const rec = recordsByPuuid.get(puuid);
    if (!rec) return null;
    return {
      longestGameMin: Math.round(rec.longestGameS / 60),
      bestKda: Number(rec.bestKda.toFixed(2)),
      bestKdaChamp: rec.bestKdaChamp,
      longestWinStreak: rec.maxWinStreak,
      mostKillsSingleGame: rec.mostKills,
      mostDamageSingleGame: rec.mostDamage,
      mostCsSingleGame: rec.mostCs,
    };
  }

  function aegisStatsFor(puuid: string): AegisStats | null {
    const snapshotsAsc = lpHistoryByPuuid.get(puuid);
    if (!snapshotsAsc || snapshotsAsc.length < 2) return null;
    // matchRows (and everything built from it, including this) arrives
    // played_at DESCENDING — reverse for computeAegisStats, which needs
    // oldest-first to walk consecutive snapshot windows in order.
    const rankedAsc = [...(rankedMatchesByPuuid.get(puuid) ?? [])].reverse();
    return computeAegisStats(snapshotsAsc, rankedAsc);
  }

  // Shared by computeDuoSynergy() and computeChampionLeaderboard() below —
  // both need "which name/tag/avatar goes with this puuid" and neither
  // should compute it separately.
  const nameByPuuid = new Map(
    (ladderRows ?? []).map((r) => [
      r.puuid,
      {
        name: r.game_name,
        tag: r.tag_line,
        profileIconUrl: r.profile_icon_id != null ? profileIconUrl(ddragonVersion, r.profile_icon_id) : null,
      },
    ])
  );

  const players: Player[] = (ladderRows ?? []).map((row): Player => {
    const lp = row.lp ?? 0;
    const history = lpHistoryByPuuid.get(row.puuid) ?? [];
    const wins = row.wins ?? 0;
    const losses = row.losses ?? 0;
    const fallbackPoint: LpHistoryPoint = {
      lp,
      capturedAt: new Date().toISOString(),
      tier: tierKeyFromRiot(row.tier),
      division: divisionFromRiot(row.division),
      wins,
      losses,
    };
    // Needs >=2 points — a single point can't compute a step between
    // x-coordinates (division by zero) in lineAreaGeometry().
    const lpHistory: LpHistoryPoint[] = history.length >= 2 ? history.slice(-20) : [fallbackPoint, fallbackPoint];
    // Peak looks at the FULL stored history, not just the last-20 window shown
    // in the chart — otherwise an old high climbed months ago would drop out.
    const peakLp = peakFromHistory(history.length > 0 ? history : [fallbackPoint]);
    const matches = matchesByPuuid.get(row.puuid) ?? [];

    const role = row.role ? normalizeRole(row.role) : mostPlayedRole(row.puuid) ?? "mid";
    const mastery = masteryPoolByPuuid.get(row.puuid) ?? [];

    return {
      name: row.game_name,
      tag: row.tag_line,
      you: row.is_you,
      role,
      tierKey: tierKeyFromRiot(row.tier),
      division: divisionFromRiot(row.division),
      lp,
      wins,
      losses,
      mainChamp: row.main_champ ?? mostPlayedChamp(row.puuid) ?? "—",
      profileIconUrl: row.profile_icon_id != null ? profileIconUrl(ddragonVersion, row.profile_icon_id) : null,
      summonerLevel: row.summoner_level,
      lpHistory,
      peakLp,
      flexRank: flexByPuuid.get(row.puuid) ?? null,
      championPool: championPool(row.puuid),
      masteryPool: mastery,
      championInsights: computeChampionInsights(mastery, championPoolAll(row.puuid)),
      liveGame: liveGameByPuuid.get(row.puuid) ?? null,
      matches,
      winrate: wins + losses > 0 ? Math.round((100 * wins) / (wins + losses)) : 0,
      roleAverages: roleAveragesFor(row.puuid, role),
      roleDistribution: roleDistributionFor(row.puuid),
      lineas: historialDeLineas(partidasConLineaByPuuid.get(row.puuid) ?? []),
      personalRecords: personalRecordsFor(row.puuid),
      aegisStats: aegisStatsFor(row.puuid),
      // rankedMatchesByPuuid ya viene played_at DESC (más nueva primero),
      // que es justo el orden que computeRecentForm espera para cortar la
      // ventana — al revés que computeAegisStats, que lo necesita ascendente.
      recentForm: computeRecentForm(rankedMatchesByPuuid.get(row.puuid) ?? []),
      // Sobre rankedMatchesByPuuid y no sobre `matches`: este último está
      // capado en 5 (es lo que se muestra) y el tilt necesita ver las de antes
      // de la racha para tener contra qué comparar las muertes. Ya viene de la
      // más nueva a la más vieja, que es el orden que detectTilt espera.
      buildStats: computeBuildStats(buildSamplesByPuuid.get(row.puuid) ?? [], esCore, nombreDeItem),
      tilt: detectTilt(
        (rankedMatchesByPuuid.get(row.puuid) ?? []).map((m) => ({
          win: m.win,
          deaths: m.deaths,
          playedAtMs: Date.parse(m.playedAt),
          durMin: m.durationS / 60,
        }))
      ),
      radar: computeRadar(ownStatsFor(row.puuid, role), peerStatsFor(row.puuid, role)),
      // Los mismos promedios sin el grupo de por medio: el radar se cae si
      // nadie más juega ese rol, y el cara a cara no tiene por qué caerse con
      // él — ahí la comparación es contra la otra persona.
      metricas: metricasPropias(ownStatsFor(row.puuid, role)),
      matchups: computeMatchups(matchupSamplesByPuuid.get(row.puuid) ?? []).slice(0, MATCHUPS_SHOWN),
    };
  });

  players.sort((a, b) => tierScore(b) - tierScore(a));

  // Oldest last-refresh across the group, not newest — "last updated" should
  // read as "everyone is at least this fresh", not get flattered by
  // whichever one summoner happened to refresh most recently.
  const refreshTimes = (ladderRows ?? [])
    .map((r) => r.last_refreshed_at)
    .filter((t): t is string => t != null);
  const lastUpdated = refreshTimes.length > 0 ? refreshTimes.reduce((min, t) => (t < min ? t : min)) : null;

  // Exposed so the client can build real champion-art URLs itself (see
  // components/ChampIcon.tsx) instead of every champion chip needing its own
  // resolved icon URL computed server-side — one version string covers all
  // of them, same as profileIconUrl already does per-player above.
  // Edge-cached for 60s: this handler re-reads every stored match and calls
  // Spectator-V5 once PER PLAYER on every request, so N friends refreshing
  // the page independently multiplied Riot calls for identical data. Vercel's
  // CDN honors s-maxage even with force-dynamic (that flag only turns off
  // Next's own data cache). The embedded liveGame can be up to 60s stale on
  // first paint — /api/live (uncached, polled every 60s client-side) merges
  // the fresh status in right after, so nothing user-visible is lost.
  return NextResponse.json(
    {
      players,
      duoSynergy: computeDuoSynergy(),
      championLeaderboard: computeChampionLeaderboard(),
      lastUpdated,
      ddragonVersion,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
