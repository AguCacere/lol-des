/**
 * TU LÍNEA: qué dice la diferencia de oro contra el rival de tu línea, leída
 * como trayectoria y no como un número suelto.
 *
 * ## Por qué se reescribió
 *
 * La versión anterior sacaba conclusiones que los datos no sostienen. Decía
 * "Te comieron la línea y la diferencia no paró de crecer: −521 a los 20′"
 * sobre esta secuencia real:
 *
 *     10′ −204    15′ −717    20′ −521
 *
 * Dos problemas, y el segundo es el grave. Uno: "te comieron la línea" es un
 * juicio —una diferencia de oro negativa no demuestra que el rival te haya
 * dominado, ni que hayas jugado mal, ni que eso decidiera la partida—. Dos:
 * **"no paró de crecer" es directamente falso**. Entre el 15′ y el 20′ la
 * brecha se achicó 196. La frase se armaba comparando solo la PRIMERA y la
 * ÚLTIMA medición, así que el medio —que es donde está lo interesante— no se
 * miraba nunca.
 *
 * Y había una tercera, de otro tipo: la función cerraba con "Igual la ganaron:
 * se definió en otra parte del mapa". Eso no se puede afirmar con una
 * diferencia de oro y cuatro tiempos de objetivo.
 *
 * ## Qué hace ahora
 *
 * Lee la trayectoria entera y describe. Nada de causalidad, nada de juicio:
 *
 *   - **el pico**: el punto más lejos del cero, con su minuto;
 *   - **qué pasó después del pico**, si hubo algo después;
 *   - **si cambió de signo** entre la primera y la última.
 *
 * Y de ahí sale UNA frase factual. "Recuperaste 196 de oro relativo entre el
 * 15′ y el 20′" dice exactamente lo que pasó y no una pizca más.
 *
 * Todo lo que devuelve sale de números guardados. Sin diferencia de oro no hay
 * lectura: preferimos no decir nada antes que narrar con dos tiempos sueltos.
 */
import type { Match } from "./types";

/**
 * Debajo de esto la línea está pareja: 300 de oro es menos de un ítem chico.
 * Se usa SOLO para elegir el color y para no decir "ventaja" de una diferencia
 * que no lo es. Nunca para clasificar la brecha en leve/moderada/grave: esos
 * escalones serían inventados y el pedido es explícito en que no los haya.
 */
const PAREJA = 300;

export interface Medida {
  min: number;
  valor: number;
}

export interface LecturaDeLinea {
  /** Las mediciones que de verdad existen, en orden. Nunca rellenadas. */
  medidas: Medida[];
  /**
   * El punto más lejos del cero. Con empate gana el PRIMERO: es el minuto en
   * el que se llegó a esa diferencia, y haberla sostenido no la mueve.
   */
  pico: Medida;
  /**
   * Cómo llamarlo en pantalla.
   *
   * "Mayor brecha" servía para los dos lados y obligaba a leer el signo para
   * saber de cuál: con +1.200 también era "la mayor brecha". "Ventaja" y
   * "desventaja" se entienden sin mirar el número.
   */
  picoEs: "ventaja" | "desventaja" | "diferencia";
  /**
   * Lo que pasó entre el pico y la última medición. `null` si el pico ES la
   * última: ahí no hay "después" que contar.
   */
  despues: { desde: number; hasta: number; delta: number; valor: number } | null;
  /** Si la diferencia se movió siempre en la misma dirección, alejándose del cero. */
  siempreCreciendo: boolean;
  /** Si la primera y la última caen de lados distintos del cero. */
  cambioDeSigno: boolean;
  /** La frase descriptiva. `null` cuando hay una sola medición y no hay trayectoria que contar. */
  frase: string | null;
  /** Verde / rojo / gris según dónde TERMINÓ, no según el pico. Es un acento, no un veredicto. */
  tono: "good" | "bad" | "neutral";
}

/** Con signo, y sin signo en el cero — ver la nota de `puntajeTexto` en lib/liga.ts. */
export function oro(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-AR")}`;
}

