/**
 * El palmarés. Lo que se prueba es que la cuenta de copas no se parta ni se
 * invente: es el registro de quién ganó qué y va a sobrevivir a cambios de
 * nombre, a semanas sin ganador y a gente que se borra.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { type Edicion, palmares, titulosDe } from "../lib/palmares";

const ed = (semana: string, puuid: string | null, nombre: string | null): Edicion => ({
  semana,
  puuid,
  nombre,
  iconUrl: null,
  puntos: null,
  jugadores: 6,
});

test("cuenta las copas y ordena de más a menos", () => {
  const t = palmares([
    ed("2026-01-05", "a", "Sagitaryus"),
    ed("2026-01-12", "b", "compren bitcoin"),
    ed("2026-01-19", "a", "Sagitaryus"),
    ed("2026-01-26", "a", "Sagitaryus"),
    ed("2026-02-02", "b", "compren bitcoin"),
    ed("2026-02-09", "c", "Simiestro"),
  ]);
  assert.deepEqual(
    t.map((p) => [p.nombre, p.titulos]),
    [["Sagitaryus", 3], ["compren bitcoin", 2], ["Simiestro", 1]],
  );
});

test("empate: orden alfabético, para que la lista no baile entre renders", () => {
  const t = palmares([ed("1", "z", "Zeta"), ed("2", "a", "Alfa")]);
  assert.deepEqual(t.map((p) => p.nombre), ["Alfa", "Zeta"]);
});

test("cambiarse el nombre NO parte el palmarés en dos", () => {
  // El caso que motiva contar por puuid: el Riot ID se puede cambiar cuando
  // uno quiera, y por nombre esto daría dos personas con un título cada una.
  const t = palmares([ed("1", "a", "VORE"), ed("2", "a", "vas a perder")]);
  assert.equal(t.length, 1);
  assert.equal(t[0].titulos, 2);
});

test("una semana sin ganador no reparte título", () => {
  // Pasa de verdad: la liga la gana el mejor de los que cumplen los mínimos,
  // y puede no cumplirlos nadie.
  const t = palmares([ed("1", "a", "VORE"), ed("2", null, null)]);
  assert.equal(t.length, 1);
  assert.equal(t[0].titulos, 1);
});

test("sin puuid se cuenta por nombre, que es lo único que tienen las semanas viejas", () => {
  const t = palmares([ed("1", null, "Simiestro"), ed("2", null, "Simiestro")]);
  assert.equal(t.length, 1);
  assert.equal(t[0].titulos, 2);
  assert.equal(t[0].puuid, null);
});

test("sin ediciones, palmarés vacío y no una fila en cero", () => {
  assert.deepEqual(palmares([]), []);
});

test("la foto se rellena con la primera que aparezca y no se pisa con un null", () => {
  const con = { ...ed("1", "a", "VORE"), iconUrl: "/icono.png" };
  assert.equal(palmares([ed("2", "a", "VORE"), con])[0].iconUrl, "/icono.png");
  assert.equal(palmares([con, ed("2", "a", "VORE")])[0].iconUrl, "/icono.png");
});

test("titulosDe indexa por la misma clave que usa el palmarés", () => {
  const eds = [ed("1", "a", "VORE"), ed("2", "a", "VORE"), ed("3", null, "Simiestro")];
  const m = titulosDe(eds);
  assert.equal(m.get("a"), 2);
  assert.equal(m.get("nombre:Simiestro"), 1);
});
