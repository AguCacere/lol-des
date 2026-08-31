"use client";

import type { Player } from "@/lib/types";
import { champTag } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { playerKey } from "./LadderTable";

/**
 * Fixed corner tray listing everyone currently live — one shared card, not a
 * popup per row. Stays mounted and visible on its own the whole time at
 * least one tracked player is in a game; every other live player joins it as
 * another row instead of opening a second tray. Desktop-only: on narrow
 * screens this stays hidden and the row-level "EN VIVO" badge + its own
 * hover popup in LadderTable keeps doing that job (see the max-width:680px
 * guard in globals.css around both this and that rule).
 */
export function LiveTray({ players, ddragonVersion }: { players: Player[]; ddragonVersion: string | null }) {
  const live = players.filter((p) => p.liveGame);
  if (live.length === 0) return null;

  return (
    <div className="live-tray">
      <div className="live-tray-head">
        <span className="live-dot" />
        En vivo ahora · {live.length}
      </div>
      <div className="live-tray-list">
        {live.map((p) => (
          <div className="live-tray-row" key={playerKey(p)}>
            <span className="live-tray-avatar">
              {p.profileIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- one small fixed-size avatar, not worth next/image's config for an external CDN
                <img src={p.profileIconUrl} alt="" />
              ) : (
                champTag(p.mainChamp)
              )}
            </span>
            <span className="live-tray-mid">
              <span className="live-tray-name">
                {p.name} <span className="player-tag">#{p.tag}</span>
              </span>
              <span className="live-tray-champ">
                <ChampIcon champ={p.liveGame!.champion} version={ddragonVersion} className="live-tray-champ-avatar" />
                {p.liveGame!.champion}
              </span>
              <span className="live-tray-meta">
                {p.liveGame!.queueLabel} · hace {p.liveGame!.startedMinutesAgo} min
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
