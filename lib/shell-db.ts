/**
 * Blue Shells contra la base: inventario, lanzamiento y efectos pendientes.
 *
 * El cálculo puro está en `lib/shell.ts` y no se repite acá. Este archivo se
 * ocupa de lo único que aquel no puede hacer: que el sorteo pase UNA sola vez
 * y quede escrito.
 *
 * ## Cómo se evita el doble uso
 *
 * No hay transacciones multi-tabla desde PostgREST, así que la atomicidad sale
 * del ORDEN y de un índice único, no de un BEGIN:
 *
 *   1. Se inserta el evento con el `interaccion_id` de Discord. Ese id es
 *      único por interacción y la tabla tiene un índice único parcial sobre
 *      él: **si Discord reintenta, el segundo insert falla**. Es el candado, y
 *      va primero a propósito — antes de tocar el inventario.
 *   2. Recién con el evento escrito se descuenta la shell y se aplica el
 *      efecto.
 *
 * El modo de falla que queda es el opuesto —evento escrito y descuento que no
 * llega— y es el que conviene: se puede reconciliar mirando los eventos, que
 * es la fuente auditable. Al revés, una shell descontada sin evento se pierde
 * sin rastro.
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

  // 1. Inventario. Se mira ANTES de sortear: sin shell no hay sorteo que valga.
  const inventario = await inventarioDeLaEdicion(supabase, semana);
  if ((inventario.get(actor) ?? 0) < 1) {
    return { error: "No tenés ninguna Blue Shell." };
  }

  const resuelto = resolverLanzamiento(actor, objetivo, rnd);

  // 2. Lo que el efecto necesita saber, resuelto ANTES de escribir nada: una
  //    vez escrito el evento, el campeón y los mains ya no se pueden volver a
  //    sortear sin contradecir lo que la pantalla muestra.
  const campeon = resuelto.efecto === "RANDOM_CHAMPION" ? await opciones.campeonPara(resuelto.final) : null;
  const prohibidos = resuelto.efecto === "MAIN_BAN" ? await opciones.mainsDe(resuelto.final) : [];
  const robo = movimientoDeRobo(resuelto);

  // 3. El evento primero, con el candado. Ver el header.
  const { data: evento, error: eError } = await supabase
    .from("liga_eventos")
    .insert({
      semana,
      tipo: "SHELL_LANZADA",
      efecto: resuelto.efecto,
      actor_puuid: actor,
      objetivo_puuid: objetivo,
      final_puuid: resuelto.final,
      rebotado: resuelto.rebotado,
      monto: robo ? robo.monto : null,
      interaccion_id: interaccionId,
      meta: { campeon, prohibidos },
    })
    .select("id")
    .single<{ id: string }>();
  if (eError || !evento) {
    // 23505 = choque de único: es el reintento de Discord haciendo su trabajo.
    if ((eError as { code?: string } | null)?.code === "23505") {
      return { error: "Esa Blue Shell ya se lanzó." };
    }
    return { error: errorDeTablas(eError?.message ?? "no se pudo registrar el lanzamiento") };
  }

  // 4. Y recién ahora se descuenta y se arma el efecto.
  await supabase.from("liga_shells").insert({
    semana,
    puuid: actor,
    delta: -1,
    origen: "USO",
    evento_id: evento.id,
  });

  if (resuelto.efecto !== "STEAL_POINTS") {
    await supabase.from("liga_efectos").insert({
      evento_id: evento.id,
      semana,
      puuid: resuelto.final,
      efecto: resuelto.efecto,
      estado: "PENDIENTE",
      campeon,
      prohibidos: resuelto.efecto === "MAIN_BAN" ? prohibidos : null,
      faltan: resuelto.efecto === "MAIN_BAN" ? CONFIG_SHELL.partidasDeBan : 1,
    });
  }

  return { ...resuelto, eventoId: evento.id, campeon, prohibidos };
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
