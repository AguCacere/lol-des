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

/**
 * Por debajo de esto ni se muestra. Tres tampoco es una muestra seria, pero
 * es el piso donde un resultado deja de ser "jugué una vez y perdí": ya hay
 * una tendencia que mirar, con la cantidad de partidas al lado para que se
 * lea con la desconfianza que merece.
 */
export const MATCHUP_MIN_GAMES = 3;

/**
 * `matches` es el historial ranked completo de UN jugador, en cualquier
 * orden. Devuelve los pares campeón/rival con suficientes partidas,
 * ordenados por cantidad de partidas y, a igualdad, por peor winrate
 * primero: lo que más te cuesta es lo que querés ver arriba.
 */
export function computeMatchups(matches: MatchupSample[]): Matchup[] {
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

  const out: Matchup[] = [];
  for (const agg of byPair.values()) {
    if (agg.games < MATCHUP_MIN_GAMES) continue;
    out.push({
      champ: agg.champ,
      opponent: agg.opponent,
      games: agg.games,
      wins: agg.wins,
      losses: agg.games - agg.wins,
      winrate: Math.round((100 * agg.wins) / agg.games),
      avgGoldDiff15: agg.goldN > 0 ? Math.round(agg.goldSum / agg.goldN) : null,
    });
  }

  out.sort((a, b) => b.games - a.games || a.winrate - b.winrate);
  return out;
}
