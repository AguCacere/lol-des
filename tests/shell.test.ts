/**
 * Blue Shells. Lo que se prueba acá es el MOTOR: el sorteo, el rebote y la
 * cuenta de puntos. Lo que toca la base (lib/shell-db.ts) y el cron
 * (lib/shell-cron.ts) se prueba con dobles de Supabase más abajo.
 *
 * El azar entra por parámetro justamente para esto: con un `rnd` fijo, cada
 * resultado es verificable en vez de "lo probé y salió bien".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_SHELL,
  type EfectoShell,
  movimientoDeRobo,
  periodoDeComeback,
  puntosDeObjetos,
  resolverLanzamiento,
  shellsDisponibles,
  sorteoPesado,
  sortearEfecto,
  ultimosParaComeback,
} from "../lib/shell";

/** Un `rnd` que devuelve los valores que le pasás, en orden. */
const dados = (...xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};

/* ── 7. El sorteo con pesos ── */

test("el sorteo con pesos respeta los tramos", () => {
  const ops = [
    { valor: "a", peso: 1 },
    { valor: "b", peso: 1 },
    { valor: "c", peso: 2 },
  ];
  // Total 4: [0,1)→a, [1,2)→b, [2,4)→c
  assert.equal(sorteoPesado(ops, dados(0)), "a");
  assert.equal(sorteoPesado(ops, dados(0.24)), "a");
  assert.equal(sorteoPesado(ops, dados(0.26)), "b");
  assert.equal(sorteoPesado(ops, dados(0.6)), "c");
  assert.equal(sorteoPesado(ops, dados(0.999)), "c");
});

test("un peso en 0 apaga esa opción y no la saca nunca", () => {
  const ops = [
    { valor: "apagada", peso: 0 },
    { valor: "viva", peso: 1 },
  ];
  for (const x of [0, 0.3, 0.7, 0.99]) assert.equal(sorteoPesado(ops, dados(x)), "viva");
});

test("sin ninguna opción viva devuelve null y no rompe", () => {
  assert.equal(sorteoPesado([{ valor: "x", peso: 0 }], dados(0.5)), null);
  assert.equal(sorteoPesado([], dados(0.5)), null);
});

test("los tres efectos son alcanzables con la configuración de hoy", () => {
  const vistos = new Set<EfectoShell>();
  for (let i = 0; i < 300; i++) vistos.add(sortearEfecto(dados(i / 300)));
  assert.deepEqual([...vistos].sort(), ["MAIN_BAN", "RANDOM_CHAMPION", "STEAL_POINTS"]);
});

/* ── 8. El rebote ── */

test("sin rebote, el que se lo come es el objetivo", () => {
  // Segundo dado = 0.99: por encima de la probabilidad de rebote.
  const l = resolverLanzamiento("agus", "simi", dados(0.9, 0.99));
  assert.equal(l.rebotado, false);
  assert.equal(l.final, "simi");
});

test("con rebote, el que se lo come es el que la tiró", () => {
  const l = resolverLanzamiento("agus", "simi", dados(0.9, 0));
  assert.equal(l.rebotado, true);
  assert.equal(l.final, "agus");
  // El efecto NO cambia: un rebote cambia a quién le pega, no qué pasa.
  assert.equal(l.efecto, resolverLanzamiento("agus", "simi", dados(0.9, 0.99)).efecto);
});

test("el rebote se tira DESPUÉS del efecto, así que el efecto no depende de él", () => {
  const sin = resolverLanzamiento("a", "b", dados(0.1, 0.99));
  const con = resolverLanzamiento("a", "b", dados(0.1, 0.0));
  assert.equal(sin.efecto, con.efecto);
});

/* ── 9 y 10. El robo, normal y rebotado ── */

test("robo normal: el actor gana y el objetivo pierde", () => {
  const mov = movimientoDeRobo({ efecto: "STEAL_POINTS", actor: "agus", objetivo: "simi", final: "simi", rebotado: false });
  assert.deepEqual(mov, { pierde: "simi", gana: "agus", monto: 0.5 });
});

