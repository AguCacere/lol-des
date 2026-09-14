import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { dossierHash, generateCoachReport, type CoachDossier, type CoachReport } from "@/lib/coach";
import { computeMatchups, type MatchupSample } from "@/lib/matchups";
import { roleFromTeamPosition } from "@/lib/mapping";
import { ROLES, tierFor } from "@/lib/ladder";
import { DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import { exigirSesion } from "@/lib/auth";
import { winrateExacto } from "@/lib/winrate";

// El análisis piensa un rato (adaptive thinking sobre un dossier de ~2k
// tokens). No es una consulta de lectura, es una llamada a un modelo.
export const maxDuration = 300;

/** Partidas nuevas desde el último informe a partir de las cuales vale regenerarlo. */
const STALE_MATCHES = 10;
/** Y días desde el último, para que un informe viejo no quede congelado aunque el jugador no sume partidas. */
const STALE_DAYS = 7;

interface MatchRow {
  champion: string;
  win: boolean;
  opponent_champion: string | null;
  kills: number;
  deaths: number;
  assists: number;
  gold_diff_15: number | null;
}

/**
 * POST /api/coach — { gameName, tagLine, force? } → análisis del pool de UN
 * jugador hecho por Claude sobre sus datos reales (ver lib/coach.ts).
 *
 * Cachea en `coach_reports` y regenera solo cuando cambió algo: cada llamada
 * cuesta plata, y el informe no cambia porque alguien abra la pestaña de
 * nuevo. `force: true` lo regenera igual.
 *
 * Requiere ANTHROPIC_API_KEY en el entorno y la tabla coach_reports creada
 * (ver supabase/schema.sql).
 */
export async function POST(req: Request) {
  let body: { gameName?: string; tagLine?: string; force?: boolean; peek?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  const { gameName, tagLine, force, peek } = body;
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Faltan gameName y/o tagLine." }, { status: 400 });
  }

  // Acá el portero es más fino que en el resto: LEER el informe guardado no
  // cuesta nada y lo puede ver cualquiera (es lo que hace `peek` al abrir el
  // perfil). Lo que se cierra es GENERARLO, que es lo que se paga por token.
  if (!peek) {
    const cerrado = exigirSesion(req);
    if (cerrado) return cerrado;
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin conexión a Supabase." }, { status: 500 });
  }

  const { data: summoner } = await supabase
    .from("ladder")
    .select("puuid, game_name, role, tier, division, lp")
    .eq("game_name", gameName)
    .eq("tag_line", tagLine)
    .maybeSingle();
  if (!summoner) {
    return NextResponse.json({ error: "Invocador no encontrado." }, { status: 404 });
  }

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select("champion, win, opponent_champion, kills, deaths, assists, gold_diff_15, team_position")
    .eq("puuid", summoner.puuid)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    // Sin remakes: cuatro minutos sin farmear le hunden el CS por minuto y el
    // gold diff a los 15 que no existe, y el consejo sale de ahí. Ver
    // DURACION_MINIMA_S.
    .gte("game_duration_s", DURACION_MINIMA_S)
    .returns<(MatchRow & { team_position: string | null })[]>();
  if (matchesError) {
    return NextResponse.json({ error: `Error leyendo partidas: ${matchesError.message}` }, { status: 500 });
  }
  const rows = matchRows ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Todavía no hay partidas guardadas para analizar." }, { status: 400 });
  }

  const { data: cached } = await supabase
    .from("coach_reports")
    .select("payload, matches_at_generation, generated_at, dossier_hash")
    .eq("puuid", summoner.puuid)
    .maybeSingle();

  // `peek` solo mira el caché y NUNCA llama al modelo. Lo usa el panel al
  // montarse para mostrar un informe que ya existe sin que abrir la pestaña
  // sea una llamada paga.
  if (peek) {
    return cached
      ? NextResponse.json({ report: cached.payload as CoachReport, generatedAt: cached.generated_at, cached: true })
      : NextResponse.json({ report: null });
  }

  // Pool por campeón. Se agrega acá y no se reusa el de /api/ladder porque
  // ese arma el ladder entero para todos: para un solo jugador es una query
  // enfocada y quince líneas.
  const porChamp = new Map<string, { games: number; wins: number; k: number; d: number; a: number }>();
  const rolFreq = new Map<string, number>();
  for (const r of rows) {
    const agg = porChamp.get(r.champion) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0 };
    agg.games += 1;
    agg.wins += r.win ? 1 : 0;
    agg.k += r.kills;
    agg.d += r.deaths;
    agg.a += r.assists;
    porChamp.set(r.champion, agg);
    const rol = roleFromTeamPosition(r.team_position);
    if (rol) rolFreq.set(rol, (rolFreq.get(rol) ?? 0) + 1);
  }
  const pool = [...porChamp.entries()]
    .map(([champ, s]) => ({
      champ,
      games: s.games,
      wins: s.wins,
      winrate: winrateExacto(s.wins, s.games),
      avgKda: Number(((s.k + s.a) / Math.max(1, s.d)).toFixed(2)),
    }))
    .sort((a, b) => b.games - a.games)
    // Diez alcanzan: más abajo son campeones de una o dos partidas, que no
    // sostienen ninguna conclusión y solo suman tokens al dossier.
    .slice(0, 10);

  const samples: MatchupSample[] = rows.map((r) => ({
    champ: r.champion,
    opponent: r.opponent_champion,
    win: r.win,
    goldDiff15: r.gold_diff_15,
  }));

  const { data: masteryRows } = await supabase
    .from("champion_mastery")
    .select("champion, level")
    .eq("puuid", summoner.puuid)
    .order("points", { ascending: false });

  const rolTop = [...rolFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const t = summoner.tier ? tierFor(summoner.tier.toLowerCase() as Parameters<typeof tierFor>[0]) : null;

  const dossier: CoachDossier = {
    gameName: summoner.game_name,
    rol: rolTop ? ROLES[rolTop as keyof typeof ROLES].label : "sin rol definido",
    rango: t ? `${t.name} ${summoner.division} · ${summoner.lp} LP` : "sin rango",
    totalPartidas: rows.length,
    pool,
    matchups: computeMatchups(samples),
    maestria: (masteryRows ?? []).map((m) => ({ champ: m.champion, level: m.level })),
  };

  // El corte que hace que regenerar sin haber jugado no cueste nada: si el
  // dossier es idéntico al de la última vez, la entrada del modelo sería la
  // misma byte por byte y la salida no puede aportar nada nuevo. Se devuelve
  // lo cacheado sin llamar, incluso con force. (La API no tiene memoria entre
  // llamadas: el modelo no "recuerda" el informe anterior, así que la única
  // forma de no pagar de nuevo es no llamar.)
  const hash = dossierHash(dossier);
  if (cached && cached.dossier_hash === hash) {
    return NextResponse.json({
      report: cached.payload as CoachReport,
      generatedAt: cached.generated_at,
      cached: true,
      unchanged: true,
    });
  }

  // Cambió algo, pero si cambió poco no vale regenerar solo: los umbrales
  // gobiernan la regeneración automática, no la que pide el usuario a mano.
  if (cached && !force) {
    const dias = (Date.now() - new Date(cached.generated_at).getTime()) / 86_400_000;
    const nuevas = rows.length - cached.matches_at_generation;
    if (nuevas < STALE_MATCHES && dias < STALE_DAYS) {
      return NextResponse.json({ report: cached.payload as CoachReport, generatedAt: cached.generated_at, cached: true });
    }
  }

  let report: CoachReport;
  try {
    report = await generateCoachReport(dossier);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("coach failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const generatedAt = new Date().toISOString();
  const { error: saveError } = await supabase
    .from("coach_reports")
    .upsert({
      puuid: summoner.puuid,
      payload: report,
      matches_at_generation: rows.length,
      dossier_hash: hash,
      generated_at: generatedAt,
    });
  // Un fallo al guardar no invalida el informe: ya está generado y pagado,
  // así que se devuelve igual y a lo sumo la próxima vez se regenera.
  if (saveError) console.error("coach: no se pudo cachear el informe —", saveError.message);

  return NextResponse.json({ report, generatedAt, cached: false });
}
