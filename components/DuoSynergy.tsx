"use client";

import { useState } from "react";
import type { DuoPair, DuoSharedMatch } from "@/lib/types";
import { ROLES, formatRelativeDate } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";

type DuoSortKey = "games" | "winrate";

function DuoSharedMatchRow({ m, ddragonVersion }: { m: DuoSharedMatch; ddragonVersion: string | null }) {
  return (
    <div className="duovs-match-row">
      <span className={`duovs-match-stripe ${m.win ? "w" : "l"}`} />
      <div className="duovs-match-side">
        <ChampIcon champ={m.aChamp} version={ddragonVersion} className="duovs-match-champ" />
        <span className="duovs-match-kda">
          {m.aK}/{m.aD}/{m.aA}
        </span>
      </div>
      <span className="duovs-match-sep">·</span>
      <div className="duovs-match-side">
        <ChampIcon champ={m.bChamp} version={ddragonVersion} className="duovs-match-champ" />
        <span className="duovs-match-kda">
          {m.bK}/{m.bD}/{m.bA}
        </span>
      </div>
      <div className="duovs-match-meta">
        <span className={`duovs-match-result ${m.win ? "w" : "l"}`}>{m.win ? "VICTORIA" : "DERROTA"}</span>
        <span className="duovs-match-date">
          {formatRelativeDate(m.playedAt)} · {Math.round(m.durationS / 60)} min
        </span>
      </div>
    </div>
  );
}

function DuoVsRow({ p, ddragonVersion }: { p: DuoPair; ddragonVersion: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const losses = p.games - p.wins;
  return (
    <div className="panel-item">
      <button
        type="button"
        className={`panel-row duovs-row${expanded ? " is-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="duovs-side">
          <PlayerAvatar name={p.aName} iconUrl={p.aProfileIconUrl} className="duo-avatar" />
          <div className="duovs-side-info">
            <span className="duovs-name">
              {p.aName} <span className="player-tag">#{p.aTag}</span>
            </span>
            {p.aRole && <span className="duovs-role">{ROLES[p.aRole].label}</span>}
          </div>
        </div>
        <div className="duovs-center">
          <span className={`duovs-wr ${p.winrate >= 50 ? "good" : "bad"}`}>{p.winrate}%</span>
          <span className="duovs-record">
            {p.wins}V {losses}D
          </span>
        </div>
        <div className="duovs-side right">
          <PlayerAvatar name={p.bName} iconUrl={p.bProfileIconUrl} className="duo-avatar" />
          <div className="duovs-side-info">
            <span className="duovs-name">
              {p.bName} <span className="player-tag">#{p.bTag}</span>
            </span>
            {p.bRole && <span className="duovs-role">{ROLES[p.bRole].label}</span>}
          </div>
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
          <h5 className="duosum-section-title">
            {p.games} {p.games === 1 ? "partida juntos" : "partidas juntos"} · última vez {formatRelativeDate(p.lastPlayedAt)}
          </h5>
          <div className="duosum-matches">
            {p.recentMatches.map((m) => (
              <DuoSharedMatchRow m={m} ddragonVersion={ddragonVersion} key={m.matchId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Sinergia de dúo" — con quién juega más seguido cada invocador del grupo, y
 * cómo les va juntos. Un panel "enfrentado" por PAREJA (no un formulario de
 * label/valor): avatar+nombre de cada uno a los costados, winrate/récord
 * grande centrado entre los dos, como un cartel de versus. Al tocarlo
 * despliega las últimas partidas que ESE DÚO compartió específicamente —
 * ambos campeones y KDA del mismo juego, no el historial genérico de uno
 * solo — todo ya viene armado en /api/ladder (computeDuoSynergy calcula
 * recentMatches por pareja), así que no hace falta ningún fetch nuevo ni un
 * loading real: expandir es instantáneo.
 */
export function DuoSynergy({
  pairs,
  loading,
  ddragonVersion,
}: {
  pairs: DuoPair[];
  loading?: boolean;
  ddragonVersion: string | null;
}) {
  const [sortKey, setSortKey] = useState<DuoSortKey>("games");
  const sorted = sortKey === "games" ? pairs : [...pairs].sort((a, b) => b.winrate - a.winrate);

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Sinergia de dúo
        </h2>
        <span className="meta">Compañeros del grupo que juegan más seguido juntos</span>
      </div>
      {pairs.length > 0 && (
        <div className="ladder-controls">
          <span />
          <label className="sort-select-wrap">
            <span className="meta">Ordenar por</span>
            <select className="sort-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as DuoSortKey)}>
              <option value="games">Partidas juntos</option>
              <option value="winrate">Winrate</option>
            </select>
          </label>
        </div>
      )}
      <div className={pairs.length === 0 ? "duo-list" : "panel-list"}>
        {loading ? (
          <div className="empty-state">
            <strong>Cargando…</strong>
            Buscando partidas compartidas.
          </div>
        ) : pairs.length === 0 ? (
          <div className="empty-state">
            <strong>Todavía no hay dúos para mostrar</strong>
            Se arma solo cuando dos invocadores del grupo comparten una partida de ranked como compañeros de equipo.
          </div>
        ) : (
          sorted.map((p) => <DuoVsRow p={p} ddragonVersion={ddragonVersion} key={`${p.aName}#${p.aTag}-${p.bName}#${p.bTag}`} />)
        )}
      </div>
    </section>
  );
}
