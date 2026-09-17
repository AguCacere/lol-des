/**
 * Los momentos que merecen un grito en el canal.
 *
 * El bot ya avisa cuando alguien juega mal (`lib/roast.ts`) y cuando se lleva
 * la partida al hombro (`lib/carry.ts`). Esto es la tercera categoría: no "jugó
 * bien" sino **pasó algo**. Un penta, una partida sin morir, un récord propio
 * roto. Cosas puntuales, verificables, que no dependen de ningún umbral
 * discutible salvo el del récord.
 *
 * Todo sale de columnas que ya están guardadas. No se le pide nada nuevo a
 * Riot.
 *
 * Los umbrales se midieron contra las 1058 partidas guardadas (18/9), que es la
 * única forma de saber si un aviso va a ser especial o va a ser ruido:
 *
 *   penta      0 en toda la historia   ← justamente por eso hay que gritarlo
 *   cuádruple  7
 *   perfecta   10
 *   récord     12 con la regla de abajo (sin ella, 114 — o sea spam)
 *
 * Son ~29 de 1058, un 2,7%: parecido a la carrileada y menos que la cargada.
 */

export type TipoHito = "penta" | "cuadra" | "perfecta" | "record";

/** Qué récord se rompió. Son los tres que se miden por partida suelta. */
export type TipoRecord = "kills" | "dano" | "cs";

export interface HitoCandidate {
  matchId: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  pentaKills: number;
  quadraKills: number;
  danoACampeones: number;
  cs: number;
}

/**
 * Los mejores números ANTERIORES de esa persona, para saber si rompió algo.
 *
 * Null cuando no hay historial suficiente (ver PARTIDAS_PARA_RECORD): con
 * quince partidas guardadas, cualquier cosa es un récord y el bot se pasaría
 * una semana felicitando a un tipo por existir.
 */
export interface RecordsPrevios {
  kills: number;
  dano: number;
  cs: number;
}

export interface Hito {
  tipo: TipoHito;
  matchId: string;
  /** Solo para `record`: qué rompió, con cuánto y contra cuánto. */
  record?: { que: TipoRecord; ahora: number; antes: number };
}

/** Kills mínimas para que una partida sin morir sea un hito y no un support tranquilo. */
const KILLS_PARA_PERFECTA = 5;

/**
 * Partidas previas mínimas para que un récord sea un récord. Lo usa quien
 * arma `RecordsPrevios`: con menos que esto, manda null.
 *
 * Sin esto salen 114 avisos sobre 1058 partidas —un 10,8%, uno de cada nueve—
 * porque al principio de un historial se rompe un récord casi todas las veces.
 * Con treinta previas bajan a 22.
 */
export const PARTIDAS_PARA_RECORD = 30;

/**
 * Y por cuánto hay que romperlo. Un 10% arriba, y en kills además dos más.
 *
 * "21 kills, antes 20" no es una noticia, es un empate con suerte. Con el
 * margen quedan 12 en vez de 22, y los que sobreviven son todos de verdad:
 * 14 kills contra 11, 59.281 de daño contra 50.911, 307 CS contra 275.
 */
const MARGEN_RECORD = 1.1;
const KILLS_EXTRA_RECORD = 2;

/**
 * El hito de esa partida, o null si no pasó nada digno de mención.
 *
 * El orden NO es casual y es lo único que hay que respetar si se agregan más:
 * una partida con penta casi seguro es también una partida sin morir y un
 * récord de kills. Sale UNO, el más grande, o el canal recibe tres mensajes
 * de la misma partida.
 */
export function hitoDe(m: HitoCandidate, previos: RecordsPrevios | null): Hito | null {
  if (m.pentaKills > 0) return { tipo: "penta", matchId: m.matchId };
  if (m.quadraKills > 0) return { tipo: "cuadra", matchId: m.matchId };
  if (m.deaths === 0 && m.kills >= KILLS_PARA_PERFECTA) return { tipo: "perfecta", matchId: m.matchId };

  if (!previos) return null;
  // El de kills primero porque es el que la gente mira; después daño, después CS.
  if (m.kills > previos.kills * MARGEN_RECORD && m.kills >= previos.kills + KILLS_EXTRA_RECORD) {
    return { tipo: "record", matchId: m.matchId, record: { que: "kills", ahora: m.kills, antes: previos.kills } };
  }
  if (m.danoACampeones > previos.dano * MARGEN_RECORD) {
    return { tipo: "record", matchId: m.matchId, record: { que: "dano", ahora: m.danoACampeones, antes: previos.dano } };
  }
  if (m.cs > previos.cs * MARGEN_RECORD) {
    return { tipo: "record", matchId: m.matchId, record: { que: "cs", ahora: m.cs, antes: previos.cs } };
  }
  return null;
}

/** El más grande de un lote. Mismo orden que `hitoDe`. */
const PESO: Record<TipoHito, number> = { penta: 4, cuadra: 3, perfecta: 2, record: 1 };

export function mejorHito(hitos: Hito[]): Hito | null {
  if (hitos.length === 0) return null;
  return hitos.reduce((mejor, h) => (PESO[h.tipo] > PESO[mejor.tipo] ? h : mejor));
}

/** Los miles con punto, como se escriben en castellano: 59.281. */
function miles(n: number): string {
  return n.toLocaleString("es-AR");
}

const KDA = (m: HitoCandidate) => `**${m.kills}/${m.deaths}/${m.assists}**`;

/**
 * El mensaje para el canal.
 *
 * El penta tiene texto propio y no plantilla rotativa a propósito: no pasó
 * nunca en toda la historia del grupo, así que cuando pase tiene que salir
 * siempre el mismo y ser inconfundible.
 */
export function mensajeDeHito(label: string, h: Hito, m: HitoCandidate): string {
  switch (h.tipo) {
    case "penta":
      return (
        `🏆🏆🏆 **PENTAKILL DE ${label.toUpperCase()}** 🏆🏆🏆\n` +
        `Con **${m.champion}**, ${KDA(m)}. El primero del grupo. Que alguien lo grabe.`
      );
    case "cuadra":
      return `💥 **${label}** se comió un **cuádruple** con **${m.champion}** — ${KDA(m)}. Le faltó uno.`;
    case "perfecta":
      return `🧼 **${label}** terminó **sin morir ni una vez** con **${m.champion}**: ${KDA(m)}. Impecable.`;
    case "record": {
      const r = h.record!;
      if (r.que === "kills") {
        return `📈 **Récord personal de ${label}**: **${r.ahora} kills** con **${m.champion}**. Su máximo era ${r.antes}.`;
      }
      if (r.que === "dano") {
        return `📈 **Récord personal de ${label}**: **${miles(r.ahora)} de daño** con **${m.champion}**. Su máximo era ${miles(r.antes)}.`;
      }
      return `📈 **Récord personal de ${label}**: **${r.ahora} de CS** con **${m.champion}**. Su máximo era ${r.antes}.`;
    }
  }
}
