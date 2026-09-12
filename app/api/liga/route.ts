import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { exigirSesion } from "@/lib/auth";
import { getLatestVersion, profileIconUrl } from "@/lib/ddragon";
import { claveDeSemana, esSemanaDeLiga, inicioDeSemana, LIGA_INICIO, tablaDeLaSemana, ventanaDeSemana, ventanaUltimoDia, empezoElUltimoDia, puntosDeSecuencia, puntosPorDia, etiquetasDeDias, MINIMO_SEMANAL, MINIMO_ULTIMO_DIA, PUNTOS_VICTORIA, PUNTOS_DERROTA, PUNTOS_EN_RACHA, RACHA_DESDE, lpPorPartida, type Participante, type RecordSemanal, type Snapshot } from "@/lib/liga";
import { RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import { roleFromTeamPosition } from "@/lib/mapping";

/**
 * GET  /api/liga  — la tabla de la semana en curso. Lectura libre: mirar quién
 *                   va ganando no le hace daño a nadie.
 * POST /api/liga  — { puuid, participa } anota o desanota a alguien. Pide la
 *                   contraseña: quién compite por el premio no lo decide
 *                   cualquiera que tenga el link.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const { data: todos } = await supabase
    .from("summoners")
    .select("puuid, game_name, tag_line, profile_icon_id, participa_liga, liga_desde")
    .order("game_name");

  const inicio = inicioDeSemana();
  // `desde` puede no ser el lunes: la primera semana empieza cuando arrancó la
  // liga. Todo lo que se mide va contra esta ventana, no contra el lunes.
  const { desde: desdeVentana, hasta: fin } = ventanaDeSemana();

  const anotados = (todos ?? []).filter((s) => s.participa_liga);
  // Una sola consulta de versión para todos, y si Data Dragon no contesta la
  // tabla sale igual sin avatares — no vale romper la liga por un ícono.
  const version = await getLatestVersion().catch(() => null);
  const participantes: Participante[] = anotados.map((s) => ({
    puuid: s.puuid,
    name: s.game_name,
    tag: s.tag_line,
    profileIconUrl: version && s.profile_icon_id != null ? profileIconUrl(version, s.profile_icon_id) : null,
    desde: s.liga_desde ? new Date(s.liga_desde) : null,
  }));

  // Si la semana en curso es anterior al arranque, no se muestra nada: el LP
  // que ya está guardado es de antes de la liga y contarlo sería empezar el
  // campeonato con marcadores puestos.
  const arrancada = esSemanaDeLiga(inicio);
  // Distinto de `arrancada`: esa dice que la semana CUENTA para la liga (le
  // alcanza con terminar después del pistoletazo). Esta dice que el
  // pistoletazo YA SONÓ. Entre las dos hay un hueco —la primera semana
  // arrancó un lunes 23:30— en el que la tabla se dibujaba como una liga en
  // curso llena de ceros, sin nada que dijera que todavía no había empezado.
  const arrancoYa = Date.now() >= desdeVentana.getTime();

  let tabla: Awaited<ReturnType<typeof tablaDeLaSemana>> = [];
  if (arrancada && participantes.length > 0) {
    // Se pide desde una semana ANTES del lunes: la fila base de cada uno es su
    // última foto previa al arranque, y esa cae fuera de la ventana.
    const desdeAntes = new Date(desdeVentana.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
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
      .select("match_id, puuid, win, played_at, champion, team_position")
      .in("puuid", puuids)
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .gte("played_at", desdeVentana.toISOString())
      .lt("played_at", fin.toISOString());
    // Se filtra por el arranque de CADA uno y no solo por el de la semana: el
    // que se anotó el miércoles no puede llevarse las partidas del lunes.
    const arranqueDe = new Map(participantes.map((p) => [p.puuid, Math.max(desdeVentana.getTime(), p.desde?.getTime() ?? 0)]));
    // Se juntan las partidas de cada uno antes de contar, en vez de sumar al
    // vuelo: la racha necesita el ORDEN y la consulta no lo garantiza.
    const suyasPorPuuid = new Map<string, { match_id: string; win: boolean; played_at: string; champion: string | null; team_position: string | null }[]>();
    for (const m of partidas ?? []) {
      if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
      const arr = suyasPorPuuid.get(m.puuid) ?? [];
      arr.push({ match_id: m.match_id, win: m.win, played_at: m.played_at, champion: m.champion, team_position: m.team_position });
      suyasPorPuuid.set(m.puuid, arr);
    }
    // Las fotos de cada uno, para poder atribuirle el LP a cada partida.
    const fotosPorPuuid = new Map<string, Snapshot[]>();
    for (const f of (snaps ?? []) as Snapshot[]) {
      const arr = fotosPorPuuid.get(f.puuid) ?? [];
      arr.push(f);
      fotosPorPuuid.set(f.puuid, arr);
    }
    /** El valor que más se repite. En un empate gana el primero, que da igual. */
    const masRepetido = <T,>(valores: (T | null)[]): T | null => {
      const cuenta = new Map<T, number>();
      for (const v of valores) if (v != null) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
      let mejor: T | null = null;
      let max = 0;
      for (const [v, n] of cuenta) if (n > max) { mejor = v; max = n; }
      return mejor;
    };
    // El arranque del último día, para contar cuántas jugó ahí. Ver
    // MINIMO_ULTIMO_DIA: sin las tres del domingo no cobra.
    const arrancaUltimoDia = ventanaUltimoDia(inicio).desde.getTime();
    const recordPorPuuid = new Map<string, RecordSemanal>();
    for (const [puuid, suyas] of suyasPorPuuid) {
      const victorias = suyas.filter((m) => m.win).length;
      const ultimoDia = suyas.filter((m) => Date.parse(m.played_at) >= arrancaUltimoDia).length;
      // De la más nueva hacia atrás, contando mientras el resultado no cambie.
      suyas.sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at));
      const ultimo = suyas[0].win;
      let cantidad = 0;
      for (const m of suyas) {
        if (m.win !== ultimo) break;
        cantidad++;
      }
      // De la más vieja a la más nueva, que es como se juega y como hay que
      // recorrerla para contar las rachas.
      const enOrden = [...suyas].reverse().map((m) => m.win);
      // Cuánto valió cada partida, en el mismo orden. Se calcula acá y no en
      // pantalla porque depende de las partidas ANTERIORES —la racha—, y el
      // detalle solo muestra las últimas cinco.
      const valeCadaUna = puntosDeSecuencia(enOrden).cadaUna;
      // Con qué jugó la semana. No es "su campeón" ni "su rol" en general:
      // es lo que eligió ESTA semana, que en una liga de siete días es el
      // dato que explica el número de al lado.
      recordPorPuuid.set(puuid, {
        victorias,
        derrotas: suyas.length - victorias,
        ultimoDia,
        racha: { resultado: ultimo ? "W" : "L", cantidad },
        champion: masRepetido(suyas.map((m) => m.champion)),
        linea: roleFromTeamPosition(masRepetido(suyas.map((m) => m.team_position))),
        // `suyas` quedó ordenada de la más NUEVA a la más vieja por la racha;
        // la curva la necesita al revés, como pasó de verdad.
        secuencia: enOrden,
        // El acumulado día por día, para la carrera de arriba de la tabla. Se
        // calcula acá porque es el único lugar donde están los `played_at`:
        // `secuencia` ya perdió el cuándo y se quedó solo con el resultado.
        porDia: puntosPorDia(
          suyas.map((m) => ({ win: m.win, playedAt: m.played_at })),
          desdeVentana,
        ),
        // Las últimas cinco, con lo que movió cada una. Es lo que se abre al
        // tocar la fila: la forma de terminar la discusión sobre el LP es
        // mostrar partida por partida cuánto dio.
        ultimas: lpPorPartida(
          fotosPorPuuid.get(puuid) ?? [],
          suyas.slice(0, 5).map((m, i) => ({
            matchId: m.match_id,
            champion: m.champion,
            win: m.win,
            // `suyas` va de la más nueva a la más vieja y `valeCadaUna` al
            // revés: el índice se da vuelta.
            puntos: valeCadaUna[suyas.length - 1 - i],
            playedAt: m.played_at,
            lp: null,
            sinLp: null,
            lpTramo: null,
            juntas: 0,
          })),
        ),
      });
    }

    tabla = tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], desdeVentana, fin, recordPorPuuid);
  }

  // El historial de campeones. Poco y al final, que es lo que merece.
  const { data: historial } = await supabase
    .from("liga_semanas")
    .select("semana, ganador_label, lp_neto, jugadores")
    .order("semana", { ascending: false })
    .limit(8);

  return NextResponse.json({
    arrancada,
    arrancoYa,
    arrancaEl: LIGA_INICIO.toISOString(),
    semana: claveDeSemana(inicio),
    desde: desdeVentana.toISOString(),
    hasta: fin.toISOString(),
    // Las condiciones para cobrar, y si el último día ya arrancó. Van en la
    // respuesta y no como constantes en el cliente para que cambiar el número
    // en lib/liga.ts alcance: si el bundle viejo tuviera su propia copia,
    // durante la ventana de caché la pantalla exigiría un mínimo distinto del
    // que aplica el cierre.
    minimoSemanal: MINIMO_SEMANAL,
    minimoUltimoDia: MINIMO_ULTIMO_DIA,
    // La tabla de puntos, por la misma razón: la regla escrita en pantalla
    // tiene que salir de las mismas constantes que la calculan.
    puntaje: { victoria: PUNTOS_VICTORIA, derrota: PUNTOS_DERROTA, rachaDesde: RACHA_DESDE, enRacha: PUNTOS_EN_RACHA },
    ultimoDia: empezoElUltimoDia(inicio),
    // Los días ya corridos, para el eje de la carrera. Van del server porque
    // el huso es argentino y el cliente está en el reloj del que mira.
    dias: etiquetasDeDias(desdeVentana),
    tabla,
    // Para que la tabla pueda pedirle el arte del campeón a Data Dragon.
    ddragonVersion: version,
    // Todos los trackeados, para que el panel de administración pueda anotar y
    // desanotar sin pedir el ladder entero.
    plantel: (todos ?? []).map((s) => ({
      puuid: s.puuid,
      name: s.game_name,
      tag: s.tag_line,
      participa: Boolean(s.participa_liga),
    })),
    historial: historial ?? [],
  });
}

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { puuid?: unknown; participa?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  if (typeof body.puuid !== "string" || typeof body.participa !== "boolean") {
    return NextResponse.json({ error: "Faltan puuid y/o participa." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  // Se sella el momento de entrada. Al desanotar se borra, así que volver a
  // entrar arranca de cero y no recupera lo de la primera vuelta.
  const { error } = await supabase
    .from("summoners")
    .update({ participa_liga: body.participa, liga_desde: body.participa ? new Date().toISOString() : null })
    .eq("puuid", body.puuid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
