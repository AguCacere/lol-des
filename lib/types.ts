export type RoleKey = "top" | "jungle" | "mid" | "adc" | "support";

export type TierKey =
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "emerald"
  | "diamond"
  | "master";

export interface Tier {
  name: string;
  key: TierKey;
  fg: string;
  bg: string;
  rank: number;
}

export interface Match {
  win: boolean;
  champ: string;
  k: number;
  d: number;
  a: number;
  cs: number;
  csmin: string;
  dur: number;
  dmgShare: number;
  gold: number;
  visionScore: number;
  killParticipation: number;
  objShare: number;
  goldTotal: number;
  playedAt: string; // ISO timestamp
  primaryRune: string | null; // keystone, e.g. "Conqueror"
  primaryStyle: string | null; // rune tree, e.g. "Precision"
  secondaryStyle: string | null; // e.g. "Domination"
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  champLevel: number;
  damageTaken: number;
  damageMitigated: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWards: number;
  turretKills: number;
  dragonKills: number;
  /** monsterSubType per dragon this player personally killed (e.g. ["FIRE_DRAGON"]) — from the match timeline, may be shorter than dragonKills on older/unparsed matches. */
  dragonTypes: string[];
  baronKills: number;
  inhibitorKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  summoner1: string | null;
  summoner2: string | null;
  soloKills: number | null;
  skillshotsHit: number | null;
  damagePerMin: number | null;
  goldDiff10: number | null;
  goldDiff15: number | null;
  goldDiff20: number | null;
  firstBloodTimeS: number | null;
  firstTowerTimeS: number | null;
}

export interface LpHistoryPoint {
  lp: number;
  capturedAt: string; // ISO timestamp
  tier: TierKey;
  division: number;
  wins: number;
  losses: number;
}

/** Highest tier/division/LP combination ever seen in stored history — not necessarily the current one. */
export interface PeakLp {
  tier: TierKey;
  division: number;
  lp: number;
}

/** Latest Flex (RANKED_FLEX_SR) snapshot — null until we've captured at least one, since most players may not queue Flex at all. */
export interface FlexRank {
  tier: TierKey;
  division: number;
  lp: number;
  wins: number;
  losses: number;
}

/**
 * Aggregated over ALL matches stored for this player (not just the last 5
 * shown in the match history) — real data, no estimation. Riot's own
 * Champion Mastery isn't in here: it only gives points/level, not
 * win/loss/KDA, and mixes in normals/ARAM we don't track.
 */
export interface ChampionPoolEntry {
  champ: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKda: number;
  avgCsPerMin: number;
}

/** Spectator V5 snapshot — checked live on every ladder read, never persisted (would be stale instantly). */
export interface LiveGame {
  champion: string;
  queueLabel: string;
  startedMinutesAgo: number;
}

/** One entry in the Champion Mastery V4 top-5 — Riot's career-wide signal, not derived from our own stored matches. */
export interface MasteryEntry {
  champ: string;
  level: number;
  points: number;
}

/**
 * Two tracked players who showed up as TEAMMATES (same match_id, same win
 * result — Riot doesn't need to tell us teamId for this: within one match
 * a shared win/loss result only happens for players on the same team) in
 * at least one stored match. Computed entirely from data already in
 * `matches`, no extra Riot calls.
 */
export interface DuoPair {
  aName: string;
  aTag: string;
  bName: string;
  bTag: string;
  /** Same Summoner-V4 → Data Dragon icon as the profile header avatar — null falls back to initials. */
  aProfileIconUrl: string | null;
  bProfileIconUrl: string | null;
  games: number;
  wins: number;
  winrate: number;
  /** ISO timestamp of the most recent match they shared. */
  lastPlayedAt: string;
  /** Role each one played most often in the matches THEY SHARED specifically — can differ from their overall main role (duo role swaps happen). Null when team_position wasn't available for enough of their shared matches. */
  aRole: RoleKey | null;
  bRole: RoleKey | null;
  /** Each one's own KDA/main champion, computed ONLY from the games they played as teammates — not their overall career average. */
  aAvgKda: number;
  bAvgKda: number;
  aMainChamp: string | null;
  bMainChamp: string | null;
}

export interface Player {
  name: string;
  tag: string;
  you?: boolean;
  role: RoleKey;
  tierKey: TierKey;
  division: number;
  lp: number;
  wins: number;
  losses: number;
  seed: number;
  drift: number;
  mainChamp: string;
  /** Real Riot profile icon (Summoner-V4 + Data Dragon), for the profile header avatar — null falls back to champion-initials. */
  profileIconUrl: string | null;
  // derived, filled in by buildPlayer()
  spark20: number[];
  lpHistory: LpHistoryPoint[];
  peakLp: PeakLp;
  flexRank: FlexRank | null;
  championPool: ChampionPoolEntry[];
  masteryPool: MasteryEntry[];
  liveGame: LiveGame | null;
  matches: Match[];
  winrate: number;
}

/**
 * Shape a real Riot integration will eventually produce (Account-V1 + League-V4).
 * lib/riot.ts already returns data in roughly this shape — once Supabase is wired,
 * a stored row maps onto this instead of the deterministic mock in lib/mock-data.ts.
 */
export interface TrackedSummoner {
  puuid: string;
  gameName: string;
  tagLine: string;
  region: string; // platform routing value, e.g. "la2"
}
