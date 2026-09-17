import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isDisaster, roastMessage, worstDisaster, type RoastCandidate } from "@/lib/roast";
import { candidatasDeFlex, DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import { exigirSesion } from "@/lib/auth";

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
 * `flex: true` mira las últimas de flex preguntándole a Riot en vivo, porque
 * de esa cola no se guarda nada (ver RANKED_FLEX_QUEUE_ID en lib/refresh.ts).
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
  // Cuesta llamadas a Riot, plata o el Discord del grupo: solo los de casa.
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { gameName?: string; tagLine?: string; matchId?: string; dryRun?: boolean; flex?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  const { gameName, tagLine, matchId, dryRun, flex } = body;
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

  // `flex: true` no toca la base porque de flex no se guarda nada: se le
  // preguntan las últimas a Riot en el momento (ver candidatasDeFlex).
  if (flex) {
    const peorFlex = worstDisaster(await candidatasDeFlex(summoner.puuid, null));
    if (!peorFlex) {
      return NextResponse.json({ sent: false, reason: `Ninguna partida reciente de flex de ${label} califica.` });
    }
    const texto = roastMessage(label, peorFlex);
    if (dryRun) return NextResponse.json({ sent: false, dryRun: true, matchId: peorFlex.matchId, message: texto });
    const { mandarMensaje } = await import("@/lib/discord");
    const mandado = await mandarMensaje(texto);
    return NextResponse.json({ sent: mandado.ok, via: mandado.via, matchId: peorFlex.matchId, message: texto });
  }

  const columnas = "match_id, champion, win, kills, deaths, assists, dmg_share, cs, cs_per_min";
  let query = supabase
    .from("matches")
    .select(columnas)
    .eq("puuid", summoner.puuid)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID);
  query = matchId
    ? query.eq("match_id", matchId)
    // Los remakes quedan afuera de la BÚSQUEDA de la peor, pero no de un
    // pedido explícito por match_id: si alguien pasa el id a mano, que la ruta
    // conteste de esa partida y no "no la encuentro". Cuatro minutos donde
    // nadie hizo nada dejan un 0/2/0 que gana la pulseada de "la peor" sin que
    // haya pasado nada. Ver DURACION_MINIMA_S.
    : query
        .gte("game_duration_s", DURACION_MINIMA_S)
        .order("played_at", { ascending: false })
        .limit(VENTANA);

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
  const { mandarMensaje } = await import("@/lib/discord");
  const mandado = await mandarMensaje(message);
  return NextResponse.json({
    sent: mandado.ok,
    // Por dónde salió. Un "webhook" acá con el bot configurado significa que el
    // camino del bot falló y se usó el respaldo — ver /api/discord/probar.
    via: mandado.via,
    matchId: elegida.matchId,
    califica: isDisaster(elegida),
    message,
  });
}
