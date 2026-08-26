/**
 * Data Dragon — Riot's public, keyless static asset feed. Used to map numeric
 * IDs that other endpoints return (championId from Champion Mastery V4, rune
 * IDs from Match-V5's perks) into display names, since those APIs never give
 * you the name directly. Cached in-memory per warm serverless instance,
 * refetched at most daily since champions/runes barely change patch to patch.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let versionCache: { version: string; fetchedAt: number } | null = null;
let championCache: { byId: Map<number, string>; fetchedAt: number } | null = null;
let runeCache: { byId: Map<number, string>; fetchedAt: number } | null = null;
let summonerSpellCache: { byId: Map<number, string>; fetchedAt: number } | null = null;

async function latestVersion(): Promise<string> {
  const now = Date.now();
  if (versionCache && now - versionCache.fetchedAt <= CACHE_TTL_MS) {
    return versionCache.version;
  }
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Data Dragon versions fetch failed: ${res.status}`);
  const versions: string[] = await res.json();
  versionCache = { version: versions[0], fetchedAt: now };
  return versions[0];
}

interface DDragonChampionEntry {
  key: string; // numeric championId, as a string
  name: string;
}

interface DDragonChampionResponse {
  data: Record<string, DDragonChampionEntry>;
}

async function fetchChampionMap(): Promise<Map<number, string>> {
  const version = await latestVersion();
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Data Dragon champion list fetch failed: ${res.status}`);
  const champData: DDragonChampionResponse = await res.json();

  const byId = new Map<number, string>();
  for (const entry of Object.values(champData.data)) {
    byId.set(Number(entry.key), entry.name);
  }
  return byId;
}

/** Resolves a Champion Mastery `championId` to its display name, or null if the lookup fails. */
export async function championNameById(championId: number): Promise<string | null> {
  const now = Date.now();
  if (!championCache || now - championCache.fetchedAt > CACHE_TTL_MS) {
    championCache = { byId: await fetchChampionMap(), fetchedAt: now };
  }
  return championCache.byId.get(championId) ?? null;
}

interface DDragonRune {
  id: number;
  name: string;
}

interface DDragonRuneSlot {
  runes: DDragonRune[];
}

interface DDragonRuneStyle {
  id: number; // tree id, e.g. 8000 = Precision
  name: string;
  slots: DDragonRuneSlot[];
}

async function fetchRuneMap(): Promise<Map<number, string>> {
  const version = await latestVersion();
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Data Dragon rune list fetch failed: ${res.status}`);
  const styles: DDragonRuneStyle[] = await res.json();

  const byId = new Map<number, string>();
  for (const style of styles) {
    byId.set(style.id, style.name); // tree name (Precision, Domination, ...)
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        byId.set(rune.id, rune.name); // individual rune (keystone or minor)
      }
    }
  }
  return byId;
}

/** Resolves a rune or rune-tree ID (from Match-V5 `perks`) to its display name. */
export async function runeNameById(id: number): Promise<string | null> {
  const now = Date.now();
  if (!runeCache || now - runeCache.fetchedAt > CACHE_TTL_MS) {
    runeCache = { byId: await fetchRuneMap(), fetchedAt: now };
  }
  return runeCache.byId.get(id) ?? null;
}

interface DDragonSummonerEntry {
  key: string; // numeric spell id, as a string
  name: string;
}

interface DDragonSummonerResponse {
  data: Record<string, DDragonSummonerEntry>;
}

async function fetchSummonerSpellMap(): Promise<Map<number, string>> {
  const version = await latestVersion();
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Data Dragon summoner spell fetch failed: ${res.status}`);
  const data: DDragonSummonerResponse = await res.json();

  const byId = new Map<number, string>();
  for (const entry of Object.values(data.data)) {
    byId.set(Number(entry.key), entry.name);
  }
  return byId;
}

/** Resolves a `summoner1Id`/`summoner2Id` (from Match-V5) to its display name, e.g. "Flash". */
export async function summonerSpellNameById(id: number): Promise<string | null> {
  const now = Date.now();
  if (!summonerSpellCache || now - summonerSpellCache.fetchedAt > CACHE_TTL_MS) {
    summonerSpellCache = { byId: await fetchSummonerSpellMap(), fetchedAt: now };
  }
  return summonerSpellCache.byId.get(id) ?? null;
}
