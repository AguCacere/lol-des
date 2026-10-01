"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { cuantosEnVivo, type GrupoEnVivo } from "@/lib/live-grupos";
import { liveGameTimeLabel } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { UsersIcon } from "./StatIcons";
import { playerKey } from "./LadderTable";
import { championLabel } from "@/lib/champion-names";

/**
 * Fixed corner tray listing everyone currently live — one shared card, not a
 * popup per row. Stays mounted and visible on its own the whole time at
 * least one tracked player is in a game; every other live player joins it as
 * another row instead of opening a second tray. Desktop-only: on narrow
 * screens this stays hidden and the row-level "EN VIVO" badge + its own
 * hover popup in LadderTable keeps doing that job (see the max-width:680px
 * guard in globals.css around both this and that rule).
 */
export function LiveTray({
  grupos,
  ddragonVersion,
  onPlayer,
}: {
  /** Ya agrupados por partida — ver lib/live-grupos.ts. La bandeja no vuelve a agrupar. */
  grupos: GrupoEnVivo[];
  ddragonVersion: string | null;
  /** Abrir el perfil de ese invocador — donde está el panel de la partida en vivo. */
  onPlayer: (key: string) => void;
}) {
  /**
   * Arranca mostrando UNA partida. Con tres o cuatro en curso la bandeja se
   * comía media pantalla sin que nadie la hubiera pedido: es un indicador
   * persistente, no un panel. La primera es la más nueva (lo decide
   * `gruposEnVivo`, por minuto de juego), que es la regla objetiva.
   */
  const [abierta, setAbierta] = useState(false);
  if (grupos.length === 0) return null;
  const total = cuantosEnVivo(grupos);
  const visibles = abierta ? grupos : grupos.slice(0, 1);
  const ocultas = grupos.length - visibles.length;

  return (
    <div className="live-tray">
      <div className="live-tray-head">
        <span className="live-dot" />
        En vivo ahora · {total}
        {grupos.length > 1 && (
          <button type="button" className="live-tray-mas" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
            {abierta ? "Ver menos" : `+${ocultas}`}
          </button>
        )}
      </div>
      {/* El alto máximo lo pone el CSS: desde la cuarta partida esto scrollea
          en vez de crecer. */}
      <div className={`live-tray-list${abierta ? " abierta" : ""}`}>
        {visibles.map((g) =>
          g.juntos ? (
            <TogetherRow group={g} ddragonVersion={ddragonVersion} onPlayer={onPlayer} key={g.key} />
          ) : (
            <SoloRow p={g.jugadores[0]} ddragonVersion={ddragonVersion} onPlayer={onPlayer} key={g.key} />
          )
        )}
      </div>
    </div>
  );
}

function SoloRow({
  p,
  ddragonVersion,
  onPlayer,
}: {
  p: Player;
  ddragonVersion: string | null;
  onPlayer: (key: string) => void;
}) {
  const game = p.liveGame!;
  return (
    // La fila es un botón y no un div: desde acá se llega al panel con los
    // rivales, que es lo que uno quiere ver mientras la partida está pasando.
    // Antes había que saber que estaba en el perfil y buscarlo a mano.
    <button type="button" className="live-tray-row" onClick={() => onPlayer(playerKey(p))} title="Ver la partida y los rivales">
      <span className="live-tray-avatar-wrap">
        <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="live-tray-avatar" />
        <ChampIcon champ={game.champion} version={ddragonVersion} className="live-tray-champ-badge" />
      </span>
      <span className="live-tray-mid">
        <span className="live-tray-name">
          {p.name} <span className="player-tag">#{p.tag}</span>
        </span>
        <span className="live-tray-meta">
          {championLabel(game.champion)} · {game.queueLabel} · {liveGameTimeLabel(game.startedMinutesAgo)}
        </span>
      </span>
      <ChevronVer />
    </button>
  );
}

function TogetherRow({
  group,
  ddragonVersion,
  onPlayer,
}: {
  group: GrupoEnVivo;
  ddragonVersion: string | null;
  onPlayer: (key: string) => void;
}) {
  const players = group.jugadores;
  const game = group.partida;
  return (
    // Están en la MISMA partida, así que abrir el perfil de cualquiera de los
    // dos muestra exactamente los mismos diez jugadores.
    <button
      type="button"
      className="live-tray-row"
      onClick={() => onPlayer(playerKey(players[0]))}
      title="Ver la partida y los rivales"
    >
      <span className="live-tray-stack">
        {players.map((p) => (
          <span className="live-tray-avatar-wrap sm" key={playerKey(p)}>
            <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="live-tray-avatar" />
            <ChampIcon champ={p.liveGame!.champion} version={ddragonVersion} className="live-tray-champ-badge" />
          </span>
        ))}
      </span>
      <span className="live-tray-mid">
        <span className="live-tray-together-names">{players.map((p) => p.name).join(" + ")}</span>
        <span className="live-tray-together-tag">
          <UsersIcon />
          Jugando juntos
        </span>
        <span className="live-tray-meta">
          {game.queueLabel} · {liveGameTimeLabel(game.startedMinutesAgo)}
        </span>
      </span>
      <ChevronVer />
    </button>
  );
}

/** La señal de que la fila lleva a algún lado. Sin esto no se lee como clickeable. */
function ChevronVer() {
  return (
    <svg className="live-tray-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
