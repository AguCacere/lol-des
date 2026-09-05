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
 *
 *    Las dos mitades NO valen lo mismo, y esto importa: el rival de la línea
 *    es un tipo cualquiera del ladder, o sea una muestra de lo que hace la
 *    gente; el nuestro son seis amigos con sus mañas. Que uno del grupo
 *    juegue Tahm Kench arriba no significa que el Tahm Kench de enfrente
 *    esté arriba. Por eso la observación del rival pesa el triple (ver la
 *    ruta live-detail).
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
/** Teleport. Hoy es casi exclusivo del top; inclina bastante, pero no decide como el Castigo. */
const TELEPORT = 12;

/** Cuánto vimos a un campeón en cada línea. No son partidas contadas sino peso: ver la nota 2 de arriba. */
export type ObservacionesPorRol = Map<string, Partial<Record<RoleKey, number>>>;

/** Por qué le tocó esa línea. Se muestra en la app para que un error se pueda señalar. */
export type MotivoRol = "castigo" | "vistas" | "clase" | "descarte";

export interface RolEstimado {
  rol: RoleKey | null;
  motivo: MotivoRol;
  /** Peso de las observaciones a favor de la línea elegida, y el total de ese campeón. Solo con motivo "vistas". */
  aFavor?: number;
  total?: number;
}

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
  if (hechizos.includes(TELEPORT)) {
    if (rol === "top") base += 0.3;
    else if (rol === "support" || rol === "adc") base -= 0.15;
  }

  return base;
}

/** Con qué se decidió la línea que le tocó. Mismo orden de fuerza que puntajeDe. */
function motivoDe(j: JugadorEnVivo, rol: RoleKey, obs: ObservacionesPorRol): RolEstimado {
  if ([j.spell1Id, j.spell2Id].includes(CASTIGO) && rol === "jungle") {
    return { rol, motivo: "castigo" };
  }
  const vistas = obs.get(j.champion);
  const total = vistas ? ROLES.reduce((s, r) => s + (vistas[r] ?? 0), 0) : 0;
  if (total > 0) {
    const aFavor = vistas![rol] ?? 0;
    // Solo cuenta como "lo vimos ahí" si de verdad la mayoría de lo que vimos
    // apunta a esa línea. Si no, lo que decidió fue el reparto y la clase.
    if (aFavor > total / 2) return { rol, motivo: "vistas", aFavor, total };
  }
  if ((j.tags ?? []).some((t) => POR_ETIQUETA[t]?.[rol])) return { rol, motivo: "clase" };
  return { rol, motivo: "descarte" };
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
export function asignarRoles(equipo: JugadorEnVivo[], obs: ObservacionesPorRol): RolEstimado[] {
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
      return mejor ? motivoDe(j, mejor, obs) : { rol: null, motivo: "descarte" as const };
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
  return mejorReparto.map((rol, i) => motivoDe(equipo[i], rol, obs));
}

/** El orden en que se leen las líneas. Para que los dos equipos queden enfrentados fila a fila. */
export const ORDEN_ROLES: RoleKey[] = ROLES;

export function ordenDeRol(rol: RoleKey | null): number {
  return rol ? ORDEN_ROLES.indexOf(rol) : ORDEN_ROLES.length;
}

/**
 * Con qué se estimó la línea, en criollo. Va en el tooltip del ícono: si la
 * estimación se equivoca, esto dice CUÁL de las tres fuentes falló, que es lo
 * único que hace el error arreglable en vez de misterioso.
 */
export function explicarRol(e: { motivo: MotivoRol; aFavor?: number; total?: number }): string {
  switch (e.motivo) {
    case "castigo":
      return "por el Castigo";
    case "vistas":
      // Porcentaje y no "9 de 11": lo que se acumula son PESOS, no partidas
      // contadas (una del propio jugador vale más que una del ladder), así
      // que decir "veces" sería decirte un número que no existe.
      return `es donde más lo vimos, el ${Math.round((100 * (e.aFavor ?? 0)) / (e.total || 1))}% de lo que tenemos`;
    case "clase":
      return "estimado por el tipo de campeón";
    default:
      return "por descarte: no tenemos nada de este campeón";
  }
}
