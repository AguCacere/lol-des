import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Las cuentas con las que hacer duo NO puntúa en la liga.
 *
 * El problema que resuelve: alguien juega acompañado por una cuenta que está
 * bastante arriba del elo en el que juega, y esa partida no mide lo mismo que
 * las del resto. La regla es "duo con gente de afuera de la tabla no cuenta",
 * y esto es la lista de esas cuentas.
 *
 * **Riot no dice quién fue en duo.** Match-V5 no trae party ni premade, así
 * que no hay forma de preguntarlo: lo único deducible es con quién estuviste
 * en el mismo equipo, que es lo que guarda `matches.aliados`. Por eso la lista
 * es manual — se carga el puuid una vez y toda partida donde aparezca deja de
 * contar sola, esta y las que vengan.
 *
 * Eso último es el motivo de que esto sea una tabla y no un `liga_ajustes` de
 * −4 a mano: el número a mano nace vencido. Se calculó uno con cuatro partidas
 * y antes de poder correrlo ya eran cinco, porque el tipo seguía jugando.
 *
 * **Anula la partida ENTERA**, no solo la victoria: si con esa cuenta perdió,
 * tampoco le resta. La partida no pasó para la liga. Es más fuerte que
 * `ally_afk`, que descarta solo las derrotas.
 *
 * Degrada sin romper: si la tabla todavía no existe, se loguea y no hay
 * vetados. Se lee, no se escribe, así que quedarse corto es preferible a
 * tumbar la tabla de la liga entera por una migración que falta.
 */
export async function cargarVetados(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("liga_vetados").select("puuid");
  if (error) {
    console.error("liga_vetados: no se pudo leer, sigo sin vetados —", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((v) => v.puuid as string));
}

/** Si en esa partida había una cuenta vetada del mismo lado. */
export function conVetado(aliados: string[] | null | undefined, vetados: Set<string>): boolean {
  if (vetados.size === 0 || !aliados || aliados.length === 0) return false;
  return aliados.some((p) => vetados.has(p));
}
