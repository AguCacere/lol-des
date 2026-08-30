import type { Player } from "@/lib/types";
import { ROLES } from "@/lib/ladder";
import { PlayerAvatar } from "./PlayerAvatar";

/** Below this, a season record is too short to mean much as a "best winrate" claim. */
const MIN_GAMES = 100;

const MEDALS = ["gold", "silver", "bronze"];

/**
 * "Mayor winrate" — ranking del grupo entero por winrate de season, exigiendo
 * al menos MIN_GAMES partidas jugadas (wins+losses de League-V4, el récord
 * de season completo de Riot — no partidas guardadas localmente, así que
 * esto puede tener candidatos desde el primer refresh de alguien con
 * historial previo, a diferencia del ranking por campeón). Top 3 en podio
 * (medalla + avatar grande, #1 destacado) — el resto en la lista compacta
 * de siempre.
 */
export function TopWinrate({ players }: { players: Player[] }) {
  const qualified = [...players]
    .filter((p) => p.wins + p.losses >= MIN_GAMES)
    .sort((a, b) => b.winrate - a.winrate);
  const podium = qualified.slice(0, 3);
  const rest = qualified.slice(3);

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Mayor winrate
        </h2>
        <span className="meta">Season completa, mínimo {MIN_GAMES} partidas jugadas</span>
      </div>
      {qualified.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía nadie llega a {MIN_GAMES} partidas</strong>
          Se arma solo cuando algún invocador del grupo acumula {MIN_GAMES}+ partidas jugadas esta season.
        </div>
      ) : (
        <>
          <div className="podium">
            {podium.map((p, i) => (
              <div className={`podium-card rank-${i + 1}`} key={`${p.name}#${p.tag}`}>
                <span className={`podium-medal ${MEDALS[i]}`}>{i + 1}</span>
                <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="podium-avatar" />
                <div className="podium-mid">
                  <span className="podium-name">
                    {p.name} <span className="player-tag">#{p.tag}</span>
                  </span>
                  <span className="podium-meta">
                    {ROLES[p.role].label} · {p.wins + p.losses} partidas
                  </span>
                </div>
                <span className={`podium-wr ${p.winrate >= 50 ? "good" : "bad"}`}>{p.winrate}%</span>
                <span className="podium-record">
                  {p.wins}V {p.losses}D
                </span>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <div className="champ-pool">
              {rest.map((p, i) => (
                <div className="champ-pool-row" key={`${p.name}#${p.tag}`}>
                  <span className="leaderboard-rank">{i + 4}</span>
                  <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="duo-avatar" />
                  <div className="champ-pool-mid">
                    <span className="champ-pool-name">
                      {p.name} <span className="player-tag">#{p.tag}</span>
                    </span>
                    <span className="champ-pool-games">
                      {ROLES[p.role].label} · {p.wins + p.losses} partidas
                    </span>
                  </div>
                  <div className="champ-pool-stats">
                    <span className={`champ-pool-wr ${p.winrate >= 50 ? "good" : "bad"}`}>{p.winrate}%</span>
                    <span className="champ-pool-kda">
                      {p.wins}V {p.losses}D
                    </span>
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
