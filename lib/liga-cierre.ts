import type { SupabaseClient } from "@supabase/supabase-js";
import { sendDiscordNotification } from "./discord";
import { DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "./refresh";
import { type AjusteLiga, type DetalleSemanal, type FilaDelDia, type FilaLiga, ganadorDe, mensajeDeCierre, mensajeDelDia, puntajeDe, puntosPorDia, tablaDeLaSemana, type Participante, type RecordSemanal, type Snapshot, lpAtribuido, derrotaMitigada } from "./liga";
import { cargarVetados, conVetado } from "./vetados";
import { claveDeTorneo, diaCorriente, duracionEnDias, esTorneoDeLiga, etiquetasDeDias, type Torneo, torneoAnterior, torneoDe } from "./torneo";
import { repartirTitulos } from "./liga-titulos";
import { apuestasDeLaSemana, mensajeDeResultado } from "./quiniela";

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
 * Con `todosLosTrackeados` ignora quién está anotado HOY y arma la semana con
 * todo el que tenga partidas de ranked adentro de la ventana. Es el único modo
 * de rescatar una semana vieja después de que se destildó a los que
 * compitieron: ahí `participa_liga` y `liga_desde` ya no dicen nada de esa
 * semana. Se usa solo para reconstruir a mano, nunca para cerrar ni para
 * mostrar en vivo — puede meter a alguien trackeado que jugó ranked esa semana
 * sin estar compitiendo, y por eso el que lo corre tiene que mirar si el
 * resultado coincide con los jugadores que la semana ya tenía registrados.
 *
 * Devuelve null si no hay nadie anotado (o, en modo rescate, nadie trackeado).
 */
export async function tablaDeSemanaEnBase(
  supabase: SupabaseClient,
  torneo: Torneo,
  opciones: { conCarrera?: boolean; todosLosTrackeados?: boolean; ahora?: Date } = {},
): Promise<FilaLiga[] | null> {
  // Las tres consultas de acá abajo TIRAN el error en vez de tragárselo, y eso
  // es a propósito. Antes solo se sacaba `data`: si Supabase fallaba —un 504
  // del pool lleno, que en esta base ya pasó— `data` venía undefined, la tabla
  // salía vacía y la pantalla decía "esa semana no jugó nadie" con un 200
  // limpio. Un error invisible que además MIENTE sobre el dato es peor que una
  // pantalla rota: el que lo mira no tiene forma de saber que hubo un problema.
  const consulta = supabase.from("summoners").select("puuid, game_name, tag_line, liga_desde");
  const { data: anotados, error: eAnotados } = await (opciones.todosLosTrackeados
    ? consulta
    : consulta.eq("participa_liga", true));
  if (eAnotados) throw new Error(`No se pudo leer quiénes compiten: ${eAnotados.message}`);
  if (!anotados || anotados.length === 0) return null;

  // La ventana real de esa semana: puede arrancar más tarde que el lunes si es
  // la primera de la liga.
  const desde = torneo.arranca;
  const fin = torneo.cierra;
  const desdeAntes = new Date(desde.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const puuids = anotados.map((s) => s.puuid);
  const { data: snaps, error: eSnaps } = await supabase
    .from("lp_snapshots")
    .select("puuid, tier, division, lp, wins, losses, captured_at")
    .in("puuid", puuids)
    .eq("queue_type", "RANKED_SOLO_5x5")
    .gte("captured_at", desdeAntes)
    .lt("captured_at", fin.toISOString())
    .order("captured_at");
  if (eSnaps) throw new Error(`No se pudieron leer las fotos de LP: ${eSnaps.message}`);

  // Las victorias y las derrotas se cuentan de las partidas REALES de la
  // ventana. Los contadores de lp_snapshots son acumulados de la season y
  // restarlos da bien solo si las dos puntas son válidas — ver la nota en
  // tablaDeLaSemana.
  const { data: partidas, error: ePartidas } = await supabase
    .from("matches")
    // `champion` entra solo para el anuncio: el mensaje de cierre nombra con
    // qué campeón ganó la liga el que la ganó. No toca el puntaje.
    // kills/deaths/assists entran solo para los títulos del cierre (el
    // carnicero, el kamikaze). No tocan el puntaje: la liga se decide por
    // resultado, no por cómo jugaste.
    .select("match_id, puuid, win, played_at, champion, kills, deaths, assists, aliados, game_duration_s")
    .in("puuid", puuids)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    // El MISMO filtro de remakes que /api/liga. Si el cierre contara partidas
    // que la tabla en vivo no cuenta, el campeón que anuncia el bot podría no
    // ser el que la gente vio ganar toda la semana.
    .gte("game_duration_s", DURACION_MINIMA_S)
    // Y el mismo de las derrotas con un aliado ido, por lo mismo: el cierre
    // tiene que contar exactamente las partidas que contó la tabla en vivo o
    // el bot anuncia un campeón que nadie vio ganar.
    .or("win.eq.true,ally_afk.eq.false")
    .gte("played_at", desde.toISOString())
    .lt("played_at", fin.toISOString());
  if (ePartidas) throw new Error(`No se pudieron leer las partidas de esa semana: ${ePartidas.message}`);
  // Y se filtra por el arranque de CADA uno, no solo por el de la semana: el
  // que se anotó el miércoles no puede llevarse las partidas del lunes.
  // En modo rescate el arranque de cada uno es el de la semana y nada más: el
  // `liga_desde` de hoy es posterior a esa semana entera y filtraría TODAS sus
  // partidas, que es justamente por qué volver a anotarlos no arregla el pasado.
  const arranqueDe = new Map(
    anotados.map((s) => [
      s.puuid,
      opciones.todosLosTrackeados ? desde.getTime() : Math.max(desde.getTime(), s.liga_desde ? Date.parse(s.liga_desde) : 0),
    ]),
  );
  // El arranque del último día: sin el mínimo de ese día no se cobra, por más
  // arriba que se haya terminado. Ver MINIMO_ULTIMO_DIA en lib/liga.ts.
  const arrancaUltimoDia = torneo.ultimoDesde.getTime();
  // Y el 00:00 argentino del día que corre, para el parte diario. Sale del lunes
  // más los días corridos, o sea de la MISMA cuadrícula de días calendario que
  // usa la carrera — no de un bloque de 24 horas hacia atrás. Ver diasCorridos.
  const arrancaHoy = desde.getTime() + (diaCorriente(torneo, opciones.ahora ?? new Date()) - 1) * 86400000;
  // Se agrupan y se ORDENAN por fecha antes de contar. Hasta que la liga
  // puntuó por rachas alcanzaba con sumar victorias y derrotas al vuelo, sin
  // mirar el orden; ahora "la cuarta al hilo vale 1,25" depende de en qué
  // secuencia pasaron, así que el cierre tiene que reconstruirla igual que
  // /api/liga o coronaría con un puntaje distinto del que muestra la pantalla.
  const suyasPorPuuid = new Map<string, { match_id: string; win: boolean; played_at: string; champion: string | null; kills: number; deaths: number; assists: number; game_duration_s: number }[]>();
  // El MISMO criterio de vetados que /api/liga, por lo mismo que el de los
  // remakes: si el cierre contara partidas que la tabla en vivo no cuenta, el
  // bot anunciaría un campeón que nadie vio ganar. Acá se saltean en vez de
  // marcarse `anulada` porque el cierre no muestra el historial — solo cuenta.
  const vetados = await cargarVetados(supabase);
  for (const m of partidas ?? []) {
    if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
    if (conVetado(m.aliados, vetados)) continue;
    const arr = suyasPorPuuid.get(m.puuid) ?? [];
    arr.push({ match_id: m.match_id, win: m.win, played_at: m.played_at, champion: m.champion, kills: m.kills, deaths: m.deaths, assists: m.assists, game_duration_s: m.game_duration_s });
    suyasPorPuuid.set(m.puuid, arr);
  }
  // Las fotos por jugador, para poder descartar las derrotas que a Riot no le
  // costaron LP igual que /api/liga. Tiene que ser el MISMO criterio: si el
  // cierre contara una partida que la tabla en vivo no cuenta, el bot
  // anunciaría un campeón que nadie vio ganar.
  const fotosPorPuuid = new Map<string, Snapshot[]>();
  for (const f of (snaps ?? []) as Snapshot[]) {
    const arr = fotosPorPuuid.get(f.puuid) ?? [];
    arr.push(f);
    fotosPorPuuid.set(f.puuid, arr);
  }
  const recordPorPuuid = new Map<string, RecordSemanal>();
  for (const [puuid, todas] of suyasPorPuuid) {
    const lpDeCadaUna = lpAtribuido(
      fotosPorPuuid.get(puuid) ?? [],
      todas.map((m) => ({ matchId: m.match_id, playedAt: m.played_at, duracionS: m.game_duration_s })),
    );
    const suyas = todas.filter((m) => !derrotaMitigada(m.win, lpDeCadaUna.get(m.match_id)));
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
      // Con `ahora` la serie llega hasta HOY y no hasta el domingo: el parte
      // diario necesita el cierre de ayer y el de hoy, y con el fin de semana
      // como referencia una semana en curso devolvería siete días, los últimos
      // repetidos, y el "hoy" saldría siempre 0.
      porDia: opciones.conCarrera
        ? puntosPorDia(
            suyas.map((m) => ({ win: m.win, playedAt: m.played_at })),
            torneo,
            opciones.ahora ?? new Date(fin.getTime() - 1),
          )
        : [],
      // Cuántas jugó hoy, contra el 00:00 argentino de hoy. Se cuenta acá, con
      // las partidas ya filtradas por cola, remake y arranque de cada uno, y no
      // en otra consulta: una segunda consulta con sus propios filtros es una
      // copia que se desincroniza sola.
      hoy: opciones.ahora ? suyas.filter((m) => Date.parse(m.played_at) >= arrancaHoy).length : 0,
      // Los números que los títulos necesitan y el puntaje no da. Se cuentan
      // acá, sobre las mismas partidas ya filtradas, y no en otra consulta.
      detalle: detalleDeSemana(suyas, desde),
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
    desde: opciones.todosLosTrackeados ? null : s.liga_desde ? new Date(s.liga_desde) : null,
  }));
  // Los MISMOS ajustes que lee /api/liga. Si el cierre no los aplicara, el bot
  // anunciaría un podio distinto del que la gente vio toda la semana en la
  // tabla — el mismo motivo por el que el filtro de remakes está en los dos
  // lados.
  const { data: ajustesRows } = await supabase
    .from("liga_ajustes")
    .select("puuid, puntos, motivo")
    .eq("semana", claveDeTorneo(torneo));
  const ajustes = new Map<string, AjusteLiga>(
    (ajustesRows ?? []).map((a) => [a.puuid as string, { puntos: Number(a.puntos), motivo: a.motivo as string }]),
  );

  return tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], desde, fin, recordPorPuuid, ajustes, {
    total: torneo.minimoTotal,
    ultimo: torneo.minimoUltimo,
  });
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
export interface ResumenSemana {
  semana: string;
  dias: string[];
  ganadorPuuid: string | null;
  jugadores: number;
  anotados: number;
  tabla: {
    puuid: string;
    name: string;
    puntos: number;
    victorias: number;
    derrotas: number;
    ultimoDia: number;
    habilitado: boolean;
    champion: string | null;
    porDia: number[];
  }[];
}

