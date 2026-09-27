/**
 * La progresión de LP, PARTIDA POR PARTIDA.
 *
 * El gráfico del perfil dibujaba las últimas veinte FOTOS de LP, que es otra
 * cosa: las fotos las saca el cron cada quince minutos, así que una tarde de
 * seis partidas puede dar cuatro fotos y una noche sin jugar puede dar ocho.
 * La curva resultante tenía zigzag, brillo y etiquetas, y lo único que
 * contestaba era "subió 92 LP". No decía QUÉ produjo esos cambios, que es la
 * única pregunta interesante que un gráfico de LP puede contestar.
 *
 * Acá cada punto es una partida. Y el LP de cada una no se estima ni se
 * calcula acá: sale de `atribuirLp` (lib/atribucion.ts), que es la pieza
 * única que contesta "cuánto movió esta partida" para todo el proyecto — este
 * gráfico y la detección de Aegis leen exactamente el mismo número. Este
 * archivo solo se ocupa de lo que el gráfico necesita encima: la ventana, la
 * curva y los hitos de rango.
 *
 * **Medido contra la base antes de escribir esto**, porque la idea entera
 * depende de que la atribución funcione: de las últimas 20 partidas de cada
 * uno, once de los catorce tienen las veinte con LP propio, uno tiene
 * diecinueve, y los dos que quedan son los inactivos, cuyas últimas veinte son
 * anteriores a que los empezáramos a seguir. Partidas compartiendo un tramo
 * —dos que caen entre las mismas dos fotos y no se puede saber cuál dio
 * cuánto— en la ventana reciente: **cero**.
 *
 * Y las que no se pueden atribuir NO se dibujan. Interpolar dónde iría un
 * punto del que no se sabe el LP es exactamente lo que este archivo no hace:
 * el gráfico muestra menos puntos y dice cuántos quedaron afuera.
 */

import { atribuirLp, scoreDeFoto, type PartidaUbicable } from "./atribucion";
import type { LpHistoryPoint, TierKey } from "./types";

/** Lo que el gráfico necesita de cada partida, arriba de lo que pide la atribución. */
export interface PartidaParaProgresion extends PartidaUbicable {
  champ: string;
  k: number;
  d: number;
  a: number;
}

export interface PuntoProgresion {
  matchId: string;
  playedAt: string;
  win: boolean;
  champ: string;
  k: number;
  d: number;
  a: number;
  /** Minutos, ya redondeados: el tooltip no muestra segundos. */
  dur: number;
  /** Lo que movió ESTA partida, en LP netos (escala de rankScore). */
  lp: number;
  /** El rankScore DESPUÉS de la partida. Es lo que dibuja la curva. */
  score: number;
  /** El rango ANTES y DESPUÉS. Los dos, porque el tooltip dice el tramo
   *  entero —"Diamante 2 · 34 LP → Diamante 2 · 57 LP"— y con uno solo habría
   *  que reconstruir el otro restando, que en un cambio de división da
   *  cualquier cosa. */
  antes: { tier: TierKey; division: number; lp: number };
  tier: TierKey;
  division: number;
  lpDespues: number;
  /**
   * Si en esta partida se movió de rango. Null en el caso normal.
   *
   * `deTier` separa los dos tamaños de noticia: pasar de Platino a Esmeralda
   * es un hito de verdad, moverse de Esmeralda 4 a Esmeralda 3 es un
   * movimiento. El gráfico los dibuja con pesos distintos — con siete
   * carteles iguales, las anotaciones compiten con la curva.
   */
  hito: { dir: "ascenso" | "descenso"; deTier: boolean } | null;
}

export interface Progresion {
  puntos: PuntoProgresion[];
  /** Cuántas de las que se miraron quedaron sin atribuir. Se dice en pantalla. */
  sinAtribuir: number;
  /** El neto de lo dibujado y su récord, para el encabezado. */
  neto: number;
  victorias: number;
  derrotas: number;
  /** El primer y el último punto, para escribir "de acá hasta acá". */
  desde: { tier: TierKey; division: number; lp: number; playedAt: string } | null;
  hasta: { tier: TierKey; division: number; lp: number; playedAt: string } | null;
}

/** Cuántas partidas mira. Veinte es lo que ya dibujaba el gráfico viejo en fotos. */
export const VENTANA_PARTIDAS = 20;

/**
 * `fotos` tienen que venir ASCENDENTES y ya deduplicadas (la ruta del ladder
 * las entrega así). `partidas` puede venir en cualquier orden.
 */
export function progresionPorPartida(
  fotos: LpHistoryPoint[],
  partidas: PartidaParaProgresion[],
  ventana = VENTANA_PARTIDAS,
): Progresion {
  const vacia: Progresion = { puntos: [], sinAtribuir: 0, neto: 0, victorias: 0, derrotas: 0, desde: null, hasta: null };
  if (fotos.length < 2 || partidas.length === 0) return vacia;

  // Las últimas `ventana`, de la más vieja a la más nueva: el gráfico se lee
  // de izquierda a derecha.
  const recientes = [...partidas]
    .sort((x, y) => Date.parse(y.playedAt) - Date.parse(x.playedAt))
    .slice(0, ventana)
    .reverse();

  // La atribución, que es de lib/atribucion.ts y no de acá: el tramo que
  // contiene el FINAL de cada partida, y nada para las que comparten tramo o
  // caen en un hueco.
  const { atribuidas, sinAtribuir } = atribuirLp(fotos, recientes);

  const puntos: PuntoProgresion[] = atribuidas.map(({ partida: m, antes, despues, lp }) => {
    const cruzoTier = antes.tier !== despues.tier;
    const cruzo = cruzoTier || antes.division !== despues.division;
    return {
      matchId: m.matchId,
      playedAt: m.playedAt,
      win: m.win,
      champ: m.champ,
      k: m.k,
      d: m.d,
      a: m.a,
      dur: Math.round(m.durationS / 60),
      lp,
      score: scoreDeFoto(despues),
      antes: { tier: antes.tier, division: antes.division, lp: antes.lp },
      tier: despues.tier,
      division: despues.division,
      lpDespues: despues.lp,
      hito: cruzo ? { dir: lp > 0 ? "ascenso" : "descenso", deTier: cruzoTier } : null,
    };
  });

  if (puntos.length === 0) return { ...vacia, sinAtribuir: sinAtribuir.length };

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  return {
    puntos,
    sinAtribuir: sinAtribuir.length,
    // El neto es la suma de lo dibujado, no la resta entre puntas: si alguna
    // partida quedó sin atribuir, la resta entre puntas incluiría su LP y el
    // gráfico no la muestra. La suma dice exactamente lo que está dibujado.
    neto: puntos.reduce((s, p) => s + p.lp, 0),
    victorias: puntos.filter((p) => p.win).length,
    derrotas: puntos.filter((p) => !p.win).length,
    // El "desde" es el estado ANTES de la primera partida dibujada, que es su
    // score menos lo que ella movió.
    desde: { ...primero.antes, playedAt: primero.playedAt },
    hasta: { tier: ultimo.tier, division: ultimo.division, lp: ultimo.lpDespues, playedAt: ultimo.playedAt },
  };
}
