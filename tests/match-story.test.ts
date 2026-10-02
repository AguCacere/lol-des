/**
 * La lectura de la línea: que describa lo que pasó y NO una pizca más.
 *
 * Cada caso de acá sale del pedido, y el primero es el que motivó la
 * reescritura: con 10′ −204, 15′ −717 y 20′ −521 la versión vieja decía "la
 * diferencia no paró de crecer", que es objetivamente falso — entre el 15′ y
 * el 20′ se achicó 196. Pasaba porque comparaba solo la primera medición con
 * la última y el medio no se miraba.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerLinea } from "../lib/match-story";

const M = (min: number, valor: number) => ({ min, valor });

/* ── A. El caso real de la captura ── */

test("A: −204 / −717 / −521 encuentra el pico en el 15′, no en el 20′", () => {
  const l = leerLinea([M(10, -204), M(15, -717), M(20, -521)])!;
  assert.equal(l.pico.min, 15);
  assert.equal(l.pico.valor, -717);
  assert.equal(l.picoEs, "desventaja");
});

test("A: y cuenta la recuperación posterior, con el número exacto", () => {
  const l = leerLinea([M(10, -204), M(15, -717), M(20, -521)])!;
  assert.deepEqual(l.despues, { desde: 15, hasta: 20, delta: 196, valor: -521 });
  assert.equal(l.frase, "Entre el 15′ y el 20′ recuperaste 196 de oro relativo.");
});

test("A: NUNCA puede decir que la diferencia no paró de crecer", () => {
  const l = leerLinea([M(10, -204), M(15, -717), M(20, -521)])!;
  assert.equal(l.siempreCreciendo, false);
  assert.doesNotMatch(l.frase ?? "", /no paró de crecer|siguió creciendo/);
  // Y ninguna de las palabras que el pedido prohíbe.
  assert.doesNotMatch(l.frase ?? "", /comieron|aplastaste|dominaste|destruyeron|se definió|se perdió por/i);
});

/* ── B. La brecha que sí siguió creciendo ── */

test("B: −200 / −700 / −1400 sí puede decir que siguió creciendo", () => {
  const l = leerLinea([M(10, -200), M(15, -700), M(20, -1400)])!;
  assert.equal(l.siempreCreciendo, true);
  assert.equal(l.pico.min, 20);
  assert.equal(l.despues, null);
  assert.equal(l.frase, "La brecha siguió creciendo hasta los 20′.");
});

/* ── C. La ventaja que se achicó ── */

test("C: +400 / +900 / +300 marca el pico a favor y que se redujo", () => {
  const l = leerLinea([M(10, 400), M(15, 900), M(20, 300)])!;
  assert.equal(l.pico.valor, 900);
  assert.equal(l.pico.min, 15);
  assert.equal(l.picoEs, "ventaja");
  assert.equal(l.frase, "A los 20′ la ventaja se había reducido a +300.");
  assert.equal(l.tono, "good");
});

/* ── D. El cambio de signo, sin llamarlo remontada ── */

test("D: −800 / −100 / +500 detecta el cambio de signo", () => {
  const l = leerLinea([M(10, -800), M(15, -100), M(20, 500)])!;
  assert.equal(l.cambioDeSigno, true);
  assert.equal(l.frase, "Pasaste de −800 a los 10′ a +500 a los 20′.");
});

test("D: y no lo llama remontada ni se te dio vuelta", () => {
  const l = leerLinea([M(10, -800), M(15, -100), M(20, 500)])!;
  assert.doesNotMatch(l.frase ?? "", /remont|dio vuelta|diste vuelta/i);
});

/* ── E. Datos incompletos ── */

test("E: sin ninguna medición no hay lectura", () => {
  assert.equal(leerLinea([]), null);
});

test("E: con una sola medición hay pico pero NO frase inventada", () => {
  const l = leerLinea([M(15, -717)])!;
  assert.equal(l.pico.valor, -717);
  assert.equal(l.despues, null);
  assert.equal(l.frase, null);
  // Y no se inventa un punto que no existe.
  assert.equal(l.medidas.length, 1);
});

test("E: con dos mediciones alcanza, y no se rellena la tercera", () => {
  const l = leerLinea([M(10, -204), M(20, -521)])!;
  assert.equal(l.medidas.length, 2);
  assert.equal(l.pico.min, 20);
  assert.equal(l.frase, "La brecha siguió creciendo hasta los 20′.");
});

test("E: las mediciones desordenadas se ordenan por minuto", () => {
  const l = leerLinea([M(20, -521), M(10, -204), M(15, -717)])!;
  assert.deepEqual(l.medidas.map((x) => x.min), [10, 15, 20]);
});

/* ── La línea pareja ── */

test("una diferencia chica no es ni ventaja ni brecha", () => {
  const l = leerLinea([M(10, 40), M(15, -80), M(20, 120)])!;
  assert.equal(l.picoEs, "diferencia");
  assert.equal(l.tono, "neutral");
  assert.equal(l.cambioDeSigno, false);
});

test("el cero no se escribe con signo", () => {
  const l = leerLinea([M(10, 500), M(20, 0)])!;
  assert.doesNotMatch(l.frase ?? "", /−0|\+0/);
});

/* ── El empate de picos ── */

test("con dos picos iguales gana el más temprano: es cuando se llegó", () => {
  const l = leerLinea([M(10, -700), M(15, -300), M(20, -700)])!;
  assert.equal(l.pico.min, 10);
});

/* ── El rótulo del pico no puede contradecir su signo ── */

test("con −800 / −100 / +500 el pico es una DESVENTAJA aunque la línea termine arriba", () => {
  const l = leerLinea([M(10, -800), M(15, -100), M(20, 500)])!;
  // El tono general mira dónde terminó; el pico, su propio signo. Pintar
  // −800 de verde porque terminó en +500 decía lo contrario del número.
  assert.equal(l.tono, "good");
  assert.equal(l.pico.valor, -800);
  assert.equal(l.picoEs, "desventaja");
});

/* ── El contexto histórico: solo cuando el historial lo sostiene ── */

import { rarezaDeBrecha } from "../lib/match-story";

/** Un historial parejo de -1000 a +999, para tener deciles predecibles. */
const HISTORIAL = Array.from({ length: 200 }, (_, i) => i * 10 - 1000);

test("sin historial suficiente NO se clasifica nada", () => {
  assert.equal(rarezaDeBrecha([], -717), null);
  assert.equal(rarezaDeBrecha(HISTORIAL.slice(0, 39), -2000), null);
});

test("con historial, una brecha del décimo de abajo se marca", () => {
  assert.equal(rarezaDeBrecha(HISTORIAL, -950), "abajo");
});

test("y una del décimo de arriba también", () => {
  assert.equal(rarezaDeBrecha(HISTORIAL, 950), "arriba");
});

test("una diferencia del montón NO se marca", () => {
  assert.equal(rarezaDeBrecha(HISTORIAL, 0), null);
  assert.equal(rarezaDeBrecha(HISTORIAL, -500), null);
});

test("los nulos del historial no cuentan como partidas", () => {
  const conHuecos = [...HISTORIAL.slice(0, 30), ...Array(50).fill(NaN)];
  assert.equal(rarezaDeBrecha(conHuecos, -1000), null);
});
