/**
 * Detección de tilt: no "vas perdiendo", sino "estás jugando peor Y no estás
 * parando".
 *
 * La racha de derrotas sola no dice nada — perder tres seguidas le pasa a
 * cualquiera en un rato normal de juego, y para eso ya está el chip de racha
 * en el header. Lo que separa una mala tarde de un pozo es la combinación:
 * las muertes suben respecto de tu propio promedio, y el tiempo entre partida
 * y partida se achica porque estás entrando a la siguiente sin levantarte de
 * la silla.
 *
 * Los dos datos ya estaban guardados (deaths, played_at, duración): esto no
 * pide nada nuevo a Riot, solo mira lo mismo de otra manera.
 */

export interface TiltInput {
  win: boolean;
  deaths: number;
  /** Arranque de la partida en ms. */
  playedAtMs: number;
  durMin: number;
}

export interface TiltState {
  /** Largo de la racha de derrotas actual. */
  derrotas: number;
  /** Promedio de muertes DENTRO de la racha. */
  muertesRacha: number;
  /** Y el promedio de antes de la racha, que es contra lo que se compara. */
  muertesBase: number;
  /** Minutos promedio entre el final de una partida y el arranque de la siguiente. Null si la racha es de una sola partida. */
  descansoMin: number | null;
  /**
   * Qué señales se dispararon, como códigos y no como texto.
   *
   * El texto lo arma cada lugar donde se muestra, y no acá, porque no es el
   * mismo: la app le habla al jugador ("morís 9.5 veces") y el bot habla DE
   * él ("muere 9.5 veces"). Cuando el texto vivía acá, el mensaje de Discord
   * mezclaba las dos personas en la misma oración —"está en racha de 3
   * derrotas — estás entrando a la siguiente..."— y se leía mal.
   */
  senales: SenalTilt[];
  nivel: "aviso" | "fuerte";
}

/** `muertes`: muere más que su propio promedio. `sinParar`: vuelve a entrar enseguida. */
export type SenalTilt = "muertes" | "sinParar";

/** Menos de esto es una mala racha, no un pozo. */
const MIN_DERROTAS = 3;
/** Volver a entrar antes de estos minutos es no haber parado. */
const DESCANSO_CORTO_MIN = 10;
/** Cuánto tienen que subir las muertes sobre tu propio promedio para contar. */
const FACTOR_MUERTES = 1.2;
/** Partidas previas mínimas para que el promedio base signifique algo. */
const BASE_MINIMA = 5;
/**
 * Y cuántas se miran hacia atrás como mucho. El promedio de toda la carrera
 * no es contra lo que hay que comparar: la referencia útil es cómo venías
 * jugando hace un rato, no hace cuatro meses.
 */
const BASE_VENTANA = 20;
/** A partir de acá el aviso es fuerte aunque haya una sola señal. */
const DERROTAS_GRAVES = 5;

function promedio(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * `matches` tiene que venir de la más nueva a la más vieja (played_at DESC),
 * que es como ya sale de la base.
 */
export function detectTilt(matches: TiltInput[]): TiltState | null {
  if (matches.length === 0) return null;

  // La racha se corta en la primera victoria: si ganó la última, no hay nada
  // que avisar por más feas que hayan sido las anteriores.
  if (matches[0].win) return null;
  let derrotas = 0;
  while (derrotas < matches.length && !matches[derrotas].win) derrotas++;
  if (derrotas < MIN_DERROTAS) return null;

  const racha = matches.slice(0, derrotas);
  const previas = matches.slice(derrotas, derrotas + BASE_VENTANA);

  const muertesRacha = promedio(racha.map((m) => m.deaths));
  // La base son las partidas ANTERIORES a la racha, no todas: incluir la
  // racha en su propio promedio lo empuja hacia arriba y esconde justo la
  // diferencia que se está buscando.
  const muertesBase = previas.length >= BASE_MINIMA ? promedio(previas.map((m) => m.deaths)) : NaN;

  // El descanso real es entre el FIN de una y el arranque de la siguiente, no
  // entre arranques: si no, una partida de 40 minutos se leería como un
  // descanso largo.
  const huecos: number[] = [];
  for (let i = 0; i < racha.length - 1; i++) {
    const nueva = racha[i];
    const vieja = racha[i + 1];
    const finVieja = vieja.playedAtMs + vieja.durMin * 60_000;
    huecos.push(Math.max(0, (nueva.playedAtMs - finVieja) / 60_000));
  }
  const descansoMin = huecos.length > 0 ? promedio(huecos) : null;

  const senales: SenalTilt[] = [];
  if (!Number.isNaN(muertesBase) && muertesRacha >= muertesBase * FACTOR_MUERTES) senales.push("muertes");
  if (descansoMin != null && descansoMin < DESCANSO_CORTO_MIN) senales.push("sinParar");

  // Sin ninguna de las dos señales esto es una racha de derrotas y nada más,
  // y de eso ya avisa el chip del header. Repetirlo acá sería ruido.
  if (senales.length === 0) return null;

  return {
    derrotas,
    muertesRacha: Number(muertesRacha.toFixed(1)),
    muertesBase: Number.isNaN(muertesBase) ? 0 : Number(muertesBase.toFixed(1)),
    descansoMin: descansoMin == null ? null : Number(descansoMin.toFixed(1)),
    senales,
    nivel: derrotas >= DERROTAS_GRAVES || senales.length === 2 ? "fuerte" : "aviso",
  };
}
