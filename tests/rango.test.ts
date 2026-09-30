/**
 * Cómo se escribe un rango. El caso que importa es Maestro: Riot manda
 * `rank: "I"` igual para los tres tiers de arriba, así que sin una regla la
 * pantalla escribe "Maestro 1", que no existe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { divisionCorta, rangoTexto, rankScore, tieneDivisiones } from "../lib/ladder";

test("un tier con divisiones las escribe", () => {
  assert.equal(rangoTexto("diamond", 2), "Diamante 2");
  assert.equal(rangoTexto("platinum", 4), "Platino 4");
  assert.equal(divisionCorta("diamond", 2), "2");
  assert.equal(tieneDivisiones("diamond"), true);
});

test("Maestro no lleva número, venga el que venga de Riot", () => {
  assert.equal(rangoTexto("master", 1), "Maestro");
  assert.equal(rangoTexto("master", 4), "Maestro");
  assert.equal(divisionCorta("master", 1), "");
  assert.equal(tieneDivisiones("master"), false);
});

test("el 1 guardado sigue contando para el orden, aunque no se escriba", () => {
  // Es por esto que la división NO se toca en la base ni en el cálculo: la
  // cuenta es rank*400 + (5-división)*100, así que un Maestro con división 4
  // quedaría 300 puntos abajo de donde va.
  assert.ok(rankScore("master", 1, 5) > rankScore("diamond", 1, 100));
});
