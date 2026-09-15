import { NextResponse } from "next/server";
import { getMatchById, getMatchTimeline } from "@/lib/riot";
import { minutosSinJugar } from "@/lib/timeline";
import { aliadoAfk } from "@/lib/refresh";
import { exigirSesion } from "@/lib/auth";

/**
 * TEMPORAL — se borra apenas quede decidido el umbral de `aliadoAfk`.
 *
 * Existe porque el corte de AFK se calibró a ojo y la primera partida real
 * que tenía que agarrar (un Rakan de 29:52 donde se fue uno) salió en false.
 * Sin ver los `timePlayed` de los diez, mover el umbral sería adivinar dos
 * veces seguidas. Desde el sandbox no hay salida a la API de Riot, así que
 * el único lugar donde se pueden mirar es acá, en el server de la app.
 *
 *   GET /api/debug-afk?match=LA2_1624360711&puuid=...
 *
 * `puuid` es opcional: sin él solo lista a los diez; con él, además contesta
 * qué le daría `aliadoAfk` a ESA fila.
 */
export async function GET(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  const url = new URL(req.url);
  const matchId = url.searchParams.get("match");
  const puuid = url.searchParams.get("puuid");
  if (!matchId) return NextResponse.json({ error: "Falta ?match=LA2_..." }, { status: 400 });

  try {
    const [match, timeline] = await Promise.all([
      getMatchById(matchId),
      // Si el timeline no viene, la respuesta igual sirve: se ve el
      // `timePlayed`, que es el respaldo que usa aliadoAfk en ese caso.
      getMatchTimeline(matchId).catch(() => null),
    ]);
    const duracion = match.info.gameDuration;
    return NextResponse.json({
      matchId,
      gameDuration: duracion,
      timeline: timeline ? "ok" : "no vino",
      participantes: match.info.participants.map((p) => ({
        champion: p.championName,
        teamId: p.teamId,
        win: p.win,
        nivel: p.champLevel,
        // El dato que decide: minutos seguidos sin ganar experiencia.
        minutosSinJugar: timeline ? minutosSinJugar(timeline, p.participantId) : null,
        timePlayed: p.timePlayed ?? null,
        faltante: p.timePlayed != null ? duracion - p.timePlayed : null,
      })),
      aliadoAfk: puuid ? aliadoAfk(match, puuid, timeline) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
