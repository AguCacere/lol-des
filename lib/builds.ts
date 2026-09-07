/**
 * "Cómo arrancás" — el orden de compra guardado (matches.item_build, que es
 * el ITEM_PURCHASED real del timeline) cruzado con el resultado de la
 * partida.
 *
 * La pregunta que contesta no la contesta ninguna tier list: no "cuál es el
 * mejor primer ítem de Caitlyn en el parche", sino "cuál te funciona A VOS
 * con Caitlyn, en tus partidas". Con muestras chicas eso es ruido, así que
 * hay pisos y se muestran los dos lados (ganadas y perdidas) en vez de un
 * porcentaje suelto.
 */
import { winrateExacto } from "./winrate";

/** Una partida vista desde acá: qué campeón, si ganó, y qué compró en orden. */
export interface BuildSample {
  champion: string;
  win: boolean;
  itemBuild: number[];
}

export interface PrimerItemStat {
  itemId: number;
  /** El nombre de Data Dragon, para que la fila se pueda leer sin depender del ícono. */
  nombre: string;
  games: number;
  wins: number;
  winrate: number;
}

export interface ChampionBuildStats {
  champ: string;
  games: number;
  /** Los primeros ítems core que más repitió con este campeón, el más jugado primero. */
  arranques: PrimerItemStat[];
}

/** Menos partidas que esto con un campeón y no hay nada que mirar. */
const MIN_PARTIDAS_CHAMP = 8;
/** Y menos que esto con un mismo primer ítem es una anécdota, no un patrón. */
const MIN_PARTIDAS_ITEM = 3;
/** Cuántos arranques distintos se muestran por campeón. */
const MAX_ARRANQUES = 3;

/**
 * El primer ítem core de una compra. Devuelve null si la partida no llegó a
 * uno (remake, partida corta) o si no hay build guardada — son casos que hay
 * que descartar, no contar como "arrancó con nada".
 */
export function primerCore(itemBuild: number[], esCore: (id: number) => boolean): number | null {
  for (const id of itemBuild) {
    if (esCore(id)) return id;
  }
  return null;
}

/** Todos los core en orden de compra: el "recorrido" de la build. */
export function recorridoCore(itemBuild: number[], esCore: (id: number) => boolean): number[] {
  const vistos = new Set<number>();
  const core: number[] = [];
  for (const id of itemBuild) {
    // Un mismo ítem puede aparecer dos veces (se vendió y se recompró); en el
    // recorrido interesa una sola vez, en el momento en que apareció primero.
    if (esCore(id) && !vistos.has(id)) {
      vistos.add(id);
      core.push(id);
    }
  }
  return core;
}

export function computeBuildStats(
  samples: BuildSample[],
  esCore: (id: number) => boolean,
  nombreDe: (id: number) => string
): ChampionBuildStats[] {
  const porChamp = new Map<string, { games: number; items: Map<number, { games: number; wins: number }> }>();

  for (const s of samples) {
    const primero = primerCore(s.itemBuild, esCore);
    if (primero === null) continue;
    const entrada = porChamp.get(s.champion) ?? { games: 0, items: new Map() };
    entrada.games++;
    const item = entrada.items.get(primero) ?? { games: 0, wins: 0 };
    item.games++;
    if (s.win) item.wins++;
    entrada.items.set(primero, item);
    porChamp.set(s.champion, entrada);
  }

  const salida: ChampionBuildStats[] = [];
  for (const [champ, entrada] of porChamp) {
    if (entrada.games < MIN_PARTIDAS_CHAMP) continue;
    const arranques = [...entrada.items.entries()]
      .filter(([, v]) => v.games >= MIN_PARTIDAS_ITEM)
      .map(([itemId, v]) => ({
        itemId,
        nombre: nombreDe(itemId),
        games: v.games,
        wins: v.wins,
        winrate: winrateExacto(v.wins, v.games),
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, MAX_ARRANQUES);
    // Un solo arranque no es una comparación: es "siempre compró lo mismo", y
    // eso no le dice nada a nadie.
    if (arranques.length < 2) continue;
    salida.push({ champ, games: entrada.games, arranques });
  }

  return salida.sort((a, b) => b.games - a.games);
}

/** Un ítem de la compra, ya agrupado: si compró doce pociones es UNA entrada con veces=12. */
export interface CompraItem {
  id: number;
  nombre: string;
  /** Cuántas veces lo compró en la partida. */
  veces: number;
  core: boolean;
  consumible: boolean;
}

/**
 * La compra completa agrupada por ítem, en el orden de la PRIMERA compra.
 *
 * El timeline devuelve un evento por compra, así que una partida normal son
 * veinticinco o treinta ítems donde la mitad es la misma poción. Listados uno
 * por uno eso es una pared de íconos repetidos que no se puede leer y que en
 * el celular ocupa media pantalla. Agrupado con un contador dice lo mismo en
 * un tercio del espacio, y encima dice algo que la lista larga escondía:
 * cuántas pociones se tomó.
 *
 * Se agrupa por ítem y no por compras consecutivas a propósito: comprar una
 * poción en el minuto 2 y otra en el 20 es el mismo hábito, y separarlas en
 * dos entradas volvería a fragmentar la fila.
 */
export function agruparCompra(
  itemBuild: number[],
  info: (id: number) => { name: string; core: boolean; consumible: boolean } | undefined
): CompraItem[] {
  const orden: number[] = [];
  const veces = new Map<number, number>();
  for (const id of itemBuild) {
    if (!veces.has(id)) orden.push(id);
    veces.set(id, (veces.get(id) ?? 0) + 1);
  }
  return orden.map((id) => {
    const meta = info(id);
    return {
      id,
      nombre: meta?.name ?? `Ítem ${id}`,
      veces: veces.get(id) ?? 1,
      core: meta?.core ?? false,
      consumible: meta?.consumible ?? false,
    };
  });
}
