/**
 * Fortalezas/debilidades — comparación del jugador contra el promedio real de
 * su rol (computeRoleAverages en lib/ladder.ts), no una calificación inventada.
 * Marcado explícitamente como "insight calculado" en la UI, separado de los
 * datos crudos, por la regla de no mezclar ambas cosas.
 */

export interface MetricInsight {
  key: string;
  label: string;
  value: number;
  avg: number;
  deltaPct: number;
  unit: string;
  tooltip?: string;
}

interface MetricInput {
  key: string;
  label: string;
  value: number;
  avg: number | null;
  unit: string;
  tooltip?: string;
}

/** Cuánto tiene que diferir del promedio del rol (en %) para contar como notable, no ruido. */
const THRESHOLD_PCT = 8;

export function buildMetricInsights(entries: MetricInput[]): MetricInsight[] {
  const out: MetricInsight[] = [];
  for (const e of entries) {
    // avg === 0 also skipped: a 0% role average (no peer data yet) can't
    // give a meaningful percentage difference — would divide by zero.
    if (e.avg === null || e.avg === 0) continue;
    out.push({
      key: e.key,
      label: e.label,
      value: e.value,
      avg: e.avg,
      deltaPct: ((e.value - e.avg) / e.avg) * 100,
      unit: e.unit,
      tooltip: e.tooltip,
    });
  }
  return out;
}

export function splitStrengthsWeaknesses(insights: MetricInsight[]) {
  const strengths = insights
    .filter((m) => m.deltaPct >= THRESHOLD_PCT)
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 3);
  const weaknesses = insights
    .filter((m) => m.deltaPct <= -THRESHOLD_PCT)
    .sort((a, b) => a.deltaPct - b.deltaPct)
    .slice(0, 3);
  return { strengths, weaknesses };
}
