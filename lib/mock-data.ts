import type { Match, Player, RoleKey, Tier, TierKey } from "./types";

/**
 * Deterministic placeholder data — the exact same generator that shipped in the
 * approved design mockup. Nothing here is real. Swap `getLadder()` for a
 * Supabase query once summoners/matches/lp_snapshots are populated (see
 * supabase/schema.sql and lib/riot.ts).
 */

export const ROLES: Record<RoleKey, { label: string; icon: string }> = {
  top: { label: "Top", icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" },
  jungle: {
    label: "Jungla",
    icon: "M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L2 9l6-1 4-6z",
  },
  mid: { label: "Mid", icon: "M4 20L20 4M4 4h6M4 4v6M20 20h-6M20 20v-6" },
  adc: {
    label: "ADC",
    icon: "M3 21l7-7m0 0l8-8-3-3-8 8m3 3l-3-3m0 0L4 13l3 3",
  },
  support: {
    label: "Support",
    icon: "M12 21s-7-4.35-9.5-9C1 8.6 2.6 5 6 5c2 0 3.5 1.2 4 2 .5-.8 2-2 4-2 3.4 0 5 3.6 3.5 7-2.5 4.65-9.5 9-9.5 9z",
  },
};

export const TIERS: Tier[] = [
  { name: "Hierro", key: "iron", fg: "#a99f95", bg: "rgba(169,159,149,0.14)", rank: 0 },
  { name: "Bronce", key: "bronze", fg: "#c98a5c", bg: "rgba(201,138,92,0.14)", rank: 1 },
  { name: "Plata", key: "silver", fg: "#c3ccd6", bg: "rgba(195,204,214,0.14)", rank: 2 },
  { name: "Oro", key: "gold", fg: "#F5B942", bg: "rgba(245,185,66,0.14)", rank: 3 },
  { name: "Platino", key: "platinum", fg: "#2FE6C9", bg: "rgba(47,230,201,0.14)", rank: 4 },
  { name: "Esmeralda", key: "emerald", fg: "#3ddc84", bg: "rgba(61,220,132,0.14)", rank: 5 },
  { name: "Diamante", key: "diamond", fg: "#7aa8ff", bg: "rgba(122,168,255,0.14)", rank: 6 },
  { name: "Maestro", key: "master", fg: "#c98aff", bg: "rgba(201,138,255,0.14)", rank: 7 },
];

export function tierFor(key: TierKey): Tier {
  return TIERS.find((t) => t.key === key)!;
}

export function tierScore(p: Player): number {
  // division 1 (Riot's "I") outranks division 4 ("IV") within the same tier.
  return tierFor(p.tierKey).rank * 400 + (5 - p.division) * 100 + p.lp;
}

/** Deterministic pseudo-random walk so the same seed always renders the same chart. */
function spark(seed: number, n: number, drift: number): number[] {
  let v = 50;
  const out = [v];
  let s = seed;
  for (let i = 1; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280 - 0.5;
    v = Math.max(4, Math.min(96, v + r * 22 + drift));
    out.push(Math.round(v));
  }
  return out;
}

const CHAMPS = [
  "Senna", "Kai'Sa", "Lee Sin", "Azir", "Thresh", "Jinx", "Vi", "Orianna",
  "Nautilus", "Aphelios", "Graves", "Ahri", "Braum", "Zeri", "Elise", "Corki",
];

export function champTag(name: string): string {
  return name.split(/[\s']/)[0].slice(0, 2).toUpperCase();
}

/** Small curated palette so champion chips in the match list are distinguishable at a glance. */
const CHAMP_PALETTE: { fg: string; bg: string }[] = [
  { fg: "#F5B942", bg: "rgba(245,185,66,0.14)" },
  { fg: "#7aa8ff", bg: "rgba(122,168,255,0.14)" },
  { fg: "#3ddc84", bg: "rgba(61,220,132,0.14)" },
  { fg: "#ff8a65", bg: "rgba(255,138,101,0.14)" },
  { fg: "#c98aff", bg: "rgba(201,138,255,0.14)" },
  { fg: "#2FE6C9", bg: "rgba(47,230,201,0.14)" },
  { fg: "#ff5c93", bg: "rgba(255,92,147,0.14)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic color per champion name — same champ always gets the same chip color. */
export function champColor(name: string): { fg: string; bg: string } {
  return CHAMP_PALETTE[hashString(name) % CHAMP_PALETTE.length];
}

function genMatches(seed: number): Match[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: Match[] = [];
  for (let i = 0; i < 5; i++) {
    const win = rand() > 0.42;
    const champ = CHAMPS[Math.floor(rand() * CHAMPS.length)];
    const k = Math.round(rand() * 9);
    const d = Math.round(rand() * 6);
    const a = Math.round(rand() * 14);
    const cs = Math.round(120 + rand() * 140);
    const dur = Math.round(22 + rand() * 16);
    const dmgShare = Math.round(14 + rand() * 22);
    out.push({
      win, champ, k, d, a, cs,
      csmin: (cs / dur).toFixed(1),
      dur, dmgShare,
      gold: Math.round(8 + rand() * 6),
    });
  }
  return out;
}

type SeedPlayer = Omit<Player, "spark20" | "matches" | "winrate">;

const SEED_PLAYERS: SeedPlayer[] = [
  { name: "Agus", tag: "LAS", you: true, role: "support", tierKey: "platinum", division: 2, lp: 57, wins: 64, losses: 58, seed: 11, drift: 0.6, mainChamp: "Senna" },
  { name: "InsecCarry", tag: "LAS", role: "jungle", tierKey: "master", division: 1, lp: 214, wins: 142, losses: 101, seed: 71, drift: 0.9, mainChamp: "Lee Sin" },
  { name: "ZuluJG", tag: "LAS", role: "jungle", tierKey: "diamond", division: 4, lp: 38, wins: 88, losses: 79, seed: 23, drift: 0.3, mainChamp: "Vi" },
  { name: "ClutchOrBust", tag: "LAS", role: "mid", tierKey: "platinum", division: 4, lp: 12, wins: 51, losses: 49, seed: 37, drift: -0.2, mainChamp: "Azir" },
  { name: "BotDiffLAS", tag: "LAS", role: "adc", tierKey: "emerald", division: 3, lp: 71, wins: 96, losses: 84, seed: 55, drift: 0.4, mainChamp: "Jinx" },
  { name: "MidOrFeed", tag: "LAS", role: "mid", tierKey: "gold", division: 1, lp: 83, wins: 60, losses: 63, seed: 81, drift: 0.1, mainChamp: "Ahri" },
  { name: "TopFerrari", tag: "LAS", role: "top", tierKey: "silver", division: 2, lp: 44, wins: 40, losses: 45, seed: 19, drift: -0.5, mainChamp: "Ornn" },
  { name: "VisionGremlin", tag: "LAS", role: "support", tierKey: "gold", division: 3, lp: 19, wins: 33, losses: 37, seed: 63, drift: -0.1, mainChamp: "Nautilus" },
  { name: "WardsNotIncluded", tag: "LAS", role: "adc", tierKey: "bronze", division: 4, lp: 66, wins: 22, losses: 31, seed: 29, drift: -0.7, mainChamp: "Corki" },
];

function buildPlayer(p: SeedPlayer): Player {
  const matches = genMatches(p.seed * 3 + 1);
  return {
    ...p,
    spark20: spark(p.seed, 20, p.drift),
    matches,
    winrate: Math.round((100 * p.wins) / (p.wins + p.losses)),
  };
}

/**
 * TODO(db): replace with a Supabase query — read `summoners` joined with the
 * latest `lp_snapshots` row per summoner, ordered by tier/division/LP desc.
 * The shape below (Player[]) is what the UI expects either way.
 */
export function getLadder(): Player[] {
  return SEED_PLAYERS.map(buildPlayer).sort((a, b) => tierScore(b) - tierScore(a));
}
