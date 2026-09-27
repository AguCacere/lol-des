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
 * Acá cada punto es una partida. Y el LP de cada una no se estima: sale de la
 * misma atribución por tramos que usa la liga (ver `lpAtribuido` en
 * lib/liga.ts) — se busca el par de fotos consecutivas que contiene el FINAL
 * de la partida y la diferencia de rankScore entre esas dos fotos es lo que
 * movió.
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

import { rankScore } from "./ladder";
import type { LpHistoryPoint, TierKey } from "./types";

/** Lo mínimo que hace falta de una partida para ubicarla y contarla. */
export interface PartidaParaProgresion {
  matchId: string;
  playedAt: string;
  /** Cuánto duró. Se usa para saber CUÁNDO terminó, que es cuando se mueve el LP. */
  durationS: number;
  win: boolean;
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
  /** Si en esta partida cruzó de división o de tier. Null si no se movió de rango. */
  hito: "ascenso" | "descenso" | null;
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

const score = (p: { tier: TierKey; division: number; lp: number }) => rankScore(p.tier, p.division, p.lp);

/**
 * `fotos` tienen que venir ASCENDENTES y ya deduplicadas (la ruta del ladder
 * las entrega así). `partidas` puede venir en cualquier orden: se ordena acá.
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

  /**
   * A cada partida, el tramo que contiene su FINAL. Por cuándo terminó y no
   * por cuándo empezó: el LP se mueve al final. Con `playedAt` a secas una
   * partida de 30 minutos que arranca 22:37 y termina 23:08 cae en el tramo
   * de la foto de las 22:45 —que la agarró jugando— y esa foto todavía no
   * incluía el resultado. Es la misma corrección que ya estaba en
   * `lpAtribuido`, y no es un caso raro: las fotos van cada 15 minutos y las
   * partidas duran 25-40, así que casi todas cruzan una.
   */
  const porTramo = new Map<number, PartidaParaProgresion[]>();
  for (const m of recientes) {
    const fin = Date.parse(m.playedAt) + m.durationS * 1000;
    if (Number.isNaN(fin)) continue;
    for (let i = 1; i < fotos.length; i++) {
      const desde = Date.parse(fotos[i - 1].capturedAt);
      const hasta = Date.parse(fotos[i].capturedAt);
      if (fin > desde && fin <= hasta) {
        const lista = porTramo.get(i) ?? [];
        lista.push(m);
        porTramo.set(i, lista);
        break;
      }
    }
  }

  const puntos: PuntoProgresion[] = [];
  let sinAtribuir = 0;
  const ubicadas = new Set<string>();

  for (const [i, lista] of [...porTramo.entries()].sort((x, y) => x[0] - y[0])) {
    for (const m of lista) ubicadas.add(m.matchId);
    // Dos o más en el mismo tramo: no se sabe cuál dio cuánto, así que
    // ninguna se dibuja. Medido, en la ventana reciente esto no pasa nunca;
    // el caso existe igual porque una tarde muy seguida podría producirlo.
    if (lista.length > 1) {
      sinAtribuir += lista.length;
      continue;
    }
    const antes = fotos[i - 1];
    const despues = fotos[i];
    const m = lista[0];
    const cruzo = antes.tier !== despues.tier || antes.division !== despues.division;
    const delta = score(despues) - score(antes);
    puntos.push({
      matchId: m.matchId,
      playedAt: m.playedAt,
      win: m.win,
      champ: m.champ,
      k: m.k,
      d: m.d,
      a: m.a,
      dur: Math.round(m.durationS / 60),
      lp: delta,
      score: score(despues),
      antes: { tier: antes.tier, division: antes.division, lp: antes.lp },
      tier: despues.tier,
      division: despues.division,
      lpDespues: despues.lp,
      hito: cruzo ? (delta > 0 ? "ascenso" : "descenso") : null,
    });
  }

  // Las que no cayeron en ningún tramo: se jugaron antes de la primera foto
  // guardada, o el cron se perdió las dos fotos que las rodeaban.
  for (const m of recientes) if (!ubicadas.has(m.matchId)) sinAtribuir++;

  if (puntos.length === 0) return { ...vacia, sinAtribuir };

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  return {
    puntos,
    sinAtribuir,
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
