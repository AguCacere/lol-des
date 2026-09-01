import { NextResponse } from "next/server";
import { getAccountByRiotId, getMatchById, getMatchIdsByPuuid } from "@/lib/riot";

// One-shot diagnostic — the user can't run a local Node script (no local
// clone with the real RIOT_API_KEY), so this runs the exact same recursive
// /aegis|valor/i scan as their scripts/inspect-aegis.mjs, but as a route on
// the deployed app, which already has the real key. DELETE once we've looked.
export const maxDuration = 60;

interface Hit {
  path: string;
  value: unknown;
}

/** Recursively scans EVERY key and string value for /aegis|valor/i — not narrowed to any field we already know about, since we don't know what Riot would call this internally (if it exposes it at all). */
function findAegisClues(obj: unknown, path = "", hits: Hit[] = []): Hit[] {
  if (obj === null || obj === undefined || typeof obj !== "object") return hits;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (/aegis|valor/i.test(key)) hits.push({ path: childPath, value });
    if (typeof value === "string" && /aegis|valor/i.test(value)) hits.push({ path: childPath, value });
    findAegisClues(value, childPath, hits);
  }
  return hits;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName") ?? "marlboro de diez";
  const tagLine = searchParams.get("tagLine") ?? "LAS";
  const count = Math.min(Number(searchParams.get("matches")) || 25, 50);

  let account;
  try {
    account = await getAccountByRiotId(gameName, tagLine);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo resolver la Riot ID." }, { status: 500 });
  }

  let matchIds: string[];
  try {
    matchIds = await getMatchIdsByPuuid(account.puuid, count);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudieron traer los match ids." }, { status: 500 });
  }

  const results = [];
  for (const matchId of matchIds) {
    let match: unknown;
    try {
      match = await getMatchById(matchId);
    } catch (err) {
      results.push({ matchId, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const info = (match as { info: { participants: { puuid: string; win: boolean; teamPosition: string }[] } }).info;
    const me = info.participants.find((p) => p.puuid === account.puuid);
    const hits = findAegisClues(match, matchId);
    results.push({
      matchId,
      win: me?.win ?? null,
      teamPosition: me?.teamPosition ?? null,
      hits,
    });
  }

  return NextResponse.json({ puuid: account.puuid, matchCount: matchIds.length, results });
}