/** La foto de una semana a partir de su tabla ya armada. Sin red. */
export function resumenDeTabla(torneo: Torneo, tabla: FilaLiga[]): ResumenSemana {
  const jugaron = tabla.filter((f) => !f.sinJugar);
  const g = ganadorDe(tabla);
  return {
    semana: claveDeTorneo(torneo),
    dias: etiquetasDeDias(torneo),
    ganadorPuuid: g?.puuid ?? null,
    jugadores: jugaron.length,
    // Cuántos estaban anotados esa semana, jugaran o no. Va aparte de
    // `jugadores` para que una tabla vacía pueda explicarse: "no había nadie
    // anotado" y "los seis anotados no tienen partidas guardadas en esa
    // ventana" son dos problemas distintos y el segundo es un bug.
    anotados: tabla.length,
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

/**
 * La foto de una semana: primero la GUARDADA, y recién si no hay, calculada.
 *
 * El orden importa y es la lección del bug: una semana cerrada no se puede
 * reconstruir después. El armado en vivo sale de quién tiene `participa_liga`
 * hoy —un estado del PRESENTE— así que el día que se destildó a todos para
 * rearmar el formato, la semana que ya había cerrado se quedó sin
 * participantes y la pantalla dijo que no había jugado nadie. Y volver a
 * anotarlos tampoco la arregla: `liga_desde` se sella con la fecha de hoy y
 * filtra todas las partidas viejas.
 *
 * Un resultado ya anunciado es un hecho. Se guarda al cerrar y se lee.
 */
export async function comoTerminoLaSemana(
  supabase: SupabaseClient,
  torneo: Torneo,
): Promise<ResumenSemana & { guardada: boolean }> {
  const clave = claveDeTorneo(torneo);
  const { data: fila, error } = await supabase
    .from("liga_semanas")
    .select("resumen")
    .eq("semana", clave)
    .maybeSingle();
  // Un error acá NO corta: la columna `resumen` es nueva y las migraciones de
  // esta base se corren a mano. Si todavía no está, se cae al cálculo en vivo,
  // que es lo que había antes.
  if (error) console.error("liga/semana: no se pudo leer el resumen guardado —", error.message);
  const guardado = (fila?.resumen ?? null) as ResumenSemana | null;
  if (guardado && Array.isArray(guardado.tabla)) return { ...guardado, guardada: true };

  const tabla = (await tablaDeSemanaEnBase(supabase, torneo, { conCarrera: true })) ?? [];
  return { ...resumenDeTabla(torneo, tabla), guardada: false };
}

export async function vistaPreviaDeCierre(
  supabase: SupabaseClient,
  torneo: Torneo,
): Promise<{ texto: string; semana: string; jugadores: number }> {
  const tabla = (await tablaDeSemanaEnBase(supabase, torneo)) ?? [];
  return {
    texto: mensajeDeCierre(torneo, tabla, repartirTitulos(tabla, duracionEnDias(torneo))),
    semana: claveDeTorneo(torneo),
    jugadores: tabla.filter((f) => !f.sinJugar).length,
  };
}

export async function cerrarSemanasPendientes(supabase: SupabaseClient): Promise<ResultadoCierre> {
  // El último torneo que YA terminó. Antes esto era "la semana anterior a la
  // actual", que con ventanas fijas de siete días daba lo mismo; con torneos de
  // duración variable no, porque entre el cierre de uno y el arranque del
  // siguiente puede no haber ninguna relación.
  const anterior = await torneoAnterior(supabase);
  // null = no terminó ninguno. Pasa cuando hay un torneo guardado que cubre
  // estos días y sigue corriendo: el 21/9 el derivado lunes-a-domingo se comió
  // a la semana extendida y el bot anunció un campeón con el torneo en curso.
  // Ver el header de torneoAnterior.
  if (!anterior) {
    return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: "no terminó ningún torneo todavía" };
  }
  const clave = claveDeTorneo(anterior);

  // Antes que nada: que la semana sea DE la liga. La app tiene meses de LP
  // guardado de antes de que esto existiera, y sin esta guarda el cron sale a
  // coronar campeones de semanas en las que nadie estaba compitiendo.
  if (!esTorneoDeLiga(anterior)) {
    return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `${clave} es anterior al arranque de la liga` };
  }

  const { data: yaCerrada } = await supabase.from("liga_semanas").select("semana").eq("semana", clave).maybeSingle();
  if (yaCerrada) return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `${clave} ya estaba cerrada` };

  // Con la carrera: la foto que se guarda incluye el acumulado por día, que es
  // lo que dibuja el gráfico del cartel. Es cálculo puro sobre datos que ya
  // están en memoria, no cuesta una consulta más.
  const tabla = await tablaDeSemanaEnBase(supabase, anterior, { conCarrera: true });
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
    // Y la foto entera de la semana. Ver el comentario de `resumen` en
    // supabase/schema.sql: esto NO se puede reconstruir después.
    resumen: resumenDeTabla(anterior, tabla),
  };
  const { puntos, resumen, ...basicos } = fila;
  let { error } = await supabase.from("liga_semanas").insert({ ...basicos, puntos, resumen });
  // `puntos` es una columna nueva y las migraciones se corren a mano. Si
  // todavía no está, el cierre NO se puede perder por eso: se reintenta sin
  // ella y se avisa fuerte en el log. En cuanto la migración corra, la primera
  // rama vuelve a funcionar sola.
  if (error && /(puntos|resumen)/.test(error.message)) {
    console.error("cerrarSemanasPendientes: faltan columnas de liga_semanas (puntos/resumen) — correr la migración de supabase/schema.sql. Se cierra sin ellas.");
    ({ error } = await supabase.from("liga_semanas").insert(basicos));
  }
  // Choque de clave = otra corrida ganó la carrera. No es un error: es el
  // candado funcionando.
  if (error) return { cerrada: null, ganador: null, lpNeto: null, jugadores: 0, motivo: `no se registró: ${error.message}` };

  await sendDiscordNotification(mensajeDeCierre(anterior, tabla, repartirTitulos(tabla, duracionEnDias(anterior))));

  // La quiniela se paga abajo del cierre, en un mensaje aparte: el del cierre
  // es el que importa y no se le mete ruido. Va envuelto porque la semana YA
  // quedó registrada arriba — si la tabla de apuestas no existe todavía, o
  // Discord se cae acá, eso no puede deshacer un cierre ni hacer que el cron
  // de mañana lo reintente.
  try {
    const apuestas = await apuestasDeLaSemana(supabase, clave);
    if (typeof apuestas === "string") {
      console.error(`cerrarSemanasPendientes: ${apuestas}`);
    } else {
      // `quien` y `aQuien` son game_name pelado, así que el ganador se nombra
      // igual: con el `name#tag` nunca coincidiría el auto-apostado.
      const texto = mensajeDeResultado(apuestas, ganador?.puuid ?? null, ganador?.name ?? null);
      if (texto) await sendDiscordNotification(texto);
    }
  } catch (e) {
    console.error("cerrarSemanasPendientes: falló la quiniela", e);
  }

  return {
    cerrada: clave,
    ganador: ganador ? `${ganador.name}#${ganador.tag}` : null,
    lpNeto: ganador?.lpNeto ?? null,
    jugadores: jugaron.length,
  };
}

