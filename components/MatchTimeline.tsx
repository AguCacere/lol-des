import type { Match } from "@/lib/types";

/**
 * La partida contada como una línea de tiempo en vez de como una lista de
 * números sueltos.
 *
 * Todo lo que dibuja ya estaba guardado y ya se mostraba en el bloque
 * "Timeline" de MatchDetail — la diferencia es que ahí había que leer siete
 * celdas y reconstruir mentalmente el orden de los hechos. Acá se ve de un
 * vistazo dónde se ganó o se perdió la línea: la curva es la diferencia de
 * oro contra el rival de TU carril (no contra el equipo entero), y las marcas
 * de arriba son los hitos ubicados en el minuto real en que pasaron.
 *
 * Sobre cómo está armado: el SVG estira SOLO a lo ancho
 * (preserveAspectRatio="none" con la altura del viewBox igual a la altura
 * real en px). Eso hace que el eje vertical sea 1:1 con los píxeles, y por
 * eso los textos y los puntos son HTML posicionado por encima en vez de
 * elementos del SVG: adentro del SVG escalaban con el ancho del contenedor y
 * un mismo font-size terminaba enorme en desktop y diminuto en mobile. Los
 * trazos llevan vector-effect para no engordar con el estirado horizontal.
 */

/** Unidades del viewBox a lo ancho. Arbitrario: el SVG se estira al ancho real. */
const W = 1000;
const PAD_X = 10;
/** Las tres alturas donde puede caer la etiqueta de un hito, para que dos juntas no se pisen. */
const FILAS = [8, 26, 44];
/** Alto de la banda de la curva. */
const PLOT_H = 92;
/** Espacio debajo del eje para "Inicio" y la duración. */
const PIE_H = 22;
/**
 * Piso de la escala vertical. Sin esto, una partida pareja (±80 de oro) se
 * dibujaría como una montaña rusa: la curva se autoescala al máximo real y
 * exageraría diferencias que no significan nada.
 */
const ESCALA_MINIMA = 600;
/** Separación mínima entre dos etiquetas, en % del ancho, antes de bajar a la fila siguiente. */
const SOLAPE_PCT = 22;

interface Punto {
  min: number;
  valor: number;
}

interface Hito {
  min: number;
  label: string;
  /** Verde si fue nuestro, rojo si fue del rival, gris si no se sabe (partidas viejas o remakes). */
  tono: "good" | "bad" | "muted";
}

function mmss(totalSegundos: number): string {
  const m = Math.floor(totalSegundos / 60);
  const s = totalSegundos % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function tonoDe(mine: boolean | null): Hito["tono"] {
  if (mine === null) return "muted";
  return mine ? "good" : "bad";
}

/**
 * Curva suave por puntos medios: con tres o cuatro mediciones, unirlas con
 * rectas hace que la partida parezca una sucesión de quiebres bruscos que no
 * ocurrieron. La suavidad acá es honesta — entre el minuto 10 y el 15 no
 * sabemos qué pasó, y una curva lo dice mejor que una recta.
 */
function pathSuave(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const act = pts[i];
    const cx = (prev.x + act.x) / 2;
    d += ` C ${cx} ${prev.y}, ${cx} ${act.y}, ${act.x} ${act.y}`;
  }
  return d;
}

