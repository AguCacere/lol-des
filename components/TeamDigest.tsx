"use client";

import { useState } from "react";
import type { TeamDigest as TeamDigestData } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChampIcon } from "./ChampIcon";
import { CheckIcon, CopyIcon, TrendDownIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";

function formatWindowRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
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
          <div className="digest-card">
            <span className="digest-card-label">
              <TrendUpIcon /> Mayor subida de LP
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
          </div>
        )}
        {digest.bestKda && (
          <div className="digest-card">
            <span className="digest-card-label">
              <ZapIcon /> Mejor KDA
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
          <div className="digest-card">
            <span className="digest-card-label">
              <TrendDownIcon /> Peor derrota
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
        {digest.mostPlayedChampion && (
          <div className="digest-card">
            <span className="digest-card-label">
              <TrophyIcon /> Campeón más jugado
            </span>
            <div className="digest-card-body">
              <ChampIcon champ={digest.mostPlayedChampion.champion} version={ddragonVersion} className="duo-avatar" />
              <div className="digest-card-mid">
                <span className="digest-card-name">{digest.mostPlayedChampion.champion}</span>
                <span className="digest-card-sub">{digest.mostPlayedChampion.games} partidas</span>
              </div>
              <span className="digest-card-value">
                {digest.mostPlayedChampion.wins}V-{digest.mostPlayedChampion.games - digest.mostPlayedChampion.wins}D
              </span>
            </div>
          </div>
        )}
      </div>

      <button type="button" className="digest-copy-btn" onClick={onCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copiado" : "Copiar para Discord/WhatsApp"}
      </button>
      <pre className="digest-plaintext">{digest.plainText}</pre>
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
    <section>
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
