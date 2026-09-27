/**
 * **Aegis of Valor: qué partidas parecen haberlo recibido.**
 *
 * Riot no expone este dato en ningún campo de Match-V5 —lo buscamos tres
 * veces, incluida una partida que sabemos que lo activó—, así que esto es y
 * va a seguir siendo una INFERENCIA. Lo que cambió es de qué está hecha.
 *
 * Antes: un contador. "3 posibles doble LP, 6 veces protegido en derrota",
 * sobre un recorrido propio de las fotos que además ubicaba las partidas por
 * cuándo EMPEZARON. Dos problemas: el número no servía para nada —no se podía
 * ir a ver cuáles eran— y la atribución era peor que la del gráfico de
 * progresión, que miraba lo mismo con otro criterio.
 *
 * Ahora: **las partidas concretas**. La atribución de LP sale entera de
 * `atribuirLp` (lib/atribucion.ts), la misma que dibuja la progresión, y acá
 * queda solo lo propio de Aegis: contra qué se compara cada victoria y cuándo
 * alcanza para decir algo.
 *
 * ## Cómo se decide
 *
 * Se compara **contra el historial de esa misma persona**, nunca contra otras.
 * El LP por victoria depende del MMR de cada uno, así que un umbral absoluto
 * ("más de 50 LP") marcaría Aegis en cualquiera que esté subiendo rápido y no
 * lo marcaría nunca en uno estancado.
 *
 *     victorias aisladas:  +27 +29 +28 +30 +29   → mediana 29
 *     esta victoria:       +58                   → 58 / 29 = 2,0×
 *
 * La mediana y no el promedio: un par de victorias raras no la mueven, que es
 * justamente lo que hace falta cuando lo que se busca son las raras.
 *
 * ## Medido contra la base antes de fijar los umbrales
 *
 * De los catorce jugadores, doce tienen trece o más victorias con LP propio
 * atribuido (la mediana de cada uno cae entre 18 y 30 LP). Con el umbral de
 * 1,7× salen **27 candidatas en total**, y lo interesante es cómo se reparten:
 * ninguna cae entre 1,0× y 1,89×. Todas están entre **1,89× y 2,22×** —36, 38,
 * 40 y 42 LP contra medianas de 18 y 19; 60 contra 30; 56 contra 28—, o sea
 * que son el doble exacto de una victoria normal de esa persona. No hay zona
 * gris: o es una victoria común o es el doble. Eso es lo que da confianza en
 * que esto está mirando la mecánica y no el ruido.
 *
 * Los contadores de victorias confirman las 27. Las únicas dos ventanas con
 * contadores raros de toda la base no son candidatas.
 *
 * Y son raras: entre una y cinco por persona sobre meses de historial. Por eso
 * la chapa en la partida casi nunca se va a ver en las cinco que muestra el
 * perfil, y por eso existe además el contador en Récords.
 *
 * ## Qué NO se detecta más: las derrotas protegidas
 *
 * La versión anterior marcaba como "protegida" toda derrota que perdiera menos
 * de un cuarto de lo habitual. No se sostiene: perder poco tiene al menos dos
 * causas normales y frecuentes que no son Aegis —el MMR muy por encima del
 * rango (típico después de ascender) y el piso de 0 LP de una división, que
 * recorta la derrota sin que intervenga nada más—. Con nuestros datos no hay
 * forma de separar esas de una protección real, así que la señal se fue
 * entera en vez de seguir mostrándose como si fuera Aegis. Ver DECISIONES.
 */

import { atribuirLp, type PartidaUbicable } from "./atribucion";
import type { Aegis, AegisDetection, LpHistoryPoint } from "./types";

/**
 * Victorias aisladas que hacen falta para que la mediana propia signifique
 * algo. Con cinco, una sola victoria rara ya la corre; con ocho hay contra
 * qué comparar. Abajo de esto no se emite NADA — preferimos no marcar un
 * Aegis dudoso antes que mostrar uno falso.
 */
export const MIN_VICTORIAS = 8;

/** Y desde acá la mediana es lo bastante firme como para afirmar, no solo sugerir. */
export const MIN_VICTORIAS_ALTA = 12;

/**
 * Cuánto tiene que despegarse de la mediana propia para ser candidata.
 *
 * 1,7 es el umbral que ya usaba la versión anterior y se queda: los deltas
 * reales bailan con el MMR y con el bonus de primera victoria del día, así que
 * un piso duro en 2,0 se perdería casos reales. Lo que cambia es que 1,7 ya no
 * alcanza para AFIRMAR, solo para sugerir.
 */
export const RATIO_POSIBLE = 1.7;

/** Cerca de 2×, que es de lo que se habla cuando se habla de doble LP. */
export const RATIO_ALTO = 1.85;

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[mitad - 1] + orden[mitad]) / 2 : orden[mitad];
}

/**
 * `fotosAsc` ascendentes por `capturedAt` y ya deduplicadas; `partidas` es
 * TODO el historial ranked solo/duo guardado de esa persona, sin remakes y sin
 * Clash (la ruta del ladder ya los filtra en la consulta, y son otra población:
 * un remake no mueve LP, así que no puede ser una muestra de cuánto mueve una
 * victoria).
 *
 * Devuelve null cuando no hay con qué decir nada.
 */
export function detectarAegis(fotosAsc: LpHistoryPoint[], partidas: PartidaUbicable[]): Aegis | null {
  if (fotosAsc.length < 2 || partidas.length === 0) return null;

  const { atribuidas } = atribuirLp(fotosAsc, partidas);
  const victorias = atribuidas.filter((t) => t.partida.win);
  if (victorias.length < MIN_VICTORIAS) return null;

  const base = mediana(victorias.map((t) => t.lp));
  // Una mediana en cero o negativa no es una referencia de nada: pasa con un
  // historial de fotos tan incompleto que casi ningún tramo cierra bien.
  if (base <= 0) return null;

  const detections: AegisDetection[] = [];
  for (const t of victorias) {
    const ratio = t.lp / base;
    if (ratio < RATIO_POSIBLE) continue;
    // Los contadores dicen que en ese tramo pasó algo más de lo que tenemos
    // guardado, así que el delta NO es de esta partida sola: es justo el caso
    // que fabrica un "doble LP" falso —dos victorias sumadas dan ~2× la
    // mediana—. Se descarta la candidata, no se la baja de confianza.
    if (t.wl === "contradice") continue;
    const alta = ratio >= RATIO_ALTO && victorias.length >= MIN_VICTORIAS_ALTA && t.wl === "ok";
    detections.push({
      matchId: t.partida.matchId,
      lpDelta: t.lp,
      baselineLp: Math.round(base),
      ratio: Math.round(ratio * 10) / 10,
      confidence: alta ? "high" : "possible",
    });
  }

  return { detections, baselineLp: Math.round(base), sampleSize: victorias.length };
}
