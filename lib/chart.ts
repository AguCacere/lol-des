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
 * Curva suave que PASA POR TODOS LOS PUNTOS y no se pasa de ninguno.
 *
 * Interpolación cúbica monótona (Fritsch–Carlson). Las dos propiedades que la
 * hacen la única forma aceptable acá:
 *
 * 1. **Interpola**: la curva toca cada punto real. La versión anterior era una
 *    cuadrática por los PUNTOS MEDIOS usando el punto real como control, y eso
 *    aproxima, no interpola: la línea nunca pasaba por los puntos de adentro.
 *    Con el gráfico marcando cada cierre de día con un círculo, los círculos
 *    quedaban flotando arriba o abajo del trazo. Es la definición de un gráfico
 *    que miente.
 * 2. **No sobrepasa**: entre dos puntos la curva se queda entre esos dos
 *    valores. Es lo que descalificó a Catmull-Rom, que inventa un pico que los
 *    datos no tienen. Acá lo garantiza el recorte de las tangentes: cuando el
 *    vector (α, β) se sale del círculo de radio 3, se lo achica.
 *
 * Cae a la polilínea con menos de tres puntos, donde no hay curva que armar.
 */
export function smoothLinePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 3) return linePath(pts);

  // Pendiente de cada tramo.
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    h.push(dx);
    delta.push(dx === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx);
  }

  // Tangente en cada punto: el promedio de los dos tramos que llegan, salvo en
  // los picos y los valles —donde los tramos cambian de signo— que van en 0.
  // Sin eso la curva se pasaría justo en los extremos, que es donde más se nota.
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }

  // El recorte de Fritsch–Carlson: lo que garantiza que no se pase.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const largo = a * a + b * b;
    if (largo > 9) {
      const t = 3 / Math.sqrt(largo);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }

  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i][0] + h[i] / 3;
    const c1y = pts[i][1] + (m[i] * h[i]) / 3;
    const c2x = pts[i + 1][0] - h[i] / 3;
    const c2y = pts[i + 1][1] - (m[i + 1] * h[i]) / 3;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1][0].toFixed(2)},${pts[i + 1][1].toFixed(2)}`;
  }
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
  forma: "recta" | "curva" = "recta",
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
  const line = forma === "curva" ? smoothLinePath(pts) : linePath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - padY} L${pts[0][0].toFixed(1)},${h - padY} Z`;
  const yOf = (valor: number) => padY + (1 - (valor - min) / range) * (h - padY * 2);
  return { line, area, last: pts[pts.length - 1], points: pts, yOf };
}
