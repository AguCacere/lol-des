/**
 * El aviso de racha, con la misma vara que la cargada por partida.
 *
 * Vive separado de lib/refresh.ts (que decide CUÁNDO avisar) por la misma
 * razón que lib/roast.ts: el tono es lo que más vamos a querer tocar y
 * conviene poder leerlo y probarlo sin levantar nada.
 *
 * Antes de esto había UNA sola plantilla —"lleva N derrotas al hilo" más una
 * cláusula de tilt— y era el único mensaje del bot que nunca había pasado por
 * el filtro de las cargadas: no rotaba, no nombraba el campeón, no hablaba
 * con la voz de Teemo, y la de victorias era una línea sola ("Está prendido
 * fuego."). Tres rachas seguidas eran tres mensajes calcados, que es la forma
 * más rápida de que el canal aprenda a saltear al bot.
 *
 * Dos cosas que la cargada por partida no necesita y esta sí:
 *
 * 1. ESCALONES. Tres al hilo es una jodita, cinco es una alarma, siete es un
 *    velorio. Antes eran el mismo texto con otro número.
 * 2. El tilt DICHO EN CRIOLLO. La versión vieja decía "muere 7.7 veces por
 *    partida contra 5.8 de su promedio", que es un renglón de planilla y
 *    justo el registro que el resto de la app tiene prohibido. El mismo dato
 *    contado como habla una persona —"38 muertes en cinco partidas"— es más
 *    concreto y no tiene coma decimal. Por eso acá entran las muertes TOTALES
 *    de la racha, que son un entero exacto, y no los promedios de detectTilt.
 */
import { championLabel } from "./champion-names";
import type { TiltState } from "./tilt";

/** Lo que hace falta para escribir el aviso. Lo junta checkStreakAndNotify. */
export interface RachaCandidate {
  /** Riot ID para mostrar. */
  label: string;
  /** Racha de victorias (true) o de derrotas (false). */
  gana: boolean;
  /** Largo de la racha. Siempre >= STREAK_NOTIFY_THRESHOLD. */
  count: number;
  /** El campeón que más se repite DENTRO de la racha, si se repite alguno. */
  champion: string | null;
  /** En cuántas partidas de la racha. */
  championVeces: number;
  /** Muertes totales dentro de la racha. Entero exacto, sale de matches. */
  muertesTotales: number;
  /** Solo en rachas de derrota; detectTilt no opina de las de victoria. */
  tilt: TiltState | null;
  /**
   * Para elegir plantilla de forma estable. Es `puuid:count`, así que dos
   * corridas del cron sobre la misma racha eligen el mismo chiste, y la
   * derrota siguiente —que ya es otro count— elige otro.
   */
  clave: string;
}

/**
 * Los números chicos se escriben con letra dentro de una frase; a partir de
 * ahí, con dígitos. "38 muertes en cinco partidas" se lee como habla alguien;
 * "38 muertes en 5 partidas" ya parece un reporte.
 */
const PALABRAS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
function enLetras(n: number): string {
  return n <= 10 ? PALABRAS[n] : String(n);
}

/**
 * " con **Yasuo**" cuando toda la racha fue con el mismo, ", tres de ellas
 * con **Yasuo**" cuando fue parte. Vacío si no se repite ninguno: nombrar un
 * campeón que jugó una sola vez no agrega nada.
 *
 * Tres al hilo con Yasuo es otro chiste que tres al hilo con Malphite, y ese
 * dato estaba a una palabra de distancia del `select` que ya se hacía.
 */
function clausulaDeCampeon(c: RachaCandidate): string {
  if (!c.champion || c.championVeces < 2) return "";
  const nombre = championLabel(c.champion);
  if (c.championVeces >= c.count) return ` con **${nombre}**`;
  return `, ${enLetras(c.championVeces)} de ellas con **${nombre}**`;
}

/**
 * El tilt como una cláusula que se enchufa en el medio de la frase, con
 * guion largo adelante y SIN punto al final: la plantilla la cierra.
 *
 * Solo entra cuando detectTilt encontró algo. Que no es "perdió tres", es
 * "perdió tres jugando peor y sin parar" (ver lib/tilt.ts).
 */
function clausulaDeTilt(c: RachaCandidate): string {
  if (!c.tilt) return "";
  const partes: string[] = [];
  for (const s of c.tilt.senales) {
    if (s === "muertes") {
      partes.push(`${c.muertesTotales} muertes en ${enLetras(c.count)} partidas`);
    } else {
      const min = c.tilt.descansoMin ?? 0;
      partes.push(
        min < 1
          ? "entrando a la siguiente sin levantarse de la silla"
          : `volviendo a entrar a los ${Math.round(min)} minutos`
      );
    }
  }
  if (partes.length === 0) return "";
  // Con " y " y no con comas: son dos como mucho, y una lista con comas en
  // una frase de una línea se lee como enumeración de informe.
  return ` — ${partes.join(" y ")}`;
}

