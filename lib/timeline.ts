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
  /** Whose team destroyed the first tower of the game — null if the match had none (remake) or teamId was missing on the event. */
  firstTowerMine: boolean | null;
  firstDragonTimeS: number | null;
  firstDragonMine: boolean | null;
  firstBaronTimeS: number | null;
  firstBaronMine: boolean | null;
  /**
   * Riot's `monsterSubType` for each dragon THIS player personally landed the
   * killing blow on (e.g. ["FIRE_DRAGON", "WATER_DRAGON"]) — same source data
   * as `dragonKills` on the match participant, just with which element each
   * one was, which that stat doesn't carry. Empty array, not null, when this
   * player took zero dragons or none matched their participant id.
   */
  dragonTypes: string[];
  /**
   * Every ITEM_PURCHASED event's itemId for this player, in the order they
   * actually happened — the real purchase sequence, not a "final build"
   * summary. Deliberately NOT reconciled against ITEM_SOLD/ITEM_UNDO: an
   * item that got sold or undone later still shows here, because it WAS
   * really bought at that point — reconstructing "what's left after
   * sells/undos" would need stack-based undo logic for marginal benefit
   * over just showing what happened. Includes consumables/trinkets too
   * (Health Potions, wards) — that's part of the real purchase story, not
   * noise to filter out.
   */
  itemBuild: number[];
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

/**
 * Cuántos minutos SEGUIDOS estuvo este jugador sin ganar nada de experiencia.
 *
 * Es la forma de separar al que jugó mal del que no jugó, y salió de una
 * partida real: un Renekton que terminó en nivel 9 con 5.132 de oro mientras
 * sus compañeros estaban en 12, 14 y 14. Riot no manda ningún campo que diga
 * "este se fue": `timePlayed` da la partida entera porque el cliente nunca se
 * desconectó, y el oro sube igual por el pasivo de la fuente. La experiencia
 * es lo único que se congela, porque solo entra si hay algo muriendo cerca.
 *
 * Devuelve la racha MÁS LARGA, no el total: cinco minutos sueltos repartidos
 * en media hora son muertes largas y recalls, cinco minutos pegados no le
 * pasan a nadie que esté jugando. Ni siquiera al que va 0/10 — el que pierde
 * su línea igual gana experiencia mientras se la pierden.
 *
 * Los frames vienen uno por minuto (`frameInterval`). Si a un frame le falta
 * `xp` —partida vieja, respuesta rara— esa comparación no cuenta y la racha
 * se corta: preferimos no marcar antes que marcar de más.
 */
export function minutosSinJugar(timeline: RiotTimeline, participantId: number): number {
  const clave = String(participantId);
  let racha = 0;
  let peor = 0;
  let anterior: number | null = null;
  for (const frame of timeline.info.frames) {
    const xp = frame.participantFrames[clave]?.xp;
    if (xp == null) {
      anterior = null;
      racha = 0;
      continue;
    }
    if (anterior != null) {
      if (xp <= anterior) {
        racha++;
        if (racha > peor) peor = racha;
      } else {
        racha = 0;
      }
    }
    anterior = xp;
  }
  return peor;
}

export function extractTimelineStats(
  timeline: RiotTimeline,
  myParticipantId: number,
  enemyParticipantId: number | null,
  gameDurationS: number,
  myTeamId: number
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
  let firstTowerMine: boolean | null = null;
  let firstDragonTimeS: number | null = null;
  let firstDragonMine: boolean | null = null;
  let firstBaronTimeS: number | null = null;
  let firstBaronMine: boolean | null = null;
  const dragonTypes: string[] = [];
  const itemBuild: number[] = [];
  for (const frame of timeline.info.frames) {
    for (const event of frame.events) {
      if (event.type === "CHAMPION_KILL" && firstBloodTimeS === null) {
        firstBloodTimeS = Math.round(event.timestamp / 1000);
      }
      if (event.type === "BUILDING_KILL" && event.buildingType === "TOWER_BUILDING" && firstTowerTimeS === null) {
        firstTowerTimeS = Math.round(event.timestamp / 1000);
        // teamId on a BUILDING_KILL is the team that OWNED the destroyed
        // tower — the takedown belongs to the OTHER team.
        firstTowerMine = event.teamId != null ? event.teamId !== myTeamId : null;
      }
      if (event.type === "ELITE_MONSTER_KILL" && event.monsterType === "DRAGON") {
        if (event.killerId === myParticipantId) {
          dragonTypes.push(event.monsterSubType ?? "UNKNOWN_DRAGON");
        }
        if (firstDragonTimeS === null) {
          firstDragonTimeS = Math.round(event.timestamp / 1000);
          firstDragonMine = event.killerTeamId != null ? event.killerTeamId === myTeamId : null;
        }
      }
      if (event.type === "ELITE_MONSTER_KILL" && event.monsterType === "BARON_NASHOR" && firstBaronTimeS === null) {
        firstBaronTimeS = Math.round(event.timestamp / 1000);
        firstBaronMine = event.killerTeamId != null ? event.killerTeamId === myTeamId : null;
      }
      if (event.type === "ITEM_PURCHASED" && event.participantId === myParticipantId && event.itemId != null) {
        itemBuild.push(event.itemId);
      }
    }
  }

  return {
    goldDiff10: atMinute(10),
    goldDiff15: atMinute(15),
    goldDiff20: atMinute(20),
    firstBloodTimeS,
    firstTowerTimeS,
    firstTowerMine,
    firstDragonTimeS,
    firstDragonMine,
    firstBaronTimeS,
    firstBaronMine,
    dragonTypes,
    itemBuild,
  };
}
