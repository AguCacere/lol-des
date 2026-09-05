"use client";

import { useState } from "react";
import type { ClashMatch, ClashMatchPlayer, ClashPlayerStats, ClashTournament, Player } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { wilsonLower } from "@/lib/wilson";

const MEDALS = ["gold", "silver", "bronze"];

/** Piso de la escala de la barra, igual que en los otros rankings. */
const ESCALA_MINIMA = 10;

/**
 * "Winrate por invocador" en Clash.
 *
 * Ordenado por el límite inferior de Wilson (ver lib/wilson.ts) y no por el
 * winrate crudo: con 38 partidas de Clash repartidas entre once personas, el
 * orden por porcentaje ponía un 3-de-3 arriba de un 7-de-10, que es premiar
 * al que menos jugó. La tabla muestra igual el winrate real — lo que cambia
 * es el ORDEN, y el InfoTip lo dice.
 *
 * El cruce que agrega la última columna: cómo le va en Clash comparado con su
 * SoloQ. Es la pregunta que la sección invitaba a hacer y no contestaba —
 * Clash se juega en equipo armado y con comunicación, así que rendir muy por
 * encima o muy por debajo de la propia SoloQ dice algo.
 */
function ClashPlayerStatsList({ stats, players }: { stats: ClashPlayerStats[]; players: Player[] }) {
  const soloQPorJugador = new Map(players.map((p) => [`${p.name}#${p.tag}`, p.winrate]));
  const ordenadas = [...stats].sort((a, b) => wilsonLower(b.wins, b.games) - wilsonLower(a.wins, a.games));
  const podium = ordenadas.slice(0, 3);
  const rest = ordenadas.slice(3);
  const escala = Math.max(ESCALA_MINIMA, ...ordenadas.map((s) => Math.abs(s.winrate - 50)));

  function soloQDe(s: ClashPlayerStats): number | undefined {
    return soloQPorJugador.get(`${s.playerName}#${s.playerTag}`);
  }

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
            <span className={`podium-wr ${s.wins === s.losses ? "neutral" : s.wins > s.losses ? "good" : "bad"}`}>
              {s.winrate}%
            </span>
            <span className="podium-record">
              <span className="podium-vd">
                {s.wins}V {s.losses}D
              </span>
              <DeltaSoloQ clash={s.winrate} solo={soloQDe(s)} />
            </span>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="tw-table">
          <div className="tw-head">
            <span className="tw-c-rank" />
            <span className="tw-c-name">Invocador</span>
            <span className="tw-c-games">Partidas</span>
            <span className="tw-c-bar">
              Distancia al 50%
              <InfoTip text="La barra sale del 50%. El ORDEN de la tabla, en cambio, no es por winrate: se ordena descontando la incertidumbre de la muestra, porque con estas cantidades de partidas un 3-de-3 quedaría arriba de un 7-de-10 y eso premia al que menos jugó." />
            </span>
            <span className="tw-c-wr">WR</span>
            <span className="tw-c-net">
              vs. SoloQ
              <InfoTip
                align="end"
                text="Diferencia entre su winrate de Clash y el de su SoloQ de esta season. Clash se juega con equipo armado y comunicación: rendir bastante por encima o por debajo de la propia SoloQ es el dato interesante de la sección."
              />
            </span>
          </div>
          {rest.map((s, i) => {
            const tono = s.wins === s.losses ? "neutral" : s.wins > s.losses ? "good" : "bad";
            const largo = Math.min(50, (Math.abs(s.winrate - 50) / escala) * 50);
            return (
              <div className="tw-row" key={`${s.playerName}#${s.playerTag}`}>
                <span className="tw-c-rank">{i + 4}</span>
                <div className="tw-c-name">
                  <PlayerAvatar name={s.playerName} iconUrl={s.profileIconUrl} className="tw-avatar" />
                  <span className="tw-id">
                    <span className="tw-name">
                      {s.playerName} <span className="player-tag">#{s.playerTag}</span>
                    </span>
                    <span className="tw-sub">
                      {s.wins}V {s.losses}D
                    </span>
                  </span>
                </div>
                <span className="tw-c-games">{s.games}</span>
                <div className="tw-c-bar" title={`${s.winrate}% en ${s.games} partidas de Clash`}>
                  <span className="tw-track">
                    <span className={`tw-fill ${tono}`} style={{ width: `${largo}%` }} />
                    <span className="tw-zero" />
                  </span>
                </div>
                <span className={`tw-c-wr ${tono}`}>{s.winrate}%</span>
                <span className="tw-c-net">
                  <DeltaSoloQ clash={s.winrate} solo={soloQDe(s)} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Cuánto se despega su Clash de su SoloQ, en puntos. Debajo de cinco puntos
 * se muestra "=": con seis o diez partidas de Clash, una sola victoria mueve
 * diez puntos, así que una diferencia chica no es una diferencia.
 */
function DeltaSoloQ({ clash, solo }: { clash: number; solo: number | undefined }) {
  if (solo === undefined) return <span className="tw-delta neutral">—</span>;
  const d = clash - solo;
  const tono = Math.abs(d) < 5 ? "neutral" : d > 0 ? "good" : "bad";
  return (
    <span className={`tw-delta ${tono}`} title={`Su SoloQ de esta season: ${solo}%`}>
      {Math.abs(d) < 5 ? "=" : `${d > 0 ? "+" : "−"}${Math.abs(Math.round(d))}`}
    </span>
  );
}

/**
 * A roster tile, not a table row — champion art is the headline (like an
 * actual post-game screen). A grid of these reads as a team roster; a stack
 * of full-width rows with two equal-sized icons each read as a spreadsheet,
 * which was the actual complaint even after the redundant per-row VICTORIA
 * was gone. The player's own avatar isn't repeated here — the name text
 * right below already identifies them, so a small overlapping avatar badge
 * on every single tile was one more colored circle contributing to visual
 * noise without carrying any information the name didn't already give.
 */
function ClashPlayerCard({
  p,
  ddragonVersion,
  showResult,
}: {
  p: ClashMatchPlayer;
  ddragonVersion: string | null;
  /** Only rendered per-card for the rare case where this match's tracked players split across both teams — normally the result is shown once in the match header instead of repeated on every card. */
  showResult: boolean;
}) {
  return (
    <div className="clash-player-card">
      <ChampIcon champ={p.champion} version={ddragonVersion} className="clash-player-champ" />
      <span className="clash-player-name">{p.playerName}</span>
      <span className="clash-player-kda">
        {p.k}
        <span className="neu">/</span>
        {p.d}
        <span className="neu">/</span>
        {p.a}
      </span>
      <span className="clash-player-extra">
        {p.cs} CS · {p.dmgShare}%
      </span>
      {showResult && <span className={`clash-player-result ${p.win ? "w" : "l"}`}>{p.win ? "VICTORIA" : "DERROTA"}</span>}
    </div>
  );
}

/** All tracked players in one Clash game are on the same 5-stack roster in the overwhelming majority of cases — the one shared result belongs in the card header, not repeated on every single row underneath it. */
function matchOutcome(m: ClashMatch): "w" | "l" | "mixed" {
  if (m.players.every((p) => p.win)) return "w";
  if (m.players.every((p) => !p.win)) return "l";
  return "mixed";
}

function ClashMatchCard({ m, ddragonVersion }: { m: ClashMatch; ddragonVersion: string | null }) {
  const outcome = matchOutcome(m);
  return (
    <div className={`clash-match${outcome !== "mixed" ? ` ${outcome}` : ""}`}>
      <div className="clash-match-head">
        <span>{new Date(m.playedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
        {outcome !== "mixed" && (
          <span className={`clash-match-result ${outcome}`}>{outcome === "w" ? "VICTORIA" : "DERROTA"}</span>
        )}
        <span className="clash-match-dur">{Math.round(m.durationS / 60)} min</span>
      </div>
      <div className="clash-match-players">
        {m.players.map((p) => (
          <ClashPlayerCard p={p} ddragonVersion={ddragonVersion} showResult={outcome === "mixed"} key={`${p.playerName}#${p.playerTag}`} />
        ))}
      </div>
    </div>
  );
}

/** Cuántos del grupo aparecieron ese día — un Clash de cinco amigos no es lo mismo que uno donde fue uno solo con random. */
function jugadoresDelDia(t: ClashTournament): number {
  const nombres = new Set<string>();
  for (const m of t.matches) for (const p of m.players) nombres.add(`${p.playerName}#${p.playerTag}`);
  return nombres.size;
}

function ClashTournamentRow({ t, ddragonVersion }: { t: ClashTournament; ddragonVersion: string | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`panel-item clash-day-item ${t.winrate >= 50 ? "w" : "l"}`}>
      <button
        type="button"
        className={`panel-row${expanded ? " is-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="panel-row-mid">
          <span className="panel-row-label">{t.label}</span>
          <span className="panel-row-meta">
            {t.matches.length} partida{t.matches.length === 1 ? "" : "s"} · {jugadoresDelDia(t)} del grupo
          </span>
        </div>
        {/* Una casilla por partida, en orden cronológico, en vez de una barra
            proporcional. Ocupa lo mismo y dice algo que la proporción no
            puede: la SECUENCIA. "Ganaron las tres primeras y perdieron las
            dos últimas" y "perdieron dos y remontaron tres" daban la misma
            barra de 60%. */}
        <div className="clash-secuencia">
          {[...t.matches]
            .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
            .map((m, i) => (
              <span
                key={m.matchId}
                className={`clash-casilla ${m.players[0]?.win ? "w" : "l"}`}
                title={`Partida ${i + 1}: ${m.players[0]?.win ? "victoria" : "derrota"}`}
              />
            ))}
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
  players,
  playerStats,
  loading,
  ddragonVersion,
}: {
  tournaments: ClashTournament[];
  players: Player[];
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
          <ClashPlayerStatsList stats={playerStats} players={players} />
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
