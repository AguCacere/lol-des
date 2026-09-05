"use client";

import { useState } from "react";
import type { TeamDigest as TeamDigestData } from "@/lib/types";
import { tierFor, trendColor } from "@/lib/ladder";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";
import { SparkChart } from "./SparkChart";
import { CheckIcon, CopyIcon, TrendDownIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

function formatWindowRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
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
        <strong>Sin partidas guardadas esta semana</strong>
        Se llena solo a medida que el grupo juegue ranked — no hace falta hacer nada.
      </div>
    );
  }

  // Puede faltar si el CDN devuelve un JSON anterior al deploy (la ruta se
  // cachea 5 minutos): sin la guarda, la pestaña entera queda en blanco.
  const r = digest.resumen;
  const wr = r && r.partidas > 0 ? Math.round((100 * r.victorias) / r.partidas) : 0;

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
            <span className={`digest-kpi-valor ${wr >= 50 ? "good" : "bad"}`}>{wr}%</span>
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
              pts netos
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
          <div className="digest-card accent-good">
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
              <span className="digest-card-value gd-pos">
                +{digest.biggestLpGain.delta} {digest.biggestLpGain.unit}
              </span>
            </div>
            {digest.biggestLpGain.lpScores.length >= 2 && (
              <div className="digest-card-chart">
                {/* viewBox sized close to how wide this actually renders (~520px
                    in a two-up grid): with preserveAspectRatio="none" the drawing
                    is stretched to fit, so a 280-wide box was being pulled ~1.9x
                    horizontally against ~1.3x vertically — which is what flattened
                    the curve into a smear. Matching the proportions keeps the
                    shape it was drawn with. */}
                <SparkChart values={digest.biggestLpGain.lpScores} width={520} height={44} pad={4} color={trendColor(digest.biggestLpGain.lpScores)} variant="mini" />
              </div>
            )}
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
                    de oro al minuto {digest.worstLoss.goldDiffMinute}
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
}: {
  digest: TeamDigestData | null;
  loading: boolean;
  ddragonVersion: string | null;
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
          <span className="live-dot accent" />
          Resumen semanal
        </h2>
        <span className="meta">{digest ? formatWindowRange(digest.windowStart, digest.windowEnd) : "Últimos 7 días"}</span>
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
