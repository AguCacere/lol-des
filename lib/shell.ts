/**
 * **Blue Shell**: el objeto de la edición larga de la liga.
 *
 * Este archivo es TODO cálculo puro: la configuración, el sorteo con pesos, el
 * rebote y la cuenta de lo que cada efecto mueve. No toca la base, no habla con
 * Discord y no sabe qué hora es. Lo que persiste está en `lib/shell-db.ts`;
 * lo que se dibuja, en los componentes.
 *
 * Está separado así por una razón concreta: **el sorteo tiene que pasar una
 * sola vez y del lado del servidor**. Si el bot y la web sortearan cada uno por
 * su cuenta, dos pantallas mirando el mismo evento mostrarían efectos
 * distintos. Acá el azar entra por un parámetro (`rnd`), de modo que el motor
 * es determinístico en los tests y el único que llama con `Math.random` es el
 * que escribe el resultado en la base.
 *
 * **Una Blue Shell no tiene efecto hasta que se lanza.** No hay "shells de
 * robo" guardadas en un inventario: hay shells, y el efecto se sortea en el
 * momento del lanzamiento.
 *
 * El "espejo" tampoco es un objeto. Nadie lo tiene ni lo equipa: es una
 * probabilidad inherente a lanzar, que se tira DESPUÉS de saber qué efecto
 * salió. Si pega, el efecto se le aplica al que lanzó.
 */

/** Los tres efectos que puede sacar una shell. */
export type EfectoShell = "RANDOM_CHAMPION" | "MAIN_BAN" | "STEAL_POINTS";

/** De dónde salió una shell. Queda en el ledger para poder auditar el inventario. */
export type OrigenShell = "RACHA" | "PERFECT" | "COMEBACK" | "ADMIN";

/** En qué quedó un efecto que depende de partidas futuras. */
export type EstadoEfecto = "PENDIENTE" | "CUMPLIDO" | "INCUMPLIDO" | "VENCIDO";

/**
 * **La configuración, toda junta y en un solo lugar.**
 *
 * Nada de esto está cerrado como balance: son valores de arranque, puestos acá
 * para que cambiarlos sea editar un número y no salir a buscar porcentajes
 * desparramados entre el bot, la API y la pantalla.
 */
export const CONFIG_SHELL = {
  /**
   * Los pesos del sorteo. NO son porcentajes: son pesos relativos, y la suma no
   * tiene que dar 100. Con los tres en 1 la chance es un tercio cada uno, que
   * es el arranque más honesto mientras el balance no esté decidido.
   */
  efectos: {
    RANDOM_CHAMPION: 1,
    MAIN_BAN: 1,
    STEAL_POINTS: 1,
  } satisfies Record<EfectoShell, number>,
  /** Probabilidad de que la shell rebote contra el que la lanzó, de 0 a 1. */
  rebote: 0.15,
  /** Cuántos puntos mueve un robo. Va a `puntos_objetos`, nunca al puntaje de juego. */
  robo: 0.5,
  /** Cuántas partidas dura un MAIN_BAN. */
  partidasDeBan: 3,
  /** Cuántos mains se prohíben. */
  mainsProhibidos: 3,
  /** Tope de shells en el inventario. Lanzar libera lugar. */
  tope: 3,
  /**
   * El premio de consuelo: cada cuántos días los últimos de la tabla reciben
   * una shell, y a cuántos les toca.
   */
  comeback: { cadaDias: 3, aLosUltimos: 2 },
} as const;

/** Una opción del sorteo con su peso. */
export interface Pesada<T> {
  valor: T;
  peso: number;
}

/**
 * Sorteo con pesos. `rnd` devuelve un número en [0, 1).
 *
 * Es una función aparte —y no tres líneas adentro del lanzamiento— para poder
 * probarla: con un `rnd` fijo se puede verificar exactamente qué sale en cada
 * tramo, que es la única forma de saber que los pesos se respetan.
 *
 * Los pesos ≤ 0 se descartan en vez de romper: poner un efecto en 0 es la
 * manera natural de apagarlo desde la configuración.
 */
export function sorteoPesado<T>(opciones: Pesada<T>[], rnd: () => number): T | null {
  const vivas = opciones.filter((o) => o.peso > 0);
  if (vivas.length === 0) return null;
  const total = vivas.reduce((s, o) => s + o.peso, 0);
  let x = rnd() * total;
  for (const o of vivas) {
    x -= o.peso;
    if (x < 0) return o.valor;
  }
  // Solo se llega acá por redondeo de punto flotante cuando rnd() devuelve
  // casi 1. La última es la respuesta correcta, no un error.
  return vivas[vivas.length - 1].valor;
}

/** El efecto que sale de una shell, según los pesos de la configuración. */
export function sortearEfecto(rnd: () => number): EfectoShell {
  const efecto = sorteoPesado<EfectoShell>(
    (Object.keys(CONFIG_SHELL.efectos) as EfectoShell[]).map((valor) => ({
      valor,
      peso: CONFIG_SHELL.efectos[valor],
    })),
    rnd,
  );
  // Con todos los pesos en 0 no habría efecto posible. Antes de devolver null
  // y hacer que el que llama se las arregle, cae al robo: es el único efecto
  // que se resuelve en el acto y no deja un estado pendiente.
  return efecto ?? "STEAL_POINTS";
}

