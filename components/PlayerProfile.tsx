"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import {
  tierFor,
  champTag,
  ROLES,
  currentStreak,
  computeRoleAverages,
  formatRelativeDate,
  trendColor,
  nextDivisionInfo,
  rankScore,
} from "@/lib/mock-data";
import { SparkChart } from "./SparkChart";
import { MatchDetail } from "./MatchDetail";
import { ChampionPool } from "./ChampionPool";
import { MasteryPool } from "./MasteryPool";
import { InsightsCard } from "./InsightsCard";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";
import { buildMetricInsights, splitStrengthsWeaknesses } from "@/lib/insights";

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v3a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H5a2 2 0 0 0 2 3" />
      <path d="M17 5h2a2 2 0 0 1-2 3" />
      <path d="M12 12v3" />
      <path d="M9 19h6" />
      <path d="M10.5 15h3l.4 4h-3.8z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function CmpBar({
  label,
  value,
  avg,
  max,
  suffix = "",
  tooltip,
}: {
  label: string;
  value: number;
  avg: number | null;
  max: number;
  suffix?: string;
  tooltip?: string;
}) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="cmp-row">
      <div className="cmp-row-top">
        <span className="k">
          {label}
          {tooltip && <InfoTip text={tooltip} />}
        </span>
        <span className="v">
          {value}
          {suffix}{" "}
          {avg !== null ? (
            <span style={{ color: "var(--text-muted)" }}>
              · prom. rol {avg}
              {suffix}
            </span>
          ) : (
            <span className="cmp-no-data">· sin datos del rol todavía</span>
          )}
        </span>
      </div>
      <div className="cmp-bar-track">
        <div className="cmp-bar-fill" style={{ width: `${pct}%` }} />
        {avg !== null && (
          <div className="cmp-bar-avg" style={{ left: `${Math.max(0, Math.min(100, (avg / max) * 100))}%` }} />
        )}
      </div>
    </div>
  );
}

