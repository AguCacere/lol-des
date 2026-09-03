import type { ChampionPoolEntry } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
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
  return (
    <div className="champ-pool">
      {pool.map((c) => (
        <div className="champ-pool-row" key={c.champ}>
          <ChampIcon champ={c.champ} version={ddragonVersion} className="champ-pool-avatar" />
          <div className="champ-pool-mid">
            <span className="champ-pool-name">{championLabel(c.champ)}</span>
            <span className="champ-pool-games">{c.games} {c.games === 1 ? "partida" : "partidas"}</span>
          </div>
          <div className="champ-pool-stats">
            <span className={`champ-pool-wr ${c.games < CONFIDENT_GAMES ? "thin" : c.winrate >= 50 ? "good" : "bad"}`}>
              {c.winrate}%
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
