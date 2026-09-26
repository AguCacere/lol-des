"use client";

import { useState } from "react";
import type { ClashMatch, ClashMatchPlayer, ClashPlayerStats, ClashTournament, Player } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { wilsonLower } from "@/lib/wilson";

const MEDALS = ["gold", "silver", "bronze"];

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
            <span className={`podium-wr ${tonoDeWinrate(s.wins, s.games)}`}>
              {winrateTexto(s.wins, s.games)}
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
            {/* Acá iba una barra de "distancia al 50%". Se fue: decía
                exactamente lo mismo que la columna WR de al lado, y es la
                misma visualización que ya se había sacado del estado de forma
                de Estadísticas por el mismo motivo. Era la última que
                quedaba. */}
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
                <span className={`tw-c-wr ${tono}`}>{winrateTexto(s.wins, s.games)}</span>
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
    <span className={`tw-delta ${tono}`} title={`Su SoloQ de esta season: ${solo.toFixed(1)}%`}>
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
        <span>{new Date(m.playedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
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
    <div className={`panel-item clash-day-item ${t.wins >= t.losses ? "w" : "l"}`}>
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
          <span className={`panel-row-wr ${tonoDeWinrate(t.wins, t.gamesPlayed)}`}>{winrateTexto(t.wins, t.gamesPlayed)}</span>
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
/**
 * Cuánto hace del último Clash, en la escala que hace falta acá: meses.
 *
 * Existe porque `formatRelativeDate` corta en "hace N semanas" y arriba de
 * eso escribe "26 ene" a secas. Medido contra la base, el último Clash del
 * grupo fue el 26 de enero de 2026 y hoy es septiembre: la pestaña mostraba
 * "3 torneos · 38 partidas · 52% winrate" sin decir en ningún lado que eso
 * pasó hace ocho meses, y se leía como si fuera de esta semana. Un archivo
 * tiene que decir que es un archivo.
 */
function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 60) return `hace ${Math.floor(dias / 7)} semanas`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} meses`;
  const anios = Math.floor(dias / 365);
  return anios === 1 ? "hace más de un año" : `hace más de ${anios} años`;
}

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
  const tonoTotal = tonoDeWinrate(totalWins, totalGames);
  // La partida más nueva de todas, para decir de cuándo es lo que se está
  // mirando. Los días vienen del más nuevo al más viejo, pero se busca el
  // máximo igual: el orden no es una garantía de la que depende esto.
  let ultima: string | null = null;
  for (const t of tournaments) {
    for (const m of t.matches) if (ultima === null || m.playedAt > ultima) ultima = m.playedAt;
  }

  return (
    <section>
      <div className="section-head">
        <h2>
          Clash
        </h2>
        <span className="meta">Cómo le fue al grupo en cada Clash jugado</span>
      </div>

      {!loading && tournaments.length > 0 && (
        <p className="clash-lifetime">
          {tournaments.length} {tournaments.length === 1 ? "torneo" : "torneos"} de Clash registrados · {totalGames}{" "}
          partidas ·{" "}
          <span className={`clash-lifetime-wr ${tonoTotal}`}>{winrateTexto(totalWins, totalGames)} winrate</span>
          {ultima && <span className="clash-ultima">· el último, {haceCuanto(ultima)}</span>}
        </p>
      )}

      {!loading && playerStats.length > 0 && (
        <>
          <h4 className="subsection-label">Winrate por invocador</h4>
          <p className="chart-note">
            Partidas de Clash ganadas y perdidas por cada uno, sumando todos los torneos — no el resultado de un torneo
            puntual. <strong>El orden no es por porcentaje:</strong> se tiene en cuenta cuántas partidas jugó cada uno, así un
            7-de-10 queda arriba de un 3-de-3.
            <InfoTip text="Ordenar por porcentaje pone primero al que menos jugó: ganar tres de tres es algo que pasa una de cada ocho veces por pura suerte, y con esa lógica cualquiera que juegue una sola partida y la gane queda de primero para siempre. Así que el orden le da más peso al que lo sostuvo en más partidas. Es la misma cuenta que usan los sitios de reseñas para no poner arriba al producto con una sola estrella de cinco. El porcentaje que ves sigue siendo el real." />
          </p>
          <ClashPlayerStatsList stats={playerStats} players={players} />
          <h4 className="subsection-label">Historial por día</h4>
          <p className="chart-note">
            Cada casilla es una partida de ese día, en el orden en que se jugaron:{" "}
            <span className="clash-casilla w" /> victoria, <span className="clash-casilla l" /> derrota. Tocá un día
            para ver las partidas.
          </p>
        </>
      )}

      <div className={tournaments.length === 0 ? "duo-list" : "panel-list"}>
        {/* Los dos estados, en un renglón. Ocupaban una caja de tres líneas
            cada uno para decir que falta un dato — el plan pide justo lo
            contrario. El detalle de cómo se reconstruye un día de Clash vive
            en el InfoTip, no en el hueco. */}
        {loading ? (
          <p className="clash-nada">Buscando partidas de Clash guardadas…</p>
        ) : tournaments.length === 0 ? (
          <p className="clash-nada">
            Todavía no hay ningún Clash guardado.
            <InfoTip text="Riot no expone el historial de torneos pasados, así que esta pestaña reconstruye cada día de Clash a partir de las partidas que ya están guardadas. Aparece solo la próxima vez que alguien del grupo juegue uno." />
          </p>
        ) : (
          tournaments.map((t) => <ClashTournamentRow t={t} ddragonVersion={ddragonVersion} key={t.key} />)
        )}
      </div>
    </section>
  );
}
