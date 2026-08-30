import type { ClashMatch, ClashMatchPlayer, ClashTournament } from "./types";

/**
 * Groups a group's stored Clash-queue matches (matches.queue_id = 700, see
 * lib/refresh.ts) into "tournaments" and builds a per-day auto-conclusion.
 *
 * Riot's Clash-V1 API only ever returns a player's CURRENTLY ACTIVE
 * registration — once a tournament ends, it's gone from that endpoint, with
 * no history endpoint replacing it. So there's no real tournament id, name,
 * or bracket/placement to recover from Riot after the fact — everything
 * here is reconstructed purely from stored Match-V5 games (queueId 700).
 * "One tournament" = one calendar day (Clash days run as a single evening
 * in one region), which matches how Riot actually schedules Clash and is a
 * far more reliable signal than trying to cluster by gaps between games.
 */

export interface ClashMatchRow {
  match_id: string;
  puuid: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  cs_per_min: number;
  dmg_share: number;
  damage_to_champs: number;
  vision_score: number;
  team_position: string | null;
  game_duration_s: number;
  played_at: string;
}

export interface ClashPlayerInfo {
  name: string;
  tag: string;
  profileIconUrl: string | null;
}

// The group's Clash nights all happen in the same region this app tracks
// (see RIOT_PLATFORM/RIOT_REGION in lib/riot.ts) — clustering by this
// timezone's calendar date, rather than UTC's, keeps a tournament that spans
// past local midnight from splitting into two.
const CLUSTER_TZ = "America/Argentina/Buenos_Aires";

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: CLUSTER_TZ });
}

export function computeClashTournaments(
  rows: ClashMatchRow[],
  playerByPuuid: Map<string, ClashPlayerInfo>
): ClashTournament[] {
  const rowsByMatch = new Map<string, ClashMatchRow[]>();
  for (const row of rows) {
    const arr = rowsByMatch.get(row.match_id) ?? [];
    arr.push(row);
    rowsByMatch.set(row.match_id, arr);
  }

  const matches: ClashMatch[] = [...rowsByMatch.entries()].map(([matchId, matchRows]) => {
    const players: ClashMatchPlayer[] = matchRows
      .map((r): ClashMatchPlayer | null => {
        const info = playerByPuuid.get(r.puuid);
        if (!info) return null;
        return {
          playerName: info.name,
          playerTag: info.tag,
          profileIconUrl: info.profileIconUrl,
          champion: r.champion,
          win: r.win,
          k: r.kills,
          d: r.deaths,
          a: r.assists,
          cs: r.cs,
          csPerMin: r.cs_per_min.toFixed(1),
          dmgShare: r.dmg_share,
          damageToChamps: r.damage_to_champs,
          visionScore: r.vision_score,
          teamPosition: r.team_position,
        };
      })
      .filter((p): p is ClashMatchPlayer => p !== null);
    return {
      matchId,
      playedAt: matchRows[0].played_at,
      durationS: matchRows[0].game_duration_s,
      players,
    };
  });

  const matchesByDate = new Map<string, ClashMatch[]>();
  for (const m of matches) {
    const key = dateKey(m.playedAt);
    const arr = matchesByDate.get(key) ?? [];
    arr.push(m);
    matchesByDate.set(key, arr);
  }

  const tournaments: ClashTournament[] = [...matchesByDate.entries()].map(([key, dayMatches]) => {
    dayMatches.sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());

    // Per-player-per-game results, not per-match — if two tracked friends won
    // together in one Clash game, that's two "wins" from the group's own
    // perspective, same convention as the rest of the app's per-player stats
    // (e.g. the "Mayor winrate" leaderboard).
    const results = dayMatches.flatMap((m) => m.players);
    const wins = results.filter((p) => p.win).length;
    const losses = results.length - wins;
    const winrate = results.length > 0 ? Math.round((100 * wins) / results.length) : 0;

    const kdaByPlayer = new Map<string, { name: string; champs: string[]; kdaSum: number; games: number }>();
    for (const p of results) {
      const pk = `${p.playerName}#${p.playerTag}`;
      const e = kdaByPlayer.get(pk) ?? { name: p.playerName, champs: [], kdaSum: 0, games: 0 };
      e.champs.push(p.champion);
      e.kdaSum += (p.k + p.a) / Math.max(1, p.d);
      e.games++;
      kdaByPlayer.set(pk, e);
    }
    let mvp: { name: string; champ: string; avgKda: number } | null = null;
    for (const e of kdaByPlayer.values()) {
      const avgKda = e.kdaSum / e.games;
      if (!mvp || avgKda > mvp.avgKda) mvp = { name: e.name, champ: e.champs[0], avgKda };
    }

    const label = `Clash — ${new Date(dayMatches[0].playedAt).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: CLUSTER_TZ,
    })}`;

    let conclusion = `${dayMatches.length} partida${dayMatches.length === 1 ? "" : "s"} jugada${
      dayMatches.length === 1 ? "" : "s"
    } · ${wins}V ${losses}D (${winrate}%).`;
    if (mvp) conclusion += ` Mejor rendimiento: ${mvp.name} con ${mvp.champ} (${mvp.avgKda.toFixed(2)} KDA promedio).`;
    if (results.length >= 3 && winrate >= 75) conclusion += " Gran día de Clash para el grupo.";
    else if (results.length >= 3 && winrate <= 25) conclusion += " Día flojo — a buscar revancha en el próximo Clash.";

    return { key, label, matches: dayMatches, gamesPlayed: results.length, wins, losses, winrate, conclusion };
  });

  tournaments.sort((a, b) => new Date(b.matches[0].playedAt).getTime() - new Date(a.matches[0].playedAt).getTime());
  return tournaments;
}
