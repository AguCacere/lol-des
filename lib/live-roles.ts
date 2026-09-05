import type { RoleKey } from "./types";

/**
 * En qué línea juega cada uno de los diez, DURANTE la partida.
 *
 * Spectator no lo dice. Match-V5 sí (teamPosition), pero eso llega recién
 * cuando la partida terminó — o sea, tarde para lo único que sirve este
 * panel. Así que se deduce, y como se deduce, se avisa en la app que es
 * estimado.
 *
 * Hay tres fuentes, de la más confiable a la menos:
 *
 * 1. El Castigo. Si alguien lo lleva, es la jungla. No hay caso raro que
 *    valga la pena contemplar acá.
 * 2. Lo que vimos nosotros. Cada partida guardada dice en qué posición jugó
 *    el nuestro Y contra qué campeón la jugó (opponent_champion es el rival
 *    de la MISMA línea), así que cada fila son dos observaciones de
 *    "campeón → línea". Sobre cientos de partidas del grupo, eso cubre a la
 *    mayoría de los campeones que se ven en el LAS.
 * 3. Las etiquetas de Data Dragon. Para el campeón que nunca vimos: un
 *    Marksman está abajo, un Support acompaña. Es débil y solo desempata.
 *
 * Y después está el paso que lo hace funcionar de verdad: no se elige la
 * mejor línea de cada uno por separado —así salen tres "mid" y ningún top—
 * sino el REPARTO que más suma entre los cinco, con una línea por cabeza.
 * Cinco jugadores en cinco posiciones son 120 combinaciones: se prueban
 * todas y se queda la mejor. No hace falta nada más astuto que eso.
 */

const ROLES: RoleKey[] = ["top", "jungle", "mid", "adc", "support"];

/** Id de Data Dragon del Castigo. Es el único hechizo que decide una línea por sí solo. */
const CASTIGO = 11;
/** El Barrera/Curar de abajo. Mucho más flojo que el Castigo: inclina, no decide. */
const CURAR = 7;

/** Cuántas veces vimos a un campeón en cada línea. */
export type ObservacionesPorRol = Map<string, Partial<Record<RoleKey, number>>>;

/** Lo mínimo que queremos saber de cada jugador para ubicarlo. */
export interface JugadorEnVivo {
  champion: string;
  spell1Id?: number;
  spell2Id?: number;
  /** Etiquetas de Data Dragon ("Marksman", "Support", …). Solo se usan si del campeón no vimos nada. */
  tags?: string[];
}

/**
 * Repartos que la etiqueta de Data Dragon sugiere cuando del campeón no
 * tenemos ni una partida. Suman menos de 1 a propósito: es un empujón para
 * desempatar, no una respuesta.
 */
const POR_ETIQUETA: Record<string, Partial<Record<RoleKey, number>>> = {
  Marksman: { adc: 0.5, mid: 0.1 },
  Support: { support: 0.45, top: 0.05 },
  Mage: { mid: 0.3, support: 0.15 },
  Assassin: { mid: 0.3, jungle: 0.15, top: 0.05 },
  Fighter: { top: 0.3, jungle: 0.15 },
  Tank: { top: 0.25, support: 0.15, jungle: 0.1 },
};

/** Cuántas observaciones hacen falta para creerle a la proporción en vez de a la etiqueta. */
const OBSERVACIONES_CONFIABLES = 4;

function puntajeDe(j: JugadorEnVivo, rol: RoleKey, obs: ObservacionesPorRol): number {
  const vistas = obs.get(j.champion);
  const total = vistas ? ROLES.reduce((s, r) => s + (vistas[r] ?? 0), 0) : 0;

  let base = 0;
  if (total > 0) {
    const proporcion = (vistas![rol] ?? 0) / total;
    // Con dos o tres partidas la proporción es ruido: se le cree a medias y
    // el resto lo pone la etiqueta. Recién a partir de OBSERVACIONES_CONFIABLES
    // manda lo que vimos.
    const confianza = Math.min(1, total / OBSERVACIONES_CONFIABLES);
    base = proporcion * confianza;
    if (confianza < 1) base += (1 - confianza) * (POR_ETIQUETA[j.tags?.[0] ?? ""]?.[rol] ?? 0);
  } else {
    for (const tag of j.tags ?? []) base += POR_ETIQUETA[tag]?.[rol] ?? 0;
  }

  const hechizos = [j.spell1Id, j.spell2Id];
  if (hechizos.includes(CASTIGO)) {
    // Fuerte en los dos sentidos: el que castiga está en la jungla, y —más
    // importante todavía— NO está en una línea, por más que el campeón que
    // eligió se vea siempre en el top.
    base += rol === "jungle" ? 1.6 : -1.2;
  } else if (rol === "jungle") {
    // Y al revés: sin Castigo, jungla prácticamente no existe. Esto es lo que
    // evita que el reparto meta a alguien ahí solo porque sobraba el lugar.
    base -= 0.9;
  }
  if (hechizos.includes(CURAR) && rol === "adc") base += 0.25;

  return base;
}

/** Todas las formas de repartir 5 posiciones entre 5 jugadores. Se arma una sola vez. */
const REPARTOS: RoleKey[][] = (function permutar(restantes: RoleKey[]): RoleKey[][] {
  if (restantes.length <= 1) return [restantes];
  const salida: RoleKey[][] = [];
  for (let i = 0; i < restantes.length; i++) {
    const resto = [...restantes.slice(0, i), ...restantes.slice(i + 1)];
    for (const cola of permutar(resto)) salida.push([restantes[i], ...cola]);
  }
  return salida;
})(ROLES);

/**
 * Devuelve la línea de cada jugador, en el mismo orden en que llegaron. Null
 * en las posiciones que no se pudieron ubicar (equipo incompleto o campeón
 * sin resolver).
 */
export function asignarRoles(equipo: JugadorEnVivo[], obs: ObservacionesPorRol): (RoleKey | null)[] {
  // Con un equipo que no sea de cinco no hay reparto posible: cada uno se
  // queda con su mejor línea suelta, que para eso alcanza.
  if (equipo.length !== ROLES.length) {
    return equipo.map((j) => {
      let mejor: RoleKey | null = null;
      let mejorPuntaje = -Infinity;
      for (const rol of ROLES) {
        const p = puntajeDe(j, rol, obs);
        if (p > mejorPuntaje) {
          mejorPuntaje = p;
          mejor = rol;
        }
      }
      return mejor;
    });
  }

  const tabla = equipo.map((j) => Object.fromEntries(ROLES.map((r) => [r, puntajeDe(j, r, obs)])) as Record<RoleKey, number>);

  let mejorReparto = REPARTOS[0];
  let mejorTotal = -Infinity;
  for (const reparto of REPARTOS) {
    let total = 0;
    for (let i = 0; i < reparto.length; i++) total += tabla[i][reparto[i]];
    if (total > mejorTotal) {
      mejorTotal = total;
      mejorReparto = reparto;
    }
  }
  return mejorReparto;
}

/** El orden en que se leen las líneas. Para que los dos equipos queden enfrentados fila a fila. */
export const ORDEN_ROLES: RoleKey[] = ROLES;

export function ordenDeRol(rol: RoleKey | null): number {
  return rol ? ORDEN_ROLES.indexOf(rol) : ORDEN_ROLES.length;
}
