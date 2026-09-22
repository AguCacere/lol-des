"use client";

import { useEffect, useState } from "react";
import type { DuoPair, DuoSharedMatch } from "@/lib/types";
import { formatRelativeDate } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { tonoDeWinrate, winrateExacto, winrateTexto } from "@/lib/winrate";
import { PlayerAvatar } from "./PlayerAvatar";

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
 * "Sinergia de dúo" — un explorador de relaciones, no un formulario.
 *
 * Lo que había era: una fila de chips grandes, abajo una tabla de
 * compañeros, y al costado un panel vacío esperando que toques algo. Tres
 * rectángulos que no contaban que esto trata de VÍNCULOS entre personas.
 *
 * La composición ahora sigue el recorrido real, que tiene tres pasos y no
 * uno: elegís a alguien del roster → aparecen sus compañeros COMO
 * relaciones, ordenados por cuánto jugaron juntos y con el vínculo
 * dibujado → elegís uno y recién ahí se abre la comparación y las partidas.
 *
 * Eso no esconde nada: muestra cada cosa cuando tiene sentido preguntarla.
 * Antes las tres etapas estaban en pantalla a la vez y dos de ellas vacías.
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

  // El panel de detalle hace crossfade a lo que acabás de elegir en vez de
  // cambiar de golpe — el mismo patrón de 160ms que usa PlayerProfile al
  // cambiar de fila en el ranking. El resaltado del roster sí cambia al
  // instante; lo que se demora es el CONTENIDO.
  const [displayedPlayer, setDisplayedPlayer] = useState<string | null>(null);
  const [displayedPartner, setDisplayedPartner] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (selectedPlayer === displayedPlayer && selectedPartner === displayedPartner) return;
    // Crossfade por un cambio de selección, no por un fetch: no hay nada que esperar.
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
  // Por partidas juntos, siempre. El selector "Más jugado | Más WR" que había
  // era un control de tabla: acá el vínculo se mide en cuánto jugaron juntos,
  // y el winrate de un 3-1 arriba de todo ordenaba por quién jugó MENOS.
  const ordenados = [...partners].sort((a, b) => b.games - a.games);
  const activePair = displayedPlayer && displayedPartner ? findPair(pairs, displayedPlayer, displayedPartner) : null;
  const activePartner = displayedPartner
    ? ordenados.find((p) => playerKey(p.name, p.tag) === displayedPartner) ?? null
    : null;
  const displayedName = displayedPlayer?.split("#")[0] ?? "";
  // El vínculo más jugado marca la escala de los hilos: el resto se dibuja
  // proporcional a ese, así que el grosor dice algo en vez de ser decoración.
  const maxJuntos = Math.max(1, ...ordenados.map((p) => p.games));

  function selectPlayer(key: string) {
    setSelectedPlayer((cur) => (cur === key ? null : key));
    setSelectedPartner(null);
  }

  return (
    <section className="ds">
      <div className="section-head">
        <h2>Con quién juega cada uno</h2>
        <span className="meta">
          {displayedName ? `Los compañeros de ${displayedName}` : "Elegí un invocador del roster"}
        </span>
      </div>

      {loading ? (
        <p className="ds-vacio">Buscando partidas compartidas…</p>
      ) : players.length === 0 ? (
        <p className="ds-vacio">
          Se arma solo cuando dos invocadores del grupo comparten una ranked como compañeros de equipo.
        </p>
      ) : (
        <>
          {/* El roster. Caras chicas en fila, que se desplaza de costado en
              pantallas angostas: es una lista de gente, no catorce botones
              cuadrados grandes. */}
          <div className="roster" role="group" aria-label="Invocadores">
            {players.map((pl) => {
              const key = playerKey(pl.name, pl.tag);
              return (
                <button
                  type="button"
                  className={`roster-btn${selectedPlayer === key ? " activo" : ""}`}
                  onClick={() => selectPlayer(key)}
                  aria-pressed={selectedPlayer === key}
                  key={key}
                >
                  <PlayerAvatar name={pl.name} iconUrl={pl.profileIconUrl} className="roster-cara" />
                  <span className="roster-nombre">{pl.name}</span>
                </button>
              );
            })}
          </div>

          {!selectedPlayer ? (
            <p className="ds-vacio ds-vacio-roster">
              Tocá a alguien de arriba para ver con quién juega, cuánto jugaron juntos y si les va mejor o peor
              cuando están los dos.
            </p>
          ) : (
            <div className={`ds-panel${fading ? " is-fading" : ""}`}>
              {/* Las relaciones. Cada una es un hilo desde la persona
                  elegida hasta el compañero, y el grosor del hilo es cuánto
                  jugaron juntos. La tabla que había acá no dejaba ver que
                  algunos vínculos son diez veces más pesados que otros. */}
              <ul className="ds-vinculos">
                {ordenados.map((partner) => {
                  const pKey = playerKey(partner.name, partner.tag);
                  const losses = partner.games - partner.wins;
                  const peso = Math.max(1, Math.round((partner.games / maxJuntos) * 6));
                  const flojo = partner.games < MINIMO_DUO;
                  return (
                    <li key={pKey}>
                      <button
                        type="button"
                        className={`ds-vinculo${selectedPartner === pKey ? " activo" : ""}`}
                        onClick={() => setSelectedPartner((cur) => (cur === pKey ? null : pKey))}
                        aria-pressed={selectedPartner === pKey}
                      >
                        <span className="ds-hilo" style={{ height: `${peso}px` }} aria-hidden />
                        <PlayerAvatar name={partner.name} iconUrl={partner.profileIconUrl} className="ds-vinculo-cara" />
                        <span className="ds-vinculo-id">
                          <span className="ds-vinculo-nombre">{partner.name}</span>
                          <span className="ds-vinculo-juntos">
                            {partner.games} {partner.games === 1 ? "partida" : "partidas"} juntos ·{" "}
                            {formatRelativeDate(partner.lastPlayedAt)}
                          </span>
                        </span>
                        {/* Apagado mientras la muestra no alcance: el 75% de
                            un 3-1 llamaba más la atención que el 54% de un
                            34-29. */}
                        <span
                          className={`ds-vinculo-wr ${flojo ? "flojo" : tonoDeWinrate(partner.wins, partner.games)}`}
                          title={flojo ? `Solo ${partner.games} partidas juntos: el porcentaje todavía no dice nada` : undefined}
                        >
                          {winrateTexto(partner.wins, partner.games)}
                        </span>
                        <span className="ds-vinculo-vd">
                          {partner.wins}V · {losses}D
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="ds-detalle">
                {!activePair || !activePartner ? (
                  <p className="ds-vacio ds-vacio-detalle">
                    Elegí a uno para ver cómo le va a {displayedName} con y sin él.
                  </p>
                ) : (
                  <>
                    <h3 className="ds-par">
                      {displayedName} <span className="ds-par-mas">+</span> {activePartner.name}
                    </h3>
                    <JuntosVsSeparados partner={activePartner} quien={displayedName} />
                    <p className="ds-ultimas-et">Últimas partidas juntos</p>
                    <div className="ds-ultimas">
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
