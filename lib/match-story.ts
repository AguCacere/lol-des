/**
 * "Dónde se dio vuelta la partida" — una lectura en castellano de lo que
 * muestra el gráfico, armada con los datos que ya tenemos guardados.
 *
 * El límite es importante y está dicho en el texto y en el tooltip: esto lee
 * TU CARRIL y los tiempos de los objetivos, no el mapa entero. No sabemos qué
 * pasó en las otras dos líneas ni en la jungla, así que la función no dice
 * "la partida se ganó acá" como si fuera un veredicto: describe tu línea, y
 * cuando el resultado no cierra con ella lo marca, que es justamente el dato
 * interesante ("tu línea la ganaste y la partida se perdió igual").
 *
 * Todo lo que devuelve sale de números guardados. Si no hay diferencia de oro
 * guardada, no hay lectura: preferimos no decir nada antes que inventar una
 * narración con dos tiempos de objetivo sueltos.
 */
import type { Match } from "./types";

/** Debajo de esto la línea está pareja: 300 de oro es menos de un ítem chico. */
const PAREJA = 300;
/** Y esto es una diferencia que ya decide la línea. */
const DECISIVA = 1500;

export interface MatchStory {
  /** La frase principal, sobre la línea. */
  linea: string;
  /** El contexto: dónde estuvo el quiebre, o qué objetivo pesó. Puede faltar. */
  contexto: string | null;
  /** Verde si la lectura es a favor, rojo si es en contra, gris si quedó pareja. */
  tono: "good" | "bad" | "neutral";
}

interface Medida {
  min: number;
  valor: number;
}

function mmss(totalSegundos: number): string {
  const m = Math.floor(totalSegundos / 60);
  const s = totalSegundos % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function oro(n: number): string {
  return `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("es-AR")}`;
}

export function buildMatchStory(m: Match): MatchStory | null {
  const medidas: Medida[] = [
    { min: 10, valor: m.goldDiff10 },
    { min: 15, valor: m.goldDiff15 },
    { min: 20, valor: m.goldDiff20 },
  ].filter((x): x is Medida => x.valor != null);

  if (medidas.length === 0) return null;

  const primera = medidas[0];
  const ultima = medidas[medidas.length - 1];

  // El tramo donde más se movió la diferencia. Con una sola medición no hay
  // tramo: el "quiebre" sería el arranque de la partida, que no dice nada.
  let quiebre: { desde: number; hasta: number; delta: number } | null = null;
  for (let i = 1; i < medidas.length; i++) {
    const delta = medidas[i].valor - medidas[i - 1].valor;
    if (quiebre === null || Math.abs(delta) > Math.abs(quiebre.delta)) {
      quiebre = { desde: medidas[i - 1].min, hasta: medidas[i].min, delta };
    }
  }

  const arrancoArriba = primera.valor >= PAREJA;
  const arrancoAbajo = primera.valor <= -PAREJA;
  const terminoArriba = ultima.valor >= PAREJA;
  const terminoAbajo = ultima.valor <= -PAREJA;

  let linea: string;
  let tono: MatchStory["tono"];

  if (arrancoArriba && terminoAbajo) {
    linea = `Ibas ganando la línea (${oro(primera.valor)} a los ${primera.min}\u2032) y se te dio vuelta: ${oro(ultima.valor)} a los ${ultima.min}\u2032.`;
    tono = "bad";
  } else if (arrancoAbajo && terminoArriba) {
    linea = `Arrancaste abajo (${oro(primera.valor)} a los ${primera.min}\u2032) y la diste vuelta: ${oro(ultima.valor)} a los ${ultima.min}\u2032.`;
    tono = "good";
  } else if (terminoArriba) {
    const estiro = ultima.valor > primera.valor;
    linea = `${estiro ? "Ganaste la línea y no la soltaste más" : "Te quedaste con la línea"}: ${oro(ultima.valor)} a los ${ultima.min}\u2032.`;
    tono = "good";
  } else if (terminoAbajo) {
    const seHundio = ultima.valor < primera.valor;
    linea = `${seHundio ? "Te comieron la línea y la diferencia no paró de crecer" : "Te comieron la línea"}: ${oro(ultima.valor)} a los ${ultima.min}\u2032.`;
    tono = "bad";
  } else {
    linea = `Quedaron mano a mano: ${oro(ultima.valor)} a los ${ultima.min}\u2032.`;
    tono = "neutral";
  }

  // El contexto: primero el quiebre si fue grande, después el objetivo que
  // más pesa. Uno solo — dos frases de contexto ya es un informe.
  const partes: string[] = [];
  if (quiebre && Math.abs(quiebre.delta) >= DECISIVA) {
    const cuando = `entre los ${quiebre.desde}\u2032 y los ${quiebre.hasta}\u2032`;
    partes.push(
      quiebre.delta > 0
        ? `La sacaste ${cuando} (${oro(quiebre.delta)}).`
        : `Se te fue ${cuando} (${oro(quiebre.delta)}).`
    );
  } else if (m.firstBaronTimeS != null && m.firstBaronMine != null) {
    partes.push(`El primer barón se lo llevó ${m.firstBaronMine ? "tu equipo" : "el rival"} a los ${mmss(m.firstBaronTimeS)}.`);
  } else if (m.firstTowerTimeS != null && m.firstTowerMine != null) {
    partes.push(`La primera torre la tiró ${m.firstTowerMine ? "tu equipo" : "el rival"} a los ${mmss(m.firstTowerTimeS)}.`);
  }

  // Y lo que de verdad vale la pena marcar: cuando tu línea y el resultado no
  // cuentan la misma historia. Es lo único que esta función puede afirmar
  // sobre el resto del mapa — que algo pasó afuera de tu línea.
  if (m.win && terminoAbajo) {
    partes.push("Igual la ganaron: se definió en otra parte del mapa.");
  } else if (!m.win && terminoArriba) {
    partes.push("Igual la perdieron: no se decidió en tu línea.");
  }

  return { linea, contexto: partes.length > 0 ? partes.join(" ") : null, tono };
}
