/**
 * La cargada de Discord cuando alguien tiene una partida desastrosa.
 *
 * Vive separada de lib/discord.ts (que es solo el transporte) y de
 * lib/refresh.ts (que es el cron) por una razón práctica: el criterio de qué
 * cuenta como desastre y el tono de la burla son las dos cosas que vamos a
 * querer tocar, y conviene que estén en un archivo que se pueda leer y
 * probar sin levantar nada.
 */

/** Lo mínimo de una partida que hace falta para juzgarla. */
export interface RoastCandidate {
  matchId: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

/**
 * Muertes mínimas para que califique. Con menos que esto no es un desastre,
 * es una partida mala y todos tenemos.
 */
const MIN_DEATHS = 7;
/**
 * Y el umbral que de verdad decide: (kills + asistencias) / muertes.
 *
 * Solo contar muertes no alcanza y sería injusto con los supports. Un 3/9/20
 * es alguien que murió mucho pero estuvo en todas las peleas — eso no es un
 * desastre. Un 0/13/5 es otra cosa. La proporción separa las dos sin tener
 * que mirar el rol.
 */
const MAX_RATIO = 0.6;

/** Qué tan mal salió, más bajo es peor. Sirve para elegir la peor cuando hay varias. */
export function disasterScore(m: RoastCandidate): number {
  return (m.kills + m.assists) / Math.max(1, m.deaths);
}

/** Una derrota con una línea de KDA lo bastante mala como para merecer una cargada. */
export function isDisaster(m: RoastCandidate): boolean {
  // Solo derrotas: hacer 0/13 y GANAR es gracioso por otro motivo y merece
  // otra burla, no esta.
  if (m.win) return false;
  if (m.deaths < MIN_DEATHS) return false;
  return disasterScore(m) < MAX_RATIO;
}

/**
 * Las cargadas. Se eligen por el matchId y no al azar para que la misma
 * partida siempre dé el mismo mensaje: si el cron reprocesa algo o hay que
 * depurar por qué salió tal texto, es reproducible.
 *
 * Todas meten el KDA real adentro. Una burla genérica es un chiste; una que
 * te dice "13 muertes" es el chiste Y el dato.
 */
const CARGADAS: ((label: string, champ: string, k: number, d: number, a: number) => string)[] = [
  (l, c, k, d, a) => `**${l}** salió a pasear con **${c}** y volvió **${k}/${d}/${a}**. ${d} muertes. ${d}.`,
  (l, c, k, d, a) => `Alguien avísele a **${l}** que con **${c}** también se puede no morir. Terminó **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `**${k}/${d}/${a}** con **${c}**. **${l}**, ¿estabas jugando o mirando el celular?`,
  (l, c, k, d, a) => `**${l}** repartió ${d} vidas gratis con **${c}**. Cerró en **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `**${c}** de **${l}**: **${k}/${d}/${a}**. El equipo rival le mandó una tarjeta de agradecimiento.`,
  (l, c, k, d, a) => `**${l}** hizo **${k}/${d}/${a}** con **${c}** y encima perdió. Doble mérito.`,
  (l, c, k, d, a) => `${d} muertes con **${c}**. **${l}** terminó **${k}/${d}/${a}** y sigue como si nada.`,
  (l, c, k, d, a) => `**${l}** convirtió a **${c}** en una oleada de minions: **${k}/${d}/${a}**.`,
];

/** Suma de caracteres del matchId. No necesita ser un buen hash, solo repartir parejo y ser estable. */
function indiceEstable(matchId: string, total: number): number {
  let n = 0;
  for (let i = 0; i < matchId.length; i++) n = (n + matchId.charCodeAt(i)) % total;
  return n;
}

/** El mensaje listo para mandar a Discord. Los tres emojis van siempre adelante — es la firma del formato. */
export function roastMessage(label: string, m: RoastCandidate): string {
  const cargada = CARGADAS[indiceEstable(m.matchId, CARGADAS.length)];
  return `😂😂😂 ${cargada(label, m.champion, m.kills, m.deaths, m.assists)}`;
}

/**
 * La peor de un conjunto, o null si ninguna califica. Se manda una sola por
 * corrida del cron y no una por partida: dos mensajes seguidos diluyen el
 * chiste, y con varias partidas nuevas en el mismo ciclo la peor es la que
 * vale la pena contar.
 */
export function worstDisaster(matches: RoastCandidate[]): RoastCandidate | null {
  const malas = matches.filter(isDisaster);
  if (malas.length === 0) return null;
  return malas.reduce((peor, m) => (disasterScore(m) < disasterScore(peor) ? m : peor));
}
