import type { ChampionLeaderboardEntry } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { championLabel } from "@/lib/champion-names";

/** Below this, a record on one specific champion is too short to mean much as a "best on X" claim. */
const MIN_GAMES = 50;

const MEDALS = ["gold", "silver", "bronze"];

/**
 * "Mayor winrate por campeón" — top 7 (jugador, campeón), exigiendo al menos
 * MIN_GAMES partidas CON ESE CAMPEÓN (no partidas totales del jugador). El
 * mismo invocador puede aparecer más de una vez si tiene varios campeones
 * que califican — ver computeChampionLeaderboard() en
 * app/api/ladder/route.ts para el cálculo real. Top 3 en podio (medalla +
 * ícono de campeón grande, #1 destacado) — el resto en la lista compacta.
 * El campeón es el único ícono por fila a propósito: el nombre del jugador ya
 * va como texto justo debajo, así que un mini-avatar del jugador superpuesto
 * al ícono del campeón sería el mismo "dos íconos, un dato" que se sacó de
 * las tarjetas de Clash.
 */
export function ChampionWinrateLeaderboard({
  entries,
  ddragonVersion,
}: {
  entries: ChampionLeaderboardEntry[];
  ddragonVersion: string | null;
}) {
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Mayor winrate por campeón
        </h2>
        <span className="meta">Top 7, mínimo {MIN_GAMES} partidas con ese campeón</span>
      </div>
      {entries.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía nadie llega a {MIN_GAMES} partidas con un mismo campeón</strong>
          Se arma solo a medida que se acumulen refrescos — depende del historial de partidas guardado localmente, no del récord de season de Riot.
        </div>
      ) : (
        <>
          <div className="podium">
            {podium.map((e, i) => (
              <div className={`podium-card rank-${i + 1}`} key={`${e.playerName}#${e.playerTag}-${e.champion}`}>
                <span className={`podium-medal ${MEDALS[i]}`}>{i + 1}</span>
                <ChampIcon champ={e.champion} version={ddragonVersion} className="podium-avatar" />
                <div className="podium-mid">
                  <span className="podium-name">{championLabel(e.champion)}</span>
                  <span className="podium-meta">
                    {e.playerName} · {e.games} partidas
                  </span>
                </div>
                <span className={`podium-wr ${e.winrate >= 50 ? "good" : "bad"}`}>{e.winrate}%</span>
                <span className="podium-record">{e.avgKda.toFixed(2)} KDA</span>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <div className="champ-pool">
              {rest.map((e, i) => (
                <div className="champ-pool-row" key={`${e.playerName}#${e.playerTag}-${e.champion}`}>
                  <span className="leaderboard-rank">{i + 4}</span>
                  <ChampIcon champ={e.champion} version={ddragonVersion} className="champ-pool-avatar" />
                  <div className="champ-pool-mid">
                    <span className="champ-pool-name">{championLabel(e.champion)}</span>
                    <span className="champ-pool-games">
                      {e.playerName} · {e.games} partidas
                    </span>
                  </div>
                  <div className="champ-pool-stats">
                    <span className={`champ-pool-wr ${e.winrate >= 50 ? "good" : "bad"}`}>{e.winrate}%</span>
                    <span className="champ-pool-kda">{e.avgKda.toFixed(2)} KDA</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
