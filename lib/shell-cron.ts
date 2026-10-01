/**
 * Cerrar los efectos de Blue Shell que esperan partidas.
 *
 * RANDOM_CHAMPION y MAIN_BAN no se resuelven al lanzarse: esperan a que la
 * persona juegue. Quien los cierra es **el cron de Riot que ya existe** — esto
 * se cuelga del final de `refreshOne` (lib/refresh.ts) y no abre un segundo
 * polling ni le pide nada nuevo a Riot. Usa las partidas que ese refresco
 * acaba de guardar.
 *
 * ## La idempotencia, que es lo único difícil de esto
 *
 * El cron corre cada quince minutos y puede repetir una corrida. Si el
 * progreso fuera un contador, un reintento descontaría dos partidas de un
 * MAIN_BAN con una sola jugada.
 *
 * Por eso el progreso NO es un contador: es la lista de `match_id` que ya
 * consumieron el efecto. Una partida que ya está en la lista no descuenta otra
 * vez, corra el cron las veces que corra. El contador `faltan` existe igual,
 * pero se deriva de esa lista y no al revés.
 *
 * ## Qué se mira y qué no
 *
 * Solo soloq, sin remakes, y solo partidas POSTERIORES a la activación: una
 * shell no puede castigarte por algo que jugaste antes de que te la tiraran.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Las dos constantes van COPIADAS y no importadas de `lib/refresh.ts`, que es
 * donde viven. La razón es el ciclo: refresh importa esto para colgarlo del
 * final de refreshOne, así que importar de vuelta cerraría el círculo —y en un
 * ciclo de ESM una constante puede llegar `undefined` según el orden en que se
 * resuelvan los módulos, que es un bug que no se ve hasta producción.
 *
 * Es la misma decisión que ya está tomada tres veces en este repo con
 * ARG_OFFSET_MS. Si alguna vez cambian, son dos lugares — y hay un test que
 * compara los dos valores justamente para que no se separen en silencio.
 */
const RANKED_SOLO_QUEUE_ID = 420;
const DURACION_MINIMA_S = 300;

/** Una partida, con lo mínimo para decidir si cierra un efecto. */
interface PartidaParaEfecto {
  match_id: string;
  champion: string | null;
  played_at: string;
}

interface EfectoEnCurso {
  id: string;
  puuid: string;
  efecto: string;
  campeon: string | null;
  prohibidos: string[] | null;
  faltan: number | null;
  matches: string[];
  creado_at: string;
}

/**
 * Avanza los efectos pendientes de una persona con sus partidas nuevas.
 *
 * Devuelve cuántos cerró, para el log. Nunca tira: un error acá no puede
 * tumbar el refresco de nadie — las Blue Shells son un juego arriba de la
 * liga, y la liga tiene que seguir andando aunque esto falle.
 */
export async function cerrarEfectosPendientes(supabase: SupabaseClient, puuid: string): Promise<number> {
  try {
    const { data: efectos, error } = await supabase
      .from("liga_efectos")
      .select("id, puuid, efecto, campeon, prohibidos, faltan, matches, creado_at")
      .eq("puuid", puuid)
      .eq("estado", "PENDIENTE")
      .returns<EfectoEnCurso[]>();
    // Sin tabla todavía (la migración se corre a mano) esto es un no-op
    // silencioso: no hay efectos porque no hay dónde guardarlos.
    if (error || !efectos || efectos.length === 0) return 0;

    // La más vieja de las activaciones marca desde dónde mirar: con una sola
    // consulta alcanza para todos los efectos de esta persona.
    const desde = efectos.reduce((min, e) => (e.creado_at < min ? e.creado_at : min), efectos[0].creado_at);
    const { data: partidas } = await supabase
      .from("matches")
      .select("match_id, champion, played_at")
      .eq("puuid", puuid)
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .gte("game_duration_s", DURACION_MINIMA_S)
      .gt("played_at", desde)
      .order("played_at", { ascending: true })
      .returns<PartidaParaEfecto[]>();
    if (!partidas || partidas.length === 0) return 0;

    let cerrados = 0;
    for (const e of efectos) {
      // Las de DESPUÉS de ESTE efecto, y sin las que ya contaron.
      const yaUsadas = new Set(e.matches ?? []);
      const nuevas = partidas.filter((m) => m.played_at > e.creado_at && !yaUsadas.has(m.match_id));
      if (nuevas.length === 0) continue;

      if (e.efecto === "RANDOM_CHAMPION") {
        // Se consume con la PRIMERA partida posterior. Si jugó el campeón
        // asignado, cumplió; si no, incumplió. Sin campeón asignado —no se
        // pudo sortear— el efecto se vence en vez de acusar a nadie de algo
        // que nunca se le pidió.
        const m = nuevas[0];
        const estado = !e.campeon ? "VENCIDO" : m.champion === e.campeon ? "CUMPLIDO" : "INCUMPLIDO";
        await cerrar(supabase, e.id, estado, [...yaUsadas, m.match_id], 0);
        cerrados++;
        continue;
      }

      if (e.efecto === "MAIN_BAN") {
        const prohibidos = new Set(e.prohibidos ?? []);
        const usadas = [...yaUsadas];
        let violado = false;
        let faltan = e.faltan ?? 0;
        for (const m of nuevas) {
          if (faltan <= 0) break;
          usadas.push(m.match_id);
          faltan--;
          if (m.champion && prohibidos.has(m.champion)) violado = true;
        }
        // Se cierra recién cuando se completaron las partidas. Violar el ban
        // NO corta el efecto antes de tiempo: las tres partidas son las tres
        // partidas, y la penalización por incumplir todavía no está definida
        // —solo se registra el estado—.
        if (faltan > 0) {
          await supabase.from("liga_efectos").update({ matches: usadas, faltan }).eq("id", e.id);
        } else {
          await cerrar(supabase, e.id, violado ? "INCUMPLIDO" : "CUMPLIDO", usadas, 0);
          cerrados++;
        }
      }
    }
    return cerrados;
  } catch (err) {
    console.error(`cerrarEfectosPendientes(${puuid}):`, err);
    return 0;
  }
}

async function cerrar(
  supabase: SupabaseClient,
  id: string,
  estado: string,
  matches: string[],
  faltan: number,
): Promise<void> {
  await supabase
    .from("liga_efectos")
    .update({ estado, matches, faltan, cerrado_at: new Date().toISOString() })
    .eq("id", id);
}
