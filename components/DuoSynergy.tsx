"use client";

import { useState } from "react";
import type { DuoPair, DuoSharedMatch } from "@/lib/types";
import { formatRelativeDate } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";

type SortKey = "games" | "winrate";

interface PlayerIdentity {
  name: string;
  tag: string;
  profileIconUrl: string | null;
}

interface PartnerRow extends PlayerIdentity {
  games: number;
  wins: number;
  winrate: number;
  lastPlayedAt: string;
}

function playerKey(name: string, tag: string): string {
  return `${name}#${tag}`;
}

/** Every distinct tracked player that shows up in at least one duo pair — feeds the top selector strip. */
function distinctPlayers(pairs: DuoPair[]): PlayerIdentity[] {
  const map = new Map<string, PlayerIdentity>();
  for (const p of pairs) {
    map.set(playerKey(p.aName, p.aTag), { name: p.aName, tag: p.aTag, profileIconUrl: p.aProfileIconUrl });
    map.set(playerKey(p.bName, p.bTag), { name: p.bName, tag: p.bTag, profileIconUrl: p.bProfileIconUrl });
  }
  return [...map.values()];
}

/** Every partner a given player shares at least one pair with, from that player's own side of the numbers. */
function partnersOf(pairs: DuoPair[], key: string): PartnerRow[] {
  const rows: PartnerRow[] = [];
  for (const p of pairs) {
    if (playerKey(p.aName, p.aTag) === key) {
      rows.push({
        name: p.bName,
        tag: p.bTag,
        profileIconUrl: p.bProfileIconUrl,
        games: p.games,
        wins: p.wins,
        winrate: p.winrate,
        lastPlayedAt: p.lastPlayedAt,
      });
    } else if (playerKey(p.bName, p.bTag) === key) {
      rows.push({
        name: p.aName,
        tag: p.aTag,
        profileIconUrl: p.aProfileIconUrl,
        games: p.games,
        wins: p.wins,
        winrate: p.winrate,
        lastPlayedAt: p.lastPlayedAt,
      });
    }
  }
  return rows;
}

function findPair(pairs: DuoPair[], keyA: string, keyB: string): DuoPair | null {
  return (
    pairs.find((p) => {
      const a = playerKey(p.aName, p.aTag);
      const b = playerKey(p.bName, p.bTag);
      return (a === keyA && b === keyB) || (a === keyB && b === keyA);
    }) ?? null
  );
}

function DuoSharedMatchRow({ m, ddragonVersion }: { m: DuoSharedMatch; ddragonVersion: string | null }) {
  return (
    <div className="duovs-match-row">
      <span className={`duovs-match-stripe ${m.win ? "w" : "l"}`} />
      <div className="duovs-match-side">
        <ChampIcon champ={m.aChamp} version={ddragonVersion} className="duovs-match-champ" />
        <span className="duovs-match-kda">
          {m.aK}/{m.aD}/{m.aA}
        </span>
      </div>
      <span className="duovs-match-sep">·</span>
      <div className="duovs-match-side">
        <ChampIcon champ={m.bChamp} version={ddragonVersion} className="duovs-match-champ" />
        <span className="duovs-match-kda">
          {m.bK}/{m.bD}/{m.bA}
        </span>
      </div>
      <div className="duovs-match-meta">
        <span className={`duovs-match-result ${m.win ? "w" : "l"}`}>{m.win ? "VICTORIA" : "DERROTA"}</span>
        <span className="duovs-match-date">
          {formatRelativeDate(m.playedAt)} · {Math.round(m.durationS / 60)} min
        </span>
      </div>
    </div>
  );
}

/**
 * "Sinergia de dúo" — selector horizontal de invocadores (chips, uno al lado
 * del otro) en vez de una lista vertical: tocar uno abre, al lado, con quién
 * jugó del grupo — filtrable por partidas juntos o winrate — y tocar un
 * compañero de esa lista muestra las últimas 5 partidas que ESE dúo compartió
 * (campeón + KDA real de cada uno en la misma partida). Todo sale de `pairs`
 * (ya viene completo desde /api/ladder, recentMatches incluido) — no hay
 * fetch ni loading real, elegir un invocador o un compañero es instantáneo.
 */
