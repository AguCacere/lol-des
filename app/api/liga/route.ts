import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { exigirSesion } from "@/lib/auth";
import { getLatestVersion, profileIconUrl } from "@/lib/ddragon";
import { claveDeSemana, finDeSemana, inicioDeSemana, tablaDeLaSemana, type Participante, type Snapshot } from "@/lib/liga";

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
    .select("puuid, game_name, tag_line, profile_icon_id, participa_liga")
    .order("game_name");

  const inicio = inicioDeSemana();
  const fin = finDeSemana(inicio);

  const anotados = (todos ?? []).filter((s) => s.participa_liga);
  // Una sola consulta de versión para todos, y si Data Dragon no contesta la
  // tabla sale igual sin avatares — no vale romper la liga por un ícono.
  const version = await getLatestVersion().catch(() => null);
  const participantes: Participante[] = anotados.map((s) => ({
    puuid: s.puuid,
    name: s.game_name,
    tag: s.tag_line,
    profileIconUrl: version && s.profile_icon_id != null ? profileIconUrl(version, s.profile_icon_id) : null,
  }));

  let tabla: Awaited<ReturnType<typeof tablaDeLaSemana>> = [];
  if (participantes.length > 0) {
    // Se pide desde una semana ANTES del lunes: la fila base de cada uno es su
    // última foto previa al arranque, y esa cae fuera de la ventana.
    const desdeAntes = new Date(inicio.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { data: snaps } = await supabase
      .from("lp_snapshots")
      .select("puuid, tier, division, lp, wins, losses, captured_at")
      .in("puuid", anotados.map((s) => s.puuid))
      .gte("captured_at", desdeAntes)
      .lt("captured_at", fin.toISOString())
      .order("captured_at");
    tabla = tablaDeLaSemana(participantes, (snaps ?? []) as Snapshot[], inicio, fin);
  }

  // El historial de campeones. Poco y al final, que es lo que merece.
  const { data: historial } = await supabase
    .from("liga_semanas")
    .select("semana, ganador_label, lp_neto, jugadores")
    .order("semana", { ascending: false })
    .limit(8);

  return NextResponse.json({
    semana: claveDeSemana(inicio),
    desde: inicio.toISOString(),
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

  const { error } = await supabase
    .from("summoners")
    .update({ participa_liga: body.participa })
    .eq("puuid", body.puuid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
