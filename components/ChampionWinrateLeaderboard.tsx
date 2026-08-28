import type { ChampionLeaderboardEntry } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";

/** Below this, a record on one specific champion is too short to mean much as a "best on X" claim. */
const MIN_GAMES = 50;

/**
 * "Mayor winrate por campeón" — top 7 (jugador, campeón), exigiendo al menos
 * MIN_GAMES partidas CON ESE CAMPEÓN (no partidas totales del jugador). El
 * mismo invocador puede aparecer más de una vez si tiene varios campeones
 * que califican — ver computeChampionLeaderboard() en
 * app/api/ladder/route.ts para el cálculo real.
 */
export function ChampionWinrateLeaderboard({
  entries,
  ddragonVersion,
}: {
  entries: ChampionLeaderboardEntry[];
  ddragonVersion: string | null;
}) {
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
        <div className="champ-pool">
          {entries.map((e, i) => (
            <div className="champ-pool-row" key={`${e.playerName}#${e.playerTag}-${e.champion}`}>
              <span className="leaderboard-rank">{i + 1}</span>
              <ChampIcon champ={e.champion} version={ddragonVersion} className="champ-pool-avatar" />
              <PlayerAvatar name={e.playerName} iconUrl={e.profileIconUrl} className="duo-avatar leaderboard-mini-avatar" />
              <div className="champ-pool-mid">
                <span className="champ-pool-name">{e.champion}</span>
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
    </section>
  );
}