/** El resultado completo de un lanzamiento, ya resuelto. */
export interface Lanzamiento {
  efecto: EfectoShell;
  /** Quién la tiró. Sale del Discord ID, nunca de un nombre escrito a mano. */
  actor: string;
  /** A quién se la tiró. */
  objetivo: string;
  /** Quién se la come. Es el objetivo, salvo que haya rebotado. */
  final: string;
  rebotado: boolean;
}

/**
 * Resuelve un lanzamiento: sortea el efecto y después tira el rebote.
 *
 * **El orden importa y es el del juego**: primero se sabe qué efecto salió y
 * recién después si vuelve. Un rebote no cambia el efecto, cambia a quién le
 * pega.
 *
 * Tirarse una shell a uno mismo es legal y no se trata distinto: ahí el
 * rebote no cambia nada y el robo da cero, que es exactamente lo que
 * corresponde.
 */
export function resolverLanzamiento(actor: string, objetivo: string, rnd: () => number): Lanzamiento {
  const efecto = sortearEfecto(rnd);
  const rebotado = rnd() < CONFIG_SHELL.rebote;
  return { efecto, actor, objetivo, final: rebotado ? actor : objetivo, rebotado };
}

/** Un movimiento de puntos de objeto: quién pierde, quién gana y cuánto. */
export interface MovimientoDeRobo {
  pierde: string;
  gana: string;
  monto: number;
}

/**
 * Quién pierde y quién gana en un robo.
 *
 * El que pierde es SIEMPRE el que se comió el efecto (`final`), y el que gana
 * es el otro. Así el caso rebotado sale solo: si la shell vuelve, el que la
 * tiró es el final, pierde él y cobra el que iba a ser la víctima.
 *
 * Null cuando el efecto no es un robo, y null también cuando alguien se la
 * tiró a sí mismo: ahí los dos lados son la misma persona y el movimiento
 * sería +0,5 y −0,5 sobre el mismo puuid, o sea nada escrito como si fuera
 * algo.
 */
export function movimientoDeRobo(l: Lanzamiento, monto = CONFIG_SHELL.robo): MovimientoDeRobo | null {
  if (l.efecto !== "STEAL_POINTS") return null;
  const gana = l.final === l.actor ? l.objetivo : l.actor;
  if (gana === l.final) return null;
  return { pierde: l.final, gana, monto };
}

/** Una línea del ledger de puntos de objeto, tal como la devuelve la base. */
export interface LineaDeObjetos {
  puuid: string;
  puntos: number;
}

/**
 * Lo que los objetos le movieron a cada uno, sumado por jugador.
 *
 * Es una suma y no un contador guardado a propósito: el total se puede volver
 * a calcular desde los eventos en cualquier momento, así que un bug en la
 * escritura no deja un número mentiroso que nadie puede desarmar.
 */
export function puntosDeObjetos(lineas: LineaDeObjetos[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lineas) {
    // Redondeado a dos decimales en cada paso: la liga se define por cuartos
    // de punto y 0.1 + 0.2 no da 0.3 en punto flotante.
    m.set(l.puuid, Math.round(((m.get(l.puuid) ?? 0) + l.puntos) * 100) / 100);
  }
  return m;
}

/** Cuántas shells tiene disponibles alguien, a partir de su ledger. */
export function shellsDisponibles(deltas: number[]): number {
  return deltas.reduce((s, d) => s + d, 0);
}

/**
 * En qué período de comeback cae un instante, para la clave de idempotencia.
 *
 * Es el número de bloque de `cadaDias` contado desde el arranque de la
 * edición. Dos corridas del cron el mismo día dan el mismo número, que es
 * justamente el punto: la clave `(edición, período, jugador, origen)` hace que
 * la segunda entrega choque contra el índice único en vez de regalar otra
 * shell.
 */
export function periodoDeComeback(arranque: number, ahora: number, cadaDias = CONFIG_SHELL.comeback.cadaDias): number {
  const dia = 86400000;
  return Math.max(0, Math.floor((ahora - arranque) / (cadaDias * dia)));
}

/**
 * A quiénes les toca la shell de consuelo: los últimos de la tabla.
 *
 * `tabla` tiene que venir ORDENADA como la clasificación. Se saltea a los que
 * no jugaron nada: regalarle una shell al que no se anotó a jugar no es
 * ayudar al que viene último, es ayudar al que no vino.
 */
export function ultimosParaComeback<T extends { puuid: string; sinJugar: boolean }>(
  tabla: T[],
  cuantos = CONFIG_SHELL.comeback.aLosUltimos,
): string[] {
  const jugaron = tabla.filter((f) => !f.sinJugar);
  // Con menos de uno más que los premiados, "los últimos" serían todos y el
  // premio dejaría de ser un premio de consuelo.
  if (jugaron.length <= cuantos) return [];
  return jugaron.slice(-cuantos).map((f) => f.puuid);
}