/**
 * Rescata la foto de una semana cerrada que se quedó sin participantes.
 *
 * Reconstruye la tabla con TODO el que tenga partidas de ranked en la ventana
 * —ignorando quién está anotado hoy— y la guarda en `liga_semanas.resumen`.
 * Devuelve además cuántos jugadores había registrados en el cierre original,
 * para que el que lo corre pueda ver si coincide antes de creerle: el modo
 * rescate puede meter a alguien trackeado que jugó ranked esa semana sin estar
 * compitiendo.
 *
 * No inventa un ganador nuevo: `ganador_puuid` y `puntos` de la fila no se
 * tocan. Lo único que escribe es la foto.
 */
export async function rescatarResumen(
  supabase: SupabaseClient,
  torneo: Torneo,
): Promise<{ semana: string; reconstruidos: number; registrados: number | null; guardado: boolean; motivo?: string }> {
  const clave = claveDeTorneo(torneo);
  const { data: fila, error: eFila } = await supabase
    .from("liga_semanas")
    .select("jugadores")
    .eq("semana", clave)
    .maybeSingle();
  if (eFila) throw new Error(`No se pudo leer la semana: ${eFila.message}`);
  if (!fila) return { semana: clave, reconstruidos: 0, registrados: null, guardado: false, motivo: "esa semana no está cerrada" };

  const tabla = (await tablaDeSemanaEnBase(supabase, torneo, { conCarrera: true, todosLosTrackeados: true })) ?? [];
  const resumen = resumenDeTabla(torneo, tabla);
  if (resumen.tabla.length === 0) {
    return {
      semana: clave,
      reconstruidos: 0,
      registrados: fila.jugadores ?? null,
      guardado: false,
      motivo: "no hay ninguna partida de ranked guardada en esa ventana",
    };
  }

  const { error } = await supabase.from("liga_semanas").update({ resumen }).eq("semana", clave);
  if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
  return { semana: clave, reconstruidos: resumen.tabla.length, registrados: fila.jugadores ?? null, guardado: true };
}

