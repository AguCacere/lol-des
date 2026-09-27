"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import {
  tierFor,
  champTag,
  ROLES,
  currentStreak,
  formatRelativeDate,
  nextDivisionInfo,
  rankScore,
  rankEmblemUrl,
  liveGameTimeLabel,
} from "@/lib/ladder";
import { championSplashUrl } from "@/lib/ddragon";
import { TiltCard } from "./TiltCard";
import { LiveGamePanel } from "./LiveGamePanel";
import { StreakIcon } from "./StreakIcon";
import { ChampIcon } from "./ChampIcon";
import { MatchDetail } from "./MatchDetail";
import { CoachPanel } from "./CoachPanel";
import { LineHistory } from "./LineHistory";
import { leerElPerfil } from "@/lib/lectura";
import { PersonalRecords } from "./PersonalRecords";
import { RecentForm } from "./RecentForm";
import { ProgresionLP } from "./ProgresionLP";
import { ProfileLectura } from "./ProfileLectura";
import { ProfileCampeones } from "./ProfileCampeones";
import { AegisStats } from "./AegisStats";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";
import { ReviewIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

/**
 * Sub-navegación del perfil. Reemplaza al toggle Macro/Micro, que solo
 * existía por debajo de 760px: el perfil ya venía largo con dos columnas
 * apiladas, y con radar, métricas y matchups en camino un scroll único deja
 * de ser usable en cualquier tamaño. Cada bloque nuevo entra en su pestaña
 * en vez de estirar la página.
 */
/**
 * DOS y no tres. "Mejorar" se fue: no era otra dimensión del perfil, era la
 * INTERPRETACIÓN de los datos del perfil, y tenerla aparte costaba un click
 * para llegar a la conclusión y repetía adentro las líneas y la forma
 * reciente, que ya estaban en Resumen. Ahora la lectura vive donde tiene
 * contexto y el perfil se lee de corrido. Ver DECISIONES.
 */
type ProfileTabKey = "resumen" | "campeones";
const PROFILE_TABS: { key: ProfileTabKey; label: string }[] = [
  { key: "resumen", label: "Resumen" },
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
  /**
   * Qué hace mejor y qué peor que su línea, ya filtrado a lo que se despega
   * de verdad. Es lo que era la pestaña Mejorar. Ver lib/lectura.ts.
   */
  const lectura = leerElPerfil(p.radar);
  // Se fueron TODOS los promedios sobre `p.matches` que vivían acá: wins,
  // avgKDA, avgCS, avgDmg, avgVision, avgDur, killPart y objPart. Los ocho
  // promediaban las últimas CINCO partidas y se mostraban —en las fichas del
  // Resumen o en la tarjeta de fortalezas— como si fueran los números
  // generales del jugador, sin decir la muestra. Las mismas métricas, bien
  // contadas sobre todo el historial y con su muestra escrita, están en la
  // lectura contra su línea (lib/lectura.ts) y en la forma reciente.
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

  // El delta de la ventana de fotos, que sigue vivo en el encabezado (el
  // chip de "▲92 LP netos" al lado del rango). El GRÁFICO ya no sale de acá:
  // dibuja una partida por punto desde `p.progresion`, ver ProgresionLP.tsx.
  const lpDeltaUnit = lpCrossedBoundary ? "LP netos" : "LP";
  const streak = currentStreak(p.matches);
  // Se fueron `metricInsights` y su split en fortalezas/debilidades. No es
  // que sobraran: estaban MAL. Sus valores salían de `avgKDA`, `avgCS`,
  // `avgDmg`, `killPart` y `objPart`, que promedian las últimas CINCO
  // partidas, y los comparaban contra `roleAverages`, que sale de cientos de
  // partidas del grupo. Una sola partida buena te movía de "debilidad" a
  // "fortaleza". La comparación bien hecha —todas tus partidas en esa línea
  // contra todas las del grupo en esa línea, con las dos muestras a la
  // vista— ya la hacía el radar, y es la que quedó en la lectura contra su
  // línea (lib/lectura.ts).
  const peakTier = tierFor(p.peakLp.tier);
  const isAtPeak = p.peakLp.tier === p.tierKey && p.peakLp.division === p.division && p.peakLp.lp === p.lp;
  const next = nextDivisionInfo(p.tierKey, p.division, p.lp);
  const nextTier = next ? tierFor(next.tier) : null;
  // Null en los tiers para los que todavía no tenemos arte (ver
  // RANK_EMBLEMS_AVAILABLE) — ahí el rango queda como estaba, solo texto.
  const emblemUrl = rankEmblemUrl(p.tierKey);

  return (
    // Sin encabezado de sección. Tenía uno —"Perfil de invocador" con un
    // "Click en una fila del ladder para inspeccionar" al costado— y los dos
    // se quedaron sin sentido el día que el perfil dejó de vivir DEBAJO del
    // ladder: el rótulo repite lo que ya dicen el botón de volver y el nombre
    // enorme que viene justo abajo, y la ayuda señalaba una tabla que en esta
    // vista no está en pantalla.
    <section id="profileSection">
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
          /* ── El Resumen, reconstruido alrededor de tres preguntas ──
             qué me está pasando · qué hago bien · qué debería corregir.

             Antes había TRES pestañas y la del medio, "Mejorar", no era otra
             dimensión del perfil: era la interpretación de los datos del
             perfil. Tenerla aparte costaba un click para llegar a la
             conclusión y, peor, repetía adentro cosas que ya estaban acá —las
             líneas y la forma reciente salían dos veces, con dos diseños—.
             Ahora el perfil son dos pestañas y la regla es una sola:

                 UNA INFORMACIÓN APARECE UNA SOLA VEZ.

             Forma reciente, líneas, comparación con el rol, progresión de LP:
             cada una en un lugar y nada más. */
          <div className="resumen">
            {/* Si está jugando AHORA, eso primero: es lo único del perfil que
                sirve mientras la partida está pasando, y en diez minutos deja
                de existir. */}
            {p.liveGame && (
              <div className="resumen-ancho">
                <LiveGamePanel gameName={p.name} tagLine={p.tag} ddragonVersion={ddragonVersion} />
              </div>
            )}

            {/* Y el tilt: si está en pozo, es lo más accionable que tiene el
                perfil — mirar el gráfico de LP mientras tanto no le sirve. */}
            {p.tilt && (
              <div className="resumen-ancho">
                <TiltCard tilt={p.tilt} />
              </div>
            )}

            {/* ═══ 1. Qué le está pasando ═══
                La progresión partida por partida, a todo el ancho. Arrancó
                compartiendo renglón con la forma reciente y quedaba MAL: el
                gráfico mide 150px con su pie y la forma reciente 410, así
                que abajo del dibujo quedaban 260px de nada. Y a todo el
                ancho el gráfico gana lo que le faltaba — 60px entre partida
                y partida en vez de 25, que es la diferencia entre poder
                apuntarle a una y no. */}
            <section className="resumen-ancho resumen-momento">
              <h4 className="resumen-titulo">Su momento</h4>
              <ProgresionLP p={p.progresion} ddragonVersion={ddragonVersion} />
            </section>

            {/* ═══ 2 y 3. Qué hace bien y qué corregir ═══
                Lo que era la pestaña Mejorar, ya interpretado: máximo tres
                fortalezas y UN foco. Ver lib/lectura.ts. */}
            <section className="resumen-izq">
              {/* Sin un título propio arriba: "Dónde está destacando" y "Su
                  foco ahora" SON los títulos, y meterlos abajo de un "Contra
                  su línea" agregaba un escalón de jerarquía que no separa
                  nada — la línea contra la que se compara ya la dice la
                  primera frase del bloque. */}
              <ProfileLectura l={lectura} role={p.role} />

              {p.lineas && (
                <>
                  <h4 className="resumen-titulo con-aire">
                    Cómo está jugando
                    <InfoTip text="Sale de la posición REAL que Riot le asignó en cada partida guardada, no del rol que figura arriba." />
                  </h4>
                  <LineHistory h={p.lineas} />
                </>
              )}

              {p.personalRecords && (
                <>
                  <h4 className="resumen-titulo con-aire">Récords</h4>
                  <PersonalRecords records={p.personalRecords} />
                </>
              )}

              <AegisStats stats={p.aegisStats} />
            </section>

            {/* La lista de partidas, en la columna de la derecha y a lo alto:
                son cinco items y la columna de la izquierda es una pila de
                lecturas cortas. */}
            <section className="resumen-der">
              {/* La forma reciente vive acá y no al lado del gráfico: es la
                  misma pregunta que las últimas partidas —qué viene pasando—
                  y juntas equilibran la columna. Su propio encabezado hace
                  de título; no lleva uno arriba porque sería el mismo texto
                  dos veces. */}
              <RecentForm form={p.recentForm} />

              <h4 className="subsection-label forma-despues">Últimas partidas</h4>
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
                            {/* Mismo truco que la chapa de repasar: en 390 la
                                palabra entera se comía 55 de los ~98px de la
                                línea y el nombre salía "Serap…". La inicial
                                dice lo mismo —es como se escriben los récords
                                en toda la app— y el color no queda solo. */}
                            <span className={`match-result ${m.win ? "w" : "l"}`}>
                              <span className="match-result-larga">{m.win ? "VICTORIA" : "DERROTA"}</span>
                              <span className="match-result-corta">{m.win ? "V" : "D"}</span>
                            </span>
                          </div>
                          {/* En el teléfono esta línea entra en 131px y con
                              todo puesto lo último que se leía era "186 CS…".
                              Se caen las dos piezas de menor jerarquía —el CS
                              por minuto entre paréntesis y el % de daño— y los
                              dos que quedan entran enteros, sin ellipsis
                              colgando. Los dos escondidos siguen estando en el
                              detalle desplegado (MatchDetail). */}
                          <div className="match-sub">
                            {m.dur} min · {m.cs} CS
                            <span className="match-sub-extra"> ({m.csmin}/min)</span>
                            <span className="match-sub-extra"> · daño {m.dmgShare}%</span>
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
            </section>
          </div>
        )}


        {tab === "campeones" && (
          <>
            {/* Organizado alrededor DEL CAMPEÓN. Antes eran cinco secciones
                —maestría, más jugados, lectura del pool, enfrentamientos y
                cómo arrancás— cada una con todos los campeones adentro: para
                entender cómo le iba con Seraphine había que recorrer las
                cinco y juntar los pedazos de cabeza. Ninguna cuenta cambió,
                solo el eje por el que se cruzan. */}
            <ProfileCampeones
              pool={p.championPool}
              mastery={p.masteryPool}
              matchups={p.matchups}
              builds={p.buildStats}
              insights={p.championInsights}
              ddragonVersion={ddragonVersion}
            />

            {/* Al final y aparte: no es un dato más del pool, es una lectura
                del conjunto hecha por un modelo, y llega después de que la
                persona ya vio los números. */}
            <h4 className="subsection-label">Análisis del pool</h4>
            <CoachPanel gameName={p.name} tagLine={p.tag} ddragonVersion={ddragonVersion} />
          </>
        )}
      </div>
    </section>
  );
}
