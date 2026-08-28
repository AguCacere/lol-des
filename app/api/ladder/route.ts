import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { peakFromHistory, tierScore } from "@/lib/ladder";
import { divisionFromRiot, normalizeRole, roleFromTeamPosition, tierKeyFromRiot } from "@/lib/mapping";
import { getLiveGamesByPuuid } from "@/lib/live";
import { getLatestVersion, profileIconUrl, runeIconUrlByName, summonerSpellIconUrlByName } from "@/lib/ddragon";
import type { ChampionLeaderboardEntry, ChampionPoolEntry, DuoPair, FlexRank, LpHistoryPoint, MasteryEntry, Match, Player, RoleKey } from "@/lib/types";

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
  wards_placed: number | null;
  wards_killed: number | null;
  control_wards: number | null;
  turret_kills: number | null;
  dragon_kills: number | null;
  dragon_types: string[] | null;
  baron_kills: number | null;
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
  team_position: string | null;
  game_duration_s: number;
  played_at: string;
}

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
        "match_id, puuid, champion, win, kills, deaths, assists, cs, cs_per_min, dmg_share, damage_to_champs, gold_earned, vision_score, kill_participation, obj_share, primary_rune, primary_style, secondary_style, double_kills, triple_kills, quadra_kills, penta_kills, champ_level, damage_taken, damage_mitigated, wards_placed, wards_killed, control_wards, turret_kills, dragon_kills, dragon_types, baron_kills, inhibitor_kills, first_blood, first_tower, summoner1, summoner2, solo_kills, skillshots_hit, damage_per_min, gold_diff_10, gold_diff_15, gold_diff_20, first_blood_time_s, first_tower_time_s, team_position, game_duration_s, played_at"
      )
      .in("puuid", puuids)
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

  const [
    [
      { data: snapshots, error: snapshotsError },
      { data: matchRows, error: matchesError },
      { data: masteryRows, error: masteryError },
    ],
    liveGameByPuuid,
    ddragonVersion,
  ] = await Promise.all([dbQueries, activeGames, ddragonVersionPromise]);

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
  // Champion / role frequency across ALL stored matches (not just the last 5
  // shown) — used as the "most played" fallback when main_champ/role aren't
  // set manually. `summoners.role` has no UI to set it yet, so in practice
  // this IS the role source — team_position comes straight from Riot.
  const champFreqByPuuid = new Map<string, Map<string, number>>();
  const roleFreqByPuuid = new Map<string, Map<RoleKey, number>>();
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
    { puuid: string; win: boolean; playedAt: string; role: RoleKey | null; champion: string; kills: number; deaths: number; assists: number }[]
  >();
  for (const row of matchRows ?? []) {
    const tracked = trackedByMatchId.get(row.match_id) ?? [];
    tracked.push({
      puuid: row.puuid,
      win: row.win,
      playedAt: row.played_at,
      role: roleFromTeamPosition(row.team_position),
      champion: row.champion,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
    });
    trackedByMatchId.set(row.match_id, tracked);

    const freq = champFreqByPuuid.get(row.puuid) ?? new Map<string, number>();
    freq.set(row.champion, (freq.get(row.champion) ?? 0) + 1);
    champFreqByPuuid.set(row.puuid, freq);

    const role = roleFromTeamPosition(row.team_position);
    if (role) {
      const roleFreq = roleFreqByPuuid.get(row.puuid) ?? new Map<RoleKey, number>();
      roleFreq.set(role, (roleFreq.get(role) ?? 0) + 1);
      roleFreqByPuuid.set(row.puuid, roleFreq);
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
      wardsPlaced: row.wards_placed ?? 0,
      wardsKilled: row.wards_killed ?? 0,
      controlWards: row.control_wards ?? 0,
      turretKills: row.turret_kills ?? 0,
      dragonKills: row.dragon_kills ?? 0,
      dragonTypes: row.dragon_types ?? [],
      baronKills: row.baron_kills ?? 0,
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
    });
    matchesByPuuid.set(row.puuid, arr);
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
  function championPool(puuid: string): ChampionPoolEntry[] {
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
      .sort((a, b) => b.games - a.games)
      .slice(0, 5);
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
          avgKda: Number(((s.kSum + s.aSum) / Math.max(1, s.dSum)).toFixed(2)),
        });
      }
    }
    return entries.sort((a, b) => b.winrate - a.winrate).slice(0, CHAMPION_LEADERBOARD_SIZE);
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
          };
          cur.games += 1;
          cur.wins += first.win ? 1 : 0;
          if (first.playedAt > cur.lastPlayedAt) cur.lastPlayedAt = first.playedAt;
          const comboKey = `${first.role ?? ""}|${second.role ?? ""}`;
          cur.roleCombos.set(comboKey, (cur.roleCombos.get(comboKey) ?? 0) + 1);
          addToAgg(cur.aAgg, first);
          addToAgg(cur.bAgg, second);
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

    return {
      name: row.game_name,
      tag: row.tag_line,
      you: row.is_you,
      role: row.role ? normalizeRole(row.role) : mostPlayedRole(row.puuid) ?? "mid",
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
      masteryPool: masteryPoolByPuuid.get(row.puuid) ?? [],
      liveGame: liveGameByPuuid.get(row.puuid) ?? null,
      matches,
      winrate: wins + losses > 0 ? Math.round((100 * wins) / (wins + losses)) : 0,
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
  return NextResponse.json({
    players,
    duoSynergy: computeDuoSynergy(),
    championLeaderboard: computeChampionLeaderboard(),
    lastUpdated,
    ddragonVersion,
  });
}
