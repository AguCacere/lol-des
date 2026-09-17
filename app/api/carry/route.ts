import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { esCarry, mejorCarry, mensajeDeCarry, type CarryCandidate } from "@/lib/carry";
import { DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import { getSupabaseServerClient } from "@/lib/supabase";

/** Cuántas partidas recientes se miran cuando no se pasa un matchId puntual. El mismo número que /api/roast. */
const VENTANA = 20;

interface Fila {
  match_id: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  team_position: string | null;
  dmg_share: number;
  kill_participation: number;
  heal_teammates: number | null;
  shield_teammates: number | null;
  damage_mitigated: number | null;
  skillshots_hit: number | null;
}

const COLUMNAS =
  "match_id, champion, win, kills, deaths, assists, team_position, dmg_share, kill_participation, heal_teammates, shield_teammates, damage_mitigated, skillshots_hit";

function candidata(r: Fila): CarryCandidate {
  return {
    matchId: r.match_id,
    champion: r.champion,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    linea: r.team_position,
    dmgShare: r.dmg_share,
    killParticipation: r.kill_participation,
    healTeammates: r.heal_teammates,
    shieldTeammates: r.shield_teammates,
    damageMitigated: r.damage_mitigated,
    skillshotsHit: r.skillshots_hit,
  };
}

/**
 * POST /api/carry — { gameName, tagLine, matchId?, dryRun? } → manda a Discord
 * la carrileada de una partida YA guardada.
 *
 * El gemelo de /api/roast y existe por lo mismo: el cron solo mira partidas que
 * acaba de insertar y de las últimas tres horas (ver checkCarryAndNotify en
 * lib/refresh.ts), que es lo correcto para el automático —si mirara el
 * historial entero volvería a publicar la misma carrileada cada quince
 * minutos— pero deja afuera querer publicar a mano una partida vieja, o una
 * que quedó guardada antes de que la carrileada existiera. Para eso es esto.
 *
 *   fetch("/api/carry", { method: "POST", headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ gameName: "VORE", tagLine: "CHESS", dryRun: true }) }).then(r => r.json())
 *
 * `dryRun: true` devuelve el texto sin mandarlo. Conviene mirarlo antes: del
 * Discord no se borra tan fácil.
 *
 * Sin `matchId` busca la mejor de las últimas 20 y no manda nada si ninguna
 * califica. Con `matchId` manda esa y punto —si la elegiste a mano, la decisión
 * ya está tomada—; la respuesta igual te dice si cumplía el criterio
 * automático, en `califica`.
 *
 * No hay camino de flex, a diferencia de la cargada: la carrileada necesita
 * team_position, dmg_share y kill_participation, y de flex no se guarda nada.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Manda un mensaje al Discord del grupo: solo los de casa.
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

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

  let query = supabase
    .from("matches")
    .select(COLUMNAS)
    .eq("puuid", summoner.puuid)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID);
  query = matchId
    ? query.eq("match_id", matchId)
    : query
        // Los remakes quedan afuera de la BÚSQUEDA, no de un pedido explícito
        // por match_id: en cuatro minutos se puede terminar 3/0/1 con el 40%
        // del daño de un equipo que no jugó, y eso no es carrear.
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
      { status: 404 },
    );
  }

  const elegida = matchId ? candidata(filas[0]) : mejorCarry(filas.map(candidata));
  if (!elegida) {
    return NextResponse.json({
      sent: false,
      reason: `Ninguna de las últimas ${filas.length} partidas de ${label} califica como carrileada.`,
    });
  }

  const message = mensajeDeCarry(label, elegida);
  if (dryRun) {
    return NextResponse.json({ sent: false, dryRun: true, matchId: elegida.matchId, califica: esCarry(elegida), message });
  }

  // Import perezoso: así el módulo de Discord no se carga en el dryRun.
  const { mandarMensaje } = await import("@/lib/discord");
  const mandado = await mandarMensaje(message);
  return NextResponse.json({
    sent: mandado.ok,
    via: mandado.via,
    matchId: elegida.matchId,
    califica: esCarry(elegida),
    message,
  });
}
