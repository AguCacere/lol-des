/**
 * El cruce entre las dos listas de campeones del perfil: la maestría de Riot
 * (carrera completa, todas las colas) contra el pool real de partidas ranked
 * que guardamos. Por separado cada una dice algo; juntas dicen otra cosa que
 * ninguna puede decir sola.
 *
 * Corre en el servidor y no en el cliente por una razón concreta: el
 * `championPool` que viaja en la respuesta está cortado al top 5 por
 * partidas, así que un campeón de mucha maestría que no aparece ahí puede
 * ser tanto uno que no jugás como uno que quedó sexto. Desde acá se ve el
 * mapa entero y la diferencia se puede afirmar de verdad.
 */
import type { ChampionPoolEntry, MasteryEntry } from "./types";

/**
 * Partidas mínimas para que un winrate signifique algo. El mismo umbral con
 * el que el pool decide si le pone color al porcentaje: si no alcanza para
 * pintarlo, tampoco alcanza para sacar una conclusión de él.
 */
export const CONFIDENT_GAMES = 5;

/** Winrate por debajo del cual "mucha maestría" pasa a ser un problema y no un mérito. */
const POOR_WINRATE = 45;
/** Y por encima del cual vale la pena señalar un campeón que no está entre los más trabajados. */
const GOOD_WINRATE = 55;

export interface ChampionInsight {
  /**
   * - `abandonado`: mucha maestría y CERO partidas ranked en lo que llevamos guardado.
   * - `sin_rendir`: mucha maestría, partidas de sobra, y no le está saliendo.
   * - `destacado`: le rinde con un campeón que NO está entre sus más trabajados.
   */
  kind: "abandonado" | "sin_rendir" | "destacado";
  champ: string;
  /** Nivel de maestría de Riot. Null en `destacado`, que justamente es el que no está en el top de maestría. */
  masteryLevel: number | null;
  games: number;
  /** Null en `abandonado`: sin partidas no hay winrate. */
  winrate: number | null;
}

/**
 * `mastery` es el top de Champion Mastery (lo que devuelve Riot, hoy 5) y
 * `pool` el historial COMPLETO de campeones jugados en ranked, no el top 5
 * recortado que se manda al cliente.
 *
 * Devuelve como mucho una observación de cada tipo — la más fuerte de cada
 * una. Tres líneas que dicen algo valen más que diez que repiten lo que las
 * listas de arriba ya muestran.
 */
export function computeChampionInsights(mastery: MasteryEntry[], pool: ChampionPoolEntry[]): ChampionInsight[] {
  if (mastery.length === 0 || pool.length === 0) return [];

  const byChamp = new Map(pool.map((c) => [c.champ, c]));
  const masteryChamps = new Set(mastery.map((m) => m.champ));
  const out: ChampionInsight[] = [];

  // El de más maestría que no aparece NUNCA en el historial guardado. Ojo con
  // el alcance: significa "no lo jugó en lo que llevamos registrado", no "no
  // lo juega más" — la maestría es de toda la vida y nuestro historial
  // arranca donde arranca. El texto del componente lo dice así.
  const abandonado = mastery.filter((m) => !byChamp.has(m.champ)).sort((a, b) => b.points - a.points)[0];
  if (abandonado) {
    out.push({ kind: "abandonado", champ: abandonado.champ, masteryLevel: abandonado.level, games: 0, winrate: null });
  }

  // Mucha maestría y resultados malos, con muestra suficiente para decirlo.
  // Se elige el de más partidas y no el de peor winrate: con más partidas la
  // afirmación es más sólida, y es plata invertida en algo que no rinde.
  const sinRendir = mastery
    .map((m) => ({ m, c: byChamp.get(m.champ) }))
    .filter((x): x is { m: MasteryEntry; c: ChampionPoolEntry } => !!x.c && x.c.games >= CONFIDENT_GAMES && x.c.winrate <= POOR_WINRATE)
    .sort((a, b) => b.c.games - a.c.games)[0];
  if (sinRendir) {
    out.push({
      kind: "sin_rendir",
      champ: sinRendir.m.champ,
      masteryLevel: sinRendir.m.level,
      games: sinRendir.c.games,
      winrate: sinRendir.c.winrate,
    });
  }

  // Le va bien con algo que no está entre sus campeones más trabajados. Es el
  // único de los tres que sugiere hacer algo en vez de describir lo que pasa.
  const destacado = pool
    .filter((c) => !masteryChamps.has(c.champ) && c.games >= CONFIDENT_GAMES && c.winrate >= GOOD_WINRATE)
    .sort((a, b) => b.winrate - a.winrate || b.games - a.games)[0];
  if (destacado) {
    out.push({
      kind: "destacado",
      champ: destacado.champ,
      masteryLevel: null,
      games: destacado.games,
      winrate: destacado.winrate,
    });
  }

  return out;
}
