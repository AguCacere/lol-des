"use client";

import { useState } from "react";
import type { ClashMatch, ClashMatchPlayer, ClashPlayerStats, ClashTournament } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";

const MEDALS = ["gold", "silver", "bronze"];

/** "Winrate por invocador" — cada tracked player's lifetime Clash record. Top 3 en podio (medalla + avatar grande, #1 destacado), el resto en la lista compacta — mismo tratamiento que "Mayor winrate" (Estadísticas). */
function ClashPlayerStatsList({ stats }: { stats: ClashPlayerStats[] }) {
  const podium = stats.slice(0, 3);
  const rest = stats.slice(3);
  return (
    <>
      <div className="podium">
        {podium.map((s, i) => (
          <div className={`podium-card rank-${i + 1}`} key={`${s.playerName}#${s.playerTag}`}>
            <span className={`podium-medal ${MEDALS[i]}`}>{i + 1}</span>
            <PlayerAvatar name={s.playerName} iconUrl={s.profileIconUrl} className="podium-avatar" />
            <div className="podium-mid">
              <span className="podium-name">
                {s.playerName} <span className="player-tag">#{s.playerTag}</span>
              </span>
              <span className="podium-meta">
                {s.games} {s.games === 1 ? "partida de Clash" : "partidas de Clash"}
              </span>
            </div>
            <span className={`podium-wr ${s.winrate >= 50 ? "good" : "bad"}`}>{s.winrate}%</span>
            <span className="podium-record">
              {s.wins}V {s.losses}D
            </span>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="champ-pool">
          {rest.map((s, i) => (
            <div className="champ-pool-row" key={`${s.playerName}#${s.playerTag}`}>
              <span className="leaderboard-rank">{i + 4}</span>
              <PlayerAvatar name={s.playerName} iconUrl={s.profileIconUrl} className="duo-avatar" />
              <div className="champ-pool-mid">
                <span className="champ-pool-name">
                  {s.playerName} <span className="player-tag">#{s.playerTag}</span>
                </span>
                <span className="champ-pool-games">
                  {s.games} {s.games === 1 ? "partida de Clash" : "partidas de Clash"}
                </span>
              </div>
              <div className="champ-pool-stats">
                <span className={`champ-pool-wr ${s.winrate >= 50 ? "good" : "bad"}`}>{s.winrate}%</span>
                <span className="champ-pool-kda">
                  {s.wins}V {s.losses}D
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ClashPlayerRow({ p, ddragonVersion }: { p: ClashMatchPlayer; ddragonVersion: string | null }) {
  return (
    <div className="clash-player-row">
      <PlayerAvatar name={p.playerName} iconUrl={p.profileIconUrl} className="clash-player-avatar" />
      <ChampIcon champ={p.champion} version={ddragonVersion} className="clash-player-champ" />
      <div className="clash-player-mid">
        <span className="clash-player-name">
          {p.playerName}
          <span className="player-tag">#{p.playerTag}</span>
        </span>
        <span className="clash-player-champ-name">{p.champion}</span>
      </div>
      <div className="clash-player-stats">
        <span className="kda">
          {p.k}
          <span className="neu">/</span>
          {p.d}
          <span className="neu">/</span>
          {p.a}
        </span>
        <span className="extra">
          {p.cs} CS · {p.dmgShare}% daño
        </span>
      </div>
      <span className={`clash-player-result ${p.win ? "w" : "l"}`}>{p.win ? "VICTORIA" : "DERROTA"}</span>
    </div>
  );
}

function ClashMatchCard({ m, ddragonVersion }: { m: ClashMatch; ddragonVersion: string | null }) {
  return (
    <div className="clash-match">
      <div className="clash-match-head">
        <span>{new Date(m.playedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
        <span>{Math.round(m.durationS / 60)} min</span>
      </div>
      <div className="clash-match-players">
        {m.players.map((p) => (
          <ClashPlayerRow p={p} ddragonVersion={ddragonVersion} key={`${p.playerName}#${p.playerTag}`} />
        ))}
      </div>
    </div>
  );
}

function ClashTournamentRow({ t, ddragonVersion }: { t: ClashTournament; ddragonVersion: string | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="panel-item">
      <button
        type="button"
        className={`panel-row${expanded ? " is-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="panel-row-mid">
          <span className="panel-row-label">{t.label}</span>
          <span className="panel-row-meta">
            {t.matches.length} partida{t.matches.length === 1 ? "" : "s"} de Clash
          </span>
        </div>
        <div className="panel-row-bar">
          <span className="duo-seg win" style={{ flex: t.wins }} />
          <span className="duo-seg loss" style={{ flex: t.losses }} />
        </div>
        <div className="panel-row-stats">
          <span className={`panel-row-wr ${t.winrate >= 50 ? "good" : "bad"}`}>{t.winrate}%</span>
          <span className="panel-row-record">
            {t.wins}V {t.losses}D
          </span>
        </div>
        <svg
          className="panel-row-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="panel-row-detail">
          {t.matches.map((m) => (
            <ClashMatchCard m={m} ddragonVersion={ddragonVersion} key={m.matchId} />
          ))}
          <p className="clash-conclusion">{t.conclusion}</p>
        </div>
      )}
    </div>
  );
}

/**
 * "Clash" tab — cada torneo de Clash que jugó alguien del grupo, reconstruido
 * enteramente a partir de partidas guardadas (matches.queue_id = 700, ver
 * lib/clash.ts). Riot no expone historial real de torneos Clash pasados
 * (Clash-V1 solo devuelve la inscripción ACTIVA de un jugador, nunca su
 * historial), así que acá no hay nombre de torneo ni resultado de llave real
 * de Riot — cada "torneo" es un día calendario con Clash jugado, con las
 * partidas y stats reales de cada partida, más una conclusión automática.
 */
export function ClashHistory({
  tournaments,
  playerStats,
  loading,
  ddragonVersion,
}: {
  tournaments: ClashTournament[];
  playerStats: ClashPlayerStats[];
  loading: boolean;
  ddragonVersion: string | null;
}) {
  const totalGames = tournaments.reduce((s, t) => s + t.gamesPlayed, 0);
  const totalWins = tournaments.reduce((s, t) => s + t.wins, 0);
  const totalWinrate = totalGames > 0 ? Math.round((100 * totalWins) / totalGames) : 0;

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Clash
        </h2>
        <span className="meta">Cómo le fue al grupo en cada Clash jugado</span>
      </div>

      {!loading && tournaments.length > 0 && (
        <p className="clash-lifetime">
          {tournaments.length} {tournaments.length === 1 ? "torneo" : "torneos"} de Clash registrados · {totalGames}{" "}
          partidas ·{" "}
          <span className={`clash-lifetime-wr ${totalWinrate >= 50 ? "good" : "bad"}`}>{totalWinrate}% winrate</span>
        </p>
      )}

      {!loading && playerStats.length > 0 && (
        <>
          <h4 className="subsection-label">Winrate por invocador</h4>
          <p className="chart-note">
            Partidas de Clash individuales ganadas/perdidas por cada uno, sumando TODOS los torneos jugados — no el
            resultado de un torneo puntual.
          </p>
          <ClashPlayerStatsList stats={playerStats} />
          <h4 className="subsection-label">Historial por día</h4>
        </>
      )}

      <div className={tournaments.length === 0 ? "duo-list" : "panel-list"}>
        {loading ? (
          <div className="empty-state">
            <strong>Cargando…</strong>
            Buscando partidas de Clash guardadas.
          </div>
        ) : tournaments.length === 0 ? (
          <div className="empty-state">
            <strong>Todavía no hay Clash para mostrar</strong>
            Se arma solo la próxima vez que alguien del grupo juegue un Clash — Riot no expone historial de torneos
            pasados, así que esto reconstruye cada día de Clash a partir de las partidas que ya tenemos guardadas.
          </div>
        ) : (
          tournaments.map((t) => <ClashTournamentRow t={t} ddragonVersion={ddragonVersion} key={t.key} />)
        )}
      </div>
    </section>
  );
}
