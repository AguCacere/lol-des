import { rankScore } from "./ladder";
import type { AegisStats, LpHistoryPoint } from "./types";

/**
 * Statistical inference for "Aegis of Valor" — see AegisStats in lib/types.ts
 * for why this is a heuristic rather than a real Riot field. The core idea:
 * every ~15min refresh takes an lp_snapshots row (see lib/refresh.ts), so a
 * pair of CONSECUTIVE snapshots brackets whatever ranked games happened
 * between them. When exactly ONE ranked match falls in that window, the
 * combined rankScore delta between the two snapshots is THAT match's real
 * LP change — unambiguous. Two or more matches in the same window can't be
 * split apart, so those windows are skipped entirely rather than guessed.
 */

export interface RankedMatchLite {
  playedAt: string;
  win: boolean;
}

/** Below this many isolated samples of EACH result (win/loss), there's not enough of this player's own history to call anything an outlier — return null rather than guess off 1-2 data points. */
const MIN_SAMPLE_PER_RESULT = 5;
/** A win's LP delta needs to be at least this many times the player's own median win delta to count as "posible doble LP". Not literally 2x — real deltas wobble with MMR/first-win-of-day bonuses, so a hard 2x floor would miss real cases while still safely clearing normal variance. */
const WIN_MULTIPLIER = 1.7;
/** A loss "protected" needs to have lost no more than this fraction of the player's own median loss (e.g. 0.25 = lost at most a quarter of their usual loss). */
const LOSS_PROTECTION_RATIO = 0.25;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * `snapshotsAsc` and `rankedMatchesAsc` must both already be sorted oldest
 * first (captured_at / played_at ascending) and pre-filtered to ranked
 * solo/duo only — this is a pure function, no sorting/filtering by
 * queue/puuid happens here (see app/api/ladder/route.ts).
 */
export function computeAegisStats(snapshotsAsc: LpHistoryPoint[], rankedMatchesAsc: RankedMatchLite[]): AegisStats | null {
  if (snapshotsAsc.length < 2) return null;

  const isolated: { win: boolean; delta: number }[] = [];
  for (let i = 0; i < snapshotsAsc.length - 1; i++) {
    const prev = snapshotsAsc[i];
    const next = snapshotsAsc[i + 1];
    const prevTime = new Date(prev.capturedAt).getTime();
    const nextTime = new Date(next.capturedAt).getTime();
    // (prevTime, nextTime] — a match played AT prevTime belongs to whatever
    // window produced prev itself, not this one; a match played exactly at
    // nextTime is the one that produced next.
    const inWindow = rankedMatchesAsc.filter((m) => {
      const t = new Date(m.playedAt).getTime();
      return t > prevTime && t <= nextTime;
    });
    if (inWindow.length !== 1) continue;

    const delta = rankScore(next.tier, next.division, next.lp) - rankScore(prev.tier, prev.division, prev.lp);
    isolated.push({ win: inWindow[0].win, delta });
  }

  const winSamples = isolated.filter((s) => s.win).map((s) => s.delta);
  const lossSamples = isolated.filter((s) => !s.win).map((s) => s.delta);
  if (winSamples.length < MIN_SAMPLE_PER_RESULT || lossSamples.length < MIN_SAMPLE_PER_RESULT) return null;

  const winMedian = median(winSamples);
  const lossMedian = median(lossSamples); // negative, in the ordinary case

  let doubleLp = 0;
  let protectedLosses = 0;
  for (const s of isolated) {
    if (s.win && winMedian > 0 && s.delta >= winMedian * WIN_MULTIPLIER) doubleLp++;
    if (!s.win && lossMedian < 0 && s.delta >= lossMedian * LOSS_PROTECTION_RATIO) protectedLosses++;
  }

  return { doubleLp, protectedLosses, sampleSize: isolated.length };
}
