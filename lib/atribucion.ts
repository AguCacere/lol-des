/**
 * **Atribuir LP a una partida.** La fuente única.
 *
 * Toda la app que necesita saber "cuánto LP movió ESTA partida" pasa por acá:
 * el gráfico de progresión del perfil (lib/progresion.ts) y la detección de
 * Aegis (lib/aegis.ts). Antes eran dos recorridos distintos sobre los mismos
 * datos, con dos criterios distintos —uno usaba el FINAL de la partida y el
 * otro el principio— y por lo tanto dos respuestas distintas para la misma
 * pregunta. La de Aegis era la peor de las dos.
 *
 * El método, en una línea: el cron guarda una foto del rango cada ~15 minutos
 * (`lp_snapshots`, ver lib/refresh.ts), así que **un par de fotos consecutivas
 * encierra lo que pasó entre las dos**. Si adentro de ese tramo cayó UNA sola
 * partida, la diferencia de rankScore entre las dos fotos es exactamente lo
 * que movió esa partida. No es una estimación: es la resta.
 *
 * Tres reglas que no se negocian:
 *
 * 1. **Por el FINAL de la partida**, `playedAt + durationS`, nunca por el
 *    principio. El LP se mueve al terminar. Una partida de 30 minutos que
 *    arranca 22:37 y termina 23:08 cae, mirando el principio, en el tramo de
 *    la foto de las 22:45 —que la agarró jugando— y esa foto todavía no
 *    incluía el resultado. Con fotos cada 15 minutos y partidas de 25-40, casi
 *    todas cruzan una: no es un caso raro, es el caso normal.
 * 2. **Dos o más partidas en el mismo tramo no se reparten.** No se divide, no
 *    se interpola, no se estima. Las dos quedan sin atribuir y se dicen.
 * 3. **Lo que no cae en ningún tramo tampoco se inventa.** Partidas anteriores
 *    a la primera foto guardada, o en un hueco donde el cron no corrió.
 *
 * Y una validación de más, cuando los datos la permiten: las fotos guardan
 * `wins` y `losses` además del LP, así que en un tramo con una sola partida se
 * puede pedir que los contadores se hayan movido exactamente en uno y del lado
 * correcto. Ver `coherenciaWL`.
 */

import { rankScore } from "./ladder";
import type { LpHistoryPoint } from "./types";

/** Lo mínimo que hace falta de una partida para poder ubicarla entre dos fotos. */
export interface PartidaUbicable {
  matchId: string;
  playedAt: string;
  /** Segundos. Se usa para saber CUÁNDO TERMINÓ, que es cuando se mueve el LP. */
  durationS: number;
  win: boolean;
}

/**
 * Qué dicen los contadores de victorias/derrotas del tramo.
 *
 * - `ok`: se movieron exactamente en uno y del lado que corresponde al
 *   resultado de la partida. La atribución está confirmada por dos caminos.
 * - `contradice`: se movieron, pero no así. O sea que en ese tramo pasó algo
 *   más de lo que tenemos guardado —otra partida que todavía no bajamos, o una
 *   que se guardó con otro resultado—, y el delta de LP NO es de una sola.
 * - `sin-datos`: no se puede verificar. Contadores en cero (arranque de
 *   season), o que retroceden (reset), o que no se movieron.
 */
export type CoherenciaWL = "ok" | "contradice" | "sin-datos";

export interface TramoAtribuido<T extends PartidaUbicable> {
  partida: T;
  /** La foto de ANTES y la de DESPUÉS. El tramo entero, no solo el delta. */
  antes: LpHistoryPoint;
  despues: LpHistoryPoint;
  /** Lo que movió, en la escala de rankScore (no en LP crudo: el LP se resetea al ascender). */
  lp: number;
  wl: CoherenciaWL;
}

export interface Atribucion<T extends PartidaUbicable> {
  /** Las que tienen un LP propio e inequívoco, de la más vieja a la más nueva. */
  atribuidas: TramoAtribuido<T>[];
  /** Las que no: compartían tramo, o cayeron fuera de todos. */
  sinAtribuir: T[];
}

/** rankScore de una foto. Con rankScore y no con el LP crudo: al ascender el LP vuelve a ~0. */
export const scoreDeFoto = (f: { tier: LpHistoryPoint["tier"]; division: number; lp: number }) =>
  rankScore(f.tier, f.division, f.lp);

