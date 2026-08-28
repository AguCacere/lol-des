/**
 * Data Dragon — Riot's public, keyless static asset feed. Used to map numeric
 * IDs that other endpoints return (championId from Champion Mastery V4, rune
 * IDs from Match-V5's perks) into display names, since those APIs never give
 * you the name directly — and, for runes/summoner spells, to also resolve
 * real icon art from the same NAME once it's stored (matches.primary_rune,
 * .summoner1/2 store names, not ids). Cached in-memory per warm serverless
 * instance, refetched at most daily since champions/runes barely change
 * patch to patch.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let versionCache: { version: string; fetchedAt: number } | null = null;
let championCache: { byId: Map<number, string>; fetchedAt: number } | null = null;

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
  icon: string; // relative path under cdn/img/ — e.g. "perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png"
}

interface DDragonRuneSlot {
  runes: DDragonRune[];
}

interface DDragonRuneStyle {
  id: number; // tree id, e.g. 8000 = Precision
  name: string;
  icon: string; // tree-level icon, same relative-path convention
  slots: DDragonRuneSlot[];
}

interface RuneMaps {
  byId: Map<number, string>;
  /** Icon path (relative, under cdn/img/) keyed by the rune/tree NAME — the same value matches.primary_rune / .primary_style / .secondary_style store. */
  iconByName: Map<string, string>;
}

let runeCache: { maps: RuneMaps; fetchedAt: number } | null = null;

async function fetchRuneMaps(): Promise<RuneMaps> {
  const version = await latestVersion();
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Data Dragon rune list fetch failed: ${res.status}`);
  const styles: DDragonRuneStyle[] = await res.json();

  const byId = new Map<number, string>();
  const iconByName = new Map<string, string>();
  for (const style of styles) {
    byId.set(style.id, style.name); // tree name (Precision, Domination, ...)
    iconByName.set(style.name, style.icon);
    for (const slot of style.slots) {
      for (const rune of slot.runes) {
        byId.set(rune.id, rune.name); // individual rune (keystone or minor)
        iconByName.set(rune.name, rune.icon);
      }
    }
  }
  return { byId, iconByName };
}

async function getRuneMaps(): Promise<RuneMaps> {
  const now = Date.now();
  if (!runeCache || now - runeCache.fetchedAt > CACHE_TTL_MS) {
    runeCache = { maps: await fetchRuneMaps(), fetchedAt: now };
  }
  return runeCache.maps;
}

/** Resolves a rune or rune-tree ID (from Match-V5 `perks`) to its display name. */
export async function runeNameById(id: number): Promise<string | null> {
  const maps = await getRuneMaps();
  return maps.byId.get(id) ?? null;
}

/**
 * Icon URL for a rune or rune-tree NAME, as stored in matches.primary_rune /
 * .primary_style / .secondary_style. Version-agnostic path (Data Dragon
 * serves rune art from cdn/img/, not cdn/{version}/img/ like champions and
 * spells) — no version parameter needed.
 */
export async function runeIconUrlByName(name: string): Promise<string | null> {
  const maps = await getRuneMaps();
  const icon = maps.iconByName.get(name);
  return icon ? `https://ddragon.leagueoflegends.com/cdn/img/${icon}` : null;
}

interface DDragonSummonerEntry {
  key: string; // numeric spell id, as a string
  name: string;
  image: { full: string }; // e.g. "SummonerFlash.png" — not derivable from `name` ("Flash") by any simple rule
}

interface DDragonSummonerResponse {
  data: Record<string, DDragonSummonerEntry>;
}

interface SpellMaps {
  byId: Map<number, string>;
  /** CDN image filename (e.g. "SummonerDot.png" for Ignite) keyed by the spell NAME matches.summoner1/2 store. */
  iconFileByName: Map<string, string>;
}

let summonerSpellCache: { maps: SpellMaps; fetchedAt: number } | null = null;

async function fetchSummonerSpellMaps(): Promise<SpellMaps> {
  const version = await latestVersion();
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Data Dragon summoner spell fetch failed: ${res.status}`);
  const data: DDragonSummonerResponse = await res.json();

  const byId = new Map<number, string>();
  const iconFileByName = new Map<string, string>();
  for (const entry of Object.values(data.data)) {
    byId.set(Number(entry.key), entry.name);
    iconFileByName.set(entry.name, entry.image.full);
  }
  return { byId, iconFileByName };
}

async function getSummonerSpellMaps(): Promise<SpellMaps> {
  const now = Date.now();
  if (!summonerSpellCache || now - summonerSpellCache.fetchedAt > CACHE_TTL_MS) {
    summonerSpellCache = { maps: await fetchSummonerSpellMaps(), fetchedAt: now };
  }
  return summonerSpellCache.maps;
}

/** Resolves a `summoner1Id`/`summoner2Id` (from Match-V5) to its display name, e.g. "Flash". */
export async function summonerSpellNameById(id: number): Promise<string | null> {
  const maps = await getSummonerSpellMaps();
  return maps.byId.get(id) ?? null;
}

/** Icon URL for a summoner spell NAME, as stored in matches.summoner1/summoner2. Versioned, same convention as champion/profile icons. */
export async function summonerSpellIconUrlByName(version: string, name: string): Promise<string | null> {
  const maps = await getSummonerSpellMaps();
  const file = maps.iconFileByName.get(name);
  return file ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${file}` : null;
}

/**
 * Exposed so a caller building URLs for many players in one request (see
 * app/api/ladder/route.ts) can resolve the version once and reuse it,
 * instead of going through the full async profileIconUrl per player.
 */
export function getLatestVersion(): Promise<string> {
  return latestVersion();
}

/**
 * Builds the CDN URL for a `profileIconId` (Summoner-V4), given an
 * already-resolved Data Dragon version (see getLatestVersion). Pure and
 * synchronous on purpose — profile icon art doesn't change per patch, so
 * there's no freshness reason this needs to hit the version cache itself.
 */
export function profileIconUrl(version: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

/**
 * Champion square art for a `championName` as stored in `matches`/mastery/etc
 * — that column is Riot's own Match-V5 `championName` field, which is
 * already the exact id Data Dragon's champion CDN expects (e.g. "MonkeyKing"
 * for Wukong, "KSante" for K'Sante), so no id-to-name mapping is needed here
 * at all. Pure/sync like profileIconUrl, same reason: no freshness concern
 * worth an async version lookup per call.
 */
export function championIconUrl(version: string, championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
}
