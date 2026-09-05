import { METRIC_INFO } from "./metric-info";

/**
 * Radar de rendimiento — las siete dimensiones del juego de un jugador en su
 * rol, cada una medida contra lo que hace el RESTO del grupo en ese mismo rol.
 *
 * La decisión de fondo es cómo se normaliza cada eje. Un radar necesita todos
 * los ejes en la misma escala 0..1, y las escalas naturales no son
 * comparables entre sí: el CS/min de un grupo se mueve en una franja
 * angostísima (7,0 a 8,5 entre jugadores parecidos) mientras que la visión
 * por minuto varía muchísimo más. Normalizar contra un tope fijo (como hacen
 * las barras de "Comparación con tu rol") aplasta los ejes angostos: siempre
 * darían casi lo mismo y el polígono no diría nada.
 *
 * Por eso cada eje se mide en DESVÍOS ESTÁNDAR respecto del promedio del rol
 * (z-score), no en porcentaje. Así cada eje usa su propio rango real y "estar
 * bien en farmeo" y "estar bien en visión" pesan igual en la figura, que es
 * justamente lo que un radar tiene que mostrar.
 *
 * Lógica pura, sin API ni base: app/api/ladder/route.ts arma los promedios y
 * desvíos por rol y pregunta acá.
 */

/** Los siete ejes. El orden es el que se dibuja, en sentido horario desde arriba. */
export const RADAR_METRICS = [
  "kda",
  "killParticipation",
  "dmgShare",
  "objShare",
  "goldPerMin",
  "csPerMin",
  "visionPerMin",
] as const;
export type RadarMetric = (typeof RADAR_METRICS)[number];

/** Promedio y desvío de un eje dentro de una población (el grupo en ese rol, o el jugador). */
export interface MetricStats {
  /** Cuántas partidas aportaron a este eje. Por métrica y no global: una partida puede tener CS/min y no tener participación en kills. */
  n: number;
  mean: number;
  sd: number;
}

export interface RadarAxis {
  key: RadarMetric;
  /** Promedio propio en este eje. */
  value: number;
  /** Promedio del resto del grupo en el mismo rol. */
  peerMean: number;
  /** Desvíos estándar de diferencia contra el grupo. Positivo = por encima. */
  z: number;
  /** Radio 0..1 en el dibujo. 0,5 es exactamente el promedio del rol. */
  radius: number;
}

export interface RadarProfile {
  /** Partidas propias en ese rol que alimentan el radar (el eje peor muestreado). */
  ownGames: number;
  /** Partidas del RESTO del grupo en ese rol (el eje peor muestreado). */
  peerGames: number;
  axes: RadarAxis[];
}

/** Partidas propias mínimas para que un eje signifique algo. */
const MIN_OWN = 10;
/** Partidas ajenas mínimas para que el promedio del rol signifique algo. */
const MIN_PEER = 20;
/**
 * Menos de cinco ejes no es un radar, es un triángulo: la figura deja de
 * leerse como un perfil y pasa a ser tres números mal dibujados.
 */
const MIN_AXES = 5;
/**
 * Dónde cae el promedio del grupo y cuánto abre cada desvío. Con 0,5 y 0,2,
 * ±2,5 desvíos llenan el radio entero — más que eso es un outlier tan grande
 * que la diferencia entre 3 y 4 desvíos ya no aporta nada a la lectura.
 */
const CENTER = 0.5;
const PER_SD = 0.2;
const Z_CAP = 2.5;
/** Piso del radio: sin esto un eje muy malo colapsa al centro y el polígono se rompe en un pico. */
const MIN_RADIUS = 0.06;

/**
 * `own` y `peer` traen, por eje, la muestra del jugador y la del resto del
 * grupo en el mismo rol. Un eje se dibuja solo si las dos tienen muestra
 * suficiente y el grupo tiene algo de dispersión; si quedan menos de
 * MIN_AXES, no hay radar.
 */
export function computeRadar(
  own: Partial<Record<RadarMetric, MetricStats>>,
  peer: Partial<Record<RadarMetric, MetricStats>>
): RadarProfile | null {
  const axes: RadarAxis[] = [];
  let ownGames = Infinity;
  let peerGames = Infinity;

  for (const key of RADAR_METRICS) {
    const o = own[key];
    const p = peer[key];
    if (!o || !p) continue;
    if (o.n < MIN_OWN || p.n < MIN_PEER) continue;
    // Sin dispersión no hay z-score posible (división por cero). Pasa cuando
    // todas las partidas del grupo en ese eje traen el mismo número, que en
    // la práctica significa que la columna no tiene dato real.
    if (!(p.sd > 0)) continue;

    const z = Math.max(-Z_CAP, Math.min(Z_CAP, (o.mean - p.mean) / p.sd));
    axes.push({
      key,
      value: o.mean,
      peerMean: p.mean,
      z,
      radius: Math.max(MIN_RADIUS, Math.min(1, CENTER + z * PER_SD)),
    });
    ownGames = Math.min(ownGames, o.n);
    peerGames = Math.min(peerGames, p.n);
  }

  if (axes.length < MIN_AXES) return null;
  return { ownGames, peerGames, axes };
}

/**
 * Cómo se llama y cómo se escribe cada eje. Vive acá y no en el componente
 * del radar porque lo usan los dos que comparan estas métricas: el radar
 * contra el grupo y el cara a cara entre dos jugadores.
 *
 * `short` es la etiqueta que entra alrededor del polígono; `long` la que se
 * puede leer sola en una fila.
 */
export const RADAR_AXIS: Record<RadarMetric, { short: string; long: string; decimals: number; suffix?: string; tooltip?: string }> = {
  kda: { short: "KDA", long: "KDA", decimals: 2 },
  killParticipation: { short: "Particip.", long: "Participación en kills", decimals: 0, suffix: "%", tooltip: METRIC_INFO.killParticipation },
  dmgShare: { short: "Daño", long: "% del daño del equipo", decimals: 0, suffix: "%", tooltip: METRIC_INFO.dmgShare },
  objShare: { short: "Objetivos", long: "Participación en objetivos", decimals: 0, suffix: "%", tooltip: METRIC_INFO.objShare },
  goldPerMin: { short: "Oro", long: "Oro por minuto", decimals: 0, tooltip: METRIC_INFO.goldPerMin },
  csPerMin: { short: "CS", long: "CS por minuto", decimals: 1, tooltip: METRIC_INFO.csPerMin },
  visionPerMin: { short: "Visión", long: "Visión por minuto", decimals: 2, tooltip: METRIC_INFO.visionScore },
};
