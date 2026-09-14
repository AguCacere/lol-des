import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDiscordNotification } from "./discord";
import { RANKED_SOLO_QUEUE_ID } from "./refresh";
import { claveDeSemana, esSemanaDeLiga, etiquetasDeDias, type FilaLiga, ganadorDe, inicioDeSemana, mensajeDeCierre, puntajeDe, puntosPorDia, tablaDeLaSemana, type Participante, type RecordSemanal, type Snapshot, ventanaDe, ventanaUltimoDia } from "./liga";

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

/**
 * El valor que más se repite, ignorando los nulos. Empate: gana el primero que
 * llegó a esa cuenta, que con campeones es tan arbitrario como cualquier otro
 * criterio y por lo menos es estable.
 */
function masRepetido<T>(valores: (T | null)[]): T | null {
  const cuenta = new Map<T, number>();
  for (const v of valores) {
    if (v == null) continue;
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  let mejor: T | null = null;
  let max = 0;
  for (const [v, n] of cuenta) {
    if (n > max) {
      mejor = v;
      max = n;
    }
  }
  return mejor;
}

/**
 * La tabla final de una semana, armada desde la base.
 *
 * Está aparte del cierre porque la vista previa del anuncio necesita
 * exactamente esto y nada más: las mismas queries, el mismo filtrado y el
 * mismo orden, pero sin escribir en `liga_semanas` ni tocar Discord. Dos
 * copias de este armado se irían de sincronía el día que cambie el puntaje y
 * la vista previa mostraría un mensaje que no es el que va a salir.
 *
 * Con `conCarrera` calcula además el acumulado por día de cada uno, que es lo
 * que dibuja el gráfico. El cierre no lo pide —solo necesita el puntaje final y
 * calcularlo ahí sería trabajo que nadie mira—, pero la pantalla que muestra
 * cómo terminó una semana vieja sí.
 *
 * Devuelve null si no hay nadie anotado.
 */
export async function tablaDeSemanaEnBase(
  supabase: SupabaseClient,
  inicio: Date,
  opciones: { conCarrera?: boolean } = {},
): Promise<FilaLiga[] | null> {
  const { data: anotados } = await supabase
    .from("summoners")
    .select("puuid, game_name, tag_line, liga_desde")
    .eq("participa_liga", true);
  if (!anotados || anotados.length === 0) return null;

  // La ventana real de esa semana: puede arrancar más tarde que el lunes si es
  // la primera de la liga.
  const { desde, hasta: fin } = ventanaDe(inicio);
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
    // `champion` entra solo para el anuncio: el mensaje de cierre nombra con
    // qué campeón ganó la liga el que la ganó. No toca el puntaje.
    .select("puuid, win, played_at, champion")
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
  const arrancaUltimoDia = ventanaUltimoDia(inicio).desde.getTime();
  // Se agrupan y se ORDENAN por fecha antes de contar. Hasta que la liga
  // puntuó por rachas alcanzaba con sumar victorias y derrotas al vuelo, sin
  // mirar el orden; ahora "la cuarta al hilo vale 1,25" depende de en qué
  // secuencia pasaron, así que el cierre tiene que reconstruirla igual que
  // /api/liga o coronaría con un puntaje distinto del que muestra la pantalla.
  const suyasPorPuuid = new Map<string, { win: boolean; played_at: string; champion: string | null }[]>();
  for (const m of partidas ?? []) {
    if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
    const arr = suyasPorPuuid.get(m.puuid) ?? [];
    arr.push({ win: m.win, played_at: m.played_at, champion: m.champion });
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
      // El acumulado por día solo cuando alguien lo va a mirar. Y se calcula
      // con el FIN de esa semana como "ahora": con la fecha de hoy, una semana
      // vieja daría siete días corridos igual, pero una semana que todavía
      // corre daría los que van — y acá siempre se quiere la semana entera.
      porDia: opciones.conCarrera
        ? puntosPorDia(suyas.map((m) => ({ win: m.win, playedAt: m.played_at })), inicio, new Date(fin.getTime() - 1))
        : [],
      // El campeón de la semana sí se calcula: es lo único de este bloque que
      // sale en el anuncio ("ganó la liga con Yasuo"). La línea no, que ahí no
      // se nombra.
      champion: masRepetido(suyas.map((m) => m.champion)),
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
  return tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], desde, fin, recordPorPuuid);
}

