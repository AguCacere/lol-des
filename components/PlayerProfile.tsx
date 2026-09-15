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
import { championSplashUrl } from "@/lib/ddragon";
import { TiltCard } from "./TiltCard";
import { LiveGamePanel } from "./LiveGamePanel";
import { BuildStarts } from "./BuildStarts";
import { SparkChart } from "./SparkChart";
import { StreakIcon } from "./StreakIcon";
import { ChampIcon } from "./ChampIcon";
import { MatchDetail } from "./MatchDetail";
import { ChampionPool } from "./ChampionPool";
import { MasteryPool } from "./MasteryPool";
import { ChampionInsights } from "./ChampionInsights";
import { CoachPanel } from "./CoachPanel";
import { Matchups } from "./Matchups";
import { InsightsCard } from "./InsightsCard";
import { LineHistory } from "./LineHistory";
import { PersonalRecords } from "./PersonalRecords";
import { RadarChart } from "./RadarChart";
import { RecentForm } from "./RecentForm";
import { AegisStats } from "./AegisStats";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";
import { buildMetricInsights, splitStrengthsWeaknesses } from "@/lib/insights";
import { ClockIcon, EyeIcon, ReviewIcon, TargetIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";
import { winrateTexto } from "@/lib/winrate";

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

/**
 * "23:14" — a qué hora arrancó esa partida, en hora argentina.
 *
 * Va pegada al "hoy" / "ayer" que ya estaba. Sola, la fecha relativa contesta
 * "cuándo, más o menos" y con cinco partidas del mismo día las cinco dicen
 * "hoy": no hay forma de saber cuál fue primero ni si esa derrota fue a las
 * cuatro de la tarde o a las tres de la mañana, que es justo lo que explica
 * media hora mala.
 *
 * Forzada a Buenos Aires y no al reloj del que mira, igual que todo lo de la
 * liga: el grupo está todo acá, y una partida que aparece a otra hora según
 * desde dónde se abra la app es peor que no tener la hora.
 */
function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    // hour12 explícito: `es-AR` sin esto devuelve 12 horas con "p. m." —
    // medido en Chrome, "09:14 p. m."— mientras el resto de la app escribe 24
    // ("cierra 23:30"). Dos relojes distintos en la misma pantalla.
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/**
 * "22 ago" — la fecha de una punta del gráfico, sin año: la ventana nunca cruza
 * uno. En hora argentina, como todo lo que escribe una fecha en esta app.
 */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

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

  // Identidad del jugador, estable entre refetches. El OBJETO no lo es: el
  // poll de "en vivo" corre cada 60s y reconstruye la lista entera
  // (`prev.map(p => ({...p}))`), así que `player` es un objeto nuevo cada
  // minuto aunque no haya cambiado un solo dato.
  const targetKey = player ? `${player.name}#${player.tag}` : null;
  const shownKey = displayed ? `${displayed.name}#${displayed.tag}` : null;

  // Mismo jugador con datos frescos: se cambia el objeto en su lugar, sin
  // crossfade. Va durante el render y no en un efecto porque es un AJUSTE de
  // estado derivado — el patrón que documenta React y el mismo que usa
  // useImageFallback acá al lado; en un efecto dispara un render en cascada.
  if (player !== displayed && targetKey === shownKey) {
    setDisplayed(player);
  }

  // La pestaña se resetea si y SOLO SI cambió el jugador. Antes esto vivía
  // adentro del setTimeout del crossfade, y ahí estaba el bug de fondo: el
  // timeout se dispara ante cualquier cosa que haga diferir las claves,
  // aunque sea por un solo render, y arrastraba el reset con él. Un `player`
  // que se va a null por un render (una lista que se rearma, un refetch a
  // mitad de camino) alcanzaba para tirarte de "Campeones" a "Resumen".
  //
  // Comparando contra la identidad del último jugador para el que se
  // reseteó, ningún refetch puede disparar esto — solo un cambio real de
  // jugador. Y el null se ignora a propósito: si vuelve el mismo jugador
  // después de un parpadeo, no hay nada que resetear.
  const [tabOwner, setTabOwner] = useState<string | null>(targetKey);
  if (targetKey !== null && targetKey !== tabOwner) {
    setTabOwner(targetKey);
    setTab("resumen");
    setExpandedMatch(null);
  }

  useEffect(() => {
    if (targetKey === shownKey) return;
    // Crossfade on selection change, not a fetch — nothing to await before this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFading(true);
    const t = setTimeout(() => {
      setDisplayed(player);
      setFading(false);
    }, 160);
    return () => clearTimeout(t);
  }, [player, targetKey, shownKey]);

  if (!displayed) {
    return (
      <section id="profileSection">
        <div className="section-head">
          <h2>
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

  /**
   * Los límites de división que la curva efectivamente cruzó, para dibujarlos
   * como guías. Sin ellos el gráfico muestra que bajaste pero no CONTRA QUÉ:
   * una caída de 102 puntos puede ser media división o dos, y no hay forma de
   * saberlo mirando la línea.
   *
   * Solo los cruzados: si en toda la ventana no cambiaste de división, no hay
   * ninguna línea que dibujar — cuánto falta para la siguiente ya está en la
   * barra de progreso del encabezado.
   */
  const lpMin = Math.min(...lpScores);
  const lpMax = Math.max(...lpScores);
  const lpGuides = [...new Map(p.lpHistory.map((h) => [`${h.tier}|${h.division}`, h])).values()]
    .map((h) => ({ value: rankScore(h.tier, h.division, 0), label: `${tierFor(h.tier).name} ${h.division}` }))
    .filter((g) => g.value > lpMin && g.value < lpMax);

  /**
   * El récord de la ventana. Los snapshots guardan las victorias y derrotas
   * acumuladas de la season, así que la resta entre el primero y el último da
   * las partidas que efectivamente entraron en esta curva — el dato que
   * explica la caída y que hasta ahora no se mostraba en ningún lado.
   *
   * Con piso en 0 por si el acumulado se reinicia (season nueva, o alguien
   * que se agregó de nuevo): ahí la resta daría negativo y no significaría
   * nada.
   */
  const lpVentana = (() => {
    const primero = p.lpHistory[0];
    const ultimo = p.lpHistory[p.lpHistory.length - 1];
    const v = Math.max(0, ultimo.wins - primero.wins);
    const d = Math.max(0, ultimo.losses - primero.losses);
    const dias = Math.round((Date.parse(ultimo.capturedAt) - Date.parse(primero.capturedAt)) / 86400000);
    return { v, d, dias, desde: primero.capturedAt, hasta: ultimo.capturedAt };
  })();
  // lpDelta is a rankScore delta, not a raw LP delta — the two only match when
  // no division changed hands. Labeling it "LP" unconditionally used to show
  // e.g. "Platino 3 · 64 LP → Platino 2 · 36 LP  ▲72 LP", which reads as a
  // fabricated 72-LP gain when the real LP number visibly dropped 64→36.
  //
  // "pts" evitaba eso pero inventaba una unidad: rankScore sube de a 100 por
  // división y 400 por tier, o sea la MISMA escala que el LP. La diferencia
  // son LP netos y punto — decirlo así se entiende sin dejar de distinguirlo
  // del número crudo que se ve al lado.
  const lpDeltaUnit = lpCrossedBoundary ? "LP netos" : "LP";
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
    // "LP netos" y no "pts", por lo mismo que el titular de arriba: desde que
    // existe la liga, "puntos" es SU unidad y dos escalas con el mismo nombre
    // en la misma app se confunden solas.
    const stepUnit = prev && (prev.tier !== h.tier || prev.division !== h.division) ? "LP netos" : "LP";
    return (
      <>
        <div className="spark-tooltip-head">
          <span className="date">
            {new Date(h.capturedAt).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "short",
              timeZone: "America/Argentina/Buenos_Aires",
            })}
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
          Perfil de invocador
        </h2>
        <span className="meta">Click en una fila del ladder para inspeccionar</span>
      </div>

      <div className={`profile${fading ? " is-fading" : ""}`} style={{ borderTopColor: t.fg }}>
        {/* El splash del campeón principal, apagado y desvanecido hacia la
            izquierda: le da identidad al perfil sin pelearle legibilidad al
            nombre ni al rango, que son los datos. Es un fondo CSS y no un
            <img> a propósito — si la URL falla, no queda un ícono roto, no
            queda nada. */}
        <div
          className="profile-hero-art"
          style={{ backgroundImage: `url(${championSplashUrl(p.mainChamp)})` }}
          aria-hidden="true"
        />
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

          {/* El reparto de roles del header se fue a "Sus líneas", en la
              pestaña de estadísticas: decía el porcentaje por rol y nada más,
              y ahí abajo está lo mismo con el winrate y el KDA de cada una.
              Tenerlo en los dos lados era el mismo dato dos veces, con el
              bueno escondido. */}

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
            {/* Si está jugando AHORA, eso primero: es lo único del perfil que
                sirve mientras la partida está pasando, y en diez minutos deja
                de existir. */}
            {p.liveGame && (
              <div className="live-panel-wrap">
                <LiveGamePanel gameName={p.name} tagLine={p.tag} ddragonVersion={ddragonVersion} />
              </div>
            )}

            {/* Después el tilt: si está en pozo, es lo más accionable que tiene
                el perfil — mirar el gráfico de LP mientras tanto no le sirve
                de nada. */}
            {p.tilt && <TiltCard tilt={p.tilt} />}
            <div>
              <div className="lp-chart-card">
                {/* Arriba va solo lo que resume TODA la ventana: cuánto se
                    movió y con qué récord. El de dónde a dónde bajó al pie,
                    pegado a los extremos de la curva que describe — antes
                    estaba acá arriba y las fechas de esos mismos dos puntos
                    abajo, o sea el mismo par de extremos contado dos veces con
                    el gráfico en el medio. */}
                <div className="lp-chart-top">
                  <span className="label">
                    LP · progresión reciente <InfoTip text={METRIC_INFO.lpProgression} />
                  </span>
                  <div className="lp-chart-resumen">
                    <span className={`lp-chart-delta ${lpDelta >= 0 ? "up" : "down"}`}>
                      {lpDelta >= 0 ? "▲" : "▼"} {Math.abs(lpDelta)}
                      <span className="lp-chart-delta-unit">{lpDeltaUnit}</span>
                    </span>
                    {lpVentana.v + lpVentana.d > 0 && (
                      <span className="lp-chart-record">
                        <strong className={lpVentana.v >= lpVentana.d ? "gd-pos" : "gd-neg"}>
                          {lpVentana.v}V-{lpVentana.d}D
                        </strong>
                        {lpVentana.dias > 0 && ` en ${lpVentana.dias} ${lpVentana.dias === 1 ? "día" : "días"}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="lp-svg">
                  <SparkChart
                    values={lpScores}
                    // El viewBox tiene que quedar cerca del ancho real en el
                    // que se dibuja: el SVG usa preserveAspectRatio="none", así
                    // que cuanto más lejos esté, más se estira todo a lo ancho
                    // (el trazo se aplasta y los puntos salen elípticos).
                    width={620}
                    height={132}
                    pad={10}
                    color={lpChartColor}
                    variant="detailed"
                    pointLabels={lpPointLabels}
                    guides={lpGuides}
                    // El techo y el piso escritos sobre el punto. Mismo
                    // formato que las puntas del pie del gráfico, así los
                    // cuatro números de la tarjeta se leen igual entre sí.
                    valorDePunto={(i) => lpEndpointLabel(p.lpHistory[i])}
                  />
                </div>
                {/* Cada extremo con su fecha y su elo en la misma columna, y
                    metidos hacia adentro lo mismo que la curva (padX/width del
                    SparkChart, ver --lp-inset) para que caigan justo debajo
                    del primer y del último punto en vez de contra el borde de
                    la tarjeta. */}
                <div className="lp-chart-pie">
                  <span className="lp-chart-extremo">
                    <span className="fecha">{fechaCorta(lpVentana.desde)}</span>
                    <span className="elo">{lpEndpointLabel(lpStartPoint)}</span>
                  </span>
                  {lpVentana.v + lpVentana.d === 0 && (
                    <span className="lp-chart-pie-nota">sin partidas nuevas todavía</span>
                  )}
                  <span className="lp-chart-extremo a-la-derecha">
                    <span className="fecha">{fechaCorta(lpVentana.hasta)}</span>
                    <span className="elo">{lpEndpointLabel(lpCurrentPoint)}</span>
                  </span>
                </div>
                {p.lpHistory.length < 3 && (
                  <p className="chart-note">
                    Todavía hay poco historial guardado — la curva real va a aparecer a medida que se acumulen más
                    actualizaciones de LP.
                  </p>
                )}
              </div>
              <div className="stat-grid">
                <div className="stat-tile"><TrophyIcon /><div className="v">{winrateTexto(p.wins, p.wins + p.losses)}</div><div className="k">Winrate season</div></div>
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
                                {/* El texto va en su propio span para poder
                                    esconderlo en el teléfono y dejar la lupa
                                    sola: son 70px que en 390 no sobran. */}
                                <span className="review-badge-txt">Para repasar</span>
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
                          <span className="extra match-date">
                            {formatRelativeDate(m.playedAt)}{" "}
                            <i className="match-hora">{horaDe(m.playedAt)}</i>
                          </span>
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
            {p.lineas && (
              <div>
                <h4 className="subsection-label">
                  Sus líneas
                  <InfoTip text="Sale de la posición REAL que Riot le asignó en cada partida guardada, no del rol que figura arriba. La barra clara de atrás es cuánto jugó esa línea comparada con la que más juega; la de color, el winrate." />
                </h4>
                <LineHistory h={p.lineas} />
              </div>
            )}
            <div className="stack-cols">
              <div>
                <RadarChart radar={p.radar} role={p.role} />
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
              <h4 className="subsection-label">
                Maestría de campeón
                <InfoTip text="Champion Mastery de Riot: puntos acumulados en toda tu carrera y en TODAS las colas (ranked, normales, ARAM). No sale de las partidas que guarda la app, por eso el orden puede no coincidir con el de al lado. Riot solo expone puntos y nivel acá — no hay victorias ni KDA en este dato." />
              </h4>
              <MasteryPool pool={p.masteryPool} ddragonVersion={ddragonVersion} />
            </div>
            <div>
              <h4 className="subsection-label">
                Campeones más jugados
                <InfoTip text="Sale de tus partidas de ranked solo/dúo guardadas por la app, no de tu carrera completa: el winrate y el KDA son reales, calculados de esas partidas. Por eso el orden puede no coincidir con el de maestría, que cuenta todas las colas de siempre. El winrate va en gris cuando hay menos de 5 partidas: con tan pocas, el porcentaje todavía no dice nada." />
              </h4>
              <ChampionPool pool={p.championPool} ddragonVersion={ddragonVersion} />
            </div>
          </div>
        )}

        {tab === "campeones" && (
          <>
            {/* Antes que los enfrentamientos porque conecta con las dos listas
                de arriba: es la conclusión de mirarlas juntas, no un bloque
                nuevo de datos. */}
            {p.championInsights.length > 0 && (
              <h4 className="subsection-label">
                Lectura del pool
                <InfoTip text="Sale de cruzar las dos listas de arriba: la maestría dice cuánto invertiste en cada campeón de toda tu carrera, el pool dice cómo te está yendo en ranked. Ninguna de las dos por separado puede señalar un campeón muy trabajado que no está rindiendo, o uno que te rinde sin ser de los tuyos." />
              </h4>
            )}
            <ChampionInsights insights={p.championInsights} ddragonVersion={ddragonVersion} />

            {/* A lo ancho y debajo de las dos columnas: cada fila lleva dos
                íconos, dos nombres, el oro a los 15 y el récord, y a media
                columna eso se amontona. Además es otra unidad de análisis que
                las listas de arriba — un par, no un campeón suelto. */}
            <h4 className="subsection-label">Enfrentamientos de línea</h4>
            <Matchups matchups={p.matchups} ddragonVersion={ddragonVersion} />

            {/* Después de los enfrentamientos: los dos son "cómo jugás a este
                campeón", pero el arranque es una decisión que se toma antes de
                la partida y el matchup es contra quién te tocó. */}
            <BuildStarts stats={p.buildStats} ddragonVersion={ddragonVersion} />

            {/* Al final de la pestaña a propósito: lee todo lo de arriba (pool,
                maestría, enfrentamientos) y lo interpreta, así que llega
                después de que el jugador ya vio los datos crudos. */}
            <h4 className="subsection-label">Análisis del pool</h4>
            <CoachPanel gameName={p.name} tagLine={p.tag} ddragonVersion={ddragonVersion} />
          </>
        )}
      </div>
    </section>
  );
}
