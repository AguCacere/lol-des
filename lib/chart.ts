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
 *
 * `escala` fuerza el techo y el piso en vez de sacarlos de la serie. Es para
 * cuando hay VARIAS curvas juntas que se van a comparar entre sí: cada una
 * escalada contra su propio mínimo y máximo dibuja la misma pendiente para
 * recorridos completamente distintos, que es justo lo contrario de lo que
 * promete ponerlas una al lado de la otra. Con `escala` el piso `minRange` no
 * se aplica: el que la pasa ya decidió el recorrido mirando TODAS las series.
 */
export function lineAreaGeometry(
  values: number[],
  w: number,
  h: number,
  padX = 6,
  minRange = 10,
  padY = padX,
  smooth = false,
  escala?: { min: number; max: number },
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

  const min = escala ? escala.min : Math.min(...values);
  const max = escala ? escala.max : Math.max(...values);
  // Sin `escala` manda el piso; con `escala` manda lo que pidieron, y el
  // Math.max es solo para no dividir por cero si llega un techo igual al piso.
  const range = escala ? Math.max(max - min, 0.0001) : Math.max(max - min, minRange);
  const stepX = (w - padX * 2) / (values.length - 1);
  const pts: [number, number][] = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - (v - min) / range) * (h - padY * 2);
    return [x, y];
  });
  const line = smooth ? smoothLinePath(pts) : linePath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - padY} L${pts[0][0].toFixed(1)},${h - padY} Z`;
  const yOf = (valor: number) => padY + (1 - (valor - min) / range) * (h - padY * 2);
  return { line, area, last: pts[pts.length - 1], points: pts, yOf };
}
