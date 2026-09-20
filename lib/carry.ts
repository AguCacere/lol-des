/**
 * La contracara de la cargada: cuando alguien se llevó la partida al hombro.
 *
 * Hasta acá el bot solo hablaba cuando alguien jugaba mal. Esto es lo mismo
 * para el otro lado, con una diferencia que es toda la gracia del módulo:
 * **carrear no se mide igual en todas las líneas**.
 *
 * Los umbrales de acá no se eligieron a ojo, se midieron contra las 1047
 * partidas guardadas del grupo (17/9). El percentil 90 del % de daño del
 * equipo es 30,4 en mid, 30,1 en bot, 30,3 en top… y **22,5 en la jungla**. Con
 * un corte plano en 30 calificaba UNA sola partida de jungla en toda la
 * historia, y ninguna de support. De ahí que el umbral sea por rol.
 *
 * El support es otro deporte y necesita otra vara entera: su mediana de daño es
 * 11% contra 22% de un mid, así que por daño no va a ganar nunca. Lo que sí
 * lidera es la participación en kills (mediana 56,8, la más alta de las cinco
 * líneas), y ahí se lo mide.
 *
 * El support tiene TRES caminos, porque hay tres formas distintas de carrear
 * desde ahí y ninguna vara sola las agarra: el enchanter (curación y escudos),
 * el de enganche (asistencias) y el tanque (daño aguantado). Ver esCarrySup.
 *
 * Con esto salta en el **2,48%** de las partidas —26 de 1047, contra 4,3% de la
 * cargada—, repartidas entre las cinco líneas. Que
 * sea RARO es parte del diseño: es el mismo argumento del parte diario que se
 * calla los domingos. Un bot que felicita todos los días es un bot que el canal
 * aprende a saltear, y después no lo lee ni cuando pasó algo de verdad.
 */

/** Lo que hace falta de una partida para juzgar si fue una carrileada. */
export interface CarryCandidate {
  matchId: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** El `team_position` de Riot: TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY. Sin esto no se juzga. */
  linea: string | null;
  /** % del daño a campeones del equipo que hizo este jugador. */
  dmgShare: number;
  /** (kills + asistencias propias) / kills del equipo. */
  killParticipation: number;
  /** Los dos del enchanter. Pueden faltar en partidas viejas (ver /api/repair). */
  healTeammates: number | null;
  shieldTeammates: number | null;
  /** El del tanque: daño que absorbió con escudos, armadura y resistencia. */
  damageMitigated: number | null;
  /** No decide nada; se muestra en el mensaje cuando es alto. Ver abajo. */
  skillshotsHit: number | null;
}

/**
 * El % de daño del equipo desde el cual la partida es "de las buenas", por rol.
 * Es el percentil 90 de cada línea, redondeado para arriba.
 *
 * La jungla va mucho más abajo y no es que el jungla aporte menos: su daño se
 * reparte entre campeones y monstruos, y `dmg_share` solo cuenta el hecho a
 * campeones. Medirlo con la vara de un mid sería pedirle que juegue de mid.
 */
const UMBRAL_DMG: Record<string, number> = { TOP: 32, MIDDLE: 32, BOTTOM: 32, JUNGLE: 24 };

/** (kills + asistencias) / muertes. El mismo ratio que usa la cargada, del lado bueno. */
const KDA_MINIMO = 5;
/**
 * Y un techo de muertes, que es lo que separa carrear de farmear kills.
 * Se puede terminar 20/9 y haber sido un desastre dos veces.
 */
const MUERTES_MAXIMAS = 4;

/** La participación en kills desde la cual un support estuvo en TODO. */
const SUP_KP_MINIMA = 70;
/**
 * Los dos caminos del support, que son dos formas distintas de carrear.
 *
 * El enchanter (Milio, Soraka) se mide por lo que curó y escudó: el p90 del
 * grupo es ~19.600, así que 15.000 ya es una partida enorme. El de enganche
 * (Thresh, Blitz) no cura nada y su aporte son las asistencias: estuvo en cada
 * pelea. Con un solo camino, el Thresh 5/3/19 que sí carreó quedaba afuera.
 */
const SUP_CURACION = 15000;
const SUP_ASISTENCIAS = 15;
/**
 * Las asistencias que alcanzan SOLAS, sin llegar al 70% de participación.
 *
 * El KP es un porcentaje y por eso se diluye: en una partida donde el equipo
 * hizo 58 kills, estar en 34 de ellas da 58,6% — abajo del umbral— aunque 34
 * asistencias sean muchísimas. La vara terminaba midiendo cuánto mató el
 * equipo y no cuánto aportó el support.
 *
 * Medido sobre 183 partidas de support del grupo: la mediana son 13
 * asistencias, el p90 son 26 y el p95 son 29. O sea que 25 ya es el techo de
 * lo que se ve. Y el KP de 70 estaba por ENCIMA del p90 de participación
 * (69,3), que es por qué tan pocas pasaban.
 *
 * Las tres partidas que esto agrega en todo el historial dicen que el
 * problema no era el tipo de campeón: una Seraphine 0/2/34 (KP 58,6), otra
 * Seraphine 2/3/26, y —la que lo deja claro— una **Soraka con 61.095 de
 * curación** que quedaba afuera con KP 64,4. Soraka es la enchanter más pura
 * que hay: no le faltaba un criterio propio, le sobraba un ratio.
 *
 * Sigue siendo selectivo: de 183 partidas de support pasan 10 en vez de 7.
 */
