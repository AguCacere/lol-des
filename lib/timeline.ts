import type { RiotTimeline } from "./riot";

/**
 * Pure extraction logic over a Match-V5 timeline — no API calls here, just
 * turning frames/events into the numbers MatchDetail actually shows.
 */
export interface TimelineStats {
  goldDiff10: number | null;
  goldDiff15: number | null;
  goldDiff20: number | null;
  firstBloodTimeS: number | null;
  firstTowerTimeS: number | null;
  /**
   * Riot's `monsterSubType` for each dragon THIS player personally landed the
   * killing blow on (e.g. ["FIRE_DRAGON", "WATER_DRAGON"]) — same source data
   * as `dragonKills` on the match participant, just with which element each
   * one was, which that stat doesn't carry. Empty array, not null, when this
   * player took zero dragons or none matched their participant id.
   */
  dragonTypes: string[];
}

/** Gold diff vs. the enemy in the same lane (teamPosition) at a fixed minute mark — team totals would hide who's actually winning a lane. */
function goldDiffAt(timeline: RiotTimeline, ms: number, myId: number, enemyId: number): number | null {
  // Frames land roughly once a minute; take the last one at or before `ms`.
  let frame = null;
  for (const f of timeline.info.frames) {
    if (f.timestamp > ms) break;
    frame = f;
  }
  if (!frame) return null;
  const mine = frame.participantFrames[String(myId)]?.totalGold;
  const theirs = frame.participantFrames[String(enemyId)]?.totalGold;
  if (mine == null || theirs == null) return null;
  return mine - theirs;
}

export function extractTimelineStats(
  timeline: RiotTimeline,
  myParticipantId: number,
  enemyParticipantId: number | null,
  gameDurationS: number
): TimelineStats {
  const durationMs = gameDurationS * 1000;

  function atMinute(min: number): number | null {
    if (enemyParticipantId === null || durationMs < min * 60 * 1000) return null;
    return goldDiffAt(timeline, min * 60 * 1000, myParticipantId, enemyParticipantId);
  }

  // First blood / first tower are game-wide facts, independent of who's viewing.
  // Can't early-exit once both are found anymore — dragons keep spawning all
  // game, well past the point first blood/tower are usually decided, so a
  // scan that stopped there silently dropped every later dragon kill.
  let firstBloodTimeS: number | null = null;
  let firstTowerTimeS: number | null = null;
  const dragonTypes: string[] = [];
  for (const frame of timeline.info.frames) {
    for (const event of frame.events) {
      if (event.type === "CHAMPION_KILL" && firstBloodTimeS === null) {
        firstBloodTimeS = Math.round(event.timestamp / 1000);
      }
      if (event.type === "BUILDING_KILL" && firstTowerTimeS === null) {
        firstTowerTimeS = Math.round(event.timestamp / 1000);
      }
      if (event.type === "ELITE_MONSTER_KILL" && event.monsterType === "DRAGON" && event.killerId === myParticipantId) {
        dragonTypes.push(event.monsterSubType ?? "UNKNOWN_DRAGON");
      }
    }
  }

  return {
    goldDiff10: atMinute(10),
    goldDiff15: atMinute(15),
    goldDiff20: atMinute(20),
    firstBloodTimeS,
    firstTowerTimeS,
    dragonTypes,
  };
}
