/**
 * Los acontecimientos de la semana en curso. Lo que se prueba es sobre todo
 * lo que NO tiene que decir: sin datos, nada; sin margen, nada; y nunca una
 * predicción.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { acontecimientos, cercaDelRecord, type FilaAhora, recordDeLaLiga } from "../lib/liga-ahora";

const f = (name: string, puntos: number, extra: Partial<FilaAhora> = {}): FilaAhora => ({
  puuid: name,
  name,
  victorias: 8,
  derrotas: 3,
  sinJugar: false,
  puntos,
  ...extra,
});

test("sin nadie que haya jugado no hay acontecimientos", () => {
  assert.deepEqual(acontecimientos([], 10, 3), []);
  assert.deepEqual(acontecimientos([f("Ana", 0, { sinJugar: true })], 10, 3), []);
});

test("con uno solo no hay margen que contar", () => {
  const a = acontecimientos([f("Ana", 5)], 10, 3);
  assert.equal(a.filter((x) => x.clase === "margen").length, 0);
});

test("el margen con el segundo es lo primero que se dice", () => {
  const a = acontecimientos([f("Ana", 6.25), f("Beto", 5.5)], 10, 3);
  assert.equal(a[0].clase, "margen");
  assert.equal(a[0].texto, "Beto está a 0,75 de Ana");
});

test("empate arriba se dice como empate, no como margen de 0", () => {
  const a = acontecimientos([f("Ana", 6), f("Beto", 6)], 10, 3);
  assert.match(a[0].texto, /empatados arriba/);
});

test("una racha de 2 no es noticia; de 3 sí", () => {
  const dos = acontecimientos([f("Ana", 6, { racha: { resultado: "W", cantidad: 2 } })], 10, 3);
  assert.equal(dos.filter((x) => x.clase === "racha").length, 0);
  const tres = acontecimientos([f("Ana", 6, { racha: { resultado: "W", cantidad: 3 } })], 10, 3);
  assert.equal(tres.find((x) => x.clase === "racha")?.texto, "Ana lleva 3 victorias seguidas");
});

test("una racha de derrotas NO se anuncia acá", () => {
  const a = acontecimientos([f("Ana", 6, { racha: { resultado: "L", cantidad: 5 } })], 10, 3);
  assert.equal(a.filter((x) => x.clase === "racha").length, 0);
});

test("subir de puesto sale de porDia y solo entre los tres primeros", () => {
  // Beto cerró ayer 4.º (2 puntos) y hoy va 2.º.
  const tabla = [
    f("Ana", 9, { porDia: [0, 5, 9] }),
    f("Beto", 8, { porDia: [0, 2, 8] }),
    f("Caro", 7, { porDia: [0, 4, 7] }),
    f("Dani", 6, { porDia: [0, 3, 6] }),
  ];
  const a = acontecimientos(tabla, 10, 3);
  assert.equal(a.find((x) => x.clase === "subio")?.texto, "Beto subió del 4.º al 2.º");
});

test("subir al 9.º no se anuncia: no es una noticia, es ruido con forma de noticia", () => {
  const tabla = Array.from({ length: 10 }, (_, i) =>
    f(`J${i}`, 100 - i, { porDia: [0, i === 9 ? -50 : 100 - i, 100 - i] }),
  );
  const a = acontecimientos(tabla, 10, 3);
  assert.equal(a.filter((x) => x.clase === "subio").length, 0);
});

test("sin curva de días no se inventa un puesto de ayer", () => {
  const a = acontecimientos([f("Ana", 9), f("Beto", 8)], 10, 3);
  assert.equal(a.filter((x) => x.clase === "subio").length, 0);
});

test("sin los mínimos de la API no se afirma que alguien cumple", () => {
  const a = acontecimientos([f("Ana", 9, { habilitado: true })], null, null);
  assert.equal(a.filter((x) => x.clase === "minimo").length, 0);
});

test("uno que cumple se nombra; varios se cuentan", () => {
  const uno = acontecimientos([f("Ana", 9, { habilitado: true })], 10, 3);
  assert.equal(uno.find((x) => x.clase === "minimo")?.texto, "Ana ya cumple los dos mínimos");
  const varios = acontecimientos(
    [f("Ana", 9, { habilitado: true }), f("Beto", 8, { habilitado: true })],
    10,
    3,
  );
  assert.equal(varios.find((x) => x.clase === "minimo")?.texto, "2 ya cumplen los dos mínimos");
});

test("nunca más de tres", () => {
  const tabla = [
    f("Ana", 9, { habilitado: true, racha: { resultado: "W", cantidad: 5 }, porDia: [0, 5, 9] }),
    f("Beto", 8, { habilitado: true, porDia: [0, 1, 8] }),
    f("Caro", 7, { porDia: [0, 6, 7] }),
  ];
  assert.equal(acontecimientos(tabla, 10, 3).length, 3);
});

/* ── El récord ── */

test("el récord es el máximo y se saltea las semanas sin puntaje", () => {
  const r = recordDeLaLiga([
    { semana: "2026-09-07", nombre: "Simiestro", puntos: null },
    { semana: "2026-09-14", nombre: "marlboro", puntos: 15.25 },
    { semana: "2026-09-21", nombre: "VORE", puntos: 12 },
  ]);
  assert.deepEqual(r, { puntos: 15.25, nombre: "marlboro", semana: "2026-09-14" });
});

test("sin ninguna semana con puntaje NO hay récord inventado", () => {
  assert.equal(recordDeLaLiga([{ semana: "x", nombre: "Ana", puntos: null }]), null);
  assert.equal(recordDeLaLiga([]), null);
});

test("una semana sin ganador no puede ser el récord", () => {
  assert.equal(recordDeLaLiga([{ semana: "x", nombre: null, puntos: 20 }]), null);
});

test("'cerca del récord' es una resta, y se calla cuando no significa nada", () => {
  const r = { puntos: 15.25, nombre: "marlboro", semana: "2026-09-14" };
  assert.equal(cercaDelRecord(13, r), "A 2,25 del récord histórico");
  // Ya lo pasó: eso lo dice el marcador solo.
  assert.equal(cercaDelRecord(16, r), null);
  // Demasiado lejos para que la frase diga algo.
  assert.equal(cercaDelRecord(2, r), null);
  assert.equal(cercaDelRecord(13, null), null);
});
