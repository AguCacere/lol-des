import { getActiveGame } from "./riot";
import { championNameById } from "./ddragon";
import { queueLabelFromId } from "./mapping";
import type { LiveGame } from "./types";

/**
 * Spectator V5 for a batch of puuids, resolved to the same LiveGame shape the
 * UI renders — shared by /api/ladder (which needs it alongside everything
 * else) and /api/live (a lighter poll target for just this one piece of
 * data, see app/page.tsx's 60s "who's live now" interval). Isolated catch per
 * summoner: one Riot hiccup can't take down the batch.
 */
export async function getLiveGamesByPuuid(puuids: string[]): Promise<Map<string, LiveGame>> {
  const results = await Promise.all(
    puuids.map(async (puuid) => {
      try {
        return { puuid, game: await getActiveGame(puuid) };
      } catch {
        return { puuid, game: null };
      }
    })
  );

  const liveGameByPuuid = new Map<string, LiveGame>();
  for (const { puuid, game } of results) {
    if (!game) continue;
    const me = game.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    const champ = await championNameById(me.championId);
    if (!champ) continue;
    liveGameByPuuid.set(puuid, {
      champion: champ,
      queueLabel: queueLabelFromId(game.gameQueueConfigId),
      // gameLength counts up from a negative offset during the loading
      // screen (before the in-game clock actually starts) — clamped so that
      // phase reads as "just started" instead of "hace -3 min".
      startedMinutesAgo: Math.max(0, Math.floor(game.gameLength / 60)),
      gameId: game.gameId,
      teamId: me.teamId,
    });
  }
  return liveGameByPuuid;
}
