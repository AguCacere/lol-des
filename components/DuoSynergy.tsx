"use client";

import { useState } from "react";
import type { DuoPair, Match, Player, RoleKey } from "@/lib/types";
import { ROLES, formatRelativeDate } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";

type DuoSortKey = "games" | "winrate";

interface DuoPartnerInfo {
  name: string;
  tag: string;
  profileIconUrl: string | null;
  games: number;
  wins: number;
  winrate: number;
  lastPlayedAt: string;
}

interface PlayerDuoSummary {
  name: string;
  tag: string;
  profileIconUrl: string | null;
  role: RoleKey;
  matches: Match[];
  partners: DuoPartnerInfo[];
  totalGames: number;
  totalWins: number;
  overallWinrate: number;
}

/**
 * Reshapes the flat pair list (A&B, A&C, B&C, ...) into one summary PER
 * PLAYER — every duo they're part of, plus their own last matches — so the
 * tab reads as "who does each person actually play with" instead of a wall
 * of separate pair rows that only grows once the group's match history goes
 * deep (see the backfill). Pure client-side reshape: no new data fetched,
 * everything's already in `players`/`pairs` from /api/ladder.
 */
function buildPlayerSummaries(players: Player[], pairs: DuoPair[]): PlayerDuoSummary[] {
  const summaries: PlayerDuoSummary[] = [];
  for (const p of players) {
    const key = `${p.name}#${p.tag}`;
    const partners: DuoPartnerInfo[] = pairs
      .filter((pair) => `${pair.aName}#${pair.aTag}` === key || `${pair.bName}#${pair.bTag}` === key)
      .map((pair) => {
        const isA = `${pair.aName}#${pair.aTag}` === key;
        return {
          name: isA ? pair.bName : pair.aName,
          tag: isA ? pair.bTag : pair.aTag,
          profileIconUrl: isA ? pair.bProfileIconUrl : pair.aProfileIconUrl,
          games: pair.games,
          wins: pair.wins,
          winrate: pair.winrate,
          lastPlayedAt: pair.lastPlayedAt,
        };
      })
      .sort((a, b) => b.games - a.games);
    if (partners.length === 0) continue;
    const totalGames = partners.reduce((s, x) => s + x.games, 0);
    const totalWins = partners.reduce((s, x) => s + x.wins, 0);
    summaries.push({
      name: p.name,
      tag: p.tag,
      profileIconUrl: p.profileIconUrl,
      role: p.role,
      matches: p.matches,
      partners,
      totalGames,
      totalWins,
      overallWinrate: totalGames > 0 ? Math.round((100 * totalWins) / totalGames) : 0,
    });
  }
  return summaries;
}

function DuoRecentMatchRow({ m, ddragonVersion }: { m: Match; ddragonVersion: string | null }) {
  return (
    <div className="duosum-match-row">
      <span className={`duosum-match-stripe ${m.win ? "w" : "l"}`} />
      <ChampIcon champ={m.champ} version={ddragonVersion} className="duosum-match-champ" />
      <div className="duosum-match-mid">
        <span className="duosum-match-champ-name">{m.champ}</span>
        <span className="duosum-match-sub">
          {formatRelativeDate(m.playedAt)} · {m.dur} min
        </span>
      </div>
      <div className="duosum-match-right">
        <span className="kda">
          {m.k}
          <span className="neu">/</span>
          {m.d}
          <span className="neu">/</span>
          {m.a}
        </span>
        <span className={`duosum-match-result ${m.win ? "w" : "l"}`}>{m.win ? "VICTORIA" : "DERROTA"}</span>
      </div>
    </div>
  );
}