export function PlayerProfile({ player, allPlayers }: { player: Player | null; allPlayers: Player[] }) {
  const [displayed, setDisplayed] = useState(player);
  const [fading, setFading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);

  useEffect(() => {
    if (player === displayed) return;
    // Crossfade on selection change, not a fetch — nothing to await before this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFading(true);
    const t = setTimeout(() => {
      setDisplayed(player);
      setFading(false);
      setExpandedMatch(null);
    }, 160);
    return () => clearTimeout(t);
  }, [player, displayed]);

  if (!displayed) {
    return (
      <section id="profileSection">
        <div className="section-head">
          <h2>
            <span className="live-dot accent" />
            Perfil de invocador
          </h2>
          <span className="meta">Click en una fila del ladder para inspeccionar</span>
        </div>
        <div className={`profile${fading ? " is-fading" : ""}`}>
          <div className="profile-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21l7-7m0 0l8-8-3-3-8 8m3 3l-3-3m0 0L4 13l3 3" />
            </svg>
            <p>
              <strong>Elegí un invocador del ranking</strong>
              Tocá cualquier fila para ver su progresión de LP, comparación con el promedio del rol y las últimas partidas.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const p = displayed;
  const t = tierFor(p.tierKey);
  const hasMatches = p.matches.length > 0;
  const wins = p.matches.filter((m) => m.win).length;
  const avgKDA = hasMatches
    ? p.matches.reduce((s, m) => s + (m.k + m.a) / Math.max(1, m.d), 0) / p.matches.length
    : 0;
  const avgCS = hasMatches ? p.matches.reduce((s, m) => s + parseFloat(m.csmin), 0) / p.matches.length : 0;
  const avgDmg = hasMatches ? p.matches.reduce((s, m) => s + m.dmgShare, 0) / p.matches.length : 0;
  const avgVision = hasMatches
    ? Number((p.matches.reduce((s, m) => s + m.visionScore / Math.max(1, m.dur), 0) / p.matches.length).toFixed(1))
    : 0;
  const avgDur = hasMatches ? Math.round(p.matches.reduce((s, m) => s + m.dur, 0) / p.matches.length) : 0;
  const killPart = hasMatches
    ? Math.round(p.matches.reduce((s, m) => s + m.killParticipation, 0) / p.matches.length)
    : 0;
  const objPart = hasMatches ? Math.round(p.matches.reduce((s, m) => s + m.objShare, 0) / p.matches.length) : 0;
  // Charted on rankScore (tier+división+LP combinado), no en el LP crudo: al
  // subir de división el número de LP se resetea (ej. Platino 3 a 80 LP →
  // Platino 2 a 0 LP), y graficar solo "lp" hacía ver esa subida como una
  // caída. rankScore trata cada división como +100 puntos, así que una
  // promoción sigue mostrándose como una subida real.
  const lpScores = p.lpHistory.map((h) => rankScore(h.tier, h.division, h.lp));
  const lpStartPoint = p.lpHistory[0];
  const lpCurrentPoint = { tier: p.tierKey, division: p.division, lp: p.lp };
  const lpCrossedBoundary = lpStartPoint.tier !== lpCurrentPoint.tier || lpStartPoint.division !== lpCurrentPoint.division;
  const lpDelta = lpScores[lpScores.length - 1] - lpScores[0];
  const lpChartColor = trendColor(lpScores);
  const lpEndpointLabel = (point: { tier: Player["tierKey"]; division: number; lp: number }) =>
    lpCrossedBoundary ? `${tierFor(point.tier).name} ${point.division} · ${point.lp} LP` : `${point.lp} LP`;
  const lpPointLabels = p.lpHistory.map((h) => {
    const ht = tierFor(h.tier);
    const hWinrate = h.wins + h.losses > 0 ? Math.round((100 * h.wins) / (h.wins + h.losses)) : 0;
    return (
      <>
        <div className="date">
          {new Date(h.capturedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
        </div>
        <div className="rank" style={{ color: ht.fg }}>
          {ht.name} {h.division} · {h.lp} LP
        </div>
        <div className="record">
          {h.wins}V {h.losses}D · {hWinrate}%
        </div>
      </>
    );
  });
  const streak = currentStreak(p.matches);
  const roleAvg = computeRoleAverages(allPlayers, p);
  const metricInsights = buildMetricInsights([
    { key: "kda", label: "KDA", value: Number(avgKDA.toFixed(2)), avg: roleAvg.kda, unit: "" },
    { key: "csPerMin", label: "CS / min", value: Number(avgCS.toFixed(1)), avg: roleAvg.csPerMin, unit: "", tooltip: METRIC_INFO.csPerMin },
    { key: "dmgShare", label: "% daño del equipo", value: Math.round(avgDmg), avg: roleAvg.dmgShare, unit: "%", tooltip: METRIC_INFO.dmgShare },
    { key: "killParticipation", label: "Kill participation", value: killPart, avg: roleAvg.killParticipation, unit: "%", tooltip: METRIC_INFO.killParticipation },
    { key: "objShare", label: "Participación objetivos", value: objPart, avg: roleAvg.objShare, unit: "%", tooltip: METRIC_INFO.objShare },
  ]);
  const { strengths, weaknesses } = splitStrengthsWeaknesses(metricInsights);
  const peakTier = tierFor(p.peakLp.tier);
  const isAtPeak = p.peakLp.tier === p.tierKey && p.peakLp.division === p.division && p.peakLp.lp === p.lp;
  const next = nextDivisionInfo(p.tierKey, p.division, p.lp);
  const nextTier = next ? tierFor(next.tier) : null;

  return (
    <section id="profileSection">
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Perfil de invocador
        </h2>
        <span className="meta">Click en una fila del ladder para inspeccionar</span>
      </div>

      <div className={`profile${fading ? " is-fading" : ""}`}>
        <div className="profile-header">
          <div className="profile-id">
            <div className="profile-avatar" style={{ background: t.bg, color: t.fg, borderColor: `${t.fg}44` }}>
              {champTag(p.mainChamp)}
            </div>
            <div>
              <p className="profile-name">
                {p.name}
                <span className="player-tag">#{p.tag}</span>
                {p.you && <span className="you-badge">VOS</span>}
              </p>
              <p className="profile-sub">
                {ROLES[p.role].label} · main {p.mainChamp} · {p.wins + p.losses} partidas esta season
              </p>
              {p.liveGame && (
                <div className="profile-live-banner">
                  <span className="live-dot" />
                  En vivo ahora · {p.liveGame.champion} · {p.liveGame.queueLabel} · hace {p.liveGame.startedMinutesAgo} min
                </div>
              )}
            </div>
          </div>
          <div className="profile-tier">
            <div className="tn" style={{ color: t.fg }}>
              {t.name} {p.division}
            </div>
            <div className="tl">{p.lp} LP</div>
            <div className="profile-tier-meta">
              <span className={`delta-chip ${lpDelta >= 0 ? "up" : "down"}`}>
                {lpDelta >= 0 ? "▲" : "▼"} {Math.abs(lpDelta)} LP
              </span>
              {streak && (
                <span className={`streak-chip ${streak.result === "W" ? "w" : "l"}`}>
                  {streak.result === "W" ? "🔥" : "🔻"} {streak.count}
                  {streak.capped ? "+" : ""} {streak.result === "W" ? "WIN STREAK" : "LOSS STREAK"}
                </span>
              )}
            </div>
            <div className="profile-tier-peak">
              <span className="peak-label">
                Máximo registrado <InfoTip text={METRIC_INFO.peakLp} />:{" "}
                <span style={{ color: peakTier.fg }}>{peakTier.name} {p.peakLp.division}</span> · {p.peakLp.lp} LP
                {isAtPeak && " (actual)"}
              </span>
              {next ? (
                <span className="next-div-label">
                  Faltan <strong>{next.lpNeeded} LP</strong> para{" "}
                  {nextTier!.name}
                  {next.division ? ` ${next.division}` : ""}
                </span>
              ) : (
                <span className="next-div-label">Tope de división del sistema alcanzado</span>
              )}
              {p.flexRank && (
                <span className="next-div-label">
                  Flex:{" "}
                  <span style={{ color: tierFor(p.flexRank.tier).fg }}>
                    {tierFor(p.flexRank.tier).name} {p.flexRank.division}
                  </span>{" "}
                  · {p.flexRank.lp} LP
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="stack-cols">
          <div>
            <h3 className="subhead">
              <span className="tag macro">Macro</span>Progresión y mapa
            </h3>
            <div className="lp-chart-card">
              <div className="lp-chart-top">
                <div>
                  <span className="label">LP · progresión reciente</span>
                  <br />
                  <span className="big">
                    {lpEndpointLabel(lpStartPoint)} → {lpEndpointLabel(lpCurrentPoint)}
                  </span>
                  <span className={`delta ${lpDelta >= 0 ? "up" : "down"}`}>
                    {lpDelta >= 0 ? "▲" : "▼"} {Math.abs(lpDelta)}
                  </span>
                </div>
              </div>
              <div className="lp-svg">
                <SparkChart
                  values={lpScores}
                  width={520}
                  height={118}
                  pad={8}
                  color={lpChartColor}
                  variant="detailed"
                  pointLabels={lpPointLabels}
                />
              </div>
              {p.lpHistory.length < 3 && (
                <p className="chart-note">
                  Todavía hay poco historial guardado — la curva real va a aparecer a medida que se acumulen más
                  actualizaciones de LP.
                </p>
              )}
            </div>
            <div className="stat-grid">
              <div className="stat-tile"><TrophyIcon /><div className="v">{p.winrate}%</div><div className="k">Winrate season</div></div>
              <div className="stat-tile">
                <TargetIcon />
                <div className="v">{objPart}%</div>
                <div className="k">
                  Participación objetivos <InfoTip text={METRIC_INFO.objShare} />
                </div>
              </div>
              <div className="stat-tile">
                <ZapIcon />
                <div className="v">{killPart}%</div>
                <div className="k">
                  Kill participation <InfoTip text={METRIC_INFO.killParticipation} />
                </div>
              </div>
              <div className="stat-tile">
                <EyeIcon />
                <div className="v">{avgVision}</div>
                <div className="k">
                  Visión / min <InfoTip text={METRIC_INFO.visionScore} />
                </div>
              </div>
              <div className="stat-tile"><ClockIcon /><div className="v">{avgDur} min</div><div className="k">Duración prom.</div></div>
              <div className="stat-tile"><TrendUpIcon /><div className="v">{wins}/{p.matches.length}</div><div className="k">Forma reciente</div></div>
            </div>

            <h4 className="subsection-label">Maestría de campeón</h4>
            <MasteryPool pool={p.masteryPool} />

            <h4 className="subsection-label">Campeones más jugados</h4>
            <ChampionPool pool={p.championPool} />
          </div>

          <div>
            <h3 className="subhead">
              <span className="tag micro">Micro</span>Últimas partidas
            </h3>
            <div className="cmp-card">
              <CmpBar
                label="KDA promedio"
                value={Number(avgKDA.toFixed(2))}
                avg={roleAvg.kda !== null ? Number(roleAvg.kda.toFixed(2)) : null}
                max={6}
              />
              <CmpBar
                label="CS / min"
                value={Number(avgCS.toFixed(1))}
                avg={roleAvg.csPerMin !== null ? Number(roleAvg.csPerMin.toFixed(1)) : null}
                max={10}
                tooltip={METRIC_INFO.csPerMin}
              />
              <CmpBar
                label="% daño del equipo"
                value={Math.round(avgDmg)}
                avg={roleAvg.dmgShare !== null ? Math.round(roleAvg.dmgShare) : null}
                max={45}
                suffix="%"
                tooltip={METRIC_INFO.dmgShare}
              />
            </div>

            <h4 className="subsection-label">Fortalezas y debilidades</h4>
            <InsightsCard strengths={strengths} weaknesses={weaknesses} sampleSize={roleAvg.sampleSize} />

            <div className="matches">
              {!hasMatches && (
                <div className="empty-state">
                  <strong>Sin partidas guardadas todavía</strong>
                  Van a aparecer acá después del próximo refresh (cron diario o &ldquo;Actualizar ahora&rdquo;).
                </div>
              )}
              {p.matches.map((m, i) => {
                const isExpanded = expandedMatch === i;
                return (
                  <div className="match-item" key={i}>
                    <button
                      type="button"
                      className={`match-row${isExpanded ? " is-expanded" : ""}`}
                      onClick={() => setExpandedMatch((cur) => (cur === i ? null : i))}
                      aria-expanded={isExpanded}
                    >
                      <div className={`match-stripe ${m.win ? "w" : "l"}`} />
                      <div className="match-champ">{champTag(m.champ)}</div>
                      <div className="match-mid">
                        <div className="match-top-line">
                          <span className="match-champ-name">{m.champ}</span>
                          <span className={`match-result ${m.win ? "w" : "l"}`}>
                            {m.win ? "VICTORIA" : "DERROTA"}
                          </span>
                        </div>
                        <div className="match-sub">
                          {m.dur} min · {m.cs} CS · {m.csmin}/min · daño {m.dmgShare}% · KP {m.killParticipation}%
                        </div>
                      </div>
                      <div className="match-stats">
                        <div className="kda">
                          {m.k}
                          <span className="neu">/</span>
                          {m.d}
                          <span className="neu">/</span>
                          {m.a}
                        </div>
                        <span className="extra">{m.gold} oro/min</span>
                        <span className="extra match-date">{formatRelativeDate(m.playedAt)}</span>
                      </div>
                      <svg
                        className="match-chevron"
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
                    {isExpanded && <MatchDetail match={m} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