/**
 * El parte diario del bot: el texto listo para mandar, o null si hoy no va.
 *
 * Sale de la MISMA `tablaDeSemanaEnBase` que el cierre y que el cartel de la
 * semana vieja. Eso no es prolijidad: si el parte armara la tabla por su cuenta,
 * el día que cambie el puntaje habría un mensaje que dice un orden y una
 * pantalla que dice otro — y el parte lo ve todo el grupo.
 *
 * Le pasa `ahora` para que el acumulado por día llegue hasta HOY y no hasta el
 * domingo, que es de donde sale el "hoy +2" de cada uno: el último cierre menos
 * el anterior.
 *
 * Devuelve null cuando no hay nada que mandar —domingo, semana sin arrancar,
 * nadie anotado, o nadie que haya jugado hoy—. Ver `mensajeDelDia` para el
 * porqué de cada caso.
 */
export async function parteDelDia(
  supabase: SupabaseClient,
  ahora: Date = new Date(),
): Promise<{ texto: string | null; motivo?: string }> {
  const torneo = await torneoDe(supabase, ahora);
  if (!esTorneoDeLiga(torneo)) return { texto: null, motivo: "el torneo en curso todavía no es de la liga" };

  const tabla = await tablaDeSemanaEnBase(supabase, torneo, { conCarrera: true, ahora });
  if (!tabla || tabla.length === 0) return { texto: null, motivo: "no hay nadie anotado" };

  const filas: FilaDelDia[] = tabla.map((f) => {
    const serie = f.porDia ?? [0];
    // El último es el cierre de hoy y el anterior el de ayer. Con un solo valor
    // —el lunes, antes de que cierre ningún día— la diferencia es contra el 0
    // del arranque, que es lo correcto: todo lo de hoy es de hoy.
    const hoyCierra = serie[serie.length - 1] ?? 0;
    const ayerCerro = serie.length >= 2 ? serie[serie.length - 2] : 0;
    return { name: f.name, puntos: puntajeDe(f), hoy: hoyCierra - ayerCerro, jugadas: f.hoy ?? 0 };
  });

  const texto = mensajeDelDia(torneo, filas, ahora);
  return texto ? { texto } : { texto: null, motivo: "hoy no hay nada para contar (domingo, o no jugó nadie)" };
}

