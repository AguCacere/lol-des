import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getActiveGame, getChampionMasteryOn, getLeagueEntriesByPuuid, type RiotActiveGame } from "@/lib/riot";
import { championNameById, championTagsById } from "@/lib/ddragon";
import { asignarRoles, ordenDeRol, type ObservacionesPorRol } from "@/lib/live-roles";
import { queueLabelFromId, divisionFromRiot, tierKeyFromRiot, roleFromTeamPosition } from "@/lib/mapping";
import { RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import type { LiveDetail, LiveParticipant } from "@/lib/types";

/**
 * GET /api/live-detail?gameName=&tagLine= — la partida EN CURSO de un
 * invocador, con los dos equipos: qué campeón juega cada uno, en qué rango
 * está, cuánta maestría tiene con ese campeón y —lo que no se puede mirar en
 * ningún otro lado— cómo te fue a VOS contra ese campeón.
 *
 * Es la única ruta de la app pensada para mirarse DURANTE la selección de
 * campeones, así que se banca costar unas llamadas más: rango y maestría de
 * los cinco rivales son diez llamadas a Riot. Por eso no se pide sola —
 * la dispara un botón, no un poll— y por eso se cachea dos minutos: dentro de
 * la misma partida, nada de esto cambia.
 */
export const dynamic = "force-dynamic";

/** Cuánta gente hay en un equipo de Grieta. Sirve de tope defensivo si Spectator devuelve algo raro. */
const POR_EQUIPO = 5;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const gameName = params.get("gameName");
  const tagLine = params.get("tagLine");
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Faltan gameName y/o tagLine." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin conexión a Supabase." }, { status: 500 });
  }

  const { data: yo } = await supabase
    .from("summoners")
    .select("puuid")
    .eq("game_name", gameName)
    .eq("tag_line", tagLine)
    .maybeSingle();
  if (!yo) return NextResponse.json({ error: "Invocador no encontrado." }, { status: 404 });

  let game: RiotActiveGame | null;
  try {
    game = await getActiveGame(yo.puuid);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Riot no respondió." }, { status: 502 });
  }
  // 404 de Spectator = no está jugando. No es un error: es la respuesta.
  if (!game) return NextResponse.json({ enPartida: false });

  const miTeam = game.participants.find((p) => p.puuid === yo.puuid)?.teamId;
  if (miTeam == null) return NextResponse.json({ enPartida: false });

  // Todos los puuid del grupo, para marcar cuáles de los diez son conocidos.
  const { data: delGrupo } = await supabase.from("summoners").select("puuid");
  const conocidos = new Set((delGrupo ?? []).map((s) => s.puuid));

  const rivalesCrudos = game.participants.filter((p) => p.teamId !== miTeam).slice(0, POR_EQUIPO);
  const aliadosCrudos = game.participants.filter((p) => p.teamId === miTeam).slice(0, POR_EQUIPO);

  // Los campeones primero: sin el nombre no hay nada que mostrar, y el mapa
  // de Data Dragon está cacheado en memoria (no cuesta llamadas).
  const champDe = new Map<number, string>();
  const tagsDe = new Map<number, string[]>();
  for (const p of [...aliadosCrudos, ...rivalesCrudos]) {
    if (champDe.has(p.championId)) continue;
    const nombre = await championNameById(p.championId);
    if (nombre) champDe.set(p.championId, nombre);
    tagsDe.set(p.championId, await championTagsById(p.championId));
  }

  /**
   * En qué línea suele verse cada uno de los diez campeones, según lo que ya
   * vimos nosotros. Cada partida guardada aporta DOS observaciones: la
   * posición en la que jugó el nuestro (champion + team_position) y la del
   * rival de esa misma línea (opponent_champion + el mismo team_position).
   * Es la fuente principal de la estimación de líneas — ver lib/live-roles.ts.
   */
  const enJuego = [...new Set(champDe.values())];
  const observaciones: ObservacionesPorRol = new Map();
  if (enJuego.length > 0) {
    // Las claves de Data Dragon son alfanuméricas ("Kaisa", "MonkeyKing",
    // "KSante"), pero esto se interpola dentro de un filtro de PostgREST:
    // se limpia igual para que un nombre raro no rompa la consulta entera.
    const lista = enJuego.map((c) => `"${c.replace(/[^A-Za-z0-9]/g, "")}"`).join(",");
    const { data: vistas } = await supabase
      .from("matches")
      .select("champion, opponent_champion, team_position")
      .not("team_position", "is", null)
      .or(`champion.in.(${lista}),opponent_champion.in.(${lista})`);
    const anotar = (champ: string | null, pos: string | null) => {
      const rol = roleFromTeamPosition(pos);
      if (!champ || !rol || !enJuego.includes(champ)) return;
      const acc = observaciones.get(champ) ?? {};
      acc[rol] = (acc[rol] ?? 0) + 1;
      observaciones.set(champ, acc);
    };
    for (const fila of vistas ?? []) {
      anotar(fila.champion, fila.team_position);
      anotar(fila.opponent_champion, fila.team_position);
    }
  }

  const rolesRivales = asignarRoles(
    rivalesCrudos.map((p) => ({ champion: champDe.get(p.championId) ?? "", spell1Id: p.spell1Id, spell2Id: p.spell2Id, tags: tagsDe.get(p.championId) })),
    observaciones,
  );
  const rolesAliados = asignarRoles(
    aliadosCrudos.map((p) => ({ champion: champDe.get(p.championId) ?? "", spell1Id: p.spell1Id, spell2Id: p.spell2Id, tags: tagsDe.get(p.championId) })),
    observaciones,
  );

  // Tu historial contra CADA campeón rival, sobre tus partidas guardadas.
  // Es opponent_champion, o sea el rival de tu misma línea — que es
  // justamente el cruce que importa en selección de campeones.
  const championesRivales = rivalesCrudos.map((p) => champDe.get(p.championId)).filter((c): c is string => !!c);
  const vsPorChampion = new Map<string, { wins: number; losses: number }>();
  if (championesRivales.length > 0) {
    const { data: cruces } = await supabase
      .from("matches")
      .select("opponent_champion, win")
      .eq("puuid", yo.puuid)
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .in("opponent_champion", championesRivales);
    for (const fila of cruces ?? []) {
      if (!fila.opponent_champion) continue;
      const acc = vsPorChampion.get(fila.opponent_champion) ?? { wins: 0, losses: 0 };
      if (fila.win) acc.wins++;
      else acc.losses++;
      vsPorChampion.set(fila.opponent_champion, acc);
    }
  }

  /**
   * Rango y maestría de un jugador. Cada uno por su cuenta y sin propagar el
   * error: que a un rival no se le pueda leer el rango no puede dejar sin
   * panel a los otros nueve.
   */
  async function resolver(
    p: RiotActiveGame["participants"][number],
    conRiot: boolean,
    rol: LiveParticipant["rol"],
  ): Promise<LiveParticipant | null> {
    const champion = champDe.get(p.championId);
    if (!champion) return null;

    let rango: LiveParticipant["rango"] = null;
    let maestria: LiveParticipant["maestria"] = null;
    if (conRiot) {
      const [entradas, m] = await Promise.all([
        getLeagueEntriesByPuuid(p.puuid).catch(() => null),
        getChampionMasteryOn(p.puuid, p.championId).catch(() => null),
      ]);
      const solo = entradas?.find((e) => e.queueType === "RANKED_SOLO_5x5");
      if (solo) {
        rango = { tier: tierKeyFromRiot(solo.tier), division: divisionFromRiot(solo.rank), lp: solo.leaguePoints };
      }
      if (m) maestria = { level: m.championLevel, points: m.championPoints };
    }

    return {
      champion,
      rol,
      riotId: p.riotId ?? null,
      esDelGrupo: conocidos.has(p.puuid),
      rango,
      maestria,
      vsVos: vsPorChampion.get(champion) ?? null,
    };
  }

  // Las diez llamadas a Riot van solo para los rivales: del propio equipo, el
  // rango de los que son del grupo ya lo tiene la app, y el de los randoms no
  // le sirve a nadie en selección de campeones.
  const [rivales, aliados] = await Promise.all([
    Promise.all(rivalesCrudos.map((p, i) => resolver(p, true, rolesRivales[i]))),
    Promise.all(aliadosCrudos.map((p, i) => resolver(p, false, rolesAliados[i]))),
  ]);

  // Los dos equipos salen ordenados por línea (top → jungla → mid → adc →
  // support) para que en el panel la fila de cada lado sea el duelo de esa
  // línea, y no dos listas en el orden arbitrario en que Riot las devuelve.
  const porLinea = (a: LiveParticipant, b: LiveParticipant) => ordenDeRol(a.rol) - ordenDeRol(b.rol);

  const detalle: LiveDetail & { enPartida: true } = {
    enPartida: true,
    gameId: game.gameId,
    queueLabel: queueLabelFromId(game.gameQueueConfigId),
    startedMinutesAgo: Math.max(0, Math.floor(game.gameLength / 60)),
    aliados: aliados.filter((p): p is LiveParticipant => p !== null).sort(porLinea),
    rivales: rivales.filter((p): p is LiveParticipant => p !== null).sort(porLinea),
  };

  return NextResponse.json(detalle, {
    // Dos minutos: dentro de la misma partida nada de esto cambia, y evita
    // que dos personas mirando el mismo vivo paguen las diez llamadas dos
    // veces. Más que eso arriesga mostrar una partida ya terminada.
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" },
  });
}
