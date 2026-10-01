/**
 * Blue Shells contra la base: inventario, lanzamiento y efectos pendientes.
 *
 * El cálculo puro está en `lib/shell.ts` y no se repite acá. Este archivo se
 * ocupa de lo único que aquel no puede hacer: que el sorteo pase UNA sola vez
 * y quede escrito.
 *
 * ## La escritura es ATÓMICA, y eso no es negociable
 *
 * Antes esto eran tres INSERT independientes desde acá en un orden elegido con
 * cuidado, y un orden cuidadoso **no es una transacción**: entre el evento y el
 * descuento de la shell puede caerse la red, y queda un lanzamiento a medias —
 * un evento que dice "MAIN BAN aplicado" sin ningún MAIN_BAN pendiente, o una
 * shell gastada sin nada que la justifique.
 *
 * Ahora las tres escrituras entran a Postgres como UNA operación: la función
 * `lanzar_blue_shell` (ver supabase/schema.sql), que corre en su transacción
 * implícita. Si cualquiera de las tres falla, se deshacen todas.
 *
 * El sorteo sigue pasando acá, en el servidor de Node, y entra a la función ya
 * resuelto. Es a propósito: así los tests pueden fijar el azar, y la función
 * SQL se ocupa solo de escribir.
 *
 * ## Y por qué no se puede gastar la misma shell dos veces
 *
 * El saldo de un ledger es una SUMA, no una fila, así que no hay UNIQUE que
 * ataje un saldo negativo. Leer el inventario y después insertar es el bug
 * clásico de check-then-act: dos pedidos simultáneos leen 1 los dos y los dos
 * descuentan.
 *
 * Lo resuelve un `pg_advisory_xact_lock` sobre (edición, jugador) adentro de
 * la función, tomado ANTES de leer el inventario. El segundo pedido se queda
 * esperando hasta que el primero commitea, y recién ahí lee el saldo — ya en
 * cero.
 *
 * ## Y de dónde sale el actor
 *
 * De ningún lado que mande el cliente. El comando recibe el `discord_id` que
 * Discord firmó, y de ahí sale el invocador. **No existe forma de lanzar en
 * nombre de otro**: el actor no es un parámetro del comando.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONFIG_SHELL,
  type EfectoShell,
  type Lanzamiento,
  movimientoDeRobo,
  type OrigenShell,
  puntosDeObjetos,
  resolverLanzamiento,
  shellsDisponibles,
} from "./shell";

/** Lo que devuelve un lanzamiento que salió bien. */
export interface LanzamientoHecho extends Lanzamiento {
  eventoId: string;
  /** El campeón sorteado, en RANDOM_CHAMPION. */
  campeon: string | null;
  /** Los mains congelados, en MAIN_BAN. */
  prohibidos: string[];
  /**
   * Si esto fue un REINTENTO de Discord y lo que se devuelve es el resultado
   * de la primera vez. Nada se volvió a sortear ni a descontar.
   */
  repetida: boolean;
}

/** Un error de negocio, ya escrito para contestarle a quien lo tipeó. */
export interface LanzamientoFallido {
  error: string;
}

export type ResultadoLanzamiento = LanzamientoHecho | LanzamientoFallido;

export function fallo(r: ResultadoLanzamiento): r is LanzamientoFallido {
  return "error" in r;
}

/** Cuántas shells tiene disponibles cada uno de la edición. */
export async function inventarioDeLaEdicion(
  supabase: SupabaseClient,
  semana: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("liga_shells")
    .select("puuid, delta")
    .eq("semana", semana)
    .returns<{ puuid: string; delta: number }[]>();
  if (error || !data) return new Map();
  const por = new Map<string, number[]>();
  for (const r of data) por.set(r.puuid, [...(por.get(r.puuid) ?? []), r.delta]);
  return new Map([...por].map(([puuid, deltas]) => [puuid, shellsDisponibles(deltas)]));
}

/**
 * Los puntos que los objetos le movieron a cada uno en la edición.
 *
 * Se derivan de los eventos de robo y no de un total guardado: el que pierde
 * es el `final_puuid` —el que se comió el efecto— y el que gana es el otro,
 * así que el caso rebotado sale solo sin una columna que lo diga.
 */
