/**
 * El agrupado de Live. Lo que más importa probar es el caso que da vuelta el
 * significado: dos del grupo en la misma partida pero en equipos distintos NO
 * están jugando juntos, están jugando uno contra el otro.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cuantosEnVivo, gruposEnVivo, nombresDelGrupo } from "../lib/live-grupos";
import type { Player } from "../lib/types";

const p = (name: string, live: { gameId: number; teamId: number; min?: number; champ?: string } | null): Player =>
  ({
    name,
    tag: "LAS",
    liveGame: live
      ? {
          champion: live.champ ?? "Lux",
          queueLabel: "SoloQ",
          startedMinutesAgo: live.min ?? 10,
          gameId: live.gameId,
          teamId: live.teamId,
        }
      : null,
  }) as Player;

test("sin nadie en partida, ningún grupo", () => {
  assert.deepEqual(gruposEnVivo([p("Ana", null), p("Beto", null)]), []);
  assert.equal(cuantosEnVivo([]), 0);
});

test("dos en la misma partida y el mismo equipo son UN grupo", () => {
  const g = gruposEnVivo([p("Ana", { gameId: 1, teamId: 100 }), p("Beto", { gameId: 1, teamId: 100 })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].juntos, true);
  assert.equal(nombresDelGrupo(g[0]), "Ana + Beto");
  assert.equal(cuantosEnVivo(g), 2);
});

test("misma partida, equipos DISTINTOS: son rivales, no van juntos", () => {
  // El caso que da vuelta el significado. Con el gameId solo, esto diría
  // "jugando juntos" de dos que se están enfrentando.
  const g = gruposEnVivo([p("Ana", { gameId: 1, teamId: 100 }), p("Beto", { gameId: 1, teamId: 200 })]);
  assert.equal(g.length, 2);
  assert.equal(g[0].juntos, false);
  assert.equal(g[1].juntos, false);
  assert.equal(cuantosEnVivo(g), 2);
});

test("partidas distintas no se mezclan aunque arranquen al mismo minuto", () => {
  const g = gruposEnVivo([p("Ana", { gameId: 1, teamId: 100 }), p("Beto", { gameId: 2, teamId: 100 })]);
  assert.equal(g.length, 2);
});

test("la más nueva va primero", () => {
  const g = gruposEnVivo([
    p("Vieja", { gameId: 1, teamId: 100, min: 30 }),
    p("Nueva", { gameId: 2, teamId: 100, min: 3 }),
    p("Media", { gameId: 3, teamId: 100, min: 14 }),
  ]);
  assert.deepEqual(g.map((x) => x.jugadores[0].name), ["Nueva", "Media", "Vieja"]);
});

test("a igual minuto gana la que tiene más gente del grupo", () => {
  const g = gruposEnVivo([
    p("Solo", { gameId: 1, teamId: 100, min: 10 }),
    p("Duo1", { gameId: 2, teamId: 100, min: 10 }),
    p("Duo2", { gameId: 2, teamId: 100, min: 10 }),
  ]);
  assert.equal(g[0].jugadores.length, 2);
});

test("cada grupo conserva el campeón de cada uno, que es lo único que no comparten", () => {
  const g = gruposEnVivo([
    p("Ana", { gameId: 1, teamId: 100, champ: "Volibear" }),
    p("Beto", { gameId: 1, teamId: 100, champ: "LeeSin" }),
  ]);
  assert.deepEqual(g[0].jugadores.map((x) => x.liveGame!.champion), ["Volibear", "LeeSin"]);
});

test("tres juntos se nombran con los tres", () => {
  const g = gruposEnVivo([
    p("A", { gameId: 1, teamId: 200 }),
    p("B", { gameId: 1, teamId: 200 }),
    p("C", { gameId: 1, teamId: 200 }),
  ]);
  assert.equal(nombresDelGrupo(g[0]), "A + B + C");
  assert.equal(cuantosEnVivo(g), 3);
});

/* ── El titular de Hoy ── */
import { tituloDeHoy } from "../lib/actividad";

test("el titular combina lo terminado con lo que está en curso", () => {
  assert.equal(tituloDeHoy(0, 0), "Todavía no arrancó el día");
  // El caso que motivó esto: la barra decía "2 en partida" y el titular
  // "Todavía no jugó nadie".
  assert.equal(tituloDeHoy(0, 2), "2 están jugando ahora");
  assert.equal(tituloDeHoy(3, 0), "3 partidas hoy");
  assert.equal(tituloDeHoy(3, 2), "3 partidas hoy · 2 en curso");
});

test("singular y plural en las dos mitades", () => {
  assert.equal(tituloDeHoy(0, 1), "1 está jugando ahora");
  assert.equal(tituloDeHoy(1, 0), "1 partida hoy");
  assert.equal(tituloDeHoy(1, 1), "1 partida hoy · 1 en curso");
});
