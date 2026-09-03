import type { FormSplit, RecentForm as RecentFormData } from "@/lib/types";
import { METRIC_INFO } from "@/lib/metric-info";
import { InfoTip } from "./InfoTip";

/**
 * Cómo se muestra cada métrica. Vive acá y no en el type que viaja por la
 * red: el server manda números crudos, la presentación (etiqueta, decimales,
 * unidad, hacia dónde es "mejor") es cosa del cliente.
 */
interface MetricSpec {
  key: keyof RecentFormData;
  label: string;
  decimals: number;
  suffix?: string;
  /** Las que ya SON porcentajes se comparan en puntos, no en % de %. */
  isPercent?: boolean;
  /** Solo las muertes van al revés: bajar es mejorar. */
  lowerIsBetter?: boolean;
  tooltip?: string;
}

const METRICS: MetricSpec[] = [
  { key: "winrate", label: "Winrate", decimals: 0, suffix: "%", isPercent: true },
  { key: "kda", label: "KDA", decimals: 2 },
  { key: "csPerMin", label: "CS / min", decimals: 1, tooltip: METRIC_INFO.csPerMin },
  { key: "killParticipation", label: "Participación", decimals: 0, suffix: "%", isPercent: true, tooltip: METRIC_INFO.killParticipation },
  { key: "damagePerMin", label: "Daño / min", decimals: 0 },
  { key: "goldPerMin", label: "Oro / min", decimals: 0, tooltip: METRIC_INFO.goldPerMin },
  { key: "visionPerMin", label: "Visión / min", decimals: 2, tooltip: METRIC_INFO.visionScore },
  { key: "deathsPerGame", label: "Muertes", decimals: 1, lowerIsBetter: true },
];

/**
 * Por debajo de esto el cambio no se pinta: dos ventanas de partidas nunca
 * dan exactamente el mismo número, y teñir de rojo un -0,4% es ruido
 * disfrazado de señal.
 */
const NEUTRAL_PCT = 2;
const NEUTRAL_POINTS = 1;

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** El cambio, ya resuelto: cuánto, con qué signo se escribe y de qué color va. */
function deltaOf(split: FormSplit, spec: MetricSpec) {
  // Un porcentaje se compara en puntos (52% → 58% es "+6 pts", no "+11,5%"),
  // el resto en cambio relativo. Y con la base en cero el cambio relativo no
  // existe, así que ahí también se cae a la diferencia cruda.
  const inPoints = spec.isPercent === true || Math.abs(split.baseline) < 1e-9;
  const raw = inPoints
    ? split.recent - split.baseline
    : (100 * (split.recent - split.baseline)) / Math.abs(split.baseline);
  const flat = Math.abs(raw) < (inPoints ? NEUTRAL_POINTS : NEUTRAL_PCT);
  const improved = spec.lowerIsBetter === true ? raw < 0 : raw > 0;
  return {
    text: `${raw > 0 ? "+" : raw < 0 ? "−" : ""}${fmt(Math.abs(raw), inPoints ? spec.decimals : 0)}${inPoints ? " pts" : "%"}`,
    arrow: flat ? "" : raw > 0 ? "▲" : "▼",
    tone: flat ? "flat" : improved ? "up" : "down",
  };
}

/**
 * "Forma reciente" — las últimas 20 partidas contra todo el historial
 * anterior del MISMO jugador (ver lib/form.ts). Es la contracara de
 * "Comparación con tu rol", que mide contra los demás: acá el único punto de
 * referencia es uno mismo, así que responde otra pregunta ("¿estoy mejor que
 * hace un mes?") y por eso tiene su propio lenguaje visual — grilla de
 * números con su delta, no barras contra un promedio ajeno.
 */
export function RecentForm({ form }: { form: RecentFormData | null }) {
  if (!form) return null;
  const tiles = METRICS.map((spec) => ({ spec, split: form[spec.key] as FormSplit | null })).filter(
    (t): t is { spec: MetricSpec; split: FormSplit } => t.split !== null
  );
  if (tiles.length === 0) return null;

  return (
    <div className="form-wrap">
      <h4 className="subsection-label">
        Forma reciente
        <InfoTip
          text={`Tus últimas ${form.recentGames} partidas ranked comparadas contra las ${form.baselineGames} anteriores que tenemos guardadas. No es contra el promedio del grupo ni contra tu rol: es contra vos mismo, para ver si estás mejorando o cayendo.`}
        />
        <span className="form-window">
          últimas {form.recentGames} vs. {form.baselineGames} anteriores
        </span>
      </h4>
      <div className="form-grid">
        {tiles.map(({ spec, split }) => {
          const d = deltaOf(split, spec);
          return (
            <div className="form-tile" key={spec.key}>
              <div className="form-tile-k">
                {spec.label}
                {spec.tooltip && <InfoTip text={spec.tooltip} />}
              </div>
              <div className="form-tile-row">
                <span className="form-tile-v">
                  {fmt(split.recent, spec.decimals)}
                  {spec.suffix}
                </span>
                <span className={`form-delta ${d.tone}`}>
                  {d.arrow && <span className="form-delta-arrow">{d.arrow}</span>}
                  {d.text}
                </span>
              </div>
              <div className="form-tile-base">
                antes {fmt(split.baseline, spec.decimals)}
                {spec.suffix}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
