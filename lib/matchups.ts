/**
 * Enfrentamientos de línea — "con Caitlyn contra Jhin: 11V 8D". Sale de
 * `matches.opponent_champion`, que es el campeón del rival con el MISMO
 * teamPosition y del otro equipo, sacado del payload de Match-V5 que ya
 * bajamos (sin llamada extra, ver lib/refresh.ts).
 *
 * Es lo más cerca que llegamos de los counters de op.gg con datos propios,
 * y la diferencia importa: op.gg promedia millones de partidas de todo el
 * servidor, esto promedia las tuyas. Con cuatro partidas contra un campeón
 * el winrate no es una propiedad del enfrentamiento, es ruido — por eso la
 * cantidad de partidas no es un detalle al pie, es parte del dato y se
 * muestra siempre.
 */
import { winrateExacto } from "./winrate";

/** Lo mínimo de una partida que hace falta acá. */
export interface MatchupSample {
  champ: string;
  /** Null cuando Riot no resolvió posición (remakes, colas raras) o nadie coincidió. */
  opponent: string | null;
  win: boolean;
  /** Diferencia de oro contra ese mismo rival a los 15 min. Null en partidas cortas o sin timeline. */
  goldDiff15: number | null;
}

export interface Matchup {
  champ: string;
  opponent: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  /** Promedio de la diferencia de oro a los 15 contra ese rival — null si ninguna partida del par lo tiene. */
  avgGoldDiff15: number | null;
}

/** Todos los enfrentamientos con UN campeón propio, con el total de ese campeón sobre los rivales listados. */
export interface ChampionMatchups {
  champ: string;
  /** Partidas sumando solo los rivales de `opponents`, no todas las del campeón. */
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  opponents: Matchup[];
}

/**
 * Por debajo de esto ni se muestra.
 *
 * Empezó en 3, que como piso estadístico es más defendible. El problema es
 * que la realidad de los datos no lo banca: con 548 partidas repartidas
 * entre siete jugadores, el grupo ENTERO tiene nueve pares que llegan a 3, y
 * todos son de jugadores que hacen one-trick. Al que rota campeones la
 * sección le quedaba vacía, que es peor que una fila con poca muestra:
 * "todavía no hay nada" no le enseña nada a nadie.
 *
 * Con 2 la fila aparece, y lo que la hace honesta no es el umbral sino la
 * presentación: el récord ("2V-0D") va SIEMPRE pegado al porcentaje, y el
 * orden pone primero los pares mejor muestreados. Al que tiene un par de 7
 * partidas no lo empuja hacia abajo ninguna fila de 2, y al que no tiene
 * nada mejor por lo menos le muestra con qué viene chocando.
 */
export const MATCHUP_MIN_GAMES = 2;

/**
 * `matches` es el historial ranked completo de UN jugador, en cualquier
 * orden. Devuelve los enfrentamientos AGRUPADOS POR CAMPEÓN PROPIO.
 *
 * Agrupado y no una lista plana porque la lista plana crece con cada rival:
 * un jugador de un solo campeón con ocho rivales repetidos se comía diez
 * filas y empujaba todo lo demás fuera de la pantalla. Agrupado son cuatro
 * filas que se despliegan, y el total del campeón — que antes había que
 * sumar a ojo — pasa a estar a la vista.
 *
 * Los totales de cada grupo suman SOLO los rivales que se listan, no todas
 * las partidas del campeón: si no, al desplegarlo los números no cerrarían
 * con lo que se ve. Por eso el grupo dice también cuántos rivales incluye.
 */
export function computeMatchups(matches: MatchupSample[]): ChampionMatchups[] {
  interface Agg {
    champ: string;
    opponent: string;
    games: number;
    wins: number;
    goldSum: number;
    goldN: number;
  }
  // La clave se arma con "|" y no con un espacio: los nombres de campeón
  // traen espacios, apóstrofos, puntos y ampersands ("Dr. Mundo",
  // "Nunu & Willump", "Kai'Sa"), pero nunca una barra vertical.
  const byPair = new Map<string, Agg>();

  for (const m of matches) {
    if (!m.opponent) continue;
    const key = `${m.champ}|${m.opponent}`;
    const agg = byPair.get(key) ?? { champ: m.champ, opponent: m.opponent, games: 0, wins: 0, goldSum: 0, goldN: 0 };
    agg.games += 1;
    agg.wins += m.win ? 1 : 0;
    if (m.goldDiff15 !== null) {
      agg.goldSum += m.goldDiff15;
      agg.goldN += 1;
    }
    byPair.set(key, agg);
  }

  const byChamp = new Map<string, Matchup[]>();
  for (const agg of byPair.values()) {
    if (agg.games < MATCHUP_MIN_GAMES) continue;
    const list = byChamp.get(agg.champ) ?? [];
    list.push({
      champ: agg.champ,
      opponent: agg.opponent,
      games: agg.games,
      wins: agg.wins,
      losses: agg.games - agg.wins,
      winrate: winrateExacto(agg.wins, agg.games),
      avgGoldDiff15: agg.goldN > 0 ? Math.round(agg.goldSum / agg.goldN) : null,
    });
    byChamp.set(agg.champ, list);
  }

  const out: ChampionMatchups[] = [];
  for (const [champ, opponents] of byChamp) {
    // Dentro del campeón: primero los rivales más jugados y, a igualdad, el
    // peor winrate arriba — lo que más te cuesta es lo que querés ver.
    opponents.sort((a, b) => b.games - a.games || a.winrate - b.winrate);
    const games = opponents.reduce((n, o) => n + o.games, 0);
    const wins = opponents.reduce((n, o) => n + o.wins, 0);
    out.push({
      champ,
      games,
      wins,
      losses: games - wins,
      winrate: winrateExacto(wins, games),
      opponents,
    });
  }

  // Entre campeones manda la cantidad de partidas: el campeón del que más
  // sabemos va arriba, y es el que conviene que quede abierto por defecto.
  out.sort((a, b) => b.games - a.games || a.winrate - b.winrate);
  return out;
}