export async function objetosDeLaEdicion(
  supabase: SupabaseClient,
  semana: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("liga_eventos")
    .select("actor_puuid, objetivo_puuid, final_puuid, monto, efecto")
    .eq("semana", semana)
    .eq("efecto", "STEAL_POINTS")
    .returns<{ actor_puuid: string | null; objetivo_puuid: string | null; final_puuid: string | null; monto: number | null }[]>();
  if (error || !data) return new Map();
  const lineas: { puuid: string; puntos: number }[] = [];
  for (const e of data) {
    if (!e.final_puuid || e.monto == null) continue;
    const gana = e.final_puuid === e.actor_puuid ? e.objetivo_puuid : e.actor_puuid;
    if (!gana || gana === e.final_puuid) continue;
    lineas.push({ puuid: e.final_puuid, puntos: -Number(e.monto) });
    lineas.push({ puuid: gana, puntos: Number(e.monto) });
  }
  return puntosDeObjetos(lineas);
}

/**
 * Lanza una Blue Shell. Es la única puerta: el bot llama acá y nada más.
 *
 * `rnd` entra por parámetro para que los tests puedan fijar el sorteo. En
 * producción es `Math.random` y el sorteo pasa ACÁ, del lado del servidor —
 * nunca en el cliente ni en dos lados a la vez.
 */
export async function lanzarShell(
  supabase: SupabaseClient,
  opciones: {
    semana: string;
    actor: string;
    objetivo: string;
    /** El id de la interacción de Discord. Es la llave contra el doble uso. */
    interaccionId: string | null;
    /** Los tres mains del objetivo, ya congelados por quien llama. */
    mainsDe: (puuid: string) => Promise<string[]>;
    /** Un campeón al azar de la línea del objetivo, o null si no se puede saber. */
    campeonPara: (puuid: string) => Promise<string | null>;
    rnd?: () => number;
  },
): Promise<ResultadoLanzamiento> {
  const { semana, actor, objetivo, interaccionId, rnd = Math.random } = opciones;

  // 1. Nunca contra uno mismo, y se corta ACÁ — antes de sortear el efecto,
  //    antes del rebote y antes de tocar la base. Quien lo intentó se queda
  //    con su shell.
  //
  //    No alcanza con esconderlo del autocompletado: una interacción armada a
  //    mano llega igual. Por eso esto se repite en la función SQL y además hay
  //    un CHECK en la tabla — tres capas diciendo lo mismo, porque una request
  //    a mano no pasa por las primeras.
  if (actor === objetivo) {
    return { error: "No podés tirarte una Blue Shell a vos mismo." };
  }

  // 2. El inventario, a modo de atajo amable: si no tiene, se le dice sin
  //    gastar un viaje a la función. La garantía REAL no está acá —esta
  //    lectura puede quedar vieja en un milisegundo— sino adentro de
  //    `lanzar_blue_shell`, bajo el lock.
  const inventario = await inventarioDeLaEdicion(supabase, semana);
  if ((inventario.get(actor) ?? 0) < 1) {
    return { error: "No tenés ninguna Blue Shell." };
  }

  const resuelto = resolverLanzamiento(actor, objetivo, rnd);

  // 3. Lo que el efecto necesita saber, resuelto ANTES de escribir: una vez
  //    escrito el evento, el campeón y los mains ya no se pueden volver a
  //    sortear sin contradecir lo que la pantalla muestra.
  const campeon = resuelto.efecto === "RANDOM_CHAMPION" ? await opciones.campeonPara(resuelto.final) : null;
  const prohibidos = resuelto.efecto === "MAIN_BAN" ? await opciones.mainsDe(resuelto.final) : [];
  const robo = movimientoDeRobo(resuelto);

  // 4. Y todo lo demás en UNA operación. Ver el header.
  const { data, error } = await supabase.rpc("lanzar_blue_shell", {
    p_semana: semana,
    p_actor: actor,
    p_objetivo: objetivo,
    p_final: resuelto.final,
    p_efecto: resuelto.efecto,
    p_rebotado: resuelto.rebotado,
    p_monto: robo ? robo.monto : null,
    p_interaccion: interaccionId,
    p_campeon: campeon,
    p_prohibidos: resuelto.efecto === "MAIN_BAN" ? prohibidos : null,
    p_faltan: resuelto.efecto === "MAIN_BAN" ? CONFIG_SHELL.partidasDeBan : 1,
  });
  if (error) return { error: errorDeTablas(error.message) };

  const r = data as RespuestaRpc | null;
  if (!r) return { error: errorDeTablas("la función de lanzamiento no contestó") };
  if (!r.ok) {
    return { error: r.error === "self" ? "No podés tirarte una Blue Shell a vos mismo." : "No tenés ninguna Blue Shell." };
  }

  // 5. Un reintento de Discord devuelve el resultado de la PRIMERA vez, no uno
  //    nuevo: ni se vuelve a sortear ni se descuenta otra shell. Lo que se
  //    contesta es lo que de verdad pasó, que puede no ser lo que sorteó ESTA
  //    corrida — por eso se lee del evento guardado y no de `resuelto`.
  if (r.repetida) {
    return {
      efecto: (r.efecto as Lanzamiento["efecto"]) ?? resuelto.efecto,
      actor,
      objetivo,
      final: r.final ?? resuelto.final,
      rebotado: r.rebotado ?? resuelto.rebotado,
      eventoId: r.evento_id,
      campeon: r.campeon ?? null,
      // Los mains que quedaron congelados en el evento, no los que más juegue
      // hoy: entre el primer intento y el reintento pueden haber cambiado.
      prohibidos: r.prohibidos ?? prohibidos,
      repetida: true,
    };
  }

  return { ...resuelto, eventoId: r.evento_id, campeon, prohibidos, repetida: false };
}

