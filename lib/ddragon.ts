/**
 * Data Dragon — Riot's public, keyless static asset feed. Used only to map
 * the numeric `championId` that Champion Mastery V4 returns into a champion
 * name (Riot's APIs never give you the name directly for mastery data).
 * Cached in-memory per warm serverless instance; refetched at most daily
 * since the champion roster barely changes.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache: { byId: Map<number, string>; fetchedAt: number } | null = null;

interface DDragonChampionEntry {
  key: string; // numeric championId, as a string
  name: string;
}

interface DDragonChampionResponse {
  data: Record<string, DDragonChampionEntry>;
}

async function fetchChampionMap(): Promise<Map<number, string>> {
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" });
  if (!versionsRes.ok) throw new Error(`Data Dragon versions fetch failed: ${versionsRes.status}`);
  const versions: string[] = await versionsRes.json();
  const latest = versions[0];

  const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`, {
    cache: "no-store",
  });
  if (!champRes.ok) throw new Error(`Data Dragon champion list fetch failed: ${champRes.status}`);
  const champData: DDragonChampionResponse = await champRes.json();

  const byId = new Map<number, string>();
  for (const entry of Object.values(champData.data)) {
    byId.set(Number(entry.key), entry.name);
  }
  return byId;
}

/** Resolves a Champion Mastery `championId` to its display name, or null if the lookup fails. */
export async function championNameById(championId: number): Promise<string | null> {
  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    cache = { byId: await fetchChampionMap(), fetchedAt: now };
  }
  return cache.byId.get(championId) ?? null;
}
