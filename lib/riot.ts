/**
 * Thin wrapper around the Riot Games API — Account-V1, League-V4, Match-V5.
 *
 * Server-side only (uses RIOT_API_KEY): call these from Route Handlers
 * (app/api/**) or Server Components/Actions, never from client components —
 * the key must never reach the browser.
 *
 * Routing values: League-V4 is PLATFORM-routed (e.g. "la2" for LAS);
 * Account-V1 and Match-V5 are REGION-routed (e.g. "americas"). Defaults below
 * match LAS/Argentina; override via env if the group plays elsewhere.
 * Reference: https://developer.riotgames.com/apis
 */

const API_KEY = process.env.RIOT_API_KEY;
const PLATFORM = process.env.RIOT_PLATFORM || "la2"; // la2=LAS, la1=LAN, na1, euw1, ...
const REGION = process.env.RIOT_REGION || "americas"; // americas, europe, asia, sea

function assertKey() {
  if (!API_KEY) {
    throw new Error(
      "RIOT_API_KEY is not set. Copy .env.example to .env.local and paste your key from developer.riotgames.com."
    );
  }
}

async function riotFetch<T>(url: string): Promise<T> {
  assertKey();
  const res = await fetch(url, {
    headers: { "X-Riot-Token": API_KEY! },
    // Riot data goes stale fast; let the caller (a cron / route handler) decide
    // caching, don't let Next cache this by default.
    cache: "no-store",
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Riot API rate limited — retry after ${retryAfter ?? "?"}s`);
  }
  if (res.status === 404) {
    throw new Error("Riot API: not found (bad Riot ID, puuid, or match id)");
  }
  if (!res.ok) {
    throw new Error(`Riot API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** Account-V1 — resolve a Riot ID ("Name#TAG") to a puuid. Region-routed. */
export function getAccountByRiotId(gameName: string, tagLine: string) {
  const url = `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotFetch<RiotAccount>(url);
}

export interface RiotLeagueEntry {
  leagueId: string;
  queueType: string; // "RANKED_SOLO_5x5" is the one we care about
  tier: string; // IRON..CHALLENGER
  rank: string; // IV..I
  leaguePoints: number;
  wins: number;
  losses: number;
}

/** League-V4 — ranked entries for a puuid (solo/duo, flex, etc). Platform-routed. */
export function getLeagueEntriesByPuuid(puuid: string) {
  const url = `https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotFetch<RiotLeagueEntry[]>(url);
}

/** Match-V5 — most recent match ids for a puuid. Region-routed. Costs 0 extra calls per id. */
export function getMatchIdsByPuuid(puuid: string, count = 20) {
  const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}&queue=420`; // 420 = ranked solo/duo
  return riotFetch<string[]>(url);
}

export interface RiotMatch {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameDuration: number;
    gameCreation: number;
    participants: RiotParticipant[];
  };
}

export interface RiotParticipant {
  puuid: string;
  teamId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  visionScore: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  damageDealtToObjectives: number;
  teamPosition: string; // TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY
  perks: RiotPerks;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
}

export interface RiotPerks {
  styles: {
    description: string; // "primaryStyle" | "subStyle"
    style: number; // rune tree id, e.g. 8000 = Precision
    selections: { perk: number }[];
  }[];
}

/**
 * Match-V5 — full detail for one match. This is the expensive one (one call
 * per match, per player) — cache it in `matches` once fetched, never re-fetch
 * an id you've already stored. Region-routed.
 */
export function getMatchById(matchId: string) {
  const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  return riotFetch<RiotMatch>(url);
}

export interface RiotChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
}

/** Champion Mastery V4 — top N champions by mastery points for a puuid. Platform-routed. */
export function getTopChampionMasteries(puuid: string, count = 1) {
  const url = `https://${PLATFORM}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`;
  return riotFetch<RiotChampionMastery[]>(url);
}
