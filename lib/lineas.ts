import type { RoleKey } from "./types";
import { wilsonLower } from "./wilson";

/**
 * El historial por línea de un jugador: cuánto jugó cada una, cómo le fue, y
 * —lo que en realidad se quiere saber— si lo están sacando de la suya.
 *
 * Todo sale de team_position, que es la posición REAL que Riot asigna en cada
 * partida, no del rol declarado (que nadie declara) ni del "más jugado".
 *
 * Riot no dice qué línea pediste en la cola, así que "autofill" no se puede
 * leer directo. Lo que sí se puede: si alguien jugó 112 de jungla en toda su
 * historia y de las últimas 20 seis fueron en otro lado, lo están mandando a
 * otra parte. Es una inferencia y la app la muestra como tal.
 */

/** Cuántas de las últimas partidas se miran para decidir si lo están sacando de su línea. */
export const VENTANA_RECIENTE = 20;
/** Con menos que esto en la ventana no se dice nada: dos partidas no son una tendencia. */
const MINIMO_PARA_OPINAR = 10;
/** A partir de qué proporción fuera de la línea propia vale la pena mencionarlo. */
const UMBRAL_FUERA = 0.3;

export interface LineaStats {
  role: RoleKey;
  games: number;
  wins: number;
  /** KDA promedio (K+A)/D de esa línea. Null si no jugó ninguna. */
  kda: number | null;
  /**
   * Wilson al 99% sobre el winrate. Sirve para ORDENAR: sin esto, una línea
   * jugada 2 veces con 2 victorias encabeza la lista por encima de uno con
   * 61% en 112 partidas, que es exactamente la mentira que hay que evitar.
   */
  score: number;
}

export interface HistorialLineas {
  /** Las cinco, siempre, ordenadas por partidas jugadas. */
  lineas: LineaStats[];
  /** La más jugada de toda la historia guardada. */
  principal: RoleKey;
  /** Partidas en la línea principal y fuera de ella, sobre TODO el historial. */
  enPrincipal: { games: number; wins: number };
  fuera: { games: number; wins: number };
  /** De las últimas VENTANA_RECIENTE con línea resuelta, cuántas fueron fuera de la principal. */
  recientes: number;
  recientesFuera: number;
  /** Si eso alcanza para decir que lo están sacando de su línea. */
  loSacanDeSuLinea: boolean;
}

export interface PartidaConLinea {
  role: RoleKey;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

const TODAS: RoleKey[] = ["top", "jungle", "mid", "adc", "support"];

/**
 * @param partidas Las partidas con línea resuelta, MÁS NUEVA PRIMERO — así
 *   llegan de la ruta del ladder, y el orden importa para la ventana
 *   reciente.
 */
export function historialDeLineas(partidas: PartidaConLinea[]): HistorialLineas | null {
  if (partidas.length === 0) return null;

  const acc = new Map<RoleKey, { games: number; wins: number; k: number; d: number; a: number }>();
  for (const p of partidas) {
    const cur = acc.get(p.role) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
    cur.games++;
    if (p.win) cur.wins++;
    cur.k += p.kills;
    cur.d += p.deaths;
    cur.a += p.assists;
    acc.set(p.role, cur);
  }

  const lineas: LineaStats[] = TODAS.map((role) => {
    const a = acc.get(role);
    if (!a) return { role, games: 0, wins: 0, kda: null, score: 0 };
    return {
      role,
      games: a.games,
      wins: a.wins,
      // Muertes en 0 en toda una línea es raro pero posible con una sola
      // partida: se divide por 1 para no devolver Infinity.
      kda: Number(((a.k + a.a) / Math.max(1, a.d)).toFixed(2)),
      score: wilsonLower(a.wins, a.games),
    };
  }).sort((x, y) => y.games - x.games);

  const principal = lineas[0].role;
  const enPrincipal = { games: lineas[0].games, wins: lineas[0].wins };
  const fuera = lineas.slice(1).reduce(
    (s, l) => ({ games: s.games + l.games, wins: s.wins + l.wins }),
    { games: 0, wins: 0 },
  );

  const ventana = partidas.slice(0, VENTANA_RECIENTE);
  const recientesFuera = ventana.filter((p) => p.role !== principal).length;

  return {
    lineas,
    principal,
    enPrincipal,
    fuera,
    recientes: ventana.length,
    recientesFuera,
    loSacanDeSuLinea: ventana.length >= MINIMO_PARA_OPINAR && recientesFuera / ventana.length >= UMBRAL_FUERA,
  };
}
