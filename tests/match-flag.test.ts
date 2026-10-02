/**
 * "Para repasar": UNA razón, con el valor y el habitual, nunca un porcentaje
 * gigante de protagonista.
 *
 * El caso que motivó el cambio es el F del pedido y salió de una captura real:
 * "KDA 569% por encima de tu promedio". El cálculo estaba bien —0,45 a 3,0 es
 * +567%— pero un número así en una chapa parece un informe financiero y no
 * dice lo único que importa, que son los dos valores.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatchFlag, type StatSample } from "../lib/matchflags";

/** Una ventana donde todo es igual salvo lo que se pise a propósito. */
function ventana(n: number, base: StatSample, target: StatSample): StatSample[] {
  return [target, ...Array.from({ length: n - 1 }, () => ({ ...base }))];
}

const NORMAL: StatSample = { csPerMin: 6, visionPerMin: 1, kda: 2 };

/* ── F. El baseline chico ── */

test("F: con KDA 0,45 de base y 3,0 en la partida, la razón trae los DOS valores", () => {
  const base = { ...NORMAL, kda: 0.45 };
  const target = { ...NORMAL, kda: 3 };
  const flag = computeMatchFlag(ventana(9, base, target), target)!;
  assert.ok(flag.principal);
  assert.equal(flag.principal.metrica, "KDA");
  assert.equal(flag.principal.valor, 3);
  assert.equal(flag.principal.base, 0.45);
  assert.equal(flag.principal.direccion, "encima");
});

test("F: y el porcentaje absurdo no es lo que se muestra", () => {
  const base = { ...NORMAL, kda: 0.45 };
  const target = { ...NORMAL, kda: 3 };
  const flag = computeMatchFlag(ventana(9, base, target), target)!;
  // El cálculo sigue existiendo (ordena los candidatos), pero el titular es
  // el par de valores: nada de 569 en lo que la pantalla pinta.
  assert.doesNotMatch(`${flag.principal!.valor} ${flag.principal!.base}`, /56[0-9]/);
});

test("F: un baseline por debajo del piso no genera razón", () => {
  // KDA habitual 0,1: el desvío relativo ahí no significa nada.
  const base = { ...NORMAL, kda: 0.1 };
  const target = { ...NORMAL, kda: 2 };
  assert.equal(computeMatchFlag(ventana(9, base, target), target), null);
});

/* ── Una sola razón ── */

test("con dos métricas apartadas se elige UNA, la que más se movió", () => {
  // CS/min +50% y KDA +150%: gana el KDA.
  const base: StatSample = { csPerMin: 4, visionPerMin: 1, kda: 2 };
  const target: StatSample = { csPerMin: 6, visionPerMin: 1, kda: 5 };
  const flag = computeMatchFlag(ventana(9, base, target), target)!;
  assert.equal(flag.principal!.metrica, "KDA");
  // Las otras siguen estando en `reasons`, pero no son el titular.
  assert.ok(flag.reasons.length >= 2);
});

test("una partida por DEBAJO también se marca, y lo dice", () => {
  const base: StatSample = { csPerMin: 7, visionPerMin: 1, kda: 2 };
  const target: StatSample = { csPerMin: 2, visionPerMin: 1, kda: 2 };
  const flag = computeMatchFlag(ventana(9, base, target), target)!;
  assert.equal(flag.principal!.metrica, "CS/min");
  assert.equal(flag.principal!.direccion, "debajo");
});

/* ── Sin base suficiente ── */

test("con pocas partidas no hay flag: una mala partida sería el promedio", () => {
  const base: StatSample = { csPerMin: 7, visionPerMin: 1, kda: 2 };
  const target: StatSample = { csPerMin: 1, visionPerMin: 1, kda: 2 };
  assert.equal(computeMatchFlag(ventana(8, base, target), target), null);
});

test("una partida parecida al promedio no se marca", () => {
  const flag = computeMatchFlag(ventana(12, NORMAL, NORMAL), NORMAL);
  assert.equal(flag, null);
});