/** Sin signo: para las cantidades que ya vienen explicadas por el verbo ("recuperaste 196"). */
function cantidad(n: number): string {
  return Math.abs(n).toLocaleString("es-AR");
}

/**
 * La lectura de una trayectoria. Pura y determinística: entran mediciones,
 * sale una descripción. Sin IA, sin umbrales inventados, sin causalidad.
 */
export function leerLinea(medidas: Medida[]): LecturaDeLinea | null {
  if (medidas.length === 0) return null;

  const ordenadas = [...medidas].sort((a, b) => a.min - b.min);
  const primera = ordenadas[0];
  const ultima = ordenadas[ordenadas.length - 1];

  // El pico: el más lejos del cero. El `>` estricto hace que un empate lo gane
  // el más temprano, que es cuando pasó.
  let pico = ordenadas[0];
  for (const med of ordenadas) {
    if (Math.abs(med.valor) > Math.abs(pico.valor)) pico = med;
  }

  const picoEs: LecturaDeLinea["picoEs"] =
    pico.valor >= PAREJA ? "ventaja" : pico.valor <= -PAREJA ? "desventaja" : "diferencia";

  const despues =
    pico.min === ultima.min
      ? null
      : { desde: pico.min, hasta: ultima.min, delta: ultima.valor - pico.valor, valor: ultima.valor };

  // "Siguió creciendo" solo si CADA tramo se alejó del cero en la misma
  // dirección. Mirar nada más la primera y la última es justo el error que
  // producía "no paró de crecer" sobre una brecha que se había achicado.
  const siempreCreciendo =
    ordenadas.length > 1 &&
    ordenadas.every((med, i) => i === 0 || Math.abs(med.valor) > Math.abs(ordenadas[i - 1].valor)) &&
    ordenadas.every((med) => Math.sign(med.valor) === Math.sign(ultima.valor) || med.valor === 0);

  const cambioDeSigno =
    ordenadas.length > 1 &&
    ((primera.valor <= -PAREJA && ultima.valor >= PAREJA) || (primera.valor >= PAREJA && ultima.valor <= -PAREJA));

  const tono: LecturaDeLinea["tono"] =
    ultima.valor >= PAREJA ? "good" : ultima.valor <= -PAREJA ? "bad" : "neutral";

  return {
    medidas: ordenadas,
    pico,
    picoEs,
    despues,
    siempreCreciendo,
    cambioDeSigno,
    frase: fraseDe({ ordenadas, primera, ultima, pico, despues, siempreCreciendo, cambioDeSigno }),
    tono,
  };
}

/**
 * La frase, en orden de prioridad. Una sola: dos ya son un informe.
 *
 * Ninguna rama explica POR QUÉ pasó algo, porque con estos datos no se puede.
 * Todas dicen qué se midió y cuándo.
 */
function fraseDe(d: {
  ordenadas: Medida[];
  primera: Medida;
  ultima: Medida;
  pico: Medida;
  despues: LecturaDeLinea["despues"];
  siempreCreciendo: boolean;
  cambioDeSigno: boolean;
}): string | null {
  // Con una sola medición no hay trayectoria. El valor ya se muestra arriba;
  // repetirlo en una frase no agrega nada.
  if (d.ordenadas.length < 2) return null;

  // Lo más informativo que puede pasar: terminar del otro lado del cero. Se
  // dice con los dos números y nada más. NO se lo llama "remontada" ni "se te
  // dio vuelta": eso ya sería contar una historia sobre el porqué.
  if (d.cambioDeSigno) {
    return `Pasaste de ${oro(d.primera.valor)} a los ${d.primera.min}′ a ${oro(d.ultima.valor)} a los ${d.ultima.min}′.`;
  }

  if (d.despues && d.despues.delta !== 0) {
    const { desde, hasta, delta, valor } = d.despues;
    // Veníamos abajo y la brecha se achicó.
    if (d.pico.valor < 0 && delta > 0) {
      return `Entre el ${desde}′ y el ${hasta}′ recuperaste ${cantidad(delta)} de oro relativo.`;
    }
    // Veníamos arriba y la ventaja se achicó.
    if (d.pico.valor > 0 && delta < 0) {
      return `A los ${hasta}′ la ventaja se había reducido a ${oro(valor)}.`;
    }
  }

  if (d.siempreCreciendo) {
    return d.ultima.valor < 0
      ? `La brecha siguió creciendo hasta los ${d.ultima.min}′.`
      : `La ventaja siguió creciendo hasta los ${d.ultima.min}′.`;
  }

  return null;
}