export function DuoSynergy({
  pairs,
  loading,
  ddragonVersion,
}: {
  pairs: DuoPair[];
  loading?: boolean;
  ddragonVersion: string | null;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("games");

  const players = distinctPlayers(pairs);
  const partners = selectedPlayer ? partnersOf(pairs, selectedPlayer) : [];
  const sortedPartners =
    sortKey === "games" ? [...partners].sort((a, b) => b.games - a.games) : [...partners].sort((a, b) => b.winrate - a.winrate);
  const activePair = selectedPlayer && selectedPartner ? findPair(pairs, selectedPlayer, selectedPartner) : null;
  const selectedName = selectedPlayer?.split("#")[0] ?? "";

  function selectPlayer(key: string) {
    setSelectedPlayer((cur) => (cur === key ? null : key));
    setSelectedPartner(null);
  }

  return (
    <section>
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Sinergia de dúo
        </h2>
        <span className="meta">Elegí un invocador para ver con quién juega</span>
      </div>

      {loading ? (
        <div className="empty-state">
          <strong>Cargando…</strong>
          Buscando partidas compartidas.
        </div>
      ) : players.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía no hay dúos para mostrar</strong>
          Se arma solo cuando dos invocadores del grupo comparten una partida de ranked como compañeros de equipo.
        </div>
      ) : (
        <>
          <div className="duo-chip-row">
            {players.map((pl) => {
              const key = playerKey(pl.name, pl.tag);
              return (
                <button
                  type="button"
                  className={`duo-chip${selectedPlayer === key ? " is-active" : ""}`}
                  onClick={() => selectPlayer(key)}
                  key={key}
                >
                  <PlayerAvatar name={pl.name} iconUrl={pl.profileIconUrl} className="duo-avatar" />
                  <span className="duo-chip-name">{pl.name}</span>
                </button>
              );
            })}
          </div>

          {selectedPlayer && (
            <div className="stack-cols">
              <div>
                <div className="duo-cols-head">
                  <span className="meta">Compañeros de {selectedName}</span>
                  <div className="duo-filter-row">
                    <button
                      type="button"
                      className={`duo-filter-btn${sortKey === "games" ? " is-active" : ""}`}
                      onClick={() => setSortKey("games")}
                    >
                      Más jugado
                    </button>
                    <button
                      type="button"
                      className={`duo-filter-btn${sortKey === "winrate" ? " is-active" : ""}`}
                      onClick={() => setSortKey("winrate")}
                    >
                      Más WR
                    </button>
                  </div>
                </div>
                <div className="champ-pool">
                  {sortedPartners.map((partner) => {
                    const pKey = playerKey(partner.name, partner.tag);
                    const losses = partner.games - partner.wins;
                    return (
                      <button
                        type="button"
                        className={`champ-pool-row duo-partner-row${selectedPartner === pKey ? " is-active" : ""}`}
                        onClick={() => setSelectedPartner((cur) => (cur === pKey ? null : pKey))}
                        key={pKey}
                      >
                        <PlayerAvatar name={partner.name} iconUrl={partner.profileIconUrl} className="champ-pool-avatar" />
                        <div className="champ-pool-mid">
                          <span className="champ-pool-name">
                            {partner.name} <span className="player-tag">#{partner.tag}</span>
                          </span>
                          <span className="champ-pool-games">
                            {partner.games} {partner.games === 1 ? "partida juntos" : "partidas juntos"} ·{" "}
                            {formatRelativeDate(partner.lastPlayedAt)}
                          </span>
                        </div>
                        <div className="champ-pool-stats">
                          <span className={`champ-pool-wr ${partner.winrate >= 50 ? "good" : "bad"}`}>{partner.winrate}%</span>
                          <span className="champ-pool-kda">
                            {partner.wins}V {losses}D
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="duo-cols-head">
                  <span className="meta">Últimas partidas juntos</span>
                </div>
                {!activePair ? (
                  <div className="empty-state">
                    <strong>Elegí un compañero</strong>
                    Tocá alguno de la lista para ver el detalle de sus últimas partidas juntos.
                  </div>
                ) : (
                  <div className="duosum-matches">
                    {activePair.recentMatches.map((m) => (
                      <DuoSharedMatchRow m={m} ddragonVersion={ddragonVersion} key={m.matchId} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