/** Lo que recibe cada plantilla, ya masticado. */
interface Vars {
  /** El Riot ID, sin negritas: las pone la plantilla donde quiere. */
  l: string;
  /** El largo de la racha. */
  n: number;
  /** " con **Yasuo**", ", tres de ellas con **Yasuo**", o vacío. */
  champ: string;
  /** " — 38 muertes en cinco partidas...", o vacío. Solo en derrotas. */
  tilt: string;
}

type Plantilla = (v: Vars) => string;

/**
 * Las frases en itálica son las de Teemo de verdad, pasadas al voseo — el bot
 * se llama Teemo y hasta ahora era el único mensaje donde no hablaba él.
 * "Nunca subestimes el poder del explorador" es la suya más conocida.
 *
 * Las dos que ya usa lib/roast.ts —"Cuidado por dónde pisás" y "Acá hay un
 * hongo con tu nombre"— no se repiten acá a propósito: son de la cargada por
 * partida y si salen en los dos lados el bot se empieza a repetir solo.
 */

/** Tres o cuatro al hilo. Todavía es una jodita y Teemo se está divirtiendo. */
const DERROTAS_JODITA: Plantilla[] = [
  (v) => `🍄 *¡Capitán Teemo en servicio!* Y el capitán informa: **${v.l}** perdió **${v.n} al hilo**${v.champ}${v.tilt}. Todavía se rescata.`,
  (v) => `🍄 *El tamaño no lo es todo.* La racha de **${v.l}** tampoco, por ahora: **${v.n} derrotas al hilo**${v.champ}${v.tilt}.`,
  (v) => `🍄 *Voy a explorar adelante.* Volví, y adelante hay **${v.n} derrotas al hilo** de **${v.l}**${v.champ}${v.tilt}. No sigas por ahí.`,
  (v) => `🍄 *¡Armado y listo!* **${v.l}** no tanto: **${v.n} al hilo**${v.champ}${v.tilt}. Andá cargando algo antes de la próxima.`,
  (v) => `🍄 *Explorar es muy divertido.* Ver a **${v.l}** perder **${v.n} al hilo**${v.champ}, un poco menos${v.tilt}.`,
  (v) => `🍄 *¡Estoy en eso!* **${v.l}** también está en eso: **${v.n} derrotas al hilo**${v.champ}${v.tilt}. Pero al revés.`,
];

/** Cinco o seis. Ya no es mala suerte y el consejo se pone serio. */
const DERROTAS_ALARMA: Plantilla[] = [
  (v) => `🍄 *Nunca subestimes el poder del explorador.* Ni el de **${v.l}** para perder **${v.n} al hilo**${v.champ}${v.tilt}. Parate, tomá agua.`,
  (v) => `🍄 *¡Muévanse, muévanse, muévanse!* Menos **${v.l}**, que va **${v.n} al hilo**${v.champ}${v.tilt}. Quedate quieto un rato.`,
  (v) => `🍄 *¡Sí, señor!* No, señor: **${v.n} derrotas al hilo** de **${v.l}**${v.champ}${v.tilt}. Esto ya no es mala suerte.`,
  (v) => `🍄 *Rompamos un par de reglas.* **${v.l}** rompió la de saber cuándo parar: **${v.n} al hilo**${v.champ}${v.tilt}.`,
  (v) => `🍄 *¡Un, dos, tres, cuatro!* **${v.n}**, en realidad, y todas perdidas. **${v.l}**${v.champ}${v.tilt}. Alto ahí.`,
  (v) => `🍄 *¡Hora de moverse!* De cola, en el caso de **${v.l}**: **${v.n} al hilo**${v.champ}${v.tilt}.`,
];

/**
 * Siete o más. Acá las frases ya no son de Teemo sino riffs sobre su voz: a
 * esta altura el chiste es que hasta él dejó de divertirse, y una línea suya
 * tal cual sonaría a que no se dio cuenta.
 */
const DERROTAS_VELORIO: Plantilla[] = [
  (v) => `⚰️ *Ya no es tan divertido explorar.* **${v.l}** lleva **${v.n} derrotas al hilo**${v.champ}${v.tilt}. Esto no es una racha, es un descenso.`,
  (v) => `⚰️ *Capitán, tenemos bajas.* **${v.n} al hilo** de **${v.l}**${v.champ}${v.tilt}. No está jugando ranked, está donando LP.`,
  (v) => `⚰️ *Se acabaron los hongos.* Y la paciencia: **${v.l}** va **${v.n} al hilo**${v.champ}${v.tilt}. Alguien avísele a la familia.`,
  (v) => `⚰️ *Retirada.* **${v.l}** no escuchó y lleva **${v.n} derrotas al hilo**${v.champ}${v.tilt}. Apagá la compu, te lo pide un yordle.`,
  (v) => `⚰️ *El código del explorador no dice nada sobre esto.* **${v.n} al hilo**, **${v.l}**${v.champ}${v.tilt}. Mañana será otro día.`,
];

