import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { exigirSesion } from "@/lib/auth";
import { getLatestVersion, profileIconUrl } from "@/lib/ddragon";
import { claveDeSemana, esSemanaDeLiga, inicioDeSemana, LIGA_INICIO, tablaDeLaSemana, ventanaDeSemana, type Participante, type Snapshot } from "@/lib/liga";
import { RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";

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
      .select("puuid, win, played_at")
      .in("puuid", puuids)
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .gte("played_at", desdeVentana.toISOString())
      .lt("played_at", fin.toISOString());
    // Se filtra por el arranque de CADA uno y no solo por el de la semana: el
    // que se anotó el miércoles no puede llevarse las partidas del lunes.
    const arranqueDe = new Map(participantes.map((p) => [p.puuid, Math.max(desdeVentana.getTime(), p.desde?.getTime() ?? 0)]));
    // Se juntan las partidas de cada uno antes de contar, en vez de sumar al
    // vuelo: la racha necesita el ORDEN y la consulta no lo garantiza.
    const suyasPorPuuid = new Map<string, { win: boolean; played_at: string }[]>();
    for (const m of partidas ?? []) {
      if (Date.parse(m.played_at) < (arranqueDe.get(m.puuid) ?? 0)) continue;
      const arr = suyasPorPuuid.get(m.puuid) ?? [];
      arr.push({ win: m.win, played_at: m.played_at });
      suyasPorPuuid.set(m.puuid, arr);
    }
    const recordPorPuuid = new Map<string, { victorias: number; derrotas: number; racha: { resultado: "W" | "L"; cantidad: number } | null }>();
    for (const [puuid, suyas] of suyasPorPuuid) {
      const victorias = suyas.filter((m) => m.win).length;
      // De la más nueva hacia atrás, contando mientras el resultado no cambie.
      suyas.sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at));
      const ultimo = suyas[0].win;
      let cantidad = 0;
      for (const m of suyas) {
        if (m.win !== ultimo) break;
        cantidad++;
      }
      recordPorPuuid.set(puuid, {
        victorias,
        derrotas: suyas.length - victorias,
        racha: { resultado: ultimo ? "W" : "L", cantidad },
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
    tabla,
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