/** Cuándo terminó, en ms. NaN si la fecha no se puede leer. */
export function finDePartida(m: PartidaUbicable): number {
  const inicio = Date.parse(m.playedAt);
  return Number.isNaN(inicio) ? NaN : inicio + m.durationS * 1000;
}

/**
 * La segunda validación: ¿los contadores de la foto acompañan a esta partida?
 *
 * Conservadora a propósito. Cuando no se puede verificar devuelve `sin-datos`
 * y no `contradice`: un historial viejo o incompleto no tiene por qué invalidar
 * una atribución que por LP es correcta — solo baja la confianza de lo que se
 * construya encima.
 */
export function coherenciaWL(antes: LpHistoryPoint, despues: LpHistoryPoint, win: boolean): CoherenciaWL {
  const dv = despues.wins - antes.wins;
  const dd = despues.losses - antes.losses;
  // Contadores inusables: retroceden (reset de season, o una foto de otra
  // cola), o la foto de antes está en cero y no hay contra qué comparar.
  if (dv < 0 || dd < 0) return "sin-datos";
  if (antes.wins === 0 && antes.losses === 0) return "sin-datos";
  // No se movió nada: la foto no llegó a registrar la partida (los contadores
  // y el LP los trae la misma llamada, pero una foto puede repetirse).
  if (dv === 0 && dd === 0) return "sin-datos";
  const esperado = win ? dv === 1 && dd === 0 : dv === 0 && dd === 1;
  return esperado ? "ok" : "contradice";
}

/**
 * `fotosAsc` tienen que venir ASCENDENTES por `capturedAt` y ya deduplicadas
 * (la ruta del ladder las entrega así). `partidas` puede venir en cualquier
 * orden.
 *
 * Recorrido lineal y no un `find` por partida: Aegis mira TODO el historial
 * —cientos de partidas contra miles de fotos— y el cuadrático se notaba en una
 * ruta que ya hace bastante. Las dos listas están ordenadas, así que alcanza
 * con un puntero que nunca vuelve para atrás.
 */
export function atribuirLp<T extends PartidaUbicable>(
  fotosAsc: LpHistoryPoint[],
  partidas: T[],
): Atribucion<T> {
  const vacia: Atribucion<T> = { atribuidas: [], sinAtribuir: [...partidas] };
  if (fotosAsc.length < 2 || partidas.length === 0) return vacia;

  const tiempos = fotosAsc.map((f) => Date.parse(f.capturedAt));
  const conFin = partidas
    .map((m) => ({ m, fin: finDePartida(m) }))
    .sort((a, b) => a.fin - b.fin);

  const sinAtribuir: T[] = [];
  /** Índice de la foto POSTERIOR → las partidas que terminaron en ese tramo. */
  const porTramo = new Map<number, T[]>();
  let i = 1;
  for (const { m, fin } of conFin) {
    if (Number.isNaN(fin)) {
      sinAtribuir.push(m);
      continue;
    }
    while (i < fotosAsc.length && tiempos[i] < fin) i++;
    // Terminó después de la última foto: todavía no hay con qué cerrarla.
    if (i >= fotosAsc.length) {
      sinAtribuir.push(m);
      continue;
    }
    // Terminó antes de la primera foto, o en un hueco del cron.
    if (fin <= tiempos[i - 1]) {
      sinAtribuir.push(m);
      continue;
    }
    const lista = porTramo.get(i) ?? [];
    lista.push(m);
    porTramo.set(i, lista);
  }

  const atribuidas: TramoAtribuido<T>[] = [];
  for (const [idx, lista] of [...porTramo.entries()].sort((a, b) => a[0] - b[0])) {
    // Dos o más en el mismo tramo: no se sabe cuál dio cuánto. Ninguna.
    if (lista.length > 1) {
      sinAtribuir.push(...lista);
      continue;
    }
    const antes = fotosAsc[idx - 1];
    const despues = fotosAsc[idx];
    atribuidas.push({
      partida: lista[0],
      antes,
      despues,
      lp: scoreDeFoto(despues) - scoreDeFoto(antes),
      wl: coherenciaWL(antes, despues, lista[0].win),
    });
  }

  return { atribuidas, sinAtribuir };
}
