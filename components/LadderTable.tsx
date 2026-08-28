import type { Player, RoleKey } from "@/lib/types";
import { champTag, currentStreak, formatRelativeTime, rankScore, ROLES, tierFor, trendColor } from "@/lib/ladder";
import { RoleIcon } from "./RoleIcon";
import { StreakIcon } from "./StreakIcon";
import { SparkChart } from "./SparkChart";
import { ChampIcon } from "./ChampIcon";

export type SortKey = "ladder" | "winrate" | "wins" | "streak" | "recent";

const ROLE_FILTERS: (RoleKey | "all")[] = ["all", "top", "jungle", "mid", "adc", "support"];

interface LadderTableProps {
  players: Player[];
  filterText: string;
  activeKey: string | null;
  onSelect: (key: string) => void;
  loading?: boolean;
  error?: string | null;
  lastUpdated: string | null;
  roleFilter: RoleKey | "all";
  onRoleFilterChange: (role: RoleKey | "all") => void;
  sortKey: SortKey;
  onSortKeyChange: (key: SortKey) => void;
  ddragonVersion: string | null;
}

export function playerKey(p: Player): string {
  return `${p.name}#${p.tag}`;
}

/**
 * Rank score (tier+división+LP combinado) per stored snapshot, not raw LP —
 * raw LP alone resets to a low number on every division promotion, which
 * would make the "últimos 20" sparkline show a climb as a plunge right at the
 * moment it should have looked best. This is the same series the profile's
 * big LP chart already charts on, so a promoted player's trend line and
 * color agree everywhere in the app instead of contradicting each other.
 */
function trendSeries(p: Player): number[] {
  return p.lpHistory.map((h) => rankScore(h.tier, h.division, h.lp));
}

function recentDelta(p: Player): number {
  const series = trendSeries(p);
  return series.length >= 2 ? series[series.length - 1] - series[0] : 0;
}

function streakMagnitude(p: Player): number {
  const s = currentStreak(p.matches);
  if (!s) return 0;
  return s.result === "W" ? s.count : -s.count;
}

function sortValue(p: Player, key: SortKey): number {
  switch (key) {
    case "winrate":
      return p.winrate;
    case "wins":
      return p.wins;
    case "streak":
      return streakMagnitude(p);
    case "recent":
      return recentDelta(p);
    case "ladder":
    default:
      return 0;
  }
}

export function LadderTable({
  players,
  filterText,
  activeKey,
  onSelect,
  loading,
  error,
  lastUpdated,
  roleFilter,
  onRoleFilterChange,
  sortKey,
  onSortKeyChange,
  ddragonVersion,
}: LadderTableProps) {
  const q = filterText.trim().toLowerCase();
  const filtered = players
    .filter((p) => roleFilter === "all" || p.role === roleFilter)
    .filter((p) => !q || playerKey(p).toLowerCase().includes(q));
  const rows =
    sortKey === "ladder" ? filtered : [...filtered].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot" />
          Ladder del grupo{" "}
          <span className="meta">· {rows.length}{rows.length === 1 ? " invocador" : " invocadores"}</span>
        </h2>
        {!loading && lastUpdated && (
          <span className="meta last-updated">Última actualización: {formatRelativeTime(lastUpdated)}</span>
        )}
      </div>

      <div className="ladder-controls">
        <div className="role-filters" role="group" aria-label="Filtrar por rol">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              className={`role-filter-btn${roleFilter === r ? " is-active" : ""}`}
              onClick={() => onRoleFilterChange(r)}
            >
              {r === "all" ? "Todos" : ROLES[r].label}
            </button>
          ))}
        </div>
        <label className="sort-select-wrap">
          <span className="meta">Ordenar por</span>
          <select
            className="sort-select"
            value={sortKey}
            onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          >
            <option value="ladder">LP (ranking)</option>
            <option value="winrate">Winrate</option>
            <option value="wins">Victorias</option>
            <option value="streak">Racha</option>
            <option value="recent">Progreso reciente</option>
          </select>
        </label>
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
              {q ? (
                <>
                  No hay ningún Riot ID en el grupo que matchee &ldquo;{q}&rdquo;. Apretá Enter para buscarlo en la
                  Riot API y sumarlo.
                </>
              ) : (
                "Ningún invocador del grupo juega ese rol."
              )}
            </div>
          ) : (
            rows.map((p) => {
              const rank = players.indexOf(p) + 1;
              const t = tierFor(p.tierKey);
              const key = playerKey(p);
              const isActive = key === activeKey;
              const streak = currentStreak(p.matches);
              const spark = trendSeries(p);
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
                        {p.liveGame && (
                          <span
                            className="live-badge"
                            aria-label={`En vivo: ${p.liveGame.champion}, ${p.liveGame.queueLabel}, hace ${p.liveGame.startedMinutesAgo} min`}
                          >
                            <span className="live-dot" />
                            En vivo · {p.liveGame.champion}
                          </span>
                        )}
                      </span>
                      <span className="player-champ">Main: {p.mainChamp}</span>
                      {/*
                        Rendered as a sibling of player-name (not nested inside
                        the live-badge) on purpose: player-name has its own
                        overflow:hidden for the name-ellipsis truncation, which
                        would silently clip an absolutely-positioned popup
                        living inside it. player-id has no overflow set, so the
                        popup escapes cleanly; :has() ties its visibility back
                        to hovering the badge specifically.
                      */}
                      {p.liveGame && (
                        <span className="live-popup" role="tooltip">
                          <span className="live-popup-head">
                            <span className="live-popup-avatar">
                              {p.profileIconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- one small fixed-size avatar, not worth next/image's config for an external CDN
                                <img src={p.profileIconUrl} alt="" />
                              ) : (
                                champTag(p.mainChamp)
                              )}
                            </span>
                            <span className="live-popup-name">
                              {p.name} <span className="player-tag">#{p.tag}</span>
                            </span>
                          </span>
                          <span className="live-popup-champ">
                            <ChampIcon champ={p.liveGame.champion} version={ddragonVersion} className="live-popup-champ-avatar" />
                            {p.liveGame.champion}
                          </span>
                          <span className="live-popup-meta">
                            {p.liveGame.queueLabel} · hace {p.liveGame.startedMinutesAgo} min
                          </span>
                        </span>
                      )}
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
                    <span className="wr-bottom">
                      <span className="wr-bar">
                        <span className="wr-seg win" style={{ flex: p.wins }} />
                        <span className="wr-seg loss" style={{ flex: p.losses }} />
                      </span>
                      {streak && (
                        <span className={`wr-streak ${streak.result === "W" ? "w" : "l"}`}>
                          <StreakIcon result={streak.result} /> {streak.count}
                          {streak.capped ? "+" : ""} {streak.result === "W" ? "V" : "D"}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="col-spark">
                    <SparkChart values={spark} width={150} height={40} pad={8} color={trendColor(spark)} />
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
