import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { exigirSesion } from "@/lib/auth";
import { DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import {
  METRICAS,
  MINIMO_BASELINE,
  baselineDe,
  diagnostico,
  evaluarObjetivo,
  matchupsDeMejora,
  objetivoSugerido,
  patrones,
  progreso,
  type ClaveMetrica,
  type Comparador,
  type Objetivo,
  type PartidaMejora,
} from "@/lib/mejora";

export const dynamic = "force-dynamic";

/**
 * GET /api/mejora?puuid=… — todo lo que dibuja la pestaña Mejora, para UNA
 * persona.
 *
 * Ruta propia y no un campo más de `/api/ladder` por una razón concreta: acá
 * se leen columnas que el ladder NO trae en su agregado (gold_diff_10 y _20
 * solo viajan para las últimas cinco partidas de cada uno) y se leen para
 * TODO el historial. Meterlas en el ladder sería traerlas para los catorce
 * cuando se miran de a uno — y ese select ya es el pedido más pesado de la
 * app contra una base Nano de 15 conexiones. Acá es un jugador por vez.
 *
 * Sin caché de CDN a propósito: la pestaña se abre justo después de jugar,
 * para ver cómo salió la última, y cuatro minutos de caché es exactamente el
 * momento en que el dato importa.
 */

/** Las columnas que necesita el motor, y ninguna más. */
const COLUMNAS =
  "match_id, champion, opponent_champion, team_position, win, played_at, game_duration_s, kills, deaths, assists, cs_per_min, vision_score, kill_participation, damage_to_champs, gold_diff_10, gold_diff_15, gold_diff_20";

interface FilaMejora {
  match_id: string;
  champion: string;
  opponent_champion: string | null;
  team_position: string | null;
  win: boolean;
  played_at: string;
  game_duration_s: number;
  kills: number;
  deaths: number;
  assists: number;
  cs_per_min: number;
  vision_score: number;
  kill_participation: number | null;
  damage_to_champs: number;
  gold_diff_10: number | null;
  gold_diff_15: number | null;
  gold_diff_20: number | null;
}

function aPartida(r: FilaMejora): PartidaMejora {
  return {
    matchId: r.match_id,
    champion: r.champion,
    oponente: r.opponent_champion,
    rol: r.team_position,
    win: r.win,
    playedAt: r.played_at,
    duracionS: r.game_duration_s,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    csPorMin: Number(r.cs_per_min),
    visionScore: r.vision_score,
    participacion: Number(r.kill_participation ?? 0),
    danoAChampions: r.damage_to_champs,
    goldDiff10: r.gold_diff_10,
    goldDiff15: r.gold_diff_15,
    goldDiff20: r.gold_diff_20,
  };
}

interface FilaObjetivo {
  id: string;
  puuid: string;
  metrica: string;
  comparador: string;
  umbral: number;
  ventana: number;
  creado_at: string;
  cerrado_at: string | null;
}

const CLAVES = new Set<string>(METRICAS.map((m) => m.clave));

function aObjetivo(f: FilaObjetivo): Objetivo | null {
  // Una métrica que ya no existe en el catálogo no rompe la pantalla: se
  // ignora esa fila. Pasa si algún día se saca una métrica y quedan
  // objetivos viejos apuntándole.
  if (!CLAVES.has(f.metrica)) return null;
  return {
    id: f.id,
    puuid: f.puuid,
    metrica: f.metrica as ClaveMetrica,
    comparador: f.comparador === "lte" ? "lte" : "gte",
    umbral: Number(f.umbral),
    ventana: f.ventana,
    creadoAt: f.creado_at,
    cerradoAt: f.cerrado_at,
  };
}

/**
 * `objetivos` puede no existir todavía: la migración la corre el usuario a
 * mano desde el editor de Supabase, y el código se despliega antes. Postgres
 * contesta 42P01 ("undefined_table"), y eso NO es un error que deba tirar la
 * pantalla abajo — todo lo demás de Mejora sale de `matches`.
 */
const TABLA_NO_EXISTE = "42P01";

export async function GET(req: Request) {
  const puuid = new URL(req.url).searchParams.get("puuid");
  if (!puuid) return NextResponse.json({ error: "Falta el puuid." }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("matches")
    .select(COLUMNAS)
    .eq("puuid", puuid)
    // Las mismas dos reglas que el resto de la app: solo ranked solo/duo y sin
    // remakes. Si esto no filtrara, una partida de cuatro minutos entraría al
    // historial como una derrota con cero de todo y correría todas las medianas.
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    .gte("game_duration_s", DURACION_MINIMA_S)
    .order("played_at", { ascending: false })
    .returns<FilaMejora[]>();

  if (error) {
    return NextResponse.json({ error: `Error leyendo las partidas: ${error.message}` }, { status: 500 });
  }

  const partidas = (data ?? []).map(aPartida);

  // El objetivo activo, si la tabla existe.
  let objetivo: Objetivo | null = null;
  let historialObjetivos: Objetivo[] = [];
  let faltaMigracion = false;
  const { data: objs, error: errObj } = await supabase
    .from("objetivos")
    .select("id, puuid, metrica, comparador, umbral, ventana, creado_at, cerrado_at")
    .eq("puuid", puuid)
    .order("creado_at", { ascending: false })
    .returns<FilaObjetivo[]>();
  if (errObj) {
    if (errObj.code === TABLA_NO_EXISTE) faltaMigracion = true;
    else return NextResponse.json({ error: `Error leyendo los objetivos: ${errObj.message}` }, { status: 500 });
  } else {
    const todos = (objs ?? []).map(aObjetivo).filter((o): o is Objetivo => o !== null);
    objetivo = todos.find((o) => o.cerradoAt === null) ?? null;
    historialObjetivos = todos.filter((o) => o.cerradoAt !== null);
  }

  // La línea de base de cada métrica, para poder sugerir umbrales y para que
  // la pantalla sepa cuáles tienen muestra suficiente.
  const bases = METRICAS.map((m) => {
    const b = baselineDe(partidas, m.clave);
    return b ? { ...b, sugerido: objetivoSugerido(b) } : null;
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  // El diagnóstico de la ÚLTIMA partida, contra todo lo anterior a ella.
  const ultima = partidas[0] ?? null;
  const diag = ultima ? diagnostico(ultima, partidas.slice(1)) : null;

  // El progreso se muestra de la métrica del objetivo si hay uno; si no, de
  // la que más patrón en contra tenga; y si tampoco, de la primera con base.
  const pats = patrones(partidas);
  const enContra = pats.find((p) => p.tono === "bad");
  const claveProgreso: ClaveMetrica | null =
    objetivo?.metrica ?? enContra?.metrica ?? bases[0]?.metrica ?? null;

  return NextResponse.json(
    {
      partidas: partidas.length,
      minimoBaseline: MINIMO_BASELINE,
      ultima: ultima ? { matchId: ultima.matchId, champion: ultima.champion, win: ultima.win, playedAt: ultima.playedAt } : null,
      diagnostico: diag,
      patrones: pats,
      progreso: claveProgreso ? progreso(partidas, claveProgreso) : null,
      matchups: matchupsDeMejora(partidas).slice(0, 6),
      bases,
      objetivo: objetivo ? evaluarObjetivo(objetivo, partidas) : null,
      historialObjetivos,
      faltaMigracion,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST /api/mejora — guarda un objetivo nuevo, o cierra el activo.
 *
 * `{ puuid, metrica, comparador, umbral, ventana }` crea uno.
 * `{ puuid, cerrar: true }` cierra el que esté abierto.
 *
 * Pide sesión: escribe.
 */
export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: {
    puuid?: unknown;
    metrica?: unknown;
    comparador?: unknown;
    umbral?: unknown;
    ventana?: unknown;
    cerrar?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  if (typeof body.puuid !== "string") {
    return NextResponse.json({ error: "Falta el puuid." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const avisoDeMigracion =
    "La tabla `objetivos` todavía no existe en la base. Está en supabase/schema.sql: hay que correrla una vez desde el editor de Supabase.";

  if (body.cerrar === true) {
    const { error } = await supabase
      .from("objetivos")
      .update({ cerrado_at: new Date().toISOString() })
      .eq("puuid", body.puuid)
      .is("cerrado_at", null);
    if (error) {
      if (error.code === TABLA_NO_EXISTE) return NextResponse.json({ error: avisoDeMigracion }, { status: 503 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Validación contra el catálogo real, no contra lo que mande el cliente.
  if (typeof body.metrica !== "string" || !CLAVES.has(body.metrica)) {
    return NextResponse.json({ error: "Métrica desconocida." }, { status: 400 });
  }
  if (body.comparador !== "gte" && body.comparador !== "lte") {
    return NextResponse.json({ error: "El comparador tiene que ser gte o lte." }, { status: 400 });
  }
  if (typeof body.umbral !== "number" || !Number.isFinite(body.umbral)) {
    return NextResponse.json({ error: "El umbral tiene que ser un número." }, { status: 400 });
  }
  const ventana = typeof body.ventana === "number" ? Math.round(body.ventana) : 5;
  if (ventana < 3 || ventana > 20) {
    return NextResponse.json({ error: "La ventana va de 3 a 20 partidas." }, { status: 400 });
  }

  // Uno activo a la vez: se cierra el anterior antes de abrir el nuevo. El
  // índice único parcial de la base lo respalda — si dos pestañas guardan a
  // la vez, una falla en vez de dejar dos activos.
  const { error: errCerrar } = await supabase
    .from("objetivos")
    .update({ cerrado_at: new Date().toISOString() })
    .eq("puuid", body.puuid)
    .is("cerrado_at", null);
  if (errCerrar) {
    if (errCerrar.code === TABLA_NO_EXISTE) return NextResponse.json({ error: avisoDeMigracion }, { status: 503 });
    return NextResponse.json({ error: errCerrar.message }, { status: 500 });
  }

  const { error } = await supabase.from("objetivos").insert({
    puuid: body.puuid,
    metrica: body.metrica,
    comparador: body.comparador as Comparador,
    umbral: body.umbral,
    ventana,
  });
  if (error) {
    if (error.code === TABLA_NO_EXISTE) return NextResponse.json({ error: avisoDeMigracion }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