/**
 * El texto del anuncio de cierre de una semana, sin mandar ni registrar nada.
 *
 * Existe por la misma razón que la vista previa del mensaje de arranque: un
 * mensaje al canal del grupo no se puede deshacer. Y la cargada del cierre
 * nombra a cada uno por su puesto, así que la única manera de saber cómo queda
 * es verla escrita con la gente de verdad.
 *
 * Sirve también para la semana EN CURSO —que todavía no terminó— justamente
 * para eso: mirar cómo quedaría el anuncio si cerrara ahora.
 */
/**
 * Cómo terminó una semana: la tabla final, los días y quién cobró.
 *
 * Es lo que mira el cartel de "cómo terminó el torneo pasado". Va acá y no en
 * una ruta aparte con sus propias queries porque tiene que dar EXACTAMENTE lo
 * mismo que dio el cierre: si se armara por otro lado, una semana vieja podría
 * mostrar un ganador distinto del que anunció el bot.
 */
export async function comoTerminoLaSemana(supabase: SupabaseClient, inicio: Date) {
  const tabla = (await tablaDeSemanaEnBase(supabase, inicio, { conCarrera: true })) ?? [];
  const jugaron = tabla.filter((f) => !f.sinJugar);
  const g = ganadorDe(tabla);
  return {
    semana: claveDeSemana(inicio),
    dias: etiquetasDeDias(inicio),
    ganadorPuuid: g?.puuid ?? null,
    jugadores: jugaron.length,
    tabla: jugaron.map((f) => ({
      puuid: f.puuid,
      name: f.name,
      puntos: puntajeDe(f),
      victorias: f.victorias,
      derrotas: f.derrotas,
      ultimoDia: f.ultimoDia,
      habilitado: f.habilitado,
      champion: f.champion,
      porDia: f.porDia,
    })),
  };
}

export async function vistaPreviaDeCierre(
  supabase: SupabaseClient,
  inicio: Date,
): Promise<{ texto: string; semana: string; jugadores: number }> {
  const tabla = (await tablaDeSemanaEnBase(supabase, inicio)) ?? [];
  return {
    texto: mensajeDeCierre(inicio, tabla),
    semana: claveDeSemana(inicio),
    jugadores: tabla.filter((f) => !f.sinJugar).length,
  };
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

  const tabla = await tablaDeSemanaEnBase(supabase, anterior);
  if (!tabla) return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: "no hay nadie anotado" };

  const jugaron = tabla.filter((f) => !f.sinJugar);
  // El que cobra no es el primero de la tabla: es el primero que además
  // cumplió los dos mínimos. Puede no haber ninguno, y ahí la semana se cierra
  // sin premio — que es exactamente lo que la regla tiene que poder hacer, o
  // no sería una regla.
  const ganador = ganadorDe(tabla);

  // Se registra ANTES de mandar el mensaje. Si Discord falla, la semana queda
  // cerrada igual y no se reintenta: es preferible perder un anuncio a que el
  // cron del día siguiente lo publique de nuevo.
  const fila = {
    semana: clave,
    ganador_puuid: ganador?.puuid ?? null,
    ganador_label: ganador ? `${ganador.name}#${ganador.tag}` : null,
    lp_neto: ganador?.lpNeto ?? null,
    // El puntaje con el que ganó: es lo que DECIDE la liga. El lp_neto queda
    // de contexto y ya no se muestra como si fuera el marcador.
    puntos: ganador ? puntajeDe(ganador) : null,
    jugadores: jugaron.length,
  };
  const { puntos, ...sinPuntos } = fila;
  let { error } = await supabase.from("liga_semanas").insert({ ...sinPuntos, puntos });
  // `puntos` es una columna nueva y las migraciones se corren a mano. Si
  // todavía no está, el cierre NO se puede perder por eso: se reintenta sin
  // ella y se avisa fuerte en el log. En cuanto la migración corra, la primera
  // rama vuelve a funcionar sola.
  if (error && /puntos/.test(error.message)) {
    console.error("cerrarSemanasPendientes: falta la columna liga_semanas.puntos — correr la migración de supabase/schema.sql. Se cierra sin el puntaje.");
    ({ error } = await supabase.from("liga_semanas").insert(sinPuntos));
  }
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
