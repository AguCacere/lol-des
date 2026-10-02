/**
 * "Para repasar" — marca una partida que se salió de la forma reciente del
 * PROPIO jugador (no del promedio del rol, que se usa en otras pantallas).
 * Lógica pura, sin API ni base: app/api/ladder/route.ts le pasa las últimas
 * WINDOW_SIZE partidas de cada uno y le pide un veredicto por partida.
 *
 * ## Por qué ya no es un porcentaje
 *
 * El cartel decía "KDA 569% por encima de tu promedio". El número es correcto
 * y comunicativamente es malo: con un baseline chico el porcentaje explota y
 * la chapa termina pareciendo un informe financiero. Un KDA que pasa de 0,45
 * a 3,0 es exactamente eso —0,45 contra 3,0— y se entiende sin dividir nada.
 *
 * Así que ahora el flag devuelve el VALOR y el BASELINE de la métrica que más
 * se movió, y la pantalla muestra "KDA 3,0 · habitual 0,45". El porcentaje se
 * sigue calculando porque es lo que ordena los candidatos, pero deja de ser el
 * protagonista.
 *
 * ## Y por qué UNA sola razón
 *
 * Antes se listaban todas las que pasaran el umbral, separadas por puntos
 * medios. Tres razones en una chapa no responden "¿por qué miro esta
 * partida?", la reparten. Se elige la de mayor desvío relativo, que es
 * determinístico y no depende del orden en que estén declaradas.
 */
import type { MatchFlag } from "./types";

export interface StatSample {
  csPerMin: number;
  visionPerMin: number;
  kda: number;
}

/** Cuántas partidas propias recientes forman la base. */
export const STATS_WINDOW_SIZE = 25;
/** Hacen falta al menos estas OTRAS partidas en la ventana: con menos, una mala partida ES el promedio. */
const MIN_SAMPLE = 8;
/** Cuánto hay que apartarse del promedio propio para que valga mirarla, en cualquier dirección. */
const DEVIATION_THRESHOLD = 0.35;
/**
 * Un baseline pegado a cero vuelve al desvío relativo un sinsentido: pasar de
 * 0,05 a 0,2 de visión/min es "+300%" y no le importa a nadie. Una métrica
 * cuyo baseline no llega a este piso no se considera.
 */
const MIN_BASELINE: Record<keyof StatSample, number> = { csPerMin: 1, visionPerMin: 0.3, kda: 0.3 };
const METRIC_LABELS: Record<keyof StatSample, string> = { csPerMin: "CS/min", visionPerMin: "Visión/min", kda: "KDA" };
/**
 * Cuántos decimales se conservan al redondear para mostrar.
 *
 * No es fijo por métrica sino por tamaño, y es justo el punto de todo esto: un
 * KDA habitual de 0,45 redondeado a un decimal da 0,5 y se pierde la
 * diferencia que el cartel existe para mostrar. Debajo de 1 van dos
 * decimales; de ahí para arriba, uno — un CS/min con dos decimales es ruido.
 */
function redondear(v: number): number {
  return Number(v.toFixed(Math.abs(v) < 1 ? 2 : 1));
}

/**
 * `window` son las partidas recientes de ESE jugador (en cualquier orden) con
 * `target` adentro. Leave-one-out: la base excluye a `target`, así que una
 * partida descomunal no infla la vara contra la que se la mide.
 */
export function computeMatchFlag(window: StatSample[], target: StatSample): MatchFlag | null {
  const n = window.length;
  if (n < MIN_SAMPLE + 1) return null;

  const candidatos: { key: keyof StatSample; ratio: number; valor: number; base: number }[] = [];
  for (const key of Object.keys(METRIC_LABELS) as (keyof StatSample)[]) {
    const sum = window.reduce((s, w) => s + w[key], 0);
    const othersAvg = (sum - target[key]) / (n - 1);
    if (othersAvg < MIN_BASELINE[key]) continue;
    const ratio = (target[key] - othersAvg) / othersAvg;
    if (Math.abs(ratio) >= DEVIATION_THRESHOLD) {
      candidatos.push({ key, ratio, valor: target[key], base: othersAvg });
    }
  }
  if (candidatos.length === 0) return null;

  // La que más se apartó. El `>` estricto deja ganar a la primera declarada
  // ante un empate exacto, que es determinístico aunque sea improbable.
  let top = candidatos[0];
  for (const c of candidatos) if (Math.abs(c.ratio) > Math.abs(top.ratio)) top = c;

  return {
    // Se mantiene por compatibilidad: durante la ventana de caché del CDN
    // conviven el JSON viejo y el bundle nuevo, y al revés.
    reasons: candidatos.map(
      (c) => `${METRIC_LABELS[c.key]} ${Math.round(Math.abs(c.ratio) * 100)}% por ${c.ratio > 0 ? "encima" : "debajo"} de tu promedio`,
    ),
    principal: {
      metrica: METRIC_LABELS[top.key],
      valor: redondear(top.valor),
      base: redondear(top.base),
      direccion: top.ratio > 0 ? "encima" : "debajo",
    },
  };
}
