"use client";

import type { Player } from "@/lib/types";
import { liveGameTimeLabel } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { UsersIcon } from "./StatIcons";
import { playerKey } from "./LadderTable";
import { championLabel } from "@/lib/champion-names";

interface LiveGroup {
  key: string;
  players: Player[];
}

/**
 * Two tracked players show up as one shared row only when they're in the
 * EXACT same live game AND on the same team — Riot's own gameId + teamId,
 * not just "both happen to be live right now" (which could just as easily
 * be two separate solo queues, or even facing each other as enemies).
 */
function groupLive(players: Player[]): LiveGroup[] {
  const byKey = new Map<string, Player[]>();
  for (const p of players) {
    if (!p.liveGame) continue;
    const key = `${p.liveGame.gameId}:${p.liveGame.teamId}`;
    const arr = byKey.get(key) ?? [];
    arr.push(p);
    byKey.set(key, arr);
  }
  return [...byKey.entries()].map(([key, group]) => ({ key, players: group }));
}

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
  players,
  ddragonVersion,
  onPlayer,
}: {
  players: Player[];
  ddragonVersion: string | null;
  /** Abrir el perfil de ese invocador — donde está el panel de la partida en vivo. */
  onPlayer: (key: string) => void;
}) {
  const groups = groupLive(players);
  if (groups.length === 0) return null;
  const total = groups.reduce((s, g) => s + g.players.length, 0);

  return (
    <div className="live-tray">
      <div className="live-tray-head">
        <span className="live-dot" />
        En vivo ahora · {total}
      </div>
      <div className="live-tray-list">
        {groups.map((g) =>
          g.players.length > 1 ? (
            <TogetherRow group={g} ddragonVersion={ddragonVersion} onPlayer={onPlayer} key={g.key} />
          ) : (
            <SoloRow p={g.players[0]} ddragonVersion={ddragonVersion} onPlayer={onPlayer} key={g.key} />
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
  group: LiveGroup;
  ddragonVersion: string | null;
  onPlayer: (key: string) => void;
}) {
  const { players } = group;
  const game = players[0].liveGame!;
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
