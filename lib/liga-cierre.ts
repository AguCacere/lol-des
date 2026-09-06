import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDiscordNotification } from "./discord";
import { RANKED_SOLO_QUEUE_ID } from "./refresh";
import {
  claveDeSemana,
  finDeSemana,
  inicioDeSemana,
  mensajeDeCierre,
  tablaDeLaSemana,
  type Participante,
  type Snapshot,
} from "./liga";

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

  const { data: yaCerrada } = await supabase.from("liga_semanas").select("semana").eq("semana", clave).maybeSingle();
  if (yaCerrada) return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `${clave} ya estaba cerrada` };

  const { data: anotados } = await supabase
    .from("summoners")
    .select("puuid, game_name, tag_line")
    .eq("participa_liga", true);
  if (!anotados || anotados.length === 0) {
    return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: "no hay nadie anotado" };
  }

  const fin = finDeSemana(anterior);
  const desdeAntes = new Date(anterior.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
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
    .select("puuid, win")
    .in("puuid", puuids)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    .gte("played_at", anterior.toISOString())
    .lt("played_at", fin.toISOString());
  const recordPorPuuid = new Map<string, { victorias: number; derrotas: number }>();
  for (const m of partidas ?? []) {
    const acc = recordPorPuuid.get(m.puuid) ?? { victorias: 0, derrotas: 0 };
    if (m.win) acc.victorias++;
    else acc.derrotas++;
    recordPorPuuid.set(m.puuid, acc);
  }


  const participantes: Participante[] = anotados.map((s) => ({
    puuid: s.puuid,
    name: s.game_name,
    tag: s.tag_line,
    profileIconUrl: null,
  }));
  const tabla = tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], anterior, fin, recordPorPuuid);
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