export function MatchTimeline({ match }: { match: Match }) {
  const m = match;

  const medidas: Punto[] = [
    { min: 10, valor: m.goldDiff10 },
    { min: 15, valor: m.goldDiff15 },
    { min: 20, valor: m.goldDiff20 },
  ].filter((p): p is Punto => p.valor != null);

  const hitos: Hito[] = [];
  if (m.firstBloodTimeS != null) {
    hitos.push({ min: m.firstBloodTimeS / 60, label: `1ª sangre ${mmss(m.firstBloodTimeS)}`, tono: m.firstBlood ? "good" : "muted" });
  }
  if (m.firstTowerTimeS != null) {
    hitos.push({ min: m.firstTowerTimeS / 60, label: `Torre ${mmss(m.firstTowerTimeS)}`, tono: tonoDe(m.firstTowerMine) });
  }
  if (m.firstDragonTimeS != null) {
    hitos.push({ min: m.firstDragonTimeS / 60, label: `Dragón ${mmss(m.firstDragonTimeS)}`, tono: tonoDe(m.firstDragonMine) });
  }
  if (m.firstBaronTimeS != null) {
    hitos.push({ min: m.firstBaronTimeS / 60, label: `Barón ${mmss(m.firstBaronTimeS)}`, tono: tonoDe(m.firstBaronMine) });
  }
  hitos.sort((a, b) => a.min - b.min);

  // El eje llega hasta donde terminó la partida, pero nunca antes del último
  // dato: un hito a los 22' en una partida marcada de 21' (redondeo de la
  // duración) quedaría dibujado fuera del gráfico.
  const finMin = Math.max(m.dur, ...medidas.map((p) => p.min), ...hitos.map((h) => h.min), 1);
  /** Posición horizontal en unidades del viewBox. */
  const x = (min: number) => PAD_X + (min / finMin) * (W - PAD_X * 2);
  /** La misma posición en %, para lo que se posiciona con CSS encima del SVG. */
  const xp = (min: number) => (x(min) / W) * 100;

  // Cada etiqueta va a la primera fila donde entra sin pisar a la anterior; si
  // no entra en ninguna, cae en la que tenga la última etiqueta más lejos.
  const ultimaPorFila = FILAS.map(() => -Infinity);
  const filaDe = hitos.map((h) => {
    const pos = xp(h.min);
    const libre = ultimaPorFila.findIndex((ult) => pos - ult >= SOLAPE_PCT);
    const fila = libre >= 0 ? libre : ultimaPorFila.indexOf(Math.min(...ultimaPorFila));
    ultimaPorFila[fila] = pos;
    return fila;
  });

  // El alto se calcula recién acá porque depende de cuántas filas de
  // etiquetas se terminaron usando: con un solo hito, reservar las tres
  // filas dejaba una franja vacía arriba del gráfico.
  const filasUsadas = filaDe.length > 0 ? Math.max(...filaDe) + 1 : 0;
  const PLOT_TOP = filasUsadas > 0 ? FILAS[filasUsadas - 1] + 20 : 12;
  const EJE_Y = PLOT_TOP + PLOT_H;
  const H = EJE_Y + PIE_H;
  /** Mitad de la altura útil de la curva, con aire para que el punto no toque el borde. */
  const AMPLITUD = PLOT_H / 2 - 6;

  const escala = Math.max(ESCALA_MINIMA, ...medidas.map((p) => Math.abs(p.valor)));
  const zeroY = PLOT_TOP + PLOT_H / 2;
  const y = (valor: number) => zeroY - (valor / escala) * AMPLITUD;

  // El arranque siempre es cero: a los 0 minutos nadie sacó ventaja todavía.
  const puntos = [{ x: x(0), y: zeroY }, ...medidas.map((p) => ({ x: x(p.min), y: y(p.valor) }))];
  const linea = medidas.length > 0 ? pathSuave(puntos) : "";
  const finArea = puntos[puntos.length - 1].x;
  const area = medidas.length > 0 ? `${linea} L ${finArea} ${zeroY} L ${puntos[0].x} ${zeroY} Z` : "";


  return (
    <div className="match-timeline">
      <div className="mt-plot" style={{ height: `${H}px` }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Línea de tiempo de la partida">
          <defs>
            {/* El área se pinta dos veces con el mismo recorte partido en la
                línea del cero: así el verde es exactamente el tramo por
                arriba y el rojo exactamente el de abajo, sin degradados que
                mientan sobre dónde estuvo el cruce. */}
            <clipPath id="mt-arriba">
              <rect x="0" y={PLOT_TOP} width={W} height={zeroY - PLOT_TOP} />
            </clipPath>
            <clipPath id="mt-abajo">
              <rect x="0" y={zeroY} width={W} height={EJE_Y - zeroY} />
            </clipPath>
            {/* Los datos se cortan en la última medición (el minuto 20 de una
                partida de 31), y cerrar el área ahí con un borde recto se leía
                como un derrumbe que no pasó. Este degradado la desvanece: se
                entiende que hasta ahí sabemos y de ahí en más no. */}
            <linearGradient id="mt-fin" gradientUnits="userSpaceOnUse" x1={Math.max(0, finArea - 90)} x2={finArea}>
              <stop offset="0%" stopColor="#fff" stopOpacity="1" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="mt-mask-fin">
              <rect x="0" y="0" width={W} height={H} fill="url(#mt-fin)" />
            </mask>
          </defs>

          {hitos.map((h, i) => (
            <line
              key={`l${i}`}
              className="mt-hito-linea"
              vectorEffect="non-scaling-stroke"
              x1={x(h.min)}
              x2={x(h.min)}
              y1={FILAS[filaDe[i]] + 12}
              y2={EJE_Y}
            />
          ))}

          {medidas.length > 0 && (
            <g mask="url(#mt-mask-fin)">
              <path className="mt-area good" d={area} clipPath="url(#mt-arriba)" />
              <path className="mt-area bad" d={area} clipPath="url(#mt-abajo)" />
              <path className="mt-linea" d={linea} vectorEffect="non-scaling-stroke" />
            </g>
          )}

          <line className="mt-cero" vectorEffect="non-scaling-stroke" x1={PAD_X} x2={W - PAD_X} y1={zeroY} y2={zeroY} />
          <line className="mt-eje" vectorEffect="non-scaling-stroke" x1={PAD_X} x2={W - PAD_X} y1={EJE_Y} y2={EJE_Y} />
        </svg>

        {/* Etiquetas y puntos como HTML encima del SVG: adentro escalaban con
            el ancho y el mismo font-size quedaba enorme en desktop. */}
        {hitos.map((h, i) => {
          const pos = xp(h.min);
          const alBorde = pos < 10 ? "start" : pos > 90 ? "end" : "mid";
          return (
            <span
              key={`t${i}`}
              className={`mt-hito ${h.tono} ${alBorde}`}
              style={{ left: `${alBorde === "start" ? 0 : alBorde === "end" ? 100 : pos}%`, top: `${FILAS[filaDe[i]]}px` }}
            >
              {h.label}
            </span>
          );
        })}

        {medidas.map((p) => (
          <span
            key={p.min}
            className={`mt-punto ${p.valor >= 0 ? "good" : "bad"}`}
            style={{ left: `${xp(p.min)}%`, top: `${y(p.valor)}px` }}
            title={`Minuto ${p.min}: ${p.valor >= 0 ? "+" : ""}${p.valor.toLocaleString("es-AR")} de oro`}
          />
        ))}

        <span className="mt-min start" style={{ top: `${EJE_Y + 5}px` }}>
          Inicio
        </span>
        <span className="mt-min end" style={{ top: `${EJE_Y + 5}px` }}>
          {m.dur} min
        </span>
      </div>

      {/* Los tres valores al pie y no como celdas aparte en la grilla: son los
          mismos puntos que ya están dibujados, y repetirlos en tres celdas con
          su propio título cada una era la mitad del alto del bloque para
          decir lo mismo dos veces. */}
      <p className="match-timeline-pie">
        <span>Diferencia de oro contra tu rival de carril</span>
        {medidas.length > 0 ? (
          <span className="match-timeline-golds">
            {medidas.map((p) => (
              <span key={p.min}>
                <span className="mtg-min">{p.min}&apos;</span>
                <span className={p.valor >= 0 ? "gd-pos" : "gd-neg"}>
                  {p.valor >= 0 ? "+" : ""}
                  {p.valor.toLocaleString("es-AR")}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span>— sin dato guardado, solo los hitos</span>
        )}
      </p>
    </div>
  );
}
