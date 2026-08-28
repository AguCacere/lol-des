import type { LpHistoryPoint, Match, PeakLp, Player, RoleKey, Tier, TierKey } from "./types";

/**
 * Shared ranking/stat helpers used by both the ladder API route and the
 * client components that render it — tier math, streaks, relative dates,
 * role-average comparisons. No mock/placeholder data lives here anymore
 * (see git history for the old deterministic generator, removed once the
 * real Supabase + Riot API pipeline fully replaced it).
 */

/** Icon shapes for each role live in components/RoleIcon.tsx — this is just the label. */
export const ROLES: Record<RoleKey, { label: string }> = {
  top: { label: "Top" },
  jungle: { label: "Jungla" },
  mid: { label: "Mid" },
  adc: { label: "ADC" },
  support: { label: "Support" },
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

/**
 * Real Riot rank emblem art, keyed by TierKey. Not Data Dragon — Riot's
 * official CDN doesn't publish these under any documented endpoint. Community
 * Dragon (a long-established, widely-used mirror of Riot's game assets — the
 * same source most third-party trackers pull rank emblems from) does.
 * "master" also covers Grandmaster/Challenger here, same fold TierKey
 * already makes everywhere else in this app.
 */
export function rankEmblemUrl(tierKey: TierKey): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblems/emblem-${tierKey}.png`;
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

export function champTag(name: string): string {
  return name.split(/[\s']/)[0].slice(0, 2).toUpperCase();
}

/**
 * Green if the series net-rose, red if it net-fell — matches the app's own
 * verde=positivo/rojo=negativo rule. Same hex as --good/--critical in
 * globals.css (not the CSS var itself, since this feeds an inline SVG stroke
 * color computed in JS) — they used to drift from the token values after the
 * palette got refined, so a chart's line and its own delta-chip badge could
 * show two visibly different shades of "green" side by side.
 */
export function trendColor(values: number[]): string {
  const delta = values[values.length - 1] - values[0];
  return delta >= 0 ? "#34C97C" : "#F0555F";
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

/**
 * Minute/hour-grained version of formatRelativeDate, for things that refresh
 * every few minutes (the ladder's "última actualización") instead of daily —
 * "hace 3 días" doesn't distinguish something 20 minutes old from 20 hours old.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / (1000 * 60));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  return formatRelativeDate(iso);
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
