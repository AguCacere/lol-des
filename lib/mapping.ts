import type { RoleKey, TierKey } from "./types";

/** League-V4 tiers → the UI's TierKey. Apex tiers (no sub-division) fold into "master". */
const TIER_KEY_BY_RIOT: Record<string, TierKey> = {
  IRON: "iron",
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
  EMERALD: "emerald",
  DIAMOND: "diamond",
  MASTER: "master",
  GRANDMASTER: "master",
  CHALLENGER: "master",
};

export function tierKeyFromRiot(tier: string | null | undefined): TierKey {
  return TIER_KEY_BY_RIOT[tier ?? ""] ?? "iron";
}

/** "I".."IV" → 1..4 (I is the best sub-rank). Apex tiers store "" — treated as 1. */
const DIVISION_BY_RIOT: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

export function divisionFromRiot(rank: string | null | undefined): number {
  return DIVISION_BY_RIOT[rank ?? ""] ?? 1;
}

const ROLE_BY_TEAM_POSITION: Record<string, RoleKey> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

export function roleFromTeamPosition(pos: string | null | undefined): RoleKey | null {
  return pos ? ROLE_BY_TEAM_POSITION[pos] ?? null : null;
}

const ROLE_KEYS: RoleKey[] = ["top", "jungle", "mid", "adc", "support"];

/** `summoners.role` is free text chosen by the player — fall back to "mid" if it's missing/garbage. */
export function normalizeRole(role: string | null | undefined): RoleKey {
  return ROLE_KEYS.includes(role as RoleKey) ? (role as RoleKey) : "mid";
}

/** Riot's queue config IDs (documented, static — https://static.developer.riotgames.com/docs/lol/queues.json), just the ones worth a friendly label. */
const QUEUE_LABELS: Record<number, string> = {
  420: "SoloQ",
  440: "Flex",
  400: "Normal (Draft)",
  430: "Normal (Blind)",
  450: "ARAM",
  900: "URF",
  1700: "Arena",
};

export function queueLabelFromId(queueId: number): string {
  return QUEUE_LABELS[queueId] ?? "Partida";
}

/** Deterministic small int from a puuid — feeds the profile's cosmetic "seed" stats (see PlayerProfile.tsx). */
export function seedFromPuuid(puuid: string): number {
  let h = 0;
  for (let i = 0; i < puuid.length; i++) {
    h = (h * 31 + puuid.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}
