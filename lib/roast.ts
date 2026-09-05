/**
 * La cargada de Discord cuando alguien tiene una partida desastrosa.
 *
 * Vive separada de lib/discord.ts (que es solo el transporte) y de
 * lib/refresh.ts (que es el cron) por una razón práctica: el criterio de qué
 * cuenta como desastre y el tono de la burla son las dos cosas que vamos a
 * querer tocar, y conviene que estén en un archivo que se pueda leer y
 * probar sin levantar nada.
 */
import { championLabel } from "./champion-names";

/** Lo mínimo de una partida que hace falta para juzgarla. Los opcionales solo suman filo al remate. */
export interface RoastCandidate {
  matchId: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** % del daño del equipo. Null en partidas guardadas antes de que existiera la columna. */
  dmgShare?: number | null;
  csPerMin?: number | null;
  cs?: number | null;
  /**
   * Los cinco campeones del equipo rival. Es lo que mira la cargada de Teemo:
   * un Teemo arriba te llena el mapa de hongos aunque vos estés de support,
   * así que atarla a tu línea la dejaba sin salir en la mayoría de los casos.
   */
  rivales?: string[] | null;
  /**
   * El campeón del rival de SU MISMA línea. Queda como respaldo de `rivales`
   * para cuando no se tiene el equipo entero. Null si Riot no resolvió
   * posición.
   */
  opponentChampion?: string | null;
  /**
   * Flex en vez de soloQ. Solo cambia el mensaje: se aclara porque la app no
   * muestra las partidas de flex en ningún lado, y si no se dijera, el que
   * la busca en el historial no la encuentra y parece un invento del bot.
   */
  esFlex?: boolean;
}

/**
 * Muertes mínimas para el camino del ratio. Con menos que esto no es un
 * desastre, es una partida mala y todos tenemos.
 */
const MIN_DEATHS = 7;
/**
 * El umbral del primer camino: (kills + asistencias) / muertes.
 *
 * Solo contar muertes no alcanza y sería injusto con los supports. Un 3/9/20
 * es alguien que murió mucho pero estuvo en todas las peleas — eso no es un
 * desastre. Un 0/13/5 es otra cosa.
 */
const MAX_RATIO = 0.6;
/**
 * Y el segundo camino, que existe porque el primero se comía casos obvios:
 * un 1/14/11 da ratio 0.857 y zafaba, cuando morir 14 veces es exactamente
 * lo que la gente quiere ver cargado. Las 11 asistencias tapan las 14
 * muertes en la división y el ratio solo no lo ve.
 *
 * La regla acá es más simple de defender que cualquier umbral fino: moriste
 * más veces de las que participaste en una kill. No importa el rol — si las
 * muertes le ganan a los takedowns, el aporte fue negativo.
 */
const MUERTES_ABSURDAS = 12;

/**
 * Qué tan mal salió, más bajo es peor. Sirve para elegir la peor cuando hay
 * varias en la misma corrida.
 */
export function disasterScore(m: RoastCandidate): number {
  return (m.kills + m.assists) / Math.max(1, m.deaths);
}

/**
 * Una partida lo bastante mala como para merecer una cargada. El resultado no
 * la salva: hacer 1/14 y ganar igual es hacer 1/14, solo que con la suerte de
 * tener cuatro compañeros que lo taparon. El mensaje lo aclara.
 */
export function isDisaster(m: RoastCandidate): boolean {
  if (m.deaths >= MIN_DEATHS && disasterScore(m) < MAX_RATIO) return true;
  if (m.deaths >= MUERTES_ABSURDAS && m.deaths > m.kills + m.assists) return true;
  return false;
}

/**
 * Las cargadas. Se eligen por el matchId y no al azar para que la misma
 * partida siempre dé el mismo mensaje: si el cron reprocesa algo o hay que
 * depurar por qué salió tal texto, es reproducible.
 *
 * Todas meten el KDA real adentro. Una burla genérica es un chiste; una que
 * te dice "14 muertes" es el chiste Y el dato.
 */
const CARGADAS: ((label: string, champ: string, k: number, d: number, a: number) => string)[] = [
  (l, c, k, d, a) => `**${l}** es un wachín de corso que terminó **${k}/${d}/${a}** todo reventado con **${c}**.`,
  (l, c, k, d, a) => `**${l}** es un condón usado con **${c}** y terminó **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `A **${l}** no le da la cabeza para jugar con **${c}** y fue full pantalla gris: **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `**${l}** está re viejo gaga y tiene que borrarlo, cómo va a terminar **${k}/${d}/${a}** con **${c}**. Borralo gugu`,
  (l, c, k, d, a) =>
    `BRUTAL! Miren esta partida de **${l}** 🔥🔥🔥 fue un depósito de leche del equipo rival con **${c}** y terminó **${k}/${d}/${a}**, increíble!`,
  (l, c, k, d, a) =>
    `Me da vergüenza mostrar esta partida... Pero **${l}** terminó **${k}/${d}/${a}** con **${c}**, no se rescata más de troll.`,
];

/** Claves de Data Dragon. Son las mismas que Match-V5 pone en championName y que guardamos. */
const TEEMO = "Teemo";
const NASUS = "Nasus";

