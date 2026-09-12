/**
 * Straight segments connecting each real point — the classic sharp zigzag
 * line style (like the reference from soloq challenge), not a smoothed curve.
 * Was Catmull-Rom before; that rounded off real up/down movements into soft
 * S-curves and, with few points, could still overshoot past what the data
 * actually supports. A plain polyline never invents shape between two points.
 */
export function linePath(pts: [number, number][]): string {
  return pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
}

/**
 * Quadratic curve through the midpoint of each consecutive pair, using the
 * real point between them as the control — every segment stays inside the
 * triangle formed by its own 3 real points, so unlike Catmull-Rom this can
 * never overshoot past what the data actually supports (same accuracy
 * concern that ruled out Catmull-Rom for linePath above). Used for the dense
 * 20-point compact sparkline specifically: 20 sharp angles packed into a
 * 150×28 box read as noisy/jagged rather than as a trend, and nothing there
 * marks individual points anyway (unlike the detailed chart, which draws a
 * dot on every real snapshot and needs the straight segments between them to
 * stay literal). Falls back to the plain polyline under 3 points, where a
 * quadratic curve has no third point to bend through.
 */
export function smoothLinePath(pts: [number, number][]): string {
  if (pts.length < 3) return linePath(pts);
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(2)},${pts[i][1].toFixed(2)} ${mx.toFixed(2)},${my.toFixed(2)}`;
  }
  const last = pts[pts.length - 1];
  const secondLast = pts[pts.length - 2];
  d += ` Q${secondLast[0].toFixed(2)},${secondLast[1].toFixed(2)} ${last[0].toFixed(2)},${last[1].toFixed(2)}`;
  return d;
}

export interface LineAreaGeometry {
  line: string;
  area: string;
  last: [number, number];
  points: [number, number][];
  /** La misma escala vertical que usaron los puntos, para dibujar guías sobre valores que no son puntos (un límite de división, un máximo). */
  yOf: (valor: number) => number;
}

/**
 * Same math as the mockup's lineAreaSVG(), split from the markup so React owns
 * the SVG tags. `minRange` floors the auto-scaled Y axis (default: 10 LP) so a
 * trivial 1-2 LP fluctuation across a handful of snapshots doesn't get
 * stretched to fill the whole chart height and look like a huge swing. Kept
 * low on purpose: with few real snapshots collected so far, actual LP ranges
 * are often modest (10-20) — a higher floor flattens those real trends too.
 */
/**
 * Reparte los puntos a lo largo del ancho según CUÁNDO pasó cada uno, pero sin
 * dejar que dos queden pegados.
 *
 * El tiempo puro miente menos pero se vuelve ilegible: el ranked se juega a los
 * saques, y medido sobre una semana real —cinco partidas un sábado en dos
 * horas, después días sin tocar— esas cinco quedaban en el 2,1% del ancho, a
 * tres píxeles una de otra. A esa distancia no se le puede apuntar a ninguna y
 * el tooltip del gráfico deja de servir.
 *
 * Entonces: posición por tiempo y después un piso de separación. Un hueco de
 * horas sigue viéndose mucho más ancho que un saque —que es todo el punto— pero
 * ninguna partida desaparece adentro de la de al lado.
 */
function repartirPorTiempo(xs: number[], ancho: number): number[] {
  const t0 = xs[0];
  const span = xs[xs.length - 1] - t0;
  const out = xs.map((t) => ((t - t0) / span) * ancho);
  // El piso nunca puede ser mayor que el reparto parejo: si lo fuera, con
  // muchos puntos la separación mínima sola se pasaría del ancho y el gráfico
  // terminaría siendo el de índice pero peor.
  const minimo = Math.min(SEPARACION_MINIMA, ancho / (xs.length - 1));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + minimo);
  // Empujar puede haber corrido el último más allá del ancho: se re-escala
  // todo para que entre, que achica las separaciones en proporción pero nunca
  // cambia el orden ni junta dos puntos en el mismo lugar.
  const total = out[out.length - 1];
  if (total > ancho) for (let i = 0; i < out.length; i++) out[i] = (out[i] / total) * ancho;
  return out;
}

/** Píxeles mínimos entre dos puntos consecutivos, para que el hover siga sirviendo. */
const SEPARACION_MINIMA = 12;

export function lineAreaGeometry(
  values: number[],
  w: number,
  h: number,
  padX = 6,
  minRange = 10,
  padY = padX,
  smooth = false,
  /**
   * Posiciones en X, normalmente instantes (`Date.parse`). Sin esto los puntos
   * se reparten parejo por índice, que es lo correcto cuando cada punto es una
   * PARTIDA —la curva de la liga, los "últimos 20" del ladder— porque ahí una
   * partida es una partida y el tiempo entre medio no significa nada.
   *
   * Con esto, en cambio, la X es el tiempo de verdad. Se usa en la progresión
   * de LP del perfil, donde el eje promete fechas: mientras el cron anduvo
   * parejo, índice y tiempo daban casi lo mismo y no se notaba, pero la caída
   * del scheduler dejó huecos de horas y el gráfico los dibujaba como una
   * bajada suave y continua que nunca pasó.
   *
   * OJO con el precio: el ranked se juega a los saques. Cinco partidas un
   * sábado a la noche y dos días sin tocar quedan, con la X por tiempo, como
   * cinco puntos amontonados y medio gráfico vacío.
   */
  xs?: number[],
): LineAreaGeometry {
  // Con menos de dos valores no hay línea: stepX dividiría por cero y
  // pts[pts.length - 1] leería de un arreglo vacío. Se devuelve una geometría
  // vacía en vez de tirar — el que dibuja decide si muestra algo, y ninguna
  // pantalla se cae por un jugador sin historial todavía.
  if (values.length < 2) {
    const y = h / 2;
    const punto: [number, number] = [padX, y];
    return { line: "", area: "", last: punto, points: values.length === 1 ? [punto] : [], yOf: () => y };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, minRange);
  const ancho = w - padX * 2;
  const stepX = ancho / (values.length - 1);
  // La X por tiempo solo si vienen tantos instantes como valores y el tramo
  // dura algo. Si todos cayeron en el mismo instante —o si falta alguno— se
  // vuelve al índice en vez de dividir por cero y apilar todo en un punto.
  const porTiempo = xs !== undefined && xs.length === values.length && xs[xs.length - 1] > xs[0];
  const equis = porTiempo ? repartirPorTiempo(xs, ancho) : null;
  const pts: [number, number][] = values.map((v, i) => {
    const x = equis ? padX + equis[i] : padX + i * stepX;
    const y = padY + (1 - (v - min) / range) * (h - padY * 2);
    return [x, y];
  });
  const line = smooth ? smoothLinePath(pts) : linePath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - padY} L${pts[0][0].toFixed(1)},${h - padY} Z`;
  const yOf = (valor: number) => padY + (1 - (valor - min) / range) * (h - padY * 2);
  return { line, area, last: pts[pts.length - 1], points: pts, yOf };
}
