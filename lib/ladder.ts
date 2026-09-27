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
  { name: "Hierro", corto: "H", key: "iron", fg: "#a99f95", bg: "rgba(169,159,149,0.14)", rank: 0 },
  { name: "Bronce", corto: "B", key: "bronze", fg: "#c98a5c", bg: "rgba(201,138,92,0.14)", rank: 1 },
  { name: "Plata", corto: "PA", key: "silver", fg: "#c3ccd6", bg: "rgba(195,204,214,0.14)", rank: 2 },
  { name: "Oro", corto: "O", key: "gold", fg: "#F5B942", bg: "rgba(245,185,66,0.14)", rank: 3 },
  { name: "Platino", corto: "PL", key: "platinum", fg: "#14B8A6", bg: "rgba(20,184,166,0.14)", rank: 4 },
  { name: "Esmeralda", corto: "E", key: "emerald", fg: "#10B981", bg: "rgba(16,185,129,0.14)", rank: 5 },
  { name: "Diamante", corto: "D", key: "diamond", fg: "#7aa8ff", bg: "rgba(122,168,255,0.14)", rank: 6 },
  { name: "Maestro", corto: "M", key: "master", fg: "#c98aff", bg: "rgba(201,138,255,0.14)", rank: 7 },
];

export function tierFor(key: TierKey): Tier {
  return TIERS.find((t) => t.key === key)!;
}

/**
 * Real Riot rank emblem art, keyed by TierKey. Local files under
 * public/icons/ranks/ — same pattern as the role badges (public/icons/roles)
 * and dragon icons (public/icons/dragons), uploaded straight into the repo
 * instead of pulled from a CDN. This used to point at Community Dragon (a
 * community mirror of Riot's game assets); dropped after it turned out
 * unreliable in practice (worked once, then 404'd) — a third-party CDN this
 * app doesn't control isn't worth the flakiness when local files work every
 * time. Returns null for a tier whose file isn't in the repo yet, so
 * TierEmblem renders the text badge directly instead of firing a request
 * that's known to 404 and flashing a broken image first — add the file AND
 * the key here when new art lands.
 */
const RANK_EMBLEMS_AVAILABLE: ReadonlySet<TierKey> = new Set(["bronze", "gold", "platinum", "emerald", "diamond"]);

export function rankEmblemUrl(tierKey: TierKey): string | null {
  return RANK_EMBLEMS_AVAILABLE.has(tierKey) ? `/icons/ranks/${tierKey}.webp` : null;
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
 * Shared "hace N min" wording for a LiveGame, used everywhere one shows up
 * (LiveTray, PlayerProfile's live banner, LadderTable's row badge) — Spectator
 * V5's gameLength is already clamped to >=0 in lib/live.ts, but "hace 0 min"
 * still reads oddly right at that boundary, so 0 gets its own phrasing here
 * instead of each call site inventing its own.
 */
export function liveGameTimeLabel(startedMinutesAgo: number): string {
  return startedMinutesAgo <= 0 ? "recién empezó" : `hace ${startedMinutesAgo} min`;
}

/**
 * Verde si la serie subió, rojo si bajó, GRIS si quedó igual — la misma regla
 * de verde=positivo/rojo=negativo del resto de la app. Same hex as --good/--critical in
 * globals.css (not the CSS var itself, since this feeds an inline SVG stroke
 * color computed in JS) — they used to drift from the token values after the
 * palette got refined, so a chart's line and its own delta-chip badge could
 * show two visibly different shades of "green" side by side.
 */
export function trendColor(values: number[]): string {
  const delta = values[values.length - 1] - values[0];
  // El empate exacto va en gris y no en verde. Con `delta >= 0` una línea
  // PLANA se pintaba de verde, y en la liga eso quedaba a la vista: el que
  // todavía no jugó dibuja [0, 0] y su fila mostraba una raya verde al lado de
  // un "todavía no jugó", como si le estuviera yendo bien. Es la misma regla
  // que el winrate (ver lib/winrate.ts): no moverse no es ganar.
  if (delta === 0) return "#7C7C76";
  return delta > 0 ? "#34C97C" : "#F0555F";
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

/**
 * Argentina está en UTC−3 todo el año. Está duplicado de lib/liga.ts a
 * propósito: liga.ts importa `rankScore` de acá, así que importarlo al revés
 * sería un ciclo. Si algún día vuelve el horario de verano, son dos lugares.
 */
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * En qué DÍA argentino cayó ese instante, como número de día corrido.
 *
 * Restar el huso y truncar: el resultado es el mismo para cualquier hora del
 * mismo día argentino, que es justo lo que "hoy" y "ayer" quieren decir.
 */
function diaArgentino(ms: number): number {
  return Math.floor((ms - ARG_OFFSET_MS) / 86400000);
}

/**
 * "hoy" / "ayer" / "hace N días" / una fecha corta cuando ya es vieja.
 *
 * Cuenta días de CALENDARIO argentinos, no bloques de 24 horas, y esa
 * distinción es la que estaba rota. Antes hacía `(ahora − entonces) / 24h`, así
 * que una partida del lunes a las 20:32 mirada el martes a las 11:54 daba 15
 * horas, o sea "0 días", o sea **"hoy"** — un martes al mediodía, cuatro
 * partidas del lunes a la noche decían todas "hoy". Reportado tal cual.
 *
 * Es exactamente la misma trampa que ya había roto la barra de días de la liga
 * (ver `diasCorridos` en lib/liga.ts): "hace un día" y "ayer" NO son lo mismo.
 * Lo primero mide tiempo transcurrido, lo segundo mide en qué casilla del
 * calendario cayó — y a las dos de la mañana esas dos cuentas discrepan en un
 * día entero.
 */
export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const days = diaArgentino(Date.now()) - diaArgentino(then);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 14) return "hace 1 semana";
  if (days < 30) return `hace ${Math.floor(days / 7)} semanas`;
  // Y la fecha corta también en hora argentina: sin el huso, una partida de las
  // 22 de un 30 se escribía "1 sep" para cualquiera con el reloj adelantado.
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
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

// RoleAverages now lives in ./types — computed server-side in
// app/api/ladder/route.ts from every tracked player's real per-match role
// (team_position), not client-side from players grouped by their one
// declared role. See Player.roleAverages for why.
