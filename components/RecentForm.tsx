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
  // El signo del TEXTO se decide sobre el número ya redondeado, no sobre el
  // crudo. Antes el signo salía de `raw` y el cuerpo del redondeo, así que un
  // winrate que bajó 0,4 puntos —y el winrate se escribe con cero decimales—
  // se leía "−0 pts". El número decía cero y el signo decía que no.
  //
  // La flecha y el color siguen mirando el crudo a propósito: bajar 0,4 es
  // bajar, y eso lo resuelve `flat`, que para eso está.
  const escala = 10 ** (inPoints ? spec.decimals : 0);
  const redondeado = Math.round(raw * escala) / escala;
  return {
    text: `${redondeado > 0 ? "+" : redondeado < 0 ? "−" : ""}${fmt(Math.abs(redondeado), inPoints ? spec.decimals : 0)}${inPoints ? " pts" : "%"}`,
    arrow: flat ? "" : raw > 0 ? "▲" : "▼",
    tone: flat ? "flat" : improved ? "up" : "down",
    flat,
    /** Cuánto se movió en términos comparables entre métricas, para ordenar. */
    magnitud: inPoints ? Math.abs(raw) / Math.max(1, Math.abs(split.baseline)) : Math.abs(raw) / 100,
  };
}

/** Cuántas se muestran. Cuatro es una lectura; ocho es la grilla de antes. */
const MAXIMO = 4;

/**
 * "Forma reciente" — las últimas 20 partidas contra todo el historial anterior
 * del MISMO jugador (ver lib/form.ts). La contracara de la comparación con el
 * rol: acá el único punto de referencia es uno mismo.
 *
 * Eran OCHO fichas en una grilla, cada una con su rectángulo. Tres problemas
 * en uno: ocupaba dos filas enteras del perfil, la mitad de las fichas decía
 * "no se movió" con el mismo peso visual que la que se movió 92%, y ocho
 * rectángulos para ocho números es exactamente el síndrome de meter cada dato
 * en su caja.
 *
 * Ahora son renglones —sin cajas— y solo las que **de verdad se movieron**,
 * ordenadas por cuánto, como mucho cuatro. Las que quedaron quietas se
 * cuentan en una línea al pie: el dato no se pierde, deja de ocupar lugar.
 */
export function RecentForm({ form }: { form: RecentFormData | null }) {
  if (!form) return null;
  const todas = METRICS.map((spec) => ({ spec, split: form[spec.key] as FormSplit | null }))
    .filter((t): t is { spec: MetricSpec; split: FormSplit } => t.split !== null)
    .map((t) => ({ ...t, d: deltaOf(t.split, t.spec) }));
  if (todas.length === 0) return null;

  const movidas = todas.filter((t) => !t.d.flat).sort((a, b) => b.d.magnitud - a.d.magnitud).slice(0, MAXIMO);
  const quietas = todas.length - todas.filter((t) => !t.d.flat).length;

  return (
    <div className="forma">
      <div className="forma-head">
        <span className="forma-rotulo">
          Forma reciente
          <InfoTip
            text={`Tus últimas ${form.recentGames} partidas ranked comparadas contra las ${form.baselineGames} anteriores que tenemos guardadas. No es contra el promedio del grupo ni contra tu rol: es contra vos mismo, para ver si estás mejorando o cayendo.`}
          />
        </span>
        <span className="forma-ventana">
          últimas {form.recentGames} vs. {form.baselineGames}
        </span>
      </div>
      {movidas.length === 0 ? (
        <p className="forma-quieto">Viene igual que antes en las {todas.length} métricas.</p>
      ) : (
        <ul className="forma-lista">
          {movidas.map(({ spec, split, d }) => (
            <li className="forma-fila" key={spec.key}>
              <span className="forma-metrica">
                {spec.label}
                {spec.tooltip && <InfoTip text={spec.tooltip} />}
              </span>
              <span className="forma-valor">
                {fmt(split.recent, spec.decimals)}
                {spec.suffix}
              </span>
              <span className={`forma-delta ${d.tone}`}>
                {d.arrow && <span className="forma-flecha">{d.arrow}</span>}
                {d.text}
              </span>
              <span className="forma-antes">
                antes {fmt(split.baseline, spec.decimals)}
                {spec.suffix}
              </span>
            </li>
          ))}
        </ul>
      )}
      {quietas > 0 && movidas.length > 0 && (
        <p className="forma-quieto">
          {quietas === 1 ? "Otra métrica no se movió" : `Otras ${quietas} no se movieron`}.
        </p>
      )}
    </div>
  );
}
