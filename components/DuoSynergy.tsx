import type { DuoPair } from "@/lib/types";
import { ROLES, formatRelativeDate } from "@/lib/mock-data";
import { RoleIcon } from "./RoleIcon";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/**
 * "Sinergia de dúo" — qué dos invocadores del grupo terminan de compañeros de
 * equipo más seguido, y con qué winrate juntos. Computado enteramente sobre
 * `matches` (match_id + puuid + win + team_position) en
 * app/api/ladder/route.ts — no pide nada nuevo a Riot. Dos jugadores que
 * comparten un match_id son compañeros si comparten resultado (víctoria/
 * derrota es siempre por equipo, no hace falta el teamId de Riot para
 * deducirlo).
 */
function DuoRow({ p }: { p: DuoPair }) {
  const losses = p.games - p.wins;
  return (
    <div className="duo-row">
      <div className="duo-avatars">
        <span className="duo-avatar">{initials(p.aName)}</span>
        <span className="duo-avatar duo-avatar-b">{initials(p.bName)}</span>
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
    </div>
  );
}

export function DuoSynergy({ pairs, loading }: { pairs: DuoPair[]; loading?: boolean }) {
  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Sinergia de dúo
        </h2>
        <span className="meta">Compañeros del grupo que juegan más seguido juntos</span>
      </div>
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
          pairs.map((p) => <DuoRow p={p} key={`${p.aName}#${p.aTag}-${p.bName}#${p.bTag}`} />)
        )}
      </div>
    </section>
  );
}
