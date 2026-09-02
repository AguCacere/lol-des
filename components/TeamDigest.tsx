"use client";

import { useState } from "react";
import type { TeamDigest as TeamDigestData } from "@/lib/types";
import { trendColor } from "@/lib/ladder";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChampIcon } from "./ChampIcon";
import { SparkChart } from "./SparkChart";
import { CheckIcon, CopyIcon, TrendDownIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";

function formatWindowRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
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
          <span className="digest-card-name">{champion.champion}</span>
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

  return (
    <>
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
              </div>
              <span className="digest-card-value gd-pos">
                +{digest.biggestLpGain.delta} {digest.biggestLpGain.unit}
              </span>
            </div>
            {digest.biggestLpGain.lpScores.length >= 2 && (
              <div className="digest-card-chart">
                <SparkChart values={digest.biggestLpGain.lpScores} width={280} height={30} pad={3} color={trendColor(digest.biggestLpGain.lpScores)} variant="mini" />
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
                <span className="digest-card-sub">
                  {digest.bestKda.champion} · {digest.bestKda.k}/{digest.bestKda.d}/{digest.bestKda.a}
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
                <span className="digest-card-sub">
                  {digest.worstLoss.champion} · {digest.worstLoss.k}/{digest.worstLoss.d}/{digest.worstLoss.a}
                </span>
              </div>
              {digest.worstLoss.goldDiffAtEnd != null && (
                <span className="digest-card-value gd-neg">
                  {digest.worstLoss.goldDiffAtEnd.toLocaleString("es-AR")} @{digest.worstLoss.goldDiffMinute}&apos;
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