const SUP_ASISTENCIAS_ABSOLUTAS = 25;

/**
 * Y el tercer camino, el del TANQUE, que necesita una vara entera aparte.
 *
 * Un Alistar o una Leona no curan, no escudan y no tiran un solo skillshot —
 * sus habilidades son dirigidas o áreas alrededor suyo. Lo que hacen es meter
 * el cuerpo, y eso se mide con `damage_mitigated`: la mediana de los tanques
 * del grupo es 36.819 contra 8.917 de los enchanters. Cuatro veces. Es el dato
 * que los separa.
 *
 * Lo importante es el tope de muertes, que acá sube a 7 y no es un descuido:
 * medido contra las 234 partidas de sup, pedir daño aguantado CON el tope de 4
 * muertes da CERO casos. El tanque que aguanta 70.000 muere seis veces — ese es
 * el laburo. Las tres partidas de Alistar con mucho daño aguantado tienen 8, 6
 * y 11 muertes.
 *
 * El daño aguantado es justamente lo que impide que ese tope más flojo deje
 * pasar al que se regala: morir seis veces sin haber absorbido nada no califica.
 * Y las asistencias confirman que esas muertes fueron adentro de peleas que el
 * equipo terminó ganando.
 */
const SUP_TANQUE_KP = 65;
const SUP_TANQUE_MUERTES = 7;
const SUP_TANQUE_MITIGADO = 40000;
const SUP_TANQUE_ASISTENCIAS = 12;

/**
 * Los skillshots NO son un camino, y vale explicar por qué para que nadie los
 * agregue de vuelta: medido contra las 234 partidas de support del grupo, con
 * cualquier umbral razonable dan CERO casos. El sup que clava muchos skillshots
 * no es el mismo que tiene alta participación y pocas muertes — son dos estilos
 * distintos y pedir los dos juntos no lo cumple nadie.
 *
 * Como dato adentro del mensaje sí lucen, y para eso se usan: desde acá para
 * arriba se nombran.
 */
const SKILLSHOTS_PARA_NOMBRAR = 60;

function kda(m: CarryCandidate): number {
  return (m.kills + m.assists) / Math.max(1, m.deaths);
}

function curacionTotal(m: CarryCandidate): number {
  return (m.healTeammates ?? 0) + (m.shieldTeammates ?? 0);
}

/**
 * Qué tan grande fue, para elegir la mejor cuando el ciclo trajo varias.
 *
 * Es la razón contra el umbral del propio rol y no el número crudo: así un
 * jungla con 28% (su umbral es 24) le gana a un mid con 33% (el suyo es 32),
 * que es lo correcto — el jungla se pasó más de su propia vara. Comparar los
 * porcentajes pelados haría que la jungla nunca gane una.
 */
export function carryScore(m: CarryCandidate): number {
  if (m.linea === "UTILITY") return m.killParticipation / SUP_KP_MINIMA;
  const umbral = UMBRAL_DMG[m.linea ?? ""];
  return umbral ? m.dmgShare / umbral : 0;
}

/**
 * Si la partida fue una carrileada. El resultado NO entra acá: se juzga cómo
 * jugó, y si además perdió, lo que cambia es el mensaje (ver mensajeDeCarry).
 */
export function esCarry(m: CarryCandidate): boolean {
  // Sin línea no se juzga. Riot no siempre resuelve la posición, y adivinarla
  // para poder felicitar es exactamente el tipo de error que se nota en el canal.
  if (!m.linea) return false;

  if (m.linea === "UTILITY") return esCarrySup(m);

  if (m.deaths > MUERTES_MAXIMAS) return false;
  const umbral = UMBRAL_DMG[m.linea];
  if (umbral === undefined) return false;
  return m.dmgShare >= umbral && kda(m) >= KDA_MINIMO;
}

/** Los tres estilos de support, cada uno con su vara. Alcanza con cumplir uno. */
function esCarrySup(m: CarryCandidate): boolean {
  // El enchanter y el de enganche: mucha participación y casi sin morir. La
  // participación se puede demostrar de dos formas y alcanza con una: el
  // PORCENTAJE de las kills del equipo, o el NÚMERO de asistencias a secas.
  // Ver SUP_ASISTENCIAS_ABSOLUTAS — el ratio castiga jugar con un equipo que
  // mata mucho, que es lo contrario de lo que se quiere premiar.
  const participo = m.killParticipation >= SUP_KP_MINIMA || m.assists >= SUP_ASISTENCIAS_ABSOLUTAS;
  if (m.deaths <= MUERTES_MAXIMAS && participo) {
    if (curacionTotal(m) >= SUP_CURACION || m.assists >= SUP_ASISTENCIAS) return true;
  }
  // El tanque: muere más, pero el daño que absorbió lo justifica.
  return (
    m.deaths <= SUP_TANQUE_MUERTES &&
    m.killParticipation >= SUP_TANQUE_KP &&
    (m.damageMitigated ?? 0) >= SUP_TANQUE_MITIGADO &&
    m.assists >= SUP_TANQUE_ASISTENCIAS
  );
}

