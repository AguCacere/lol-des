"use client";

import { useEffect, useState } from "react";
import type { DuoPair, DuoSharedMatch } from "@/lib/types";
import { formatRelativeDate } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { tonoDeWinrate, winrateExacto, winrateTexto } from "@/lib/winrate";
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
  /** El récord del invocador ELEGIDO en sus partidas sin este compañero. */
  sinGames: number;
  sinWins: number;
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
        // El "sin" es siempre el del invocador ELEGIDO, no el del compañero:
        // la pregunta de la sección es cómo le va a ÉL con cada uno al lado.
        sinGames: p.aSinPartidas,
        sinWins: p.aSinVictorias,
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
        sinGames: p.bSinPartidas,
        sinWins: p.bSinVictorias,
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
 * "Juntos vs separados": el winrate del dúo contra el del invocador elegido
 * cuando ese compañero NO está.
 *
 * Es lo que le da sentido al número de arriba. Un 60% juntos no dice nada
 * hasta saber si solo anda en 58 —o sea, da igual— o en 42.
 *
 * Tres cuidados, y los tres son sobre no mentir:
 *
 * 1. Es una ASOCIACIÓN, no una causa. Juegan juntos los findes, con otros
 *    campeones, a otra hora y contra otro elo promedio. El pie de la tarjeta
 *    lo dice con todas las letras en vez de dejarlo implícito.
 * 2. La muestra va SIEMPRE visible, de los dos lados. Un "+38 pp" sobre tres
 *    partidas es ruido con cara de hallazgo.
 * 3. Con menos de MINIMO_DUO partidas juntos no se muestra la diferencia en
 *    absoluto: se dice cuántas faltan. Es la misma regla de toda la app — si
 *    el dato no alcanza, no se publica.
 */
const MINIMO_DUO = 8;

