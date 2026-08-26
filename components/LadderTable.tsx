import type { Player } from "@/lib/types";
import { tierFor } from "@/lib/mock-data";
import { RoleIcon } from "./RoleIcon";
import { SparkChart } from "./SparkChart";

interface LadderTableProps {
  players: Player[];
  filterText: string;
  activeKey: string | null;
  onSelect: (key: string) => void;
  loading?: boolean;
  error?: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError?: string | null;
}

export function playerKey(p: Player): string {
  return `${p.name}#${p.tag}`;
}

export function LadderTable({
  players,
  filterText,
  activeKey,
  onSelect,
  loading,
  error,
  onRefresh,
  refreshing,
  refreshError,
}: LadderTableProps) {
  const q = filterText.trim().toLowerCase();
  const rows = players.filter((p) => !q || playerKey(p).toLowerCase().includes(q));

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot" />
          Ladder del grupo{" "}
          <span className="meta">· {rows.length}{rows.length === 1 ? " invocador" : " invocadores"}</span>
        </h2>
        <div className="ladder-actions">
          {refreshError && <span className="meta refresh-error">{refreshError}</span>}
          <span className="meta">Ordenado por LP</span>
          <button type="button" className="refresh-btn" onClick={onRefresh} disabled={refreshing || loading}>
            {refreshing ? "Actualizando…" : "Actualizar ahora"}
          </button>
        </div>
      </div>

      <div className="ladder">
        <div className="ladder-head">
          <span>#</span>
          <span>Invocador</span>
          <span>Rango</span>
          <span>Winrate</span>
          <span>Últimos 20</span>
          <span></span>
        </div>
        <div>
          {loading ? (
            <div className="empty-state">
              <strong>Cargando…</strong>
              Consultando el ladder.
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>No se pudo cargar el ladder</strong>
              {error}
            </div>
          ) : rows.length === 0 && players.length === 0 ? (
            <div className="empty-state">
              <strong>Todavía no hay nadie en el grupo</strong>
              Buscá un Riot ID arriba (Nombre#TAG) y apretá Enter para sumarlo.
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <strong>Sin resultados</strong>
              No hay ningún Riot ID en el grupo que matchee &ldquo;{q}&rdquo;. Apretá Enter para buscarlo en la Riot
              API y sumarlo.
            </div>
          ) : (
            rows.map((p) => {
              const rank = players.indexOf(p) + 1;
              const t = tierFor(p.tierKey);
              const key = playerKey(p);
              const isActive = key === activeKey;
              return (
                <button
                  key={key}
                  type="button"
                  className={`ladder-row${isActive ? " is-active" : ""}${p.you ? " is-you" : ""}`}
                  onClick={() => onSelect(key)}
                >
                  <span className="col-rank">{rank}</span>
                  <span className="col-player">
                    <span className="role-chip" title={p.role}>
                      <RoleIcon role={p.role} />
                    </span>
                    <span className="player-id">
                      <span className="player-name">
                        {p.name}
                        <span className="player-tag">#{p.tag}</span>
                        {p.you && <span className="you-badge">VOS</span>}
                      </span>
                      <span className="player-champ">Main: {p.mainChamp}</span>
                    </span>
                  </span>
                  <span className="col-tier">
                    <span className="tier-badge" style={{ background: t.bg, color: t.fg }}>
                      {t.name[0]}
                      {p.division}
                    </span>
                    <span className="tier-text">
                      <span className="tier-name" style={{ color: t.fg }}>
                        {t.name} {p.division}
                      </span>
                      <span className="tier-lp">{p.lp} LP</span>
                    </span>
                  </span>
                  <span className="col-winrate">
                    <span className="wr-top">
                      <span className="wr-pct">{p.winrate}%</span>
                      <span className="wr-count">
                        <span className="wc-v">{p.wins}V</span>
                        <span className="wc-sep">·</span>
                        <span className="wc-d">{p.losses}D</span>
                      </span>
                    </span>
                    <span className="wr-bar">
                      <span className="wr-seg win" style={{ flex: p.wins }} />
                      <span className="wr-seg loss" style={{ flex: p.losses }} />
                    </span>
                  </span>
                  <span className="col-spark">
                    <SparkChart values={p.spark20} width={150} height={28} color={t.fg} />
                  </span>
                  <span className="col-chevron">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
