import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDiscordNotification } from "./discord";
import { RANKED_SOLO_QUEUE_ID } from "./refresh";
import { claveDeSemana, esSemanaDeLiga, inicioDeSemana, mensajeDeCierre, tablaDeLaSemana, type Participante, type RecordSemanal, type Snapshot, ventanaDe } from "./liga";

/**
 * El cierre de la semana, separado de la ruta para poder llamarlo también
 * desde el cron de refresco — dos disparadores distintos para la misma
 * operación idempotente, así que si uno falla el otro la completa.
 */
export interface ResultadoCierre {
  cerrada: string | null;
  ganador: string | null;
  lpNeto: number | null;
  jugadores: number;
  motivo?: string;
}

export async function cerrarSemanasPendientes(supabase: SupabaseClient): Promise<ResultadoCierre> {
  const semanaEnCurso = inicioDeSemana();
  // La que acaba de terminar es la anterior a la actual.
  const anterior = new Date(semanaEnCurso.getTime() - 7 * 24 * 60 * 60 * 1000);
  const clave = claveDeSemana(anterior);

  // Antes que nada: que la semana sea DE la liga. La app tiene meses de LP
  // guardado de antes de que esto existiera, y sin esta guarda el cron sale a
  // coronar campeones de semanas en las que nadie estaba compitiendo.
  if (!esSemanaDeLiga(anterior)) {
    return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `${clave} es anterior al arranque de la liga` };
  }

  const { data: yaCerrada } = await supabase.from("liga_semanas").select("semana").eq("semana", clave).maybeSingle();
  if (yaCerrada) return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `${clave} ya estaba cerrada` };

  const { data: anotados } = await supabase
    .from("summoners")
    .select("puuid, game_name, tag_line, liga_desde")
    .eq("participa_liga", true);
  if (!anotados || anotados.length === 0) {
    return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: "no hay nadie anotado" };
  }

  // La ventana real de esa semana: puede arrancar más tarde que el lunes si es
  // la primera de la liga.
  const { desde, hasta: fin } = ventanaDe(anterior);
  const desdeAntes = new Date(desde.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const puuids = anotados.map((s) => s.puuid);
  const { data: snaps } = await supabase
    .from("lp_snapshots")
    .select("puuid, tier, division, lp, wins, losses, captured_at")
    .in("puuid", puuids)
    .eq("queue_type", "RANKED_SOLO_5x5")
    .gte("captured_at", desdeAntes)
    .lt("captured_at", fin.toISOString())
    .order("captured_at");

  // Las victorias y las derrotas se cuentan de las partidas REALES de la
  // ventana. Los contadores de lp_snapshots son acumulados de la season y
  // restarlos da bien solo si las dos puntas son válidas — ver la nota en
  // tablaDeLaSemana.
  const { data: partidas } = await supabase
    .from("matches")
    .select("puuid, win, played_at")
    .in("puuid", puuids)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    .gte("played_at", desde.toISOString())
    .lt("played_at", fin.toISOString());
  // Y se filtra por el arranque de CADA uno, no solo por el de la semana: el
  // que se anotó el miércoles no puede llevarse las partidas del lunes.
  const arranqueDe = new Map(
    anotados.map((s) => [s.puuid, Math.max(desde.getTime(), s.liga_desde ? Date.parse(s.liga_desde) : 0)]),
  );
  // La racha va en null a propósito: acá solo se corona al ganador y se manda
  // el mensaje de cierre, que se decide por LP neto. Con qué racha terminó la
  // semana es para la tabla en pantalla, no para el anuncio, y calcularla
  // obligaría a ordenar las partidas de todos para nada.
  const recordPorPuuid = new Map<string, RecordSemanal>();
  for (const m of partidas ?? []) {
    if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
    const acc = recordPorPuuid.get(m.puuid) ?? { victorias: 0, derrotas: 0, racha: null };
    if (m.win) acc.victorias++;
    else acc.derrotas++;
    recordPorPuuid.set(m.puuid, acc);
  }

  const participantes: Participante[] = anotados.map((s) => ({
    puuid: s.puuid,
    name: s.game_name,
    tag: s.tag_line,
    profileIconUrl: null,
    desde: s.liga_desde ? new Date(s.liga_desde) : null,
  }));
  const tabla = tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], desde, fin, recordPorPuuid);
  const jugaron = tabla.filter((f) => !f.sinJugar);
  const ganador = jugaron[0] ?? null;

  // Se registra ANTES de mandar el mensaje. Si Discord falla, la semana queda
  // cerrada igual y no se reintenta: es preferible perder un anuncio a que el
  // cron del día siguiente lo publique de nuevo.
  const { error } = await supabase.from("liga_semanas").insert({
    semana: clave,
    ganador_puuid: ganador?.puuid ?? null,
    ganador_label: ganador ? `${ganador.name}#${ganador.tag}` : null,
    lp_neto: ganador?.lpNeto ?? null,
    jugadores: jugaron.length,
  });
  // Choque de clave = otra corrida ganó la carrera. No es un error: es el
  // candado funcionando.
  if (error) return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `no se registró: ${error.message}` };

  await sendDiscordNotification(mensajeDeCierre(anterior, tabla));

  return {
    cerrada: clave,
    ganador: ganador ? `${ganador.name}#${ganador.tag}` : null,
    lpNeto: ganador?.lpNeto ?? null,
    jugadores: jugaron.length,
  };
}
