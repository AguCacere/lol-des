"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import {
  tierFor,
  champTag,
  ROLES,
  currentStreak,
  formatRelativeDate,
  trendColor,
  nextDivisionInfo,
  rankScore,
  rankEmblemUrl,
  liveGameTimeLabel,
} from "@/lib/ladder";
import { SparkChart } from "./SparkChart";
import { StreakIcon } from "./StreakIcon";
import { ChampIcon } from "./ChampIcon";
import { MatchDetail } from "./MatchDetail";
import { ChampionPool } from "./ChampionPool";
import { MasteryPool } from "./MasteryPool";
import { Matchups } from "./Matchups";
import { InsightsCard } from "./InsightsCard";
import { RoleDistribution } from "./RoleDistribution";
import { PersonalRecords } from "./PersonalRecords";
import { RadarChart } from "./RadarChart";
import { RecentForm } from "./RecentForm";
import { AegisStats } from "./AegisStats";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";
import { buildMetricInsights, splitStrengthsWeaknesses } from "@/lib/insights";
import { ClockIcon, EyeIcon, ReviewIcon, TargetIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

/**
 * Sub-navegación del perfil. Reemplaza al toggle Macro/Micro, que solo
 * existía por debajo de 760px: el perfil ya venía largo con dos columnas
 * apiladas, y con radar, métricas y matchups en camino un scroll único deja
 * de ser usable en cualquier tamaño. Cada bloque nuevo entra en su pestaña
 * en vez de estirar la página.
 */
type ProfileTabKey = "resumen" | "rendimiento" | "campeones";
const PROFILE_TABS: { key: ProfileTabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "rendimiento", label: "Rendimiento" },
  { key: "campeones", label: "Campeones" },
];