function JuntosVsSeparados({ partner, quien }: { partner: PartnerRow; quien: string }) {
  const wrJuntos = winrateExacto(partner.wins, partner.games);
  const wrSin = winrateExacto(partner.sinWins, partner.sinGames);
  const diff = wrJuntos - wrSin;
  const alcanza = partner.games >= MINIMO_DUO && partner.sinGames >= MINIMO_DUO;
  return (
    <div className="duovs-comp">
      <div className="duovs-comp-lados">
        <div className="duovs-comp-lado">
          <span className="duovs-comp-et">Con {partner.name}</span>
          <span className={`duovs-comp-wr ${tonoDeWinrate(partner.wins, partner.games)}`}>
            {winrateTexto(partner.wins, partner.games)}
          </span>
          <span className="duovs-comp-muestra">
            {partner.wins}V · {partner.games - partner.wins}D
          </span>
        </div>
        <div className="duovs-comp-lado">
          <span className="duovs-comp-et">Sin {partner.name}</span>
          <span className={`duovs-comp-wr ${tonoDeWinrate(partner.sinWins, partner.sinGames)}`}>
            {partner.sinGames > 0 ? winrateTexto(partner.sinWins, partner.sinGames) : "—"}
          </span>
          <span className="duovs-comp-muestra">
            {partner.sinWins}V · {partner.sinGames - partner.sinWins}D
          </span>
        </div>
      </div>
      {alcanza ? (
        <p className="duovs-comp-pie">
          <span className={`duovs-comp-diff ${diff > 0 ? "good" : diff < 0 ? "bad" : "neutral"}`}>
            {diff > 0 ? "+" : ""}
            {diff.toFixed(1).replace(".", ",")} pp
          </span>{" "}
          con {partner.name} al lado. Es lo que pasó, no por qué: juntos también juegan otros campeones, otro
          horario y otra gente enfrente.
        </p>
      ) : (
        <p className="duovs-comp-pie">
          Con {partner.games} {partner.games === 1 ? "partida" : "partidas"} juntos todavía no se puede comparar:
          hacen falta {MINIMO_DUO} de cada lado para que la diferencia signifique algo. Los números de arriba son
          el récord crudo de {quien}.
        </p>
      )}
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

  // The detail panel (compañeros + últimas partidas) crossfades to whatever
  // was just picked instead of swapping content instantly — same 160ms
  // pattern PlayerProfile uses when you click a different row in el
  // ranking, so switching invocador/compañero here reads as a change too,
  // not a jump-cut. Chip/row highlighting still tracks the selection
  // immediately (selectedPlayer/selectedPartner below) — only the panel
  // CONTENT lags behind the fade.
  const [displayedPlayer, setDisplayedPlayer] = useState<string | null>(null);
  const [displayedPartner, setDisplayedPartner] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (selectedPlayer === displayedPlayer && selectedPartner === displayedPartner) return;
    // Crossfade on selection change, not a fetch — nothing to await before this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFading(true);
    const t = setTimeout(() => {
      setDisplayedPlayer(selectedPlayer);
      setDisplayedPartner(selectedPartner);
      setFading(false);
    }, 160);
    return () => clearTimeout(t);
  }, [selectedPlayer, selectedPartner, displayedPlayer, displayedPartner]);

  const players = distinctPlayers(pairs);
  const partners = displayedPlayer ? partnersOf(pairs, displayedPlayer) : [];
  const sortedPartners =
    sortKey === "games" ? [...partners].sort((a, b) => b.games - a.games) : [...partners].sort((a, b) => b.winrate - a.winrate);
  const activePair = displayedPlayer && displayedPartner ? findPair(pairs, displayedPlayer, displayedPartner) : null;
  // La fila del compañero elegido, que es de donde sale el "sin" del
  // invocador — findPair devuelve el par, pero el par no sabe cuál de los dos
  // lados se está mirando.
  const activePartner = displayedPartner ? partners.find((p) => playerKey(p.name, p.tag) === displayedPartner) ?? null : null;
  const displayedName = displayedPlayer?.split("#")[0] ?? "";

  function selectPlayer(key: string) {
    setSelectedPlayer((cur) => (cur === key ? null : key));
    setSelectedPartner(null);
  }

  return (
    <section>
      <div className="section-head">
        <h2>
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

          {!selectedPlayer && (
            // Sin esto la sección terminaba en la fila de invocadores y
            // abajo no había nada: se leía como algo a medio cargar en vez de
            // como una sección esperando que elijas.
            <div className="empty-state duo-vacio">
              <strong>Elegí un invocador de arriba</strong>
              Se arma la lista de con quién jugó, cuántas partidas hicieron juntos y qué winrate tienen como dúo.
            </div>
          )}

          {selectedPlayer && (
            <div className={`stack-cols duo-panel${fading ? " is-fading" : ""}`}>
              <div>
                <div className="duo-cols-head">
                  <span className="meta">Compañeros de {displayedName}</span>
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
                          {/* Apagado mientras la muestra no alcance — ver
                              .champ-pool-wr.flojo en globals.css. */}
                          <span
                            className={`champ-pool-wr ${partner.games < MINIMO_DUO ? "flojo" : tonoDeWinrate(partner.wins, partner.games)}`}
                            title={partner.games < MINIMO_DUO ? `Solo ${partner.games} partidas juntos: el porcentaje todavía no dice nada` : undefined}
                          >
                            {winrateTexto(partner.wins, partner.games)}
                          </span>
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
                  <span className="meta">{activePartner ? `${displayedName} con y sin ${activePartner.name}` : "Últimas partidas juntos"}</span>
                </div>
                {!activePair || !activePartner ? (
                  <div className="empty-state">
                    <strong>Elegí un compañero</strong>
                    Tocá alguno de la lista para ver cómo le va a {displayedName} con y sin él, y el detalle de sus
                    últimas partidas juntos.
                  </div>
                ) : (
                  <>
                    <JuntosVsSeparados partner={activePartner} quien={displayedName} />
                    <div className="duo-cols-head duo-cols-head-2">
                      <span className="meta">Últimas partidas juntos</span>
                    </div>
                    <div className="duosum-matches">
                      {activePair.recentMatches.map((m) => (
                        <DuoSharedMatchRow m={m} ddragonVersion={ddragonVersion} key={m.matchId} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
