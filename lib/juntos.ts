/**
 * "Cómo jugamos juntos" — la pestaña Equipo, contada desde el grupo.
 *
 * La pregunta que contesta: de todo lo que juega esta gente, ¿cuánto es con
 * alguien del grupo, y les va mejor o peor así? Medido contra la base antes de
 * escribir una línea de esto: **el 29% de las partidas guardadas son
 * acompañadas**, y el grupo gana 48,5% juntos contra 51,4% solo. No es un
 * empate: es que juntos rinden un poco PEOR, y persona por persona la brecha
 * llega a 21 puntos para un lado (marlboro de diez) y 12 para el otro
 * (Sagitaryus, swampii). Eso es material.
 *
 * Por qué no lo contesta la sinergia de dúo que ya existe en Estadísticas: esa
 * es par por par —"vos con este, 72 partidas, 47%"— y no puede decir qué
 * PROPORCIÓN de lo que juega cada uno es acompañada, ni contra qué compararla,
 * porque el denominador (las partidas que jugó solo) no está en un par. Son la
 * misma materia prima y dos preguntas distintas; acá no se dibuja ningún par.
 *
 * Qué cuenta como "juntos": estar en la MISMA partida guardada y del mismo
 * lado. La base no guarda quién era premade —Riot no lo expone en soloq— así
 * que esto es "coincidieron en el equipo", que en soloq de un grupo de amigos
 * es lo mismo salvo casualidad astronómica.
 *
 * Qué NO entra: el Clash. La ruta que alimenta esto ya filtra a ranked solo
 * (ver el queue_id en app/api/ladder/route.ts), y está bien que sea así —
 * medido, TODAS las partidas con tres o más del grupo son Clash, que se juega
 * en equipo armado y con comunicación y tiene su propia pestaña. Mezclarlo
 * acá compararía dos poblaciones distintas.
 */

import type { RoleKey } from "./types";

/** Una fila de partida de alguien del grupo, como la arma la ruta del ladder. */
export interface EntradaJuntos {
  puuid: string;
  win: boolean;
  playedAt: string;
  role?: RoleKey | null;
}

/** Nombre y avatar de cada puuid, para no resolverlos acá adentro. */
export interface PersonaJuntos {
  name: string;
  tag: string;
  profileIconUrl: string | null;
}

export interface FilaJuntos {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  /** Partidas guardadas con al menos uno del grupo del mismo lado. */
  juntas: number;
  juntasWins: number;
  /** Las otras. El denominador que un par no puede dar. */
  solas: number;
  solasWins: number;
  /**
   * Diferencia en PUNTOS PORCENTUALES entre el winrate acompañado y el solo.
   * Null cuando alguno de los dos lados no llega al mínimo: un 0% en dos
   * partidas al lado de un 54% en cuarenta y ocho no es una brecha, es ruido
   * con tipografía grande.
   */
  brecha: number | null;
  /** Con quién del grupo jugó más, y cuántas. */
  masCon: { name: string; tag: string; games: number } | null;
}

export interface Juntos {
  /** Filas de partida de todo el grupo (una partida compartida cuenta una vez por persona). */
  filas: number;
  juntas: number;
  juntasWins: number;
  solas: number;
  solasWins: number;
  /** Cuántos del grupo estuvieron en la partida más poblada que hay guardada. */
  maxJuntos: number;
  personas: FilaJuntos[];
}

/**
 * Mínimo de cada lado para escribir la brecha. Medido contra la base: con 10
 * pasan nueve de los catorce, y los cinco que quedan afuera tienen 0, 0, 0, 1
 * y 2 partidas acompañadas — o sea que el corte no deja a nadie del lado malo,
 * separa a los que juegan con el grupo de los que no.
 */
export const MINIMO_JUNTAS = 10;

function pct(wins: number, games: number): number {
  return games > 0 ? (wins / games) * 100 : 0;
}

export function comoJugamosJuntos(
  porPartida: Iterable<EntradaJuntos[]>,
  quien: Map<string, PersonaJuntos>
): Juntos {
  interface Acc {
    juntas: number;
    juntasWins: number;
    solas: number;
    solasWins: number;
    conQuien: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  const vacio = (): Acc => ({ juntas: 0, juntasWins: 0, solas: 0, solasWins: 0, conQuien: new Map() });
  let maxJuntos = 1;

  for (const entradas of porPartida) {
    for (const yo of entradas) {
      // Mismo resultado = mismo lado. Una partida tiene un solo bando ganador,
      // así que dos de los nuestros con distinto `win` eran rivales, no
      // compañeros — y eso no es jugar juntos.
      const companeros = entradas.filter((o) => o.puuid !== yo.puuid && o.win === yo.win);
      const a = acc.get(yo.puuid) ?? vacio();
      if (companeros.length > 0) {
        a.juntas += 1;
        if (yo.win) a.juntasWins += 1;
        for (const c of companeros) a.conQuien.set(c.puuid, (a.conQuien.get(c.puuid) ?? 0) + 1);
        maxJuntos = Math.max(maxJuntos, companeros.length + 1);
      } else {
        a.solas += 1;
        if (yo.win) a.solasWins += 1;
      }
      acc.set(yo.puuid, a);
    }
  }

  const personas: FilaJuntos[] = [];
  for (const [puuid, a] of acc) {
    const p = quien.get(puuid);
    if (!p) continue;
    let masCon: FilaJuntos["masCon"] = null;
    for (const [otro, games] of a.conQuien) {
      const q = quien.get(otro);
      if (!q) continue;
      if (!masCon || games > masCon.games) masCon = { name: q.name, tag: q.tag, games };
    }
    const hayMuestra = a.juntas >= MINIMO_JUNTAS && a.solas >= MINIMO_JUNTAS;
    personas.push({
      puuid,
      name: p.name,
      tag: p.tag,
      profileIconUrl: p.profileIconUrl,
      juntas: a.juntas,
      juntasWins: a.juntasWins,
      solas: a.solas,
      solasWins: a.solasWins,
      brecha: hayMuestra ? Number((pct(a.juntasWins, a.juntas) - pct(a.solasWins, a.solas)).toFixed(1)) : null,
      masCon,
    });
  }
  // Por partidas acompañadas: la pestaña es sobre jugar juntos, así que arriba
  // va el que más lo hace y no el que mejor le va haciéndolo.
  personas.sort((x, y) => y.juntas - x.juntas || y.solas - x.solas);

  let filas = 0;
  let juntas = 0;
  let juntasWins = 0;
  let solas = 0;
  let solasWins = 0;
  for (const p of personas) {
    filas += p.juntas + p.solas;
    juntas += p.juntas;
    juntasWins += p.juntasWins;
    solas += p.solas;
    solasWins += p.solasWins;
  }
  return { filas, juntas, juntasWins, solas, solasWins, maxJuntos, personas };
}
