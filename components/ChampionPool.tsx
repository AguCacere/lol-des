import type { ChampionPoolEntry } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";

/**
 * "Campeones más jugados" — agregado sobre TODAS las partidas guardadas del
 * jugador (no solo las últimas 5 que se muestran en el historial). Winrate y
 * KDA son reales, calculados de esas partidas, no de Champion Mastery (que
 * solo da puntos/nivel, no victorias/derrotas).
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
            <span className="champ-pool-name">{c.champ}</span>
            <span className="champ-pool-games">{c.games} {c.games === 1 ? "partida" : "partidas"}</span>
          </div>
          <div className="champ-pool-stats">
            <span className={`champ-pool-wr ${c.winrate >= 50 ? "good" : "bad"}`}>{c.winrate}%</span>
            <span className="champ-pool-kda">{c.avgKda.toFixed(2)} KDA</span>
          </div>
        </div>
      ))}
    </div>
  );
}
