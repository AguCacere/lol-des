"use client";

import { useState } from "react";
import type { TeamDigest as TeamDigestData } from "@/lib/types";
import { tierFor, trendColor } from "@/lib/ladder";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { SparkChart } from "./SparkChart";
import { CheckIcon, CopyIcon, TrendDownIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

function formatWindowRange(startIso: string, endIso: string): string {
  // En hora argentina, como todo lo que escribe una fecha en esta app: sin el
  // huso, una partida de las 22 de un 30 se escribe "1 sep" para cualquiera con
  // el reloj adelantado.
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

/** One end of the week's rank move, tinted with that tier's own colour — same language as the profile's LP chart endpoints. */
function RankEnd({ point }: { point: { tier: Parameters<typeof tierFor>[0]; division: number; lp: number } }) {
  const t = tierFor(point.tier);
  return (
    <span className="digest-rank-end">
      <span style={{ color: t.fg }}>
        {t.name} {point.division}
      </span>
      <span className="digest-rank-lp">· {point.lp} LP</span>
    </span>
  );
}

/** K/D/A as a real box score instead of a run-on "9/2/16" string — muted separators, deaths tinted, same reading as the match history. */
function BoxScore({ k, d, a }: { k: number; d: number; a: number }) {
  return (
    <span className="digest-kda">
      {k}
      <span className="neu">/</span>
      <span className="deaths">{d}</span>
      <span className="neu">/</span>
      {a}
    </span>
  );
}

function ChampionCard({ champion, ddragonVersion }: { champion: NonNullable<TeamDigestData["mostPlayedChampion"]>; ddragonVersion: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = champion.players.length > 0;
  return (
    <div className="digest-card accent-primary">
      <span className="digest-card-label">
        <span className="digest-card-icon accent">
          <TrophyIcon />
        </span>
        Campeón más jugado
      </span>
      <button
        type="button"
        className={`digest-card-body digest-champ-toggle${expanded ? " is-expanded" : ""}`}
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        aria-expanded={expanded}
      >
        <ChampIcon champ={champion.champion} version={ddragonVersion} className="duo-avatar" />
        <div className="digest-card-mid">
          <span className="digest-card-name">{championLabel(champion.champion)}</span>
          <span className="digest-card-sub">{champion.games} partidas</span>
        </div>
        <span className="digest-card-value">
          {champion.wins}V-{champion.games - champion.wins}D
        </span>
        {canExpand && (
          <svg className="digest-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {expanded && (
        <div className="digest-champ-players">
          {champion.players.map((p) => (
            <div className="digest-champ-player-row" key={`${p.name}#${p.tag}`}>
              <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="duo-avatar sm" />
              <span className="digest-card-name">
                {p.name} <span className="player-tag">#{p.tag}</span>
              </span>
              <span className="digest-champ-player-stat">
                {p.games} {p.games === 1 ? "partida" : "partidas"} · {p.wins}V-{p.games - p.wins}D
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DigestBody({
  digest,
  ddragonVersion,
  copied,
  onCopy,
}: {
  digest: TeamDigestData;
  ddragonVersion: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  const hasAnything = digest.biggestLpGain || digest.bestKda || digest.worstLoss || digest.mostPlayedChampion;
  if (!hasAnything) {
    return (
      <div className="empty-state">
        <strong>Sin partidas guardadas en esta semana</strong>
        {digest.semana > 0
          ? "Esa semana nadie del grupo jugó ranked, o todavía no teníamos guardadas sus partidas."
          : "Se llena solo a medida que el grupo juegue ranked — no hace falta hacer nada."}
      </div>
    );
  }

  // Puede faltar si el CDN devuelve un JSON anterior al deploy (la ruta se
  // cachea 5 minutos): sin la guarda, la pestaña entera queda en blanco.
  const r = digest.resumen;

  return (
    <>
      {/* La semana del grupo antes de los destacados individuales: sin esto,
          la pestaña arrancaba con "el que más subió" sin decir nunca si la
          semana fue buena o mala para el grupo, ni cuánto se jugó. */}
      {r && r.partidas > 0 && (
        <div className="digest-resumen">
          <div className="digest-kpi">
            <span className="digest-kpi-valor">{r.partidas}</span>
            <span className="digest-kpi-label">partidas</span>
          </div>
          <div className="digest-kpi">
            <span className={`digest-kpi-valor ${r ? tonoDeWinrate(r.victorias, r.partidas) : "neutral"}`}>
              {r ? winrateTexto(r.victorias, r.partidas) : "0.0%"}
            </span>
            <span className="digest-kpi-label">
              {r.victorias}V-{r.derrotas}D del grupo
            </span>
          </div>
          <div className="digest-kpi">
            <span className={`digest-kpi-valor ${r.lpNeto >= 0 ? "good" : "bad"}`}>
              {r.lpNeto >= 0 ? "+" : ""}
              {r.lpNeto}
            </span>
            <span className="digest-kpi-label">
              {/* "LP netos" y no "pts netos": desde que existe la liga, "puntos"
                  es SU unidad —victoria 1, derrota −0,75— y este número es de
                  otra escala completamente distinta. Ver unidadDelta en
                  components/LadderTable.tsx. */}
              LP netos
              <InfoTip text="Lo que subió y bajó TODO el grupo sumado, no solo el que más ganó. Es la única cifra de la pestaña que dice si la semana fue buena para todos o si uno solo tapó a los demás." />
            </span>
          </div>
          <div className="digest-kpi">
            <span className="digest-kpi-valor">{r.jugadores}</span>
            <span className="digest-kpi-label">jugaron</span>
          </div>
          {r.masActivo && (
            <div className="digest-kpi ancho">
              <span className="digest-kpi-valor chico">{r.masActivo.name}</span>
              <span className="digest-kpi-label">el que más jugó · {r.masActivo.games} partidas</span>
            </div>
          )}
        </div>
      )}

      <div className="digest-grid">
        {digest.biggestLpGain && (
          <div className="digest-card accent-good destacada">
            <span className="digest-card-label">
              <span className="digest-card-icon good">
                <TrendUpIcon />
              </span>
              Mayor subida de LP
            </span>
            <div className="digest-card-body">
              <PlayerAvatar name={digest.biggestLpGain.name} iconUrl={digest.biggestLpGain.profileIconUrl} className="duo-avatar" />
              <div className="digest-card-mid">
                <span className="digest-card-name">
                  {digest.biggestLpGain.name} <span className="player-tag">#{digest.biggestLpGain.tag}</span>
                </span>
                <span className="digest-card-sub digest-rank-move">
                  <RankEnd point={digest.biggestLpGain.from} />
                  <span className="digest-rank-arrow">→</span>
                  <RankEnd point={digest.biggestLpGain.to} />
                </span>
              </div>
              {digest.biggestLpGain.lpScores.length >= 2 && (
                // La curva AL LADO del nombre y no debajo: colgada abajo
                // estiraba la tarjeta 50px más que las otras tres y la de al
                // lado quedaba con ese hueco vacío para emparejarla. Acá entra
                // en el mismo renglón y las cuatro miden lo mismo.
                //
                // El viewBox tiene que quedar cerca del ancho y del alto REALES
                // en los que se dibuja: con preserveAspectRatio="none" el
                // dibujo se estira para entrar, así que cuanto más lejos esté,
                // más se deforma.
                <div className="digest-card-chart">
                  <SparkChart values={digest.biggestLpGain.lpScores} width={340} height={56} pad={6} color={trendColor(digest.biggestLpGain.lpScores)} variant="mini" />
                </div>
              )}
              <span className="digest-card-value gd-pos">
                +{digest.biggestLpGain.delta} {digest.biggestLpGain.unit}
              </span>
            </div>
          </div>
        )}
        {digest.bestKda && (
          <div className="digest-card accent-gold">
            <span className="digest-card-label">
              <span className="digest-card-icon gold">
                <ZapIcon />
              </span>
              Mejor KDA
            </span>
            <div className="digest-card-body">
              <PlayerAvatar name={digest.bestKda.name} iconUrl={digest.bestKda.profileIconUrl} className="duo-avatar" />
              <div className="digest-card-mid">
                <span className="digest-card-name">
                  {digest.bestKda.name} <span className="player-tag">#{digest.bestKda.tag}</span>
                </span>
                <span className="digest-card-match">
                  <ChampIcon champ={digest.bestKda.champion} version={ddragonVersion} className="digest-match-champ" />
                  <span className="digest-match-name">{championLabel(digest.bestKda.champion)}</span>
                  <BoxScore k={digest.bestKda.k} d={digest.bestKda.d} a={digest.bestKda.a} />
                </span>
              </div>
              <span className="digest-card-value">{digest.bestKda.kda.toFixed(2)}</span>
            </div>
          </div>
        )}
        {digest.worstLoss && (
          <div className="digest-card accent-critical">
            <span className="digest-card-label">
              <span className="digest-card-icon critical">
                <TrendDownIcon />
              </span>
              Peor derrota
            </span>
            <div className="digest-card-body">
              <PlayerAvatar name={digest.worstLoss.name} iconUrl={digest.worstLoss.profileIconUrl} className="duo-avatar" />
              <div className="digest-card-mid">
                <span className="digest-card-name">
                  {digest.worstLoss.name} <span className="player-tag">#{digest.worstLoss.tag}</span>
                </span>
                <span className="digest-card-match">
                  <ChampIcon champ={digest.worstLoss.champion} version={ddragonVersion} className="digest-match-champ" />
                  <span className="digest-match-name">{championLabel(digest.worstLoss.champion)}</span>
                  <BoxScore k={digest.worstLoss.k} d={digest.worstLoss.d} a={digest.worstLoss.a} />
                </span>
              </div>
              {digest.worstLoss.goldDiffAtEnd != null && (
                // "-5.781 @20'" no se entiende sin saber qué se está midiendo:
                // el número suelto podría ser oro total, daño o LP. La unidad
                // y el "de atrás" lo dicen en el mismo espacio.
                <span className="digest-card-value gd-neg">
                  {digest.worstLoss.goldDiffAtEnd.toLocaleString("es-AR")}
                  <span className="digest-card-unidad">
                    {/* "al minuto 20" pasó a "@20'". El "de oro" —que es lo
                        que hacía falta para que el número no pudiera leerse
                        como daño o LP— se queda; lo que se va es la parte
                        larga, que medía 123px de una tarjeta de 317 y le
                        dejaba 19 al nombre del campeón de al lado ("A…").
                        Y "@20'" es como se escribe el minuto en los cruces
                        de línea del perfil. */}
                    de oro @{digest.worstLoss.goldDiffMinute}&apos;
                    <InfoTip
                      align="end"
                      text="Cuánto oro tenía de menos que el rival de SU MISMA línea en ese minuto — no contra el equipo entero. Es el criterio con el que se elige la peor derrota de la semana: no la del peor KDA, sino la partida donde la línea se rompió más."
                    />
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
        {digest.mostPlayedChampion && <ChampionCard champion={digest.mostPlayedChampion} ddragonVersion={ddragonVersion} />}
      </div>

      <button type="button" className="digest-copy-btn" onClick={onCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copiado" : "Copiar para Discord/WhatsApp"}
      </button>
    </>
  );
}

/**
 * "Equipo" tab — weekly group digest (see app/api/team-digest/route.ts).
 * Nothing here calls the Riot API; it's a read of matches/lp_snapshots
 * already stored, so it's cheap to lazy-load only when the tab is visited
 * (same convention as Clash).
 */
export function TeamDigest({
  digest,
  loading,
  ddragonVersion,
  onSemana,
}: {
  digest: TeamDigestData | null;
  loading: boolean;
  ddragonVersion: string | null;
  /** Cargar otra ventana de 7 días: 0 es la actual, 1 la anterior, y así. */
  onSemana: (semana: number) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!digest) return;
    try {
      await navigator.clipboard.writeText(digest.plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (permissions, insecure context) — button just doesn't confirm, nothing to recover from
    }
  }

  return (
    <section className="digest-section">
      <div className="section-head">
        <h2>
          Resumen semanal
        </h2>
        {/* Navegador de semanas. No hace falta guardar nada para que exista:
            las partidas y los snapshots de LP ya están, así que cualquier
            semana se recalcula cuando se pide (ver la ruta). */}
        <div className="digest-semanas">
          <button
            type="button"
            className="digest-semana-btn"
            onClick={() => onSemana((digest?.semana ?? 0) + 1)}
            disabled={loading || !digest?.hayAnterior}
            title="Semana anterior"
            aria-label="Semana anterior"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="meta digest-rango">
            {digest ? formatWindowRange(digest.windowStart, digest.windowEnd) : "Últimos 7 días"}
            {digest != null && digest.semana > 0 && (
              <span className="digest-hace">
                hace {digest.semana} {digest.semana === 1 ? "semana" : "semanas"}
              </span>
            )}
          </span>
          <button
            type="button"
            className="digest-semana-btn"
            onClick={() => onSemana(Math.max(0, (digest?.semana ?? 0) - 1))}
            disabled={loading || (digest?.semana ?? 0) === 0}
            title="Semana siguiente"
            aria-label="Semana siguiente"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
      {loading && (
        <div className="empty-state">
          <strong>Cargando…</strong>
        </div>
      )}
      {!loading && !digest && (
        <div className="empty-state">
          <strong>No se pudo cargar el resumen</strong>
          Probá de nuevo más tarde.
        </div>
      )}
      {!loading && digest && <DigestBody digest={digest} ddragonVersion={ddragonVersion} copied={copied} onCopy={handleCopy} />}
    </section>
  );
}