/** La lectura de una partida, con las tres mediciones que guardamos. */
export function lecturaDeOro(m: Match): LecturaDeLinea | null {
  return leerLinea(
    [
      { min: 10, valor: m.goldDiff10 },
      { min: 15, valor: m.goldDiff15 },
      { min: 20, valor: m.goldDiff20 },
    ].filter((x): x is Medida => x.valor != null),
  );
}

/** Un hito de LA PARTIDA: cuándo pasó y de quién fue. Sin una palabra sobre qué causó. */
export interface Hito {
  /** Segundos desde el arranque. */
  s: number;
  label: string;
  /** De tu equipo, del rival, o no se sabe (partidas viejas). */
  mio: boolean | null;
}

export function mmss(totalSegundos: number): string {
  const m = Math.floor(totalSegundos / 60);
  const s = totalSegundos % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Los hitos guardados, en orden. Lista, no relato: antes el barón venía con
 * una explicación de por qué la partida se había definido en otro lado, que es
 * exactamente lo que estos datos no pueden decir.
 */
export function hitosDe(m: Match): Hito[] {
  const hitos: Hito[] = [];
  // "1ª sangre" y "1ª torre" y no "Primera …": en el riel las etiquetas van
  // una al lado de la otra y a 390px las largas se pisaban. Medido.
  if (m.firstBloodTimeS != null) hitos.push({ s: m.firstBloodTimeS, label: "1ª sangre", mio: m.firstBlood ? true : null });
  if (m.firstDragonTimeS != null) hitos.push({ s: m.firstDragonTimeS, label: "Dragón", mio: m.firstDragonMine });
  if (m.firstTowerTimeS != null) hitos.push({ s: m.firstTowerTimeS, label: "1ª torre", mio: m.firstTowerMine });
  if (m.firstBaronTimeS != null) hitos.push({ s: m.firstBaronTimeS, label: "Barón", mio: m.firstBaronMine });
  return hitos.sort((a, b) => a.s - b.s);
}

/**
 * Cuántas diferencias a los 15′ hacen falta para animarse a decir "pocas
 * veces". Con menos que esto el decil es ruido: en 15 partidas, las dos peores
 * son el 13% por definición y no significan nada.
 */
const MINIMO_HISTORIAL = 40;
/** Qué tan al borde hay que estar. Un décimo para cada lado. */
const DECIL = 0.1;

/**
 * Si esta diferencia a los 15′ está entre las más extremas del propio
 * historial del jugador.
 *
 * Es el único "contexto" que se muestra, y existe para no tener que inventar
 * escalones —leve / moderada / grave— que no salen de ningún lado. Acá no hay
 * umbral elegido a dedo: se compara contra las diferencias a los 15′ que ese
 * jugador de verdad tiene guardadas, y solo se dice algo si cae en el décimo
 * de arriba o en el de abajo.
 *
 * Se mide SOLO contra el minuto 15 porque es el único de los tres que está
 * guardado en todas las partidas. Comparar el 20′ de hoy contra los 15′ de
 * siempre sería comparar dos cosas distintas.
 *
 * `null` cuando no hay historial suficiente, que es la respuesta correcta y no
 * un caso degradado: mejor "−717 a los 15′" pelado que una etiqueta inventada.
 */
export function rarezaDeBrecha(historial: number[], valor: number): "abajo" | "arriba" | null {
  const validos = historial.filter((v) => Number.isFinite(v));
  if (validos.length < MINIMO_HISTORIAL) return null;
  const peores = validos.filter((v) => v < valor).length;
  const mejores = validos.filter((v) => v > valor).length;
  if (peores / validos.length <= DECIL) return "abajo";
  if (mejores / validos.length <= DECIL) return "arriba";
  return null;
}