export function PlayerProfile({
  player,
  ddragonVersion,
}: {
  player: Player | null;
  ddragonVersion: string | null;
}) {
  const [displayed, setDisplayed] = useState(player);
  const [fading, setFading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [tab, setTab] = useState<ProfileTabKey>("resumen");

  useEffect(() => {
    if (player === displayed) return;
    // Crossfade on selection change, not a fetch — nothing to await before this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFading(true);
    const t = setTimeout(() => {
      setDisplayed(player);
      setFading(false);
      setExpandedMatch(null);
      setTab("resumen");
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
  // lpDelta is a rankScore delta, not a raw LP delta — the two only match when
  // no division changed hands. Labeling it "LP" unconditionally used to show
  // e.g. "Platino 3 · 64 LP → Platino 2 · 36 LP  ▲72 LP", which reads as a
  // fabricated 72-LP gain when the real LP number visibly dropped 64→36.
  const lpDeltaUnit = lpCrossedBoundary ? "pts" : "LP";
  const lpChartColor = trendColor(lpScores);
  const lpEndpointLabel = (point: { tier: Player["tierKey"]; division: number; lp: number }) =>
    lpCrossedBoundary ? `${tierFor(point.tier).name} ${point.division} · ${point.lp} LP` : `${point.lp} LP`;
  const lpPointLabels = p.lpHistory.map((h, i) => {
    const ht = tierFor(h.tier);
    const hWinrate = h.wins + h.losses > 0 ? Math.round((100 * h.wins) / (h.wins + h.losses)) : 0;
    // Step delta vs. the PREVIOUS snapshot specifically (not vs. the chart's
    // overall start) — this is the number the hover is actually for: "what
    // happened right here." Same rankScore-vs-raw-LP unit logic as the
    // headline delta, but evaluated per adjacent pair so a promotion between
    // two snapshots still reads as a real gain instead of a fabricated drop.
    const prev = i > 0 ? p.lpHistory[i - 1] : null;
    const stepDelta = prev ? lpScores[i] - lpScores[i - 1] : null;
    const stepUnit = prev && (prev.tier !== h.tier || prev.division !== h.division) ? "pts" : "LP";
    return (
      <>
        <div className="spark-tooltip-head">
          <span className="date">
            {new Date(h.capturedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
          </span>
          {stepDelta !== null && stepDelta !== 0 && (
            <span className={`spark-tooltip-delta ${stepDelta > 0 ? "up" : "down"}`}>
              {stepDelta > 0 ? "▲" : "▼"} {Math.abs(stepDelta)} {stepUnit}
            </span>
          )}
        </div>
        <div className="rank" style={{ color: ht.fg }}>
          {ht.name} {h.division} · {h.lp} LP
        </div>
        <div className="spark-tooltip-divider" />
        <div className="record">
          {h.wins}V {h.losses}D · <span className={hWinrate >= 50 ? "good" : "bad"}>{hWinrate}%</span>
        </div>
      </>
    );
  });
  const streak = currentStreak(p.matches);
  const roleAvg = p.roleAverages;
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
  // Null en los tiers para los que todavía no tenemos arte (ver
  // RANK_EMBLEMS_AVAILABLE) — ahí el rango queda como estaba, solo texto.
  const emblemUrl = rankEmblemUrl(p.tierKey);

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
              {p.profileIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- one small fixed-size avatar, not worth next/image's config for an external CDN
                <img src={p.profileIconUrl} alt="" className="profile-avatar-img" />
              ) : (
                champTag(p.mainChamp)
              )}
              {p.summonerLevel != null && <span className="profile-level-badge">{p.summonerLevel}</span>}
            </div>
            <div>
              <p className="profile-name">
                {p.name}
                <span className="player-tag">#{p.tag}</span>
                {p.you && <span className="you-badge">VOS</span>}
              </p>
              <p className="profile-sub">
                {ROLES[p.role].label} · main {championLabel(p.mainChamp)} · {p.wins + p.losses} partidas esta season
              </p>
              {p.liveGame && (
                // Punto pulsante y texto, no el bloque verde sólido de antes:
                // llenar una caja de color hacía que lo primero que mirabas
                // del header fuera esto y no el rango, que es el titular.
                <p className="profile-live-line">
                  <span className="live-dot" />
                  En vivo · {championLabel(p.liveGame.champion)} · {p.liveGame.queueLabel} ·{" "}
                  {liveGameTimeLabel(p.liveGame.startedMinutesAgo)}
                </p>
              )}
            </div>
          </div>

          {/* El reparto de roles pasa de una franja propia a la zona del
              medio del header: llena el hueco que quedaba entre el nombre y
              el rango con algo que ya existía, y le saca al perfil una fila
              entera de alto — que en mobile es donde más molesta. */}
          {p.roleDistribution.length > 0 && (
            <div className="profile-roles">
              <span className="role-dist-label">
                Reparto de roles
                <InfoTip text="% de todas tus partidas guardadas jugadas en cada rol — no solo la línea que se muestra como main arriba." />
              </span>
              <RoleDistribution distribution={p.roleDistribution} currentRole={p.role} />
            </div>
          )}

          <div className="profile-tier">
            <div className="profile-tier-top">
              {/* El emblema le da al rango el ancla visual que le faltaba:
                  era el dato más importante del header y competía como texto
                  suelto contra cuatro chips de colores. */}
              {emblemUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- ícono local fijo, no vale la config de next/image
                <img src={emblemUrl} alt="" className="profile-tier-emblem" />
              )}
              <div className="profile-tier-names">
                <div className="tn" style={{ color: t.fg }}>
                  {t.name} {p.division}
                </div>
                <div className="tl">{p.lp} LP</div>
              </div>
            </div>

            <div className="profile-tier-meta">
              <span className={`delta-chip ${lpDelta >= 0 ? "up" : "down"}`}>
                {lpDelta >= 0 ? "▲" : "▼"} {Math.abs(lpDelta)} {lpDeltaUnit}
              </span>
              {streak && (
                <span className={`streak-chip ${streak.result === "W" ? "w" : "l"}`}>
                  <StreakIcon result={streak.result} /> {streak.count}
                  {streak.capped ? "+" : ""} {streak.result === "W" ? "WIN STREAK" : "LOSS STREAK"}
                </span>
              )}
            </div>

            {/* Barra en vez de la pill "Faltan N LP para X". Los LP dentro de
                una división van de 0 a 100, así que la proporción existe de
                verdad y se lee de un vistazo; el texto que estaba antes queda
                igual debajo, sin perder el número exacto. */}
            <div className="rank-progress">
              <div className="rank-progress-track">
                <div
                  className="rank-progress-fill"
                  style={{ width: `${Math.max(2, Math.min(100, p.lp))}%`, background: t.fg }}
                />
              </div>
              <span className="rank-progress-label">
                {next ? (
                  <>
                    Faltan <strong>{next.lpNeeded} LP</strong> para {nextTier!.name}
                    {next.division ? ` ${next.division}` : ""}
                  </>
                ) : (
                  "Tope de división del sistema alcanzado"
                )}
              </span>
            </div>

            {/* Máximo y Flex en una sola línea apagada: son contexto, no
                titulares, y como pills competían con el rango de arriba. */}
            <div className="profile-tier-context">
              <span>
                Máximo <InfoTip text={METRIC_INFO.peakLp} />{" "}
                <span style={{ color: peakTier.fg }}>
                  {peakTier.name} {p.peakLp.division}
                </span>{" "}
                · {p.peakLp.lp} LP{isAtPeak && " (actual)"}
              </span>
              {p.flexRank && (
                <span className="profile-flex">
                  <span
                    className="flex-chip-badge"
                    style={{ background: tierFor(p.flexRank.tier).bg, color: tierFor(p.flexRank.tier).fg }}
                  >
                    {tierFor(p.flexRank.tier).name[0]}
                    {p.flexRank.division}
                  </span>
                  Flex · {p.flexRank.lp} LP
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-tabs" role="tablist">
          {PROFILE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`profile-tab${tab === t.key ? " is-active" : ""}`}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "resumen" && (
          <div className="stack-cols">
            <div>
              <div className="lp-chart-card">
                <div className="lp-chart-top">
                  <div>
                    <span className="label">
                      LP · progresión reciente <InfoTip text={METRIC_INFO.lpProgression} />
                    </span>
                    <div className="lp-chart-range">
                      {lpEndpointLabel(lpStartPoint)}
                      <span className="lp-chart-arrow">→</span>
                      {lpEndpointLabel(lpCurrentPoint)}
                    </div>
                  </div>
                  <span className={`lp-chart-delta ${lpDelta >= 0 ? "up" : "down"}`}>
                    {lpDelta >= 0 ? "▲" : "▼"} {Math.abs(lpDelta)}
                    <span className="lp-chart-delta-unit">{lpDeltaUnit}</span>
                  </span>
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
            </div>

            <div>
              <h4 className="subsection-label">Últimas partidas</h4>
              <div className="matches">
                {!hasMatches && (
                  <div className="empty-state">
                    <strong>Sin partidas guardadas todavía</strong>
                    Van a aparecer acá solas después del próximo refresh automático (corre cada 15 minutos).
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
                        <ChampIcon champ={m.champ} version={ddragonVersion} className="match-champ" />
                        <div className="match-mid">
                          <div className="match-top-line">
                            <span className="match-champ-name">{championLabel(m.champ)}</span>
                            {m.flag && (
                              <span className="review-badge" title={m.flag.reasons.join(" · ")}>
                                <ReviewIcon />
                                Para repasar
                              </span>
                            )}
                            <span className={`match-result ${m.win ? "w" : "l"}`}>
                              {m.win ? "VICTORIA" : "DERROTA"}
                            </span>
                          </div>
                          <div className="match-sub">
                            {m.dur} min · {m.cs} CS ({m.csmin}/min) · daño {m.dmgShare}%
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
                      {isExpanded && <MatchDetail match={m} ddragonVersion={ddragonVersion} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "rendimiento" && (
          <>
            {/* Ancho completo y arriba de todo: es la lectura de cabecera de
                esta pestaña ("¿voy mejorando?"), y las dos columnas de abajo
                son el detalle de por qué. */}
            <RecentForm form={p.recentForm} />
            <div className="stack-cols">
              <div>
                <h4 className="subsection-label">Perfil de rendimiento</h4>
                <RadarChart radar={p.radar} />
              </div>

              <div>
                <h4 className="subsection-label">Fortalezas y debilidades</h4>
                <InsightsCard strengths={strengths} weaknesses={weaknesses} sampleSize={roleAvg.sampleSize} />
                {p.personalRecords && (
                  <>
                    <h4 className="subsection-label">Récords personales</h4>
                    <PersonalRecords records={p.personalRecords} />
                  </>
                )}
                <AegisStats stats={p.aegisStats} />
              </div>
            </div>
          </>
        )}

        {tab === "campeones" && (
          <div className="stack-cols even">
            <div>
              <h4 className="subsection-label">Maestría de campeón</h4>
              <MasteryPool pool={p.masteryPool} ddragonVersion={ddragonVersion} />
            </div>
            <div>
              <h4 className="subsection-label">Campeones más jugados</h4>
              <ChampionPool pool={p.championPool} ddragonVersion={ddragonVersion} />
            </div>
          </div>
        )}

        {/* A lo ancho y debajo de las dos columnas: cada fila lleva dos
            íconos, dos nombres, el oro a los 15 y el récord, y a media
            columna eso se amontona. Además es otra unidad de análisis que
            las listas de arriba — un par, no un campeón suelto. */}
        {tab === "campeones" && (
          <>
            <h4 className="subsection-label">Enfrentamientos de línea</h4>
            <Matchups matchups={p.matchups} ddragonVersion={ddragonVersion} />
          </>
        )}
      </div>
    </section>
  );
}
