import { NextResponse } from "next/server";
import { getMatchById } from "@/lib/riot";
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
    const match = await getMatchById(matchId);
    const duracion = match.info.gameDuration;
    return NextResponse.json({
      matchId,
      gameDuration: duracion,
      participantes: match.info.participants.map((p) => ({
        champion: p.championName,
        teamId: p.teamId,
        win: p.win,
        timePlayed: p.timePlayed ?? null,
        // Lo que mira el corte: cuánto le faltó y qué fracción de la partida es.
        faltante: p.timePlayed != null ? duracion - p.timePlayed : null,
        fraccion: p.timePlayed != null && duracion > 0 ? Number(((duracion - p.timePlayed) / duracion).toFixed(3)) : null,
      })),
      aliadoAfk: puuid ? aliadoAfk(match, puuid) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