/** Si ese campeón estaba en el equipo de enfrente. Mira los cinco, no el rival de tu línea: un Nasus que farmea arriba te gana la partida estés donde estés. */
function habiaEnfrente(m: RoastCandidate, champion: string): boolean {
  return m.rivales?.includes(champion) === true || m.opponentChampion === champion;
}

/**
 * Las cargadas con nombre y apellido, que le ganan al sorteo cuando
 * corresponde: cuando hay cierto campeón en la partida el chiste se escribe
 * solo y sería una lástima dejarlo librado al azar entre las otras seis.
 *
 * El orden importa porque puede haber más de una que aplique:
 *
 * 1. Jugando Teemo. El bot se llama Teemo, así que esta es la de la casa y va
 *    primero — perder con su propio campeón es traicionar a la marca.
 * 2. Perder contra un Nasus. Pide derrota de verdad: el texto dice "perdió
 *    contra", así que ganando no puede salir.
 * 3. Comerse un Teemo de rival.
 *
 * Las dos frases de Teemo son las suyas de verdad, pasadas al voseo — "pisas"
 * no lo dice nadie acá.
 */
function cargadaEspecial(l: string, m: RoastCandidate): string | null {
  const kda = `**${m.kills}/${m.deaths}/${m.assists}**`;
  const champ = championLabel(m.champion);

  if (m.champion === TEEMO) {
    return `🍄 *Cuidado por dónde pisás...* Y **${l}** pisó los hongos que puso él mismo: ${kda} con **Teemo**. Devolvé el sombrero, no te lo merecés.`;
  }
  if (!m.win && habiaEnfrente(m, NASUS)) {
    return `🐶 **${l}** perdió contra el perro rabioso de Nasus, quedó ${kda} con **${champ}** y le dejaron todos los cachorros dentro de la cucha. Guau guau 😂`;
  }
  if (habiaEnfrente(m, TEEMO)) {
    return `🍄 *Acá hay un hongo con tu nombre.* Y **${l}** los encontró todos: ${kda} con **${champ}** contra un Teemo. Andá a caminar a otro lado, campeón.`;
  }
  return null;
}

/**
 * El remate: una segunda línea con el número que más duele, si lo tenemos
 * guardado. Es opcional a propósito — las partidas viejas no tienen estas
 * columnas y una cargada sin remate funciona igual.
 *
 * El umbral del daño es bajo (8%) para que un support enchanter no entre por
 * jugar como se juega su rol; el de CS es bajísimo (1.5/min) por lo mismo.
 * Acá no se busca un análisis, se busca el dato que remata el chiste.
 */
function remate(m: RoastCandidate): string | null {
  if (m.dmgShare != null && m.dmgShare > 0 && m.dmgShare < 8) {
    return `Aportó el ${m.dmgShare}% del daño del equipo. Las torres hicieron más.`;
  }
  if (m.csPerMin != null && m.csPerMin > 0 && m.csPerMin < 1.5) {
    const farm = m.cs != null ? `${m.cs} de CS, ` : "";
    return `${farm}${m.csPerMin} por minuto. Los minions murieron de viejos.`;
  }
  return null;
}

/** Suma de caracteres del matchId. No necesita ser un buen hash, solo repartir parejo y ser estable. */
function indiceEstable(matchId: string, total: number): number {
  let n = 0;
  for (let i = 0; i < matchId.length; i++) n = (n + matchId.charCodeAt(i)) % total;
  return n;
}

/** El mensaje listo para mandar a Discord. Los tres emojis van siempre adelante — es la firma del formato. */
export function roastMessage(label: string, m: RoastCandidate): string {
  // championLabel y no el nombre crudo de Riot: "MonkeyKing" o "Kaisa" en
  // medio de una cargada la desinflan.
  const especial = cargadaEspecial(label, m);
  const texto =
    especial ?? CARGADAS[indiceEstable(m.matchId, CARGADAS.length)](label, championLabel(m.champion), m.kills, m.deaths, m.assists);
  const cola = m.esFlex ? " *(flex)*" : "";

  // La segunda línea junta lo que no es la cargada en sí: que haya ganado
  // igual (que no lo salva, lo empeora) y el número que remata.
  const extras: string[] = [];
  if (m.win) extras.push("Pero ganó, lamentablemente.");
  const dato = remate(m);
  if (dato) extras.push(dato);

  // Las especiales traen su propio emoji y su propio tono: meterles los tres
  // de siempre adelante les pisa el chiste.
  const primera = especial ? `${texto}${cola}` : `😂😂😂 ${texto}${cola}`;
  return extras.length > 0 ? `${primera}\n${extras.join(" ")}` : primera;
}

/**
 * La peor de un conjunto, o null si ninguna califica. Se manda una sola por
 * corrida del cron y no una por partida: dos mensajes seguidos diluyen el
 * chiste, y con varias partidas nuevas en el mismo ciclo la peor es la que
 * vale la pena contar.
 *
 * Ordena por el ratio y, si empatan, gana la que tiene más muertes: entre dos
 * igual de improductivas, la más espectacular es la que se cuenta.
 */
export function worstDisaster(matches: RoastCandidate[]): RoastCandidate | null {
  const malas = matches.filter(isDisaster);
  if (malas.length === 0) return null;
  return malas.reduce((peor, m) => {
    const dm = disasterScore(m);
    const dp = disasterScore(peor);
    if (dm !== dp) return dm < dp ? m : peor;
    return m.deaths > peor.deaths ? m : peor;
  });
}
