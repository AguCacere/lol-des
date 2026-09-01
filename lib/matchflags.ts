/**
 * "Para repasar" — flags a match that swings hard against a player's OWN
 * recent form (not the role average used elsewhere in the app). Pure logic,
 * no API/DB access — app/api/ladder/route.ts feeds it each player's own
 * last WINDOW_SIZE matches and asks for a verdict per match.
 */
import type { MatchFlag } from "./types";

export interface StatSample {
  csPerMin: number;
  visionPerMin: number;
  kda: number;
}

/** How many of the player's own recent matches make up the baseline. */
export const STATS_WINDOW_SIZE = 25;
/** Need at least this many OTHER matches in the window to trust a baseline — too few and one bad game IS the average. */
const MIN_SAMPLE = 8;
/** How far from personal average counts as "worth a look", either direction. */
const DEVIATION_THRESHOLD = 0.35;
/**
 * A baseline sitting near zero makes % deviation meaningless — going from
 * 0.05 to 0.2 vision/min is "+300%" but nobody cares. Skip a metric whose
 * baseline doesn't clear this floor.
 */
const MIN_BASELINE: Record<keyof StatSample, number> = { csPerMin: 1, visionPerMin: 0.3, kda: 0.3 };
const METRIC_LABELS: Record<keyof StatSample, string> = { csPerMin: "CS/min", visionPerMin: "Visión/min", kda: "KDA" };

/**
 * `window` is this player's own recent matches (any order) with `target`
 * somewhere inside it (by reference or by matching every field — pass the
 * exact same object back). Leave-one-out: the baseline excludes `target`
 * itself, so one blowout game can't inflate the bar it's measured against.
 */
export function computeMatchFlag(window: StatSample[], target: StatSample): MatchFlag | null {
  const n = window.length;
  if (n < MIN_SAMPLE + 1) return null;

  const reasons: string[] = [];
  for (const key of Object.keys(METRIC_LABELS) as (keyof StatSample)[]) {
    const sum = window.reduce((s, w) => s + w[key], 0);
    const othersAvg = (sum - target[key]) / (n - 1);
    if (othersAvg < MIN_BASELINE[key]) continue;
    const ratio = (target[key] - othersAvg) / othersAvg;
    if (Math.abs(ratio) >= DEVIATION_THRESHOLD) {
      const pct = Math.round(Math.abs(ratio) * 100);
      reasons.push(`${METRIC_LABELS[key]} ${pct}% por ${ratio > 0 ? "encima" : "debajo"} de tu promedio`);
    }
  }
  return reasons.length > 0 ? { reasons } : null;
}