/** La mejor de un lote, o null si ninguna califica. */
export function mejorCarry(partidas: CarryCandidate[]): CarryCandidate | null {
  const califican = partidas.filter(esCarry);
  if (califican.length === 0) return null;
  return califican.reduce((mejor, m) => (carryScore(m) > carryScore(mejor) ? m : mejor));
}

/**
 * Suma de caracteres del matchId — el mismo truco que la cargada. No necesita
 * ser un buen hash, solo repartir parejo y ser ESTABLE: así la misma partida da
 * siempre el mismo texto y se puede depurar por qué salió el que salió.
 */
function semilla(matchId: string): number {
  let n = 0;
  for (let i = 0; i < matchId.length; i++) n += matchId.charCodeAt(i);
  return n;
}

type Plantilla = (l: string, c: string, k: number, d: number, a: number) => string;

/** Ganó llevándolos al hombro. */
const CARRILEADAS: Plantilla[] = [
  (l, c, k, d, a) => `🔥 **${l}** se los llevó al hombro con **${c}**: **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `👑 Hoy mandó **${l}**. Agarró **${c}** y terminó **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `🚛 **${l}** hizo de camión con **${c}** y los arrastró a todos: **${k}/${d}/${a}**.`,
  (l, c, k, d, a) => `📢 Señoras y señores, **${l}** con **${c}**: **${k}/${d}/${a}**. Eso es carrear.`,
  (l, c, k, d, a) => `🦍 **${l}** se puso el equipo en la espalda con **${c}** — **${k}/${d}/${a}**. Bestial.`,
];

/**
 * Jugó para ganar y perdió igual.
 *
 * Los cuatro de al lado son randoms el 90% de las veces, así que la cargada va
 * para ellos y no para el que la hizo bien — que es el sentido del mensaje:
 * dejar constancia de que no fue culpa suya.
 */
const LO_DEJARON_SOLO: Plantilla[] = [
  (l, c, k, d, a) => `😤 **${l}** hizo **${k}/${d}/${a}** con **${c}** y perdió igual. Lo dejaron más solo que perro en la lluvia.`,
  (l, c, k, d, a) => `🥀 **${k}/${d}/${a}** de **${l}** con **${c}**… y a perder. Ni jugando así le alcanzó.`,
  (l, c, k, d, a) => `🫠 **${l}** puso todo con **${c}** —**${k}/${d}/${a}**— y los otros cuatro estaban de paseo.`,
];

/**
 * El detalle que justifica el elogio, por rol. Sin esto el mensaje es una
 * palmada en la espalda; con esto es el dato de por qué.
 */
function porQue(m: CarryCandidate): string {
  if (m.linea === "UTILITY") {
    const partes: string[] = [`estuvo en el **${Math.round(m.killParticipation)}%** de las kills`];
    const cura = curacionTotal(m);
    if (cura >= SUP_CURACION) partes.push(`curó y escudó **${cura.toLocaleString("es-AR")}**`);
    if ((m.damageMitigated ?? 0) >= SUP_TANQUE_MITIGADO) {
      partes.push(`aguantó **${(m.damageMitigated ?? 0).toLocaleString("es-AR")}** de daño con el cuerpo`);
    }
    if ((m.skillshotsHit ?? 0) >= SKILLSHOTS_PARA_NOMBRAR) partes.push(`clavó **${m.skillshotsHit}** skillshots`);
    // Y si no entró por ninguna de las tres de arriba, entró por asistencias:
    // hay que decirlo o el mensaje se queda en "estuvo en el 71% de las kills"
    // y no explica nada. Es el caso del sup de enganche que no cura ni tanquea.
    if (partes.length === 1) partes.push(`repartió **${m.assists}** asistencias`);
    return `De sup: ${partes.join(", ")}.`;
  }
  // Coma decimal, como en toda la app (ver puntajeTexto en lib/liga.ts). Un
  // "32.8%" en castellano canta a número copiado de un JSON.
  return `Puso el **${m.dmgShare.toFixed(1).replace(".", ",")}%** del daño del equipo.`;
}

/** El mensaje listo para el canal. */
export function mensajeDeCarry(label: string, m: CarryCandidate): string {
  const set = m.win ? CARRILEADAS : LO_DEJARON_SOLO;
  const plantilla = set[semilla(m.matchId) % set.length];
  return `${plantilla(label, m.champion, m.kills, m.deaths, m.assists)}\n${porQue(m)}`;
}
