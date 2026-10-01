/**
 * **La representación única de quién está jugando ahora.**
 *
 * Live aparecía en tres lugares de la app —"2 en partida" en la barra, el
 * chip del pulso en Inicio y la bandeja flotante— y cada uno lo contaba a su
 * manera: la barra contaba JUGADORES, la bandeja agrupaba por partida y el
 * chip nombraba a uno y resumía el resto con "y 1 más". Tres textos distintos
 * para el mismo hecho, y tres lugares donde arreglar un bug.
 *
 * Acá vive el agrupado y nada más. La FUENTE sigue siendo la misma de antes:
 * `player.liveGame`, que `app/page.tsx` refresca contra `/api/live` cada 60
 * segundos. Esto no pide nada, no guarda nada y no agrega un segundo estado:
 * es una función pura sobre la lista de jugadores que ya está en memoria.
 *
 * **Dos jugadores están juntos cuando comparten `gameId` Y `teamId`.** El
 * gameId solo no alcanza: dos del grupo pueden estar en la misma partida
 * siendo RIVALES, y decir "jugando juntos" ahí sería exactamente al revés.
 * Los dos datos vienen del Spectator de Riot (ver lib/live.ts), así que esto
 * no se infiere por horario ni por campeón.
 *
 * Y "jugando juntos" significa eso y nada más: que están en la misma partida
 * del mismo lado. NO dice "duo" — el Spectator no expone con quién entró cada
 * uno a la cola, y dos del grupo pueden caer juntos por sorteo.
 */
import type { LiveGame, Player } from "./types";

/** Una partida en curso con todos los del grupo que están adentro, del mismo lado. */
export interface GrupoEnVivo {
  /** `gameId:teamId`. Sirve de key de React y de identidad del grupo. */
  key: string;
  /** Los del grupo que están en esa partida. Nunca vacío. */
  jugadores: Player[];
  /**
   * Los datos de la partida. Son los mismos para todos los del grupo salvo
   * el campeón, así que el campeón se lee de cada jugador y esto se usa para
   * la cola y el reloj.
   */
  partida: LiveGame;
  /** Si hay más de uno del grupo adentro. Es lo que habilita "jugando juntos". */
  juntos: boolean;
}

/**
 * Agrupa a los que están en partida, de la más nueva a la más vieja.
 *
 * El orden es por tiempo de juego ascendente —la que arrancó hace menos va
 * primero— y, a igual minuto, la de más gente del grupo. Es una regla
 * objetiva y estable: sirve para elegir cuál mostrar cuando solo entra una,
 * sin que la lista baile entre refrescos.
 */
export function gruposEnVivo(players: Player[]): GrupoEnVivo[] {
  const por = new Map<string, Player[]>();
  for (const p of players) {
    if (!p.liveGame) continue;
    const key = `${p.liveGame.gameId}:${p.liveGame.teamId}`;
    const arr = por.get(key) ?? [];
    arr.push(p);
    por.set(key, arr);
  }
  return [...por.entries()]
    .map(([key, jugadores]) => ({
      key,
      jugadores,
      partida: jugadores[0].liveGame!,
      juntos: jugadores.length > 1,
    }))
    .sort(
      (a, b) =>
        a.partida.startedMinutesAgo - b.partida.startedMinutesAgo ||
        b.jugadores.length - a.jugadores.length ||
        a.key.localeCompare(b.key),
    );
}

/** Cuántos del grupo están en partida ahora. Lo que cuenta la barra de arriba. */
export function cuantosEnVivo(grupos: GrupoEnVivo[]): number {
  return grupos.reduce((s, g) => s + g.jugadores.length, 0);
}

/** "vas a perder + marlboro de diez" — los nombres de un grupo, en orden. */
export function nombresDelGrupo(g: GrupoEnVivo): string {
  return g.jugadores.map((p) => p.name).join(" + ");
}