function PlayerDuoRow({ s, ddragonVersion }: { s: PlayerDuoSummary; ddragonVersion: string | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="panel-item">
      <button
        type="button"
        className={`panel-row${expanded ? " is-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <PlayerAvatar name={s.name} iconUrl={s.profileIconUrl} className="duo-avatar" />
        <div className="panel-row-mid">
          <span className="panel-row-label">
            {s.name} <span className="player-tag">#{s.tag}</span>
          </span>
          <span className="panel-row-meta">
            {ROLES[s.role].label} · {s.partners.length} {s.partners.length === 1 ? "compañero de dúo" : "compañeros de dúo"}
          </span>
        </div>
        <div className="panel-row-bar">
          <span className="duo-seg win" style={{ flex: s.totalWins }} />
          <span className="duo-seg loss" style={{ flex: s.totalGames - s.totalWins }} />
        </div>
        <div className="panel-row-stats">
          <span className={`panel-row-wr ${s.overallWinrate >= 50 ? "good" : "bad"}`}>{s.overallWinrate}%</span>
          <span className="panel-row-record">
            {s.totalWins}V {s.totalGames - s.totalWins}D
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
          <h5 className="duosum-section-title">Compañeros de dúo</h5>
          <div className="champ-pool">
            {s.partners.map((partner) => (
              <div className="champ-pool-row" key={`${partner.name}#${partner.tag}`}>
                <PlayerAvatar name={partner.name} iconUrl={partner.profileIconUrl} className="champ-pool-avatar" />
                <div className="champ-pool-mid">
                  <span className="champ-pool-name">
                    {partner.name} <span className="player-tag">#{partner.tag}</span>
                  </span>
                  <span className="champ-pool-games">
                    {partner.games} {partner.games === 1 ? "partida juntos" : "partidas juntos"} ·{" "}
                    {formatRelativeDate(partner.lastPlayedAt)}
                  </span>
                </div>
                <div className="champ-pool-stats">
                  <span className={`champ-pool-wr ${partner.winrate >= 50 ? "good" : "bad"}`}>{partner.winrate}%</span>
                  <span className="champ-pool-kda">
                    {partner.wins}V {partner.games - partner.wins}D
                  </span>
                </div>
              </div>
            ))}
          </div>
          {s.matches.length > 0 && (
            <>
              <h5 className="duosum-section-title">Últimas partidas</h5>
              <div className="duosum-matches">
                {s.matches.map((m, i) => (
                  <DuoRecentMatchRow m={m} ddragonVersion={ddragonVersion} key={i} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Sinergia de dúo" — con quién juega más seguido cada invocador del grupo, y
 * cómo les va juntos. Un panel por INVOCADOR (no por pareja): tocarlo
 * despliega instantáneamente todos sus compañeros de dúo + sus últimas
 * partidas — todo ya viene en /api/ladder (pairs + players.matches), no hace
 * falta pedir nada nuevo al servidor, así que no hay razón para simular un
 * loading. Antes esto era una fila por CADA pareja (A&B, A&C, B&C...), que
 * con el historial completo de partidas termina siendo una lista larguísima
 * de mucho scroll — agrupar por jugador, además de acortarla, responde mejor
 * la pregunta real ("¿con quién juega Fulano, y cómo les va?").
 */
export function DuoSynergy({
  players,
  pairs,
  loading,
  ddragonVersion,
}: {
  players: Player[];
  pairs: DuoPair[];
  loading?: boolean;
  ddragonVersion: string | null;
}) {
  const [sortKey, setSortKey] = useState<DuoSortKey>("games");
  const summaries = buildPlayerSummaries(players, pairs);
  const sorted =
    sortKey === "games"
      ? [...summaries].sort((a, b) => b.totalGames - a.totalGames)
      : [...summaries].sort((a, b) => b.overallWinrate - a.overallWinrate);

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Sinergia de dúo
        </h2>
        <span className="meta">Con quién juega más seguido cada uno, y cómo les va juntos</span>
      </div>
      {summaries.length > 0 && (
        <div className="ladder-controls">
          <span />
          <label className="sort-select-wrap">
            <span className="meta">Ordenar por</span>
            <select className="sort-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as DuoSortKey)}>
              <option value="games">Partidas compartidas</option>
              <option value="winrate">Winrate</option>
            </select>
          </label>
        </div>
      )}
      <div className={summaries.length === 0 ? "duo-list" : "panel-list"}>
        {loading ? (
          <div className="empty-state">
            <strong>Cargando…</strong>
            Buscando partidas compartidas.
          </div>
        ) : summaries.length === 0 ? (
          <div className="empty-state">
            <strong>Todavía no hay dúos para mostrar</strong>
            Se arma solo cuando dos invocadores del grupo comparten una partida de ranked como compañeros de equipo.
          </div>
        ) : (
          sorted.map((s) => <PlayerDuoRow s={s} ddragonVersion={ddragonVersion} key={`${s.name}#${s.tag}`} />)
        )}
      </div>
    </section>
  );
}
