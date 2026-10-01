/**
 * La quiniela. Lo que se prueba acá es que el bot no diga algo falso cuando
 * la semana sale rara: sin apuestas, sin ganador, o con el ganador apostado
 * por nadie.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type ApuestaResuelta, mensajeDeQuiniela, mensajeDeResultado, porCandidato } from "../lib/quiniela";

const a = (quien: string, aQuien: string): ApuestaResuelta => ({ quien, aQuien, puuid: `puuid-${aQuien}` });

test("porCandidato agrupa y ordena por cantidad", () => {
  const g = porCandidato([a("Ana", "Vore"), a("Beto", "Sagi"), a("Caro", "Vore")]);
  assert.equal(g.length, 2);
  assert.equal(g[0].aQuien, "Vore");
  assert.deepEqual(g[0].quienes, ["Ana", "Caro"]);
  assert.equal(g[1].aQuien, "Sagi");
});

test("porCandidato desempata alfabético, para que no baile entre corridas", () => {
  const g = porCandidato([a("Ana", "Zeta"), a("Beto", "Alfa")]);
  assert.deepEqual(g.map((c) => c.aQuien), ["Alfa", "Zeta"]);
});

test("la quiniela abierta sin apuestas invita a apostar", () => {
  const m = mensajeDeQuiniela("Semana 3", [], false);
  assert.match(m, /todavía no apostó nadie/);
  assert.match(m, /\/apostar/);
});

test("la quiniela cerrada sin apuestas no invita a nada", () => {
  const m = mensajeDeQuiniela("Semana 3", [], true);
  assert.match(m, /cerraron/);
  assert.doesNotMatch(m, /se puede cambiar/i);
});

test("la quiniela abierta lista a cada candidato con sus votantes", () => {
  const m = mensajeDeQuiniela("Semana 3", [a("Ana", "Vore"), a("Caro", "Vore"), a("Beto", "Sagi")], false);
  assert.match(m, /3 apuestas/);
  assert.match(m, /\*\*Vore\*\* ← Ana, Caro/);
  assert.match(m, /\*\*Sagi\*\* ← Beto/);
});

test("sin apuestas el resultado es vacío: no se manda un mensaje para no decir nada", () => {
  assert.equal(mensajeDeResultado([], "puuid-Vore", "Vore"), "");
  assert.equal(mensajeDeResultado([], null, null), "");
});

test("semana sin ganador: la quiniela queda vacante y no corona a nadie", () => {
  const m = mensajeDeResultado([a("Ana", "Vore")], null, null);
  assert.match(m, /vacante/);
  assert.doesNotMatch(m, /[Cc]obran/);
});

test("ganó alguien a quien no le apostó nadie", () => {
  const m = mensajeDeResultado([a("Ana", "Vore"), a("Beto", "Sagi")], "puuid-Nico", "Nico");
  assert.match(m, /No acertó nadie/);
  assert.match(m, /Ganó \*\*Nico\*\*/);
});

test("uno solo acierta", () => {
  const m = mensajeDeResultado([a("Ana", "Vore"), a("Beto", "Sagi")], "puuid-Vore", "Vore");
  assert.match(m, /\*\*Ana\*\*/);
  assert.match(m, /Cobran/);
  assert.match(m, /Los otros 1 erraron/);
});

test("se apostó a sí mismo y le salió", () => {
  const m = mensajeDeResultado([a("Vore", "Vore"), a("Ana", "Sagi")], "puuid-Vore", "Vore");
  assert.match(m, /se apostó a sí mismo/);
});

test("le apostaron todos y no se repite el chiste del autoapostado", () => {
  const m = mensajeDeResultado([a("Ana", "Vore"), a("Beto", "Vore")], "puuid-Vore", "Vore");
  assert.match(m, /Le apostaron todos/);
  assert.doesNotMatch(m, /erraron/);
});

test("una sola apuesta y acierta: no dice 'todos'", () => {
  const m = mensajeDeResultado([a("Ana", "Vore")], "puuid-Vore", "Vore");
  assert.match(m, /le había apostado/);
  assert.doesNotMatch(m, /Le apostaron todos/);
});
