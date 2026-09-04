import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isDisaster, roastMessage, worstDisaster, type RoastCandidate } from "@/lib/roast";
import { RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";

/** Cuántas partidas recientes se miran cuando no se pasa un matchId puntual. */
const VENTANA = 20;

interface Fila {
  match_id: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  dmg_share: number | null;
  cs: number | null;
  cs_per_min: number | null;
}

function candidato(r: Fila): RoastCandidate {
  return {
    matchId: r.match_id,
    champion: r.champion,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    dmgShare: r.dmg_share,
    cs: r.cs,
    csPerMin: r.cs_per_min,
  };
}

/**
 * POST /api/roast — { gameName, tagLine, matchId?, dryRun? } → manda a
 * Discord la cargada de una partida YA guardada.
 *
 * Existe porque el cron solo carga partidas que acaba de insertar (ver
 * checkDisasterAndNotify en lib/refresh.ts), y eso es lo correcto para el
 * automático: si mirara el historial entero volvería a publicar el mismo
 * 0/13 cada quince minutos. Pero deja afuera el caso de querer publicar a
 * mano una partida vieja, o una que quedó guardada antes de que existiera la
 * cargada. Para eso es esto.
 *
 *   fetch("/api/roast", { method: "POST", headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ gameName: "Nombre", tagLine: "LAS", dryRun: true }) }).then(r => r.json())
 *
 * `dryRun: true` devuelve el texto sin mandarlo — conviene verlo antes de
 * publicarlo en el canal, porque de Discord no se borra tan fácil.
 *
 * Sin `matchId` busca la peor de las últimas 20 ranked (ver VENTANA) y no manda
 * nada si ninguna califica. Con `matchId` manda esa y punto: si la elegiste
 * a mano, la decisión ya está tomada — la respuesta igual te dice si cumplía
 * el criterio automático.
 */
export async function POST(req: Request) {
  let body: { gameName?: string; tagLine?: string; matchId?: string; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  const { gameName, tagLine, matchId, dryRun } = body;
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Faltan gameName y/o tagLine." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin conexión a Supabase." }, { status: 500 });
  }

  const { data: summoner } = await supabase
    .from("summoners")
    .select("puuid, game_name, tag_line")
    .eq("game_name", gameName)
    .eq("tag_line", tagLine)
    .maybeSingle();
  if (!summoner) {
    return NextResponse.json({ error: "Invocador no encontrado." }, { status: 404 });
  }
  const label = `${summoner.game_name}#${summoner.tag_line}`;

  const columnas = "match_id, champion, win, kills, deaths, assists, dmg_share, cs, cs_per_min";
  let query = supabase
    .from("matches")
    .select(columnas)
    .eq("puuid", summoner.puuid)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID);
  query = matchId
    ? query.eq("match_id", matchId)
    : query.order("played_at", { ascending: false }).limit(VENTANA);

  const { data: filas, error } = await query.returns<Fila[]>();
  if (error) {
    return NextResponse.json({ error: `Error leyendo partidas: ${error.message}` }, { status: 500 });
  }
  if (!filas || filas.length === 0) {
    return NextResponse.json(
      { error: matchId ? `No hay ninguna partida ${matchId} guardada para ${label}.` : "No hay partidas guardadas." },
      { status: 404 }
    );
  }

  const elegida = matchId ? candidato(filas[0]) : worstDisaster(filas.map(candidato));
  if (!elegida) {
    return NextResponse.json({
      sent: false,
      reason: `Ninguna de las últimas ${filas.length} partidas de ${label} califica como desastre.`,
    });
  }

  const message = roastMessage(label, elegida);
  if (dryRun) {
    return NextResponse.json({ sent: false, dryRun: true, matchId: elegida.matchId, message });
  }

  // Import perezoso: así el módulo de Discord no se carga en el dryRun.
  const { sendDiscordNotification } = await import("@/lib/discord");
  await sendDiscordNotification(message);
  return NextResponse.json({
    sent: true,
    matchId: elegida.matchId,
    califica: isDisaster(elegida),
    message,
  });
}
