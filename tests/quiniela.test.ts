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

/* ───────────────────────── Sube o baja ───────────────────────── */

import { lpRealDeLaSemana, mensajeDePronosticos, mensajeDeResultadoPronosticos, type PronosticoResuelto } from "../lib/quiniela";

const pr = (quien: string, aQuien: string, direccion: "sube" | "baja"): PronosticoResuelto => ({
  quien,
  aQuien,
  puuid: `puuid-${aQuien}`,
  direccion,
});

test("el LP real le devuelve lo que recortó el tope", () => {
  // El caso que motiva la función: +40 reales, el tope lo deja en +22, y si
  // encima perdió −30 el topeado da −8 (bajó) pero de verdad subió +10.
  assert.equal(lpRealDeLaSemana({ lpNeto: -8, lpRecortado: 18 }), 10);
  assert.equal(lpRealDeLaSemana({ lpNeto: 25, lpRecortado: 0 }), 25);
});

test("sin pronósticos no se dice nada, ni en la tabla ni en el cierre", () => {
  assert.equal(mensajeDePronosticos([], false), "");
  assert.equal(mensajeDeResultadoPronosticos([], new Map()), "");
});

test("la tabla de pronósticos lista uno por línea y solo invita si está abierta", () => {
  const m = mensajeDePronosticos([pr("Ana", "Vore", "baja"), pr("Beto", "Sagi", "sube")], false);
  assert.match(m, /\*\*Sagi\*\* ▲ sube — Beto/);
  assert.match(m, /\*\*Vore\*\* ▼ baja — Ana/);
  assert.match(m, /\/apostar/);
  assert.doesNotMatch(mensajeDePronosticos([pr("Ana", "Vore", "baja")], true), /\/apostar/);
});

test("acertar sube y acertar baja", () => {
  const m = mensajeDeResultadoPronosticos(
    [pr("Ana", "Vore", "sube"), pr("Beto", "Sagi", "baja")],
    new Map([["puuid-Vore", 31], ["puuid-Sagi", -18]]),
  );
  assert.match(m, /Le pegaron:/);
  assert.match(m, /\*\*Ana\*\* → \*\*Vore\*\* ▲ sube \(\+31 LP\)/);
  assert.match(m, /\*\*Beto\*\* → \*\*Sagi\*\* ▼ baja \(-18 LP\)/);
  assert.doesNotMatch(m, /Erraron/);
});

test("errar es al revés del signo, no cualquier cosa", () => {
  const m = mensajeDeResultadoPronosticos(
    [pr("Ana", "Vore", "sube")],
    new Map([["puuid-Vore", -12]]),
  );
  assert.match(m, /No le pegó nadie/);
  assert.match(m, /Erraron: \*\*Ana\*\* → \*\*Vore\*\*/);
});

test("clavado en 0 es empate y se anula: nadie cobra por que el otro no se movió", () => {
  const m = mensajeDeResultadoPronosticos(
    [pr("Ana", "Vore", "baja")],
    new Map([["puuid-Vore", 0]]),
  );
  assert.match(m, /Se anulan \*\*Ana\*\* \(Vore\)/);
  assert.doesNotMatch(m, /Erraron/);
});

test("si el apostado no jugó la liga esa semana el pronóstico se anula, no se paga", () => {
  // Sin esto, apostar "baja" contra alguien que no jugó sería plata gratis.
  const m = mensajeDeResultadoPronosticos([pr("Ana", "Nadie", "baja")], new Map());
  assert.match(m, /Se anulan/);
  assert.doesNotMatch(m, /Le pegaron/);
});