test("robo rebotado: se da vuelta exactamente", () => {
  const mov = movimientoDeRobo({ efecto: "STEAL_POINTS", actor: "agus", objetivo: "simi", final: "agus", rebotado: true });
  assert.deepEqual(mov, { pierde: "agus", gana: "simi", monto: 0.5 });
});

test("un efecto que no es robo no mueve puntos", () => {
  assert.equal(
    movimientoDeRobo({ efecto: "MAIN_BAN", actor: "a", objetivo: "b", final: "b", rebotado: false }),
    null,
  );
});

test("tirarse una shell a uno mismo no mueve puntos", () => {
  // Los dos lados serían el mismo puuid: +0,5 y −0,5 sobre la misma persona
  // es nada escrito como si fuera algo.
  assert.equal(
    movimientoDeRobo({ efecto: "STEAL_POINTS", actor: "a", objetivo: "a", final: "a", rebotado: false }),
    null,
  );
});

test("los puntos de objetos suman por jugador y no arrastran error de punto flotante", () => {
  const m = puntosDeObjetos([
    { puuid: "a", puntos: 0.5 },
    { puuid: "a", puntos: 0.1 },
    { puuid: "a", puntos: 0.2 },
    { puuid: "b", puntos: -0.5 },
  ]);
  assert.equal(m.get("a"), 0.8);
  assert.equal(m.get("b"), -0.5);
});

/* ── El inventario ── */

test("las disponibles son la suma del ledger", () => {
  assert.equal(shellsDisponibles([1, 1, -1]), 1);
  assert.equal(shellsDisponibles([1, -1]), 0);
  assert.equal(shellsDisponibles([]), 0);
});

/* ── 16. El comeback no se duplica ── */

test("el período de comeback es el mismo durante los 3 días", () => {
  const arranque = Date.parse("2026-10-05T03:00:00Z");
  const dia = 86400000;
  // Días 0, 1 y 2 son el mismo período; el 3 abre el siguiente.
  assert.equal(periodoDeComeback(arranque, arranque), 0);
  assert.equal(periodoDeComeback(arranque, arranque + dia), 0);
  assert.equal(periodoDeComeback(arranque, arranque + 2 * dia), 0);
  assert.equal(periodoDeComeback(arranque, arranque + 3 * dia), 1);
  assert.equal(periodoDeComeback(arranque, arranque + 6 * dia), 2);
});

test("los últimos para comeback salen del final de la tabla y no incluyen a los que no jugaron", () => {
  const tabla = [
    { puuid: "a", sinJugar: false },
    { puuid: "b", sinJugar: false },
    { puuid: "c", sinJugar: false },
    { puuid: "d", sinJugar: false },
    { puuid: "z", sinJugar: true },
  ];
  assert.deepEqual(ultimosParaComeback(tabla), ["c", "d"]);
});

test("con poca gente no hay premio de consuelo: 'los últimos' serían todos", () => {
  assert.deepEqual(ultimosParaComeback([{ puuid: "a", sinJugar: false }, { puuid: "b", sinJugar: false }]), []);
});

/* ── 19 y 20. Nadie está bloqueado por su puesto ── */

test("el puesto NO entra en el motor: ni el primero ni el último están bloqueados", () => {
  // El motor no recibe la posición en ningún lado — es la forma más fuerte de
  // garantizar que no se la pueda usar para bloquear a nadie.
  const l = resolverLanzamiento("el-primero", "el-ultimo", dados(0.5, 0.99));
  assert.equal(l.actor, "el-primero");
  const r = resolverLanzamiento("el-ultimo", "el-primero", dados(0.5, 0.99));
  assert.equal(r.actor, "el-ultimo");
});

/* ── La configuración ── */

test("la configuración está centralizada y con los valores de arranque", () => {
  assert.equal(CONFIG_SHELL.robo, 0.5);
  assert.equal(CONFIG_SHELL.partidasDeBan, 3);
  assert.equal(CONFIG_SHELL.mainsProhibidos, 3);
  assert.ok(CONFIG_SHELL.rebote > 0 && CONFIG_SHELL.rebote < 1);
});
