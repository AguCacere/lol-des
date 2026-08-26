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
  baronKills: number;
  inhibitorKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  summoner1: string | null;
  summoner2: string | null;
  soloKills: number | null;
  skillshotsHit: number | null;
  damagePerMin: number | null;
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
  // derived, filled in by buildPlayer()
  spark20: number[];
  lpHistory: LpHistoryPoint[];
  peakLp: PeakLp;
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