/** Lo que devuelve la función `lanzar_blue_shell`. */
interface RespuestaRpc {
  ok: boolean;
  error?: string;
  repetida?: boolean;
  evento_id: string;
  efecto?: string;
  rebotado?: boolean;
  final?: string;
  campeon?: string | null;
  prohibidos?: string[] | null;
}

/** Otorga una shell. `periodo` no nulo la hace idempotente contra el índice único. */
export async function otorgarShell(
  supabase: SupabaseClient,
  semana: string,
  puuid: string,
  origen: OrigenShell,
  periodo: string | null = null,
): Promise<boolean> {
  const { error } = await supabase
    .from("liga_shells")
    .insert({ semana, puuid, delta: 1, origen, periodo });
  // El choque de único NO es un error: es la segunda corrida del cron
  // rebotando contra la guarda, que es exactamente para lo que está.
  return !error;
}

/** Los efectos todavía abiertos de la edición, por jugador. */
export interface EfectoAbierto {
  id: string;
  puuid: string;
  efecto: EfectoShell;
  campeon: string | null;
  prohibidos: string[] | null;
  faltan: number | null;
  matches: string[];
}

export async function efectosPendientes(
  supabase: SupabaseClient,
  puuids?: string[],
): Promise<EfectoAbierto[]> {
  let q = supabase
    .from("liga_efectos")
    .select("id, puuid, efecto, campeon, prohibidos, faltan, matches")
    .eq("estado", "PENDIENTE");
  if (puuids && puuids.length > 0) q = q.in("puuid", puuids);
  const { data, error } = await q.returns<EfectoAbierto[]>();
  if (error || !data) return [];
  return data;
}

/** La tabla todavía no existe: se dice, no se traga. */
export function errorDeTablas(detalle: string): string {
  if (/liga_shells|liga_eventos|liga_efectos/.test(detalle)) {
    return "Todavía no están creadas las tablas de Blue Shells. Hay que correr la migración de `supabase/schema.sql`.";
  }
  return `No pude con eso: ${detalle}`;
}

/** Un efecto abierto, tal como lo muestra la clasificación. */
export interface EfectoEnPantalla {
  puuid: string;
  efecto: EfectoShell;
  /** El campeón asignado, en RANDOM_CHAMPION. */
  campeon: string | null;
  /** Cuántas partidas faltan, en MAIN_BAN. */
  faltan: number | null;
  /** De cuántas arrancó, para poder escribir "1 de 3". */
  total: number | null;
}

/**
 * Los efectos todavía abiertos de la edición, para dibujarlos en la tabla.
 *
 * Devuelve una lista y no un mapa: alguien puede tener dos efectos encima a la
 * vez y un mapa por puuid perdería uno.
 */
export async function efectosDeLaEdicion(
  supabase: SupabaseClient,
  semana: string,
): Promise<EfectoEnPantalla[]> {
  const { data, error } = await supabase
    .from("liga_efectos")
    .select("puuid, efecto, campeon, faltan")
    .eq("semana", semana)
    .eq("estado", "PENDIENTE")
    .returns<{ puuid: string; efecto: EfectoShell; campeon: string | null; faltan: number | null }[]>();
  if (error || !data) return [];
  return data.map((e) => ({
    ...e,
    total: e.efecto === "MAIN_BAN" ? CONFIG_SHELL.partidasDeBan : 1,
  }));
}
