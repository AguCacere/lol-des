import type { MetricInsight } from "@/lib/insights";
import { InfoTip } from "./InfoTip";

function InsightRow({ m }: { m: MetricInsight }) {
  const up = m.deltaPct >= 0;
  return (
    <div className="insight-row">
      <span className="insight-label">
        {m.label}
        {m.tooltip && <InfoTip text={m.tooltip} />}
      </span>
      <span className="insight-value">
        {m.value}
        {m.unit}
        <span className={`insight-delta ${up ? "good" : "bad"}`}>
          {up ? "▲" : "▼"} {Math.abs(Math.round(m.deltaPct))}%
        </span>
      </span>
    </div>
  );
}

/**
 * Comparación contra el promedio real del rol — algo calculado, no un
 * dato crudo. Si no hay suficientes compañeros trackeados en el mismo rol, o
 * si el jugador rinde parejo en todo, lo dice explícitamente en vez de forzar
 * una fortaleza/debilidad que los datos no respaldan.
 */
export function InsightsCard({
  strengths,
  weaknesses,
  sampleSize,
}: {
  strengths: MetricInsight[];
  weaknesses: MetricInsight[];
  sampleSize: number;
}) {
  if (sampleSize === 0) {
    return (
      <div className="insights-card insights-empty">
        Todavía no hay partidas de otros invocadores en ese rol para comparar — se completa solo a medida que el grupo acumula más partidas en cada rol.
      </div>
    );
  }
  if (strengths.length === 0 && weaknesses.length === 0) {
    return (
      <div className="insights-card insights-empty">
        Rendís parejo con el promedio de tu rol en todo lo que medimos — nada para destacar todavía.
      </div>
    );
  }
  return (
    <div className="insights-card">
      {strengths.length > 0 && (
        <div className="insights-col">
          <h4 className="insights-col-label good">Fortalezas</h4>
          {strengths.map((m) => (
            <InsightRow m={m} key={m.key} />
          ))}
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="insights-col">
          <h4 className="insights-col-label bad">Áreas de mejora</h4>
          {weaknesses.map((m) => (
            <InsightRow m={m} key={m.key} />
          ))}
        </div>
      )}
    </div>
  );
}