/** Tres o cuatro ganadas. Se felicita, pero no del todo. */
const VICTORIAS_JODITA: Plantilla[] = [
  (v) => `🔥 *¡Capitán Teemo en servicio!* Y **${v.l}** también: **${v.n} victorias al hilo**${v.champ}. Que no se le suba.`,
  (v) => `🔥 *¡Armado y listo!* **${v.l}** viene **${v.n} al hilo**${v.champ}. Ojo que el hongo aparece cuando menos lo esperás.`,
  (v) => `🔥 *¡Justo lo que necesitaba!* **${v.l}** también, parece: **${v.n} al hilo**${v.champ}.`,
  (v) => `🔥 *¡Seguime!* Esta vez conviene: **${v.l}** lleva **${v.n} al hilo**${v.champ}.`,
  (v) => `🔥 *Explorar es muy divertido.* Ganar **${v.n} al hilo** también, y **${v.l}**${v.champ} lo está haciendo.`,
];

/** Cinco o seis ganadas. Ya hay que avisarle al resto. */
const VICTORIAS_ALARMA: Plantilla[] = [
  (v) => `🚀 *Nunca subestimes el poder del explorador.* Ni el de **${v.l}**, que va **${v.n} al hilo**${v.champ}. Alguien pare esto.`,
  (v) => `🚀 *¡Adelante!* **${v.l}** lleva **${v.n} victorias al hilo**${v.champ} y no piensa frenar.`,
  (v) => `🚀 *El tamaño no lo es todo.* La racha de **${v.l}** sí: **${v.n} al hilo**${v.champ}.`,
  (v) => `🚀 *¡Hora de moverse!* **${v.l}** se movió **${v.n} partidas al hilo**${v.champ}. Para arriba, todas.`,
  (v) => `🚀 *¡Muévanse, muévanse, muévanse!* Nadie se mueve como **${v.l}**: **${v.n} al hilo**${v.champ}.`,
];

/** Siete o más ganadas. Deja de ser una racha y pasa a ser sospechoso. */
const VICTORIAS_VELORIO: Plantilla[] = [
  (v) => `👑 *¡Capitán Teemo reportando una anomalía!* **${v.l}** lleva **${v.n} victorias al hilo**${v.champ}. Esto no es normal.`,
  (v) => `👑 *Nadie explora así.* **${v.l}** va **${v.n} al hilo**${v.champ}. Que alguien revise si es una persona.`,
  (v) => `👑 *Misión cumplida.* Y la que sigue, y la otra: **${v.n} al hilo** de **${v.l}**${v.champ}. Basta.`,
  (v) => `👑 *¡Sí, señor!* Lo que usted diga, **${v.l}**: **${v.n} victorias al hilo**${v.champ}. Ya está, ganaste.`,
];

/**
 * Los escalones. El corte en 5 y en 7 es a ojo y se puede mover: lo que
 * importa es que haya tres registros distintos y no uno solo estirado.
 */
const ALARMA_DESDE = 5;
const VELORIO_DESDE = 7;

function plantillasDe(gana: boolean, count: number): Plantilla[] {
  if (count >= VELORIO_DESDE) return gana ? VICTORIAS_VELORIO : DERROTAS_VELORIO;
  if (count >= ALARMA_DESDE) return gana ? VICTORIAS_ALARMA : DERROTAS_ALARMA;
  return gana ? VICTORIAS_JODITA : DERROTAS_JODITA;
}

/** Suma de caracteres de la clave. No necesita ser un buen hash, solo repartir parejo y ser estable. */
function indiceEstable(clave: string, total: number): number {
  let n = 0;
  for (let i = 0; i < clave.length; i++) n = (n + clave.charCodeAt(i)) % total;
  return n;
}

/** El mensaje listo para mandar a Discord. */
export function mensajeDeRacha(c: RachaCandidate): string {
  const plantillas = plantillasDe(c.gana, c.count);
  const v: Vars = {
    l: c.label,
    n: c.count,
    champ: clausulaDeCampeon(c),
    // El tilt solo tiene sentido perdiendo; detectTilt tampoco opina de las
    // rachas de victoria, pero la guarda deja la intención escrita.
    tilt: c.gana ? "" : clausulaDeTilt(c),
  };
  return plantillas[indiceEstable(c.clave, plantillas.length)](v);
}
