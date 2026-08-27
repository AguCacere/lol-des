"use client";

import { useState } from "react";
import type { DuoPair } from "@/lib/types";
import { ROLES, formatRelativeDate, champTag } from "@/lib/ladder";
import { RoleIcon } from "./RoleIcon";

type DuoSortKey = "games" | "winrate";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function DuoAvatar({ name, iconUrl, className }: { name: string; iconUrl: string | null; className: string }) {
  return (
    <span className={className}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- one small fixed-size avatar, not worth next/image's config for an external CDN
        <img src={iconUrl} alt="" className="duo-avatar-img" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** One side of the expanded "perfil del dúo" — how THIS player specifically did in the games they shared with their partner, not their overall career stats. */
function DuoPlayerStat({
  name,
  tag,
  iconUrl,
  avgKda,
  mainChamp,
}: {
  name: string;
  tag: string;
  iconUrl: string | null;
  avgKda: number;
  mainChamp: string | null;
}) {
  return (
    <div className="duo-detail-player">
      <DuoAvatar name={name} iconUrl={iconUrl} className="duo-avatar" />
      <div className="duo-detail-mid">
        <span className="duo-detail-name">
          {name} <span className="player-tag">#{tag}</span>
        </span>
        <span className="duo-detail-kda">{avgKda.toFixed(2)} KDA en estas partidas</span>
      </div>
      {mainChamp && (
        <div className="duo-detail-champ" title={`Main en el dúo: ${mainChamp}`}>
          <span className="duo-detail-champ-avatar">{champTag(mainChamp)}</span>
          {mainChamp}
        </div>
      )}
    </div>
  );
}

function DuoRow({ p }: { p: DuoPair }) {
  const [expanded, setExpanded] = useState(false);
  const losses = p.games - p.wins;
  return (
    <div className="duo-item">
      <button type="button" className={`duo-row${expanded ? " is-expanded" : ""}`} onClick={() => setExpanded((v) => !v)}>
        <div className="duo-avatars">
          <DuoAvatar name={p.aName} iconUrl={p.aProfileIconUrl} className="duo-avatar" />
          <DuoAvatar name={p.bName} iconUrl={p.bProfileIconUrl} className="duo-avatar duo-avatar-b" />
        </div>
        <div className="duo-mid">
          <span className="duo-names">
            {p.aName} <span className="duo-amp">&amp;</span> {p.bName}
          </span>
          <span className="duo-meta">
            {p.aRole && p.bRole && (
              <span className="duo-roles" title={`${ROLES[p.aRole].label} + ${ROLES[p.bRole].label}, su combo más jugado juntos`}>
                <span className="duo-role-icon"><RoleIcon role={p.aRole} /></span>
                <span className="duo-role-icon"><RoleIcon role={p.bRole} /></span>
              </span>
            )}
            {p.games} {p.games === 1 ? "partida juntos" : "partidas juntos"} · {formatRelativeDate(p.lastPlayedAt)}
          </span>
          <div className="duo-bar">
            <span className="duo-seg win" style={{ flex: p.wins }} />
            <span className="duo-seg loss" style={{ flex: losses }} />
          </div>
        </div>
        <div className="duo-stats">
          <span className={`duo-wr ${p.winrate >= 50 ? "good" : "bad"}`}>{p.winrate}%</span>
          <span className="duo-record">
            {p.wins}V {losses}D
          </span>
        </div>
        <svg
          className="duo-chevron"
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
        <div className="duo-detail">
          <DuoPlayerStat name={p.aName} tag={p.aTag} iconUrl={p.aProfileIconUrl} avgKda={p.aAvgKda} mainChamp={p.aMainChamp} />
          <DuoPlayerStat name={p.bName} tag={p.bTag} iconUrl={p.bProfileIconUrl} avgKda={p.bAvgKda} mainChamp={p.bMainChamp} />
        </div>
      )}
    </div>
  );
}

/**
 * "Sinergia de dúo" — qué dos invocadores del grupo terminan de compañeros de
 * equipo más seguido, y con qué winrate juntos. Computado enteramente sobre
 * `matches` (match_id + puuid + win + team_position + kills/deaths/assists/
 * champion) en app/api/ladder/route.ts — no pide nada nuevo a Riot. Dos
 * jugadores que comparten un match_id son compañeros si comparten resultado
 * (víctoria/derrota es siempre por equipo, no hace falta el teamId de Riot
 * para deducirlo).
 */
export function DuoSynergy({ pairs, loading }: { pairs: DuoPair[]; loading?: boolean }) {
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
      <div className="duo-list">
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
          sorted.map((p) => <DuoRow p={p} key={`${p.aName}#${p.aTag}-${p.bName}#${p.bTag}`} />)
        )}
      </div>
    </section>
  );
}
