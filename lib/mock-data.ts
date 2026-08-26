import type { ChampionPoolEntry, LpHistoryPoint, MasteryEntry, Match, PeakLp, Player, RoleKey, Tier, TierKey } from "./types";

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
  { name: "Platino", key: "platinum", fg: "#14B8A6", bg: "rgba(20,184,166,0.14)", rank: 4 },
  { name: "Esmeralda", key: "emerald", fg: "#10B981", bg: "rgba(16,185,129,0.14)", rank: 5 },
  { name: "Diamante", key: "diamond", fg: "#7aa8ff", bg: "rgba(122,168,255,0.14)", rank: 6 },
  { name: "Maestro", key: "master", fg: "#c98aff", bg: "rgba(201,138,255,0.14)", rank: 7 },
];

export function tierFor(key: TierKey): Tier {
  return TIERS.find((t) => t.key === key)!;
}

/** division 1 (Riot's "I") outranks division 4 ("IV") within the same tier. */
export function rankScore(tierKey: TierKey, division: number, lp: number): number {
  return tierFor(tierKey).rank * 400 + (5 - division) * 100 + lp;
}

export function tierScore(p: Player): number {
  return rankScore(p.tierKey, p.division, p.lp);
}

/** Highest tier/division/LP point in a history series — used for "elo máximo alcanzado". */
export function peakFromHistory(history: LpHistoryPoint[]): PeakLp {
  let best = history[0];
  let bestScore = rankScore(best.tier, best.division, best.lp);
  for (const h of history) {
    const score = rankScore(h.tier, h.division, h.lp);
    if (score > bestScore) {
      best = h;
      bestScore = score;
    }
  }
  return { tier: best.tier, division: best.division, lp: best.lp };
}

export interface NextDivisionInfo {
  tier: TierKey;
  /** null when the target has no sub-divisions (Maestro+). */
  division: number | null;
  lpNeeded: number;
}

/**
 * Divisions below Maestro promote automatically at 100 LP (current ranked
 * system, no promo series) — this is a real threshold, not a guess. Returns
 * null once already in Maestro: there's no further "next division" to track
 * in this app (Grandmaster/Challenger fold into the same "master" TierKey).
 */
export function nextDivisionInfo(tierKey: TierKey, division: number, lp: number): NextDivisionInfo | null {
  if (tierKey === "master") return null;
  const lpNeeded = Math.max(0, 100 - lp);
  if (division > 1) {
    return { tier: tierKey, division: division - 1, lpNeeded };
  }
  const idx = TIERS.findIndex((t) => t.key === tierKey);
  const next = TIERS[idx + 1];
  if (!next) return null;
  return { tier: next.key, division: next.key === "master" ? null : 4, lpNeeded };
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

/** Green if the series net-rose, red if it net-fell — matches the app's own verde=positivo/rojo=negativo rule. */
export function trendColor(values: number[]): string {
  const delta = values[values.length - 1] - values[0];
  return delta >= 0 ? "#3DDC84" : "#FF5B67";
}

export interface Streak {
  result: "W" | "L";
  count: number;
  /** true when every match we have on hand shares `result` — the real streak could be longer than `count`. */
  capped: boolean;
}

/**
 * Current win/loss streak from real match results (matches[0] = most recent).
 * `matches` here is whatever the API returned (today: last 5 stored) — if
 * every one of them matches, the streak is at least `count` but we can't see
 * further back, so callers should render it as "count+" (see Streak.capped).
 */
export function currentStreak(matches: Match[]): Streak | null {
  if (matches.length === 0) return null;
  const result: "W" | "L" = matches[0].win ? "W" : "L";
  let count = 0;
  for (const m of matches) {
    if ((m.win ? "W" : "L") !== result) break;
    count++;
  }
  return { result, count, capped: count === matches.length };
}

/** "hoy" / "ayer" / "hace N días" / a short date once it's old enough. */
export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 14) return "hace 1 semana";
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

const RUNE_PAIRS: [string, string][] = [
  ["Conqueror", "Precision"],
  ["Electrocute", "Domination"],
  ["Arcane Comet", "Sorcery"],
  ["Grasp of the Undying", "Resolve"],
  ["First Strike", "Inspiration"],
];
const RUNE_STYLES = ["Precision", "Domination", "Sorcery", "Resolve", "Inspiration"];

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
    const goldTotal = Math.round((8 + rand() * 6) * dur);
    out.push({
      win, champ, k, d, a, cs,
      csmin: (cs / dur).toFixed(1),
      dur, dmgShare,
      gold: Math.round(goldTotal / dur),
      goldTotal,
      visionScore: Math.round(10 + rand() * 40),
      killParticipation: Math.round(35 + rand() * 40),
      objShare: Math.round(10 + rand() * 30),
      playedAt: new Date(Date.now() - i * 1000 * 60 * 60 * 30).toISOString(),
      primaryRune: RUNE_PAIRS[Math.floor(rand() * RUNE_PAIRS.length)][0],
      primaryStyle: RUNE_PAIRS[Math.floor(rand() * RUNE_PAIRS.length)][1],
      secondaryStyle: RUNE_STYLES[Math.floor(rand() * RUNE_STYLES.length)],
      doubleKills: rand() > 0.5 ? Math.floor(rand() * 3) : 0,
      tripleKills: rand() > 0.85 ? 1 : 0,
      quadraKills: rand() > 0.96 ? 1 : 0,
      pentaKills: rand() > 0.99 ? 1 : 0,
      champLevel: Math.round(11 + rand() * 7),
      damageTaken: Math.round((14 + rand() * 16) * 1000),
      damageMitigated: Math.round((10 + rand() * 20) * 1000),
      wardsPlaced: Math.round(4 + rand() * 16),
      wardsKilled: Math.round(rand() * 6),
      controlWards: Math.round(rand() * 4),
      turretKills: Math.round(rand() * 3),
      dragonKills: Math.round(rand() * 2),
      baronKills: rand() > 0.8 ? 1 : 0,
      inhibitorKills: rand() > 0.9 ? 1 : 0,
      firstBlood: rand() > 0.85,
      firstTower: rand() > 0.85,
      summoner1: rand() > 0.5 ? "Flash" : "Ignite",
      summoner2: "Flash",
      soloKills: Math.floor(rand() * 3),
      skillshotsHit: Math.round(rand() * 20),
      damagePerMin: Math.round(300 + rand() * 500),
    });
  }
  return out;
}