/**
 * Los números de la semana que no salen del puntaje: días distintos, KDA
 * acumulado, el día más cargado, cuántas con el campeón que más repitió y la
 * seguidilla de victorias más larga. Alimentan los títulos del cierre.
 *
 * Se cuenta sobre las partidas que YA pasaron por todos los filtros (cola,
 * remake, arranque de cada uno). Esa es la única razón por la que vive acá y no
 * en su propio módulo: acá están las partidas buenas.
 */
function detalleDeSemana(
  suyas: { win: boolean; played_at: string; champion: string | null; kills: number; deaths: number; assists: number }[],
  inicio: Date,
): DetalleSemanal {
  const porDia = new Map<number, number>();
  const porCampeon = new Map<string, number>();
  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let rachaMax = 0;
  let racha = 0;

  for (const m of suyas) {
    kills += m.kills;
    deaths += m.deaths;
    assists += m.assists;
    // El día CALENDARIO argentino, la misma cuadrícula que usa la carrera: el
    // índice del día dentro de la semana. Ver diasCorridos.
    const d = Math.floor((Date.parse(m.played_at) - inicio.getTime()) / 86400000);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
    if (m.champion) porCampeon.set(m.champion, (porCampeon.get(m.champion) ?? 0) + 1);
    // `suyas` ya viene ordenada por fecha, que es lo que hace que esto sea una
    // racha y no una cuenta.
    racha = m.win ? racha + 1 : 0;
    if (racha > rachaMax) rachaMax = racha;
  }

  return {
    dias: porDia.size,
    kills,
    deaths,
    assists,
    maratonDia: porDia.size > 0 ? Math.max(...porDia.values()) : 0,
    conSuCampeon: porCampeon.size > 0 ? Math.max(...porCampeon.values()) : 0,
    rachaMax,
  };
}
