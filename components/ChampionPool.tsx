import type { ChampionPoolEntry } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { championLabel } from "@/lib/champion-names";
// Mismo umbral que usan los insights para decidir si se puede concluir algo
// de un winrate: si no alcanza para sacar una conclusión, tampoco alcanza
// para pintar el porcentaje de verde o rojo.
import { CONFIDENT_GAMES } from "@/lib/champion-insights";

/**
 * "Campeones más jugados" — agregado sobre TODAS las partidas ranked
 * guardadas del jugador (no solo las últimas 5 que se muestran en el
 * historial). Winrate y KDA son reales, calculados de esas partidas, no de
 * Champion Mastery (que solo da puntos/nivel, no victorias/derrotas).
 */
export function ChampionPool({ pool, ddragonVersion }: { pool: ChampionPoolEntry[]; ddragonVersion: string | null }) {
  if (pool.length === 0) {
    return (
      <div className="champ-pool-empty">
        Sin partidas guardadas todavía — el pool se arma solo a medida que se acumulen refrescos.
      </div>
    );
  }
  // Para escalar las barras: la más jugada ocupa todo, el resto en proporción.
  const maxPartidas = Math.max(...pool.map((c) => c.games));
  return (
    <div className="champ-pool">
      {pool.map((c) => (
        <div className="champ-pool-row" key={c.champ}>
          <ChampIcon champ={c.champ} version={ddragonVersion} className="champ-pool-avatar" />
          <div className="champ-pool-mid">
            <span className="champ-pool-name">{championLabel(c.champ)}</span>
            <span className="champ-pool-games">{c.games} {c.games === 1 ? "partida" : "partidas"}</span>
          </div>
          {/* El mismo lenguaje de barra que "Sus líneas" y "Cómo arrancás": el
              largo dice cuánto lo jugó comparado con su campeón más jugado, y
              adentro el verde y el rojo dicen cómo le fue. Va acá porque entre
              el nombre y los números había medio ancho de fila vacío, y porque
              un 100% en 3 partidas al lado de un 50% en 8 necesita que se vea
              de un vistazo cuál de los dos pesa. */}
          <span className="champ-pool-barra" aria-hidden>
            <span className="champ-pool-total" style={{ width: `${(100 * c.games) / maxPartidas}%` }}>
              <span className="champ-pool-v" style={{ width: `${(100 * c.wins) / c.games}%` }} />
              <span className="champ-pool-d" />
            </span>
          </span>
          <div className="champ-pool-stats">
            <span className={`champ-pool-wr ${c.games < CONFIDENT_GAMES ? "thin" : tonoDeWinrate(c.wins, c.games)}`}>
              {winrateTexto(c.wins, c.games)}
            </span>
            <span className="champ-pool-kda">{c.avgKda.toFixed(2)} KDA</span>
            {/* avgCsPerMin ya se calculaba en la ruta y viajaba en cada
                respuesta del ladder sin que nadie lo mostrara. O se muestra o
                se saca del tipo; mostrarlo cuesta menos y para un laner dice
                bastante de cómo juega ese campeón. */}
            <span className="champ-pool-cs">{c.avgCsPerMin.toFixed(1)} CS</span>
          </div>
        </div>
      ))}
    </div>
  );
}