/** Top 5 champions by games played, from ALL of a player's stored matches — mirrors app/api/ladder/route.ts's real-data version. */
function championPoolFromMatches(matches: Match[]): ChampionPoolEntry[] {
  const stats = new Map<string, { games: number; wins: number; kSum: number; dSum: number; aSum: number; csMinSum: number }>();
  for (const m of matches) {
    const agg = stats.get(m.champ) ?? { games: 0, wins: 0, kSum: 0, dSum: 0, aSum: 0, csMinSum: 0 };
    agg.games += 1;
    agg.wins += m.win ? 1 : 0;
    agg.kSum += m.k;
    agg.dSum += m.d;
    agg.aSum += m.a;
    agg.csMinSum += parseFloat(m.csmin);
    stats.set(m.champ, agg);
  }
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

type SeedPlayer = Omit<Player, "spark20" | "lpHistory" | "peakLp" | "flexRank" | "championPool" | "masteryPool" | "matches" | "winrate">;

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

/** Deterministic mock top-5 mastery — mainChamp always leads, matching how real refreshes set it from mastery #1. */
function mockMasteryPool(seed: number, mainChamp: string): MasteryEntry[] {
  const others = CHAMPS.filter((c) => c !== mainChamp);
  const champs = [mainChamp, ...others.slice(seed % others.length).concat(others).slice(0, 4)];
  let s = seed * 7 + 3;
  return champs.slice(0, 5).map((champ, i) => {
    s = (s * 9301 + 49297) % 233280;
    const points = Math.round((90000 - i * 18000) * (0.6 + (s / 233280) * 0.6));
    const level = points > 300000 ? 7 : points > 100000 ? 6 : points > 50000 ? 5 : 4;
    return { champ, level, points };
  });
}

function buildPlayer(p: SeedPlayer): Player {
  const matches = genMatches(p.seed * 3 + 1);
  const spark20 = spark(p.seed, 20, p.drift);
  const lpHistory: LpHistoryPoint[] = spark20.map((lp, i) => ({
    lp,
    capturedAt: new Date(Date.now() - (spark20.length - 1 - i) * 1000 * 60 * 60 * 20).toISOString(),
    tier: p.tierKey,
    division: p.division,
    wins: p.wins,
    losses: p.losses,
  }));
  return {
    ...p,
    spark20,
    lpHistory,
    peakLp: peakFromHistory(lpHistory),
    flexRank: null, // el mock no simula una segunda cola — el diseño real muestra "sin datos de Flex" en este caso
    championPool: championPoolFromMatches(matches),
    masteryPool: mockMasteryPool(p.seed, p.mainChamp),
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

export interface RoleAverages {
  kda: number | null;
  csPerMin: number | null;
  dmgShare: number | null;
  killParticipation: number | null;
  objShare: number | null;
  /** how many other tracked players in this role fed the average — 0 means no peers to compare against. */
  sampleSize: number;
}

/**
 * Averages KDA/CS-per-min/damage-share across every OTHER tracked player who
 * shares `player`'s role, pooling their real stored matches. Never compares
 * across roles — a support's CS is naturally far lower than a mid's by game
 * design, so a cross-role average would misrepresent "good"/"bad" rather than
 * clarify it. Returns nulls (sampleSize 0) when there's nobody else in that
 * role yet — callers must show "sin datos" rather than fabricate a number.
 */
export function computeRoleAverages(allPlayers: Player[], player: Player): RoleAverages {
  const peers = allPlayers.filter((p) => p !== player && p.role === player.role && p.matches.length > 0);
  if (peers.length === 0) {
    return { kda: null, csPerMin: null, dmgShare: null, killParticipation: null, objShare: null, sampleSize: 0 };
  }
  const peerMatches = peers.flatMap((p) => p.matches);
  const kda = peerMatches.reduce((s, m) => s + (m.k + m.a) / Math.max(1, m.d), 0) / peerMatches.length;
  const csPerMin = peerMatches.reduce((s, m) => s + parseFloat(m.csmin), 0) / peerMatches.length;
  const dmgShare = peerMatches.reduce((s, m) => s + m.dmgShare, 0) / peerMatches.length;
  const killParticipation = peerMatches.reduce((s, m) => s + m.killParticipation, 0) / peerMatches.length;
  const objShare = peerMatches.reduce((s, m) => s + m.objShare, 0) / peerMatches.length;
  return { kda, csPerMin, dmgShare, killParticipation, objShare, sampleSize: peers.length };
}
