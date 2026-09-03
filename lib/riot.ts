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

/**
 * Un 429 de Riot con su Retry-After parseado, para que quien pueda esperar
 * lo haga en vez de tener que adivinar por el texto del mensaje. Sigue
 * siendo un Error común: todo lo que ya lo cazaba genérico no cambia.
 */
export class RiotRateLimitError extends Error {
  readonly retryAfterS: number;
  constructor(retryAfter: string | null) {
    super(`Riot API rate limited — retry after ${retryAfter ?? "?"}s`);
    this.name = "RiotRateLimitError";
    // Sin cabecera, 10s: es el piso del rate limit por 2 minutos de una key
    // personal, suficiente para no volver a chocar en el reintento.
    const parsed = Number(retryAfter);
    this.retryAfterS = Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
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
    throw new RiotRateLimitError(res.headers.get("Retry-After"));
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

/** Match-V5 — match ids for a puuid, paginated via `start`/`count` (Riot caps `count` at 100 per call). `queue` defaults to ranked solo/duo (420) — pass 700 for Clash. Region-routed. Costs 0 extra calls per id. */
export function getMatchIdsByPuuid(puuid: string, count = 20, start = 0, queue = 420) {
  const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}&queue=${queue}`;
  return riotFetch<string[]>(url);
}

export interface RiotMatch {
  metadata: { matchId: string; participants: string[] };
  info: {
    gameDuration: number;
    gameCreation: number;
    queueId: number; // 420=ranked solo/duo, 700=Clash — see lib/refresh.ts
    participants: RiotParticipant[];
  };
}

export interface RiotParticipant {
  puuid: string;
  participantId: number; // 1-10, matches the keys in timeline participantFrames
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
  champLevel: number;
  totalDamageTaken: number;
  damageSelfMitigated: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionWardsBoughtInGame: number;
  turretKills: number;
  dragonKills: number;
  baronKills: number;
  inhibitorKills: number;
  firstBloodKill: boolean;
  firstBloodAssist: boolean;
  firstTowerKill: boolean;
  firstTowerAssist: boolean;
  summoner1Id: number;
  summoner2Id: number;
  /**
   * Riot-computed derived stats. Present on most modern ranked matches but not
   * guaranteed (older matches, edge cases) — always optional-chain into this.
   */
  challenges?: {
    killParticipation?: number; // 0-1 fraction
    teamDamagePercentage?: number; // 0-1 fraction
    soloKills?: number;
    skillshotsHit?: number;
    damagePerMinute?: number;
    // Team-participation counts (kill OR assist) for each objective type —
    // unlike turretKills/dragonKills/baronKills above, which only count the
    // killing blow. Confirmed against a real match dump: there's no
    // equivalent field for inhibitors or void grubs specifically (grubs only
    // show up bundled into the boolean voidMonsterKill, useless for a count).
    turretTakedowns?: number;
    dragonTakedowns?: number;
    baronTakedowns?: number;
    riftHeraldTakedowns?: number;
  };
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

export interface RiotTimelineEvent {
  type: string; // "CHAMPION_KILL" | "BUILDING_KILL" | "ELITE_MONSTER_KILL" | "ITEM_PURCHASED" | ...
  timestamp: number; // ms since game start
  killerId?: number; // participantId — only on kill-type events
  killerTeamId?: number; // 100 | 200 — only on ELITE_MONSTER_KILL, the team that got the takedown directly (no need to resolve killerId → team)
  monsterType?: string; // "DRAGON" | "RIFTHERALD" | "BARON_NASHOR" | "HORDE" — only on ELITE_MONSTER_KILL
  monsterSubType?: string; // e.g. "FIRE_DRAGON" — only when monsterType is "DRAGON"
  buildingType?: string; // "TOWER_BUILDING" | "INHIBITOR_BUILDING" — only on BUILDING_KILL
  teamId?: number; // 100 | 200 — only on BUILDING_KILL, the team that OWNED the destroyed building (so the killer's team is the other one)
  participantId?: number; // only on ITEM_* events
  itemId?: number; // only on ITEM_PURCHASED/ITEM_SOLD/ITEM_DESTROYED
}

export interface RiotTimelineFrame {
  timestamp: number; // ms since game start
  participantFrames: Record<string, { participantId: number; totalGold: number }>;
  events: RiotTimelineEvent[];
}

export interface RiotTimeline {
  info: { frameInterval: number; frames: RiotTimelineFrame[] };
}

/**
 * Match-V5 timeline — per-minute frames (gold, etc. per participant) plus a
 * chronological event log (kills, building kills, ...) for one match.
 * Separate call from getMatchById, same match_id — used for gold diff at
 * fixed minute marks and first blood/tower timing. Region-routed.
 *
 * Path is /matches/{matchId}/timeline, NOT /timelines/by-match/{matchId} —
 * that older-looking path 403s even with a valid key, because this app's
 * registered product on the Riot Developer Portal only approves specific
 * exact method paths (see the app's Match-V5 method list there), and that
 * one isn't among them. Confirmed directly against the portal's own listed
 * methods, not just docs.
 */
export function getMatchTimeline(matchId: string) {
  const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`;
  return riotFetch<RiotTimeline>(url);
}

export interface RiotActiveGame {
  gameId: number;
  gameQueueConfigId: number;
  gameLength: number; // seconds elapsed as of this response — a snapshot, not a live clock
  participants: { puuid: string; championId: number; teamId: number }[];
}

/**
 * Spectator V5 — null if the summoner isn't in a game right now, which is the
 * ordinary, common case (a 404 here isn't an error, unlike everywhere else we
 * use riotFetch). Platform-routed. Unlike every other Riot call in this app,
 * this one is meant to be called live on every ladder read, not batched into
 * the refresh cron — "in game right now" would be stale garbage by the next
 * scheduled refresh.
 */
export async function getActiveGame(puuid: string): Promise<RiotActiveGame | null> {
  assertKey();
  const url = `https://${PLATFORM}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  const res = await fetch(url, { headers: { "X-Riot-Token": API_KEY! }, cache: "no-store" });
  if (res.status === 404) return null;
  if (res.status === 429) throw new RiotRateLimitError(res.headers.get("Retry-After"));
  if (!res.ok) throw new Error(`Riot API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<RiotActiveGame>;
}

export interface RiotSummoner {
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

/** Summoner-V4 — profile icon + level for a puuid. Platform-routed. */
export function getSummonerByPuuid(puuid: string) {
  const url = `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  return riotFetch<RiotSummoner>(url);
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
