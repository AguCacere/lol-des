import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDiscordNotification } from "./discord";
import { RANKED_SOLO_QUEUE_ID } from "./refresh";
import { claveDeSemana, esSemanaDeLiga, ganadorDe, inicioDeSemana, mensajeDeCierre, tablaDeLaSemana, type Participante, type RecordSemanal, type Snapshot, ventanaDe, ventanaUltimoDia } from "./liga";

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
  // El arranque del último día: sin el mínimo de ese día no se cobra, por más
  // arriba que se haya terminado. Ver MINIMO_ULTIMO_DIA en lib/liga.ts.
  const arrancaUltimoDia = ventanaUltimoDia(anterior).desde.getTime();
  // Se agrupan y se ORDENAN por fecha antes de contar. Hasta que la liga
  // puntuó por rachas alcanzaba con sumar victorias y derrotas al vuelo, sin
  // mirar el orden; ahora "la cuarta al hilo vale 1,25" depende de en qué
  // secuencia pasaron, así que el cierre tiene que reconstruirla igual que
  // /api/liga o coronaría con un puntaje distinto del que muestra la pantalla.
  const suyasPorPuuid = new Map<string, { win: boolean; played_at: string }[]>();
  for (const m of partidas ?? []) {
    if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
    const arr = suyasPorPuuid.get(m.puuid) ?? [];
    arr.push({ win: m.win, played_at: m.played_at });
    suyasPorPuuid.set(m.puuid, arr);
  }
  const recordPorPuuid = new Map<string, RecordSemanal>();
  for (const [puuid, suyas] of suyasPorPuuid) {
    suyas.sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at));
    recordPorPuuid.set(puuid, {
      victorias: suyas.filter((m) => m.win).length,
      derrotas: suyas.filter((m) => !m.win).length,
      ultimoDia: suyas.filter((m) => Date.parse(m.played_at) >= arrancaUltimoDia).length,
      // La racha de cierre va en null: acá solo se corona y se manda el
      // mensaje, y con qué racha terminó la semana es dato de pantalla.
      racha: null,
      // Y el acumulado por día va vacío por lo mismo: la carrera se dibuja en
      // pantalla, el cierre solo necesita el puntaje final. Calcularlo acá
      // sería trabajo que nadie mira.
      porDia: [],
      champion: null,
      linea: null,
      secuencia: suyas.map((m) => m.win),
      ultimas: [],
    });
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
  // El que cobra no es el primero de la tabla: es el primero que además
  // cumplió los dos mínimos. Puede no haber ninguno, y ahí la semana se cierra
  // sin premio — que es exactamente lo que la regla tiene que poder hacer, o
  // no sería una regla.
  const ganador = ganadorDe(tabla);

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
