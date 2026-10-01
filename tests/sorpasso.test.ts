/**
 * "Alguien te pasó". Lo que más importa acá es lo que NO tiene que anunciar:
 * un mensaje de más en el canal cada quince minutos cansa en un día.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarSorpaso, mensajeDeSorpaso, type PuestoLadder } from "../lib/sorpasso";

const p = (puuid: string, score: number): PuestoLadder => ({
  puuid,
  label: puuid,
  score,
  rango: "Esmeralda 2",
  lp: score % 100,
});

test("alguien sube un puesto jugando y se anuncia", () => {
  const antes = [p("a", 2400), p("b", 2380), p("c", 2300)];
  const despues = [p("b", 2420), p("a", 2400), p("c", 2300)];
  const s = detectarSorpaso(antes, despues);
  assert.ok(s);
  assert.equal(s.quien, "b");
  assert.equal(s.aQuien, "a");
  assert.equal(s.puesto, 1);
  assert.equal(s.porLp, 20);
});

test("si el que pasa no jugó, no se anuncia", () => {
  // El puntaje de "b" no cambió: quedó arriba porque "a" perdió. Eso ya lo
  // cuenta el bot por otro lado.
  const antes = [p("a", 2400), p("b", 2380), p("c", 2300)];
  const despues = [p("b", 2380), p("a", 2360), p("c", 2300)];
  assert.equal(detectarSorpaso(antes, despues), null);
});

test("el mismo orden no anuncia nada aunque se muevan los puntajes", () => {
  const antes = [p("a", 2400), p("b", 2380)];
  const despues = [p("a", 2440), p("b", 2360)];
  assert.equal(detectarSorpaso(antes, despues), null);
});

test("un puesto más abajo del vigilado no es noticia", () => {
  const antes = [p("a", 2400), p("b", 2380), p("c", 2300), p("d", 2200), p("e", 2100)];
  const despues = [p("a", 2400), p("b", 2380), p("c", 2300), p("e", 2250), p("d", 2200)];
  assert.equal(detectarSorpaso(antes, despues), null);
  // Y con la ventana abierta hasta el quinto, sí.
  const s = detectarSorpaso(antes, despues, 5);
  assert.ok(s);
  assert.equal(s.quien, "e");
  assert.equal(s.puesto, 4);
});

test("el que aparece de la nada no pasó a nadie", () => {
  const antes = [p("a", 2400), p("b", 2380)];
  const despues = [p("nuevo", 2500), p("a", 2400), p("b", 2380)];
  assert.equal(detectarSorpaso(antes, despues), null);
});

test("el que desaparece tampoco genera un sorpaso", () => {
  const antes = [p("a", 2400), p("b", 2380), p("c", 2300)];
  const despues = [p("b", 2390), p("c", 2300)];
  // "b" subió al primer puesto y jugó, pero el que estaba arriba ya no está
  // en la lista: no se puede decir a quién pasó.
  assert.equal(detectarSorpaso(antes, despues), null);
});

test("con dos puestos movidos se anuncia el de más arriba", () => {
  const antes = [p("a", 2400), p("b", 2380), p("c", 2300), p("d", 2290)];
  const despues = [p("b", 2420), p("a", 2400), p("d", 2310), p("c", 2300)];
  const s = detectarSorpaso(antes, despues);
  assert.ok(s);
  assert.equal(s.puesto, 1, "gana el del puesto más alto");
  assert.equal(s.quien, "b");
});

test("una lista de una sola persona no puede producir nada", () => {
  assert.equal(detectarSorpaso([p("a", 2400)], [p("a", 2500)]), null);
  assert.equal(detectarSorpaso([], []), null);
});

test("el mensaje distingue el primer puesto del resto", () => {
  const primero = mensajeDeSorpaso({ quien: "b", aQuien: "a", puesto: 1, porLp: 20, rango: "Esmeralda 2", lp: 45 });
  assert.match(primero, /\*\*nuevo número 1\*\*/);
  assert.match(primero, /por 20 LP/);
  const tercero = mensajeDeSorpaso({ quien: "b", aQuien: "a", puesto: 3, porLp: 1, rango: "Platino 1", lp: 3 });
  assert.match(tercero, /3º/);
  assert.match(tercero, /por 1 LP/, "en singular");
});
