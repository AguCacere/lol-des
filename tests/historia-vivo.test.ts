/**
 * La historia de "está jugando ahora". Lo que hay que probar es la condición
 * DOBLE: sin racha no tiene que aparecer, porque ahí sería la franja de
 * "Ahora mismo" escrita de nuevo treinta centímetros más abajo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { historiaDelDia } from "../lib/historia";
import type { Player } from "../lib/types";

const ahora = Date.parse("2026-10-01T18:00:00Z");
const haceHoras = (h: number) => new Date(ahora - h * 3600000).toISOString();

const jugador = (opts: { live?: boolean; resultados: boolean[] }): Player =>
  ({
    puuid: "p1",
    name: "vas a perder",
    tag: "LAS",
    tierKey: "platinum",
    division: 3,
    lp: 40,
    peakLp: { tier: "platinum", division: 3, lp: 40 },
    lpHistory: [],
    matches: opts.resultados.map((win, i) => ({
      matchId: `m${i}`,
      win,
      playedAt: haceHoras(i + 1),
      champ: "Volibear",
    })),
    liveGame: opts.live
      ? { champion: "Volibear", queueLabel: "SoloQ", startedMinutesAgo: 14, gameId: 1, teamId: 100 }
      : null,
  }) as unknown as Player;

test("jugando ahora y viniendo de 3 derrotas: esa es la historia", () => {
  const h = historiaDelDia([jugador({ live: true, resultados: [false, false, false] })], [], null, ahora);
  assert.equal(h?.clase, "vivo");
  assert.match(h!.titulo, /está jugando ahora/);
  assert.match(h!.detalle!, /Viene de 3\+ derrotas al hilo/);
  assert.equal(h!.tono, "malo");
});

test("jugando ahora SIN racha no genera historia de vivo", () => {
  // Sería la franja "Ahora mismo" repetida. La franja ya dice quién, con qué
  // campeón y desde hace cuánto; la historia solo existe si agrega el contexto.
  const h = historiaDelDia([jugador({ live: true, resultados: [true, false, true] })], [], null, ahora);
  assert.notEqual(h?.clase, "vivo");
});

test("con racha pero SIN estar jugando tampoco: esa es la historia de racha, no la de vivo", () => {
  const h = historiaDelDia([jugador({ live: false, resultados: [false, false, false] })], [], null, ahora);
  assert.notEqual(h?.clase, "vivo");
});

test("no inventa causalidad: describe la racha y la partida, nada más", () => {
  const h = historiaDelDia([jugador({ live: true, resultados: [false, false, false, false] })], [], null, ahora);
  const texto = `${h!.titulo} ${h!.detalle}`;
  for (const prohibido of ["tilt", "intenta", "cortar", "nervios", "va a ", "seguramente", "mejor momento"]) {
    assert.ok(!texto.toLowerCase().includes(prohibido), `no debería decir "${prohibido}": ${texto}`);
  }
});

test("una racha de victorias jugando ahora también vale, y es de tono bueno", () => {
  const h = historiaDelDia([jugador({ live: true, resultados: [true, true, true] })], [], null, ahora);
  assert.equal(h?.clase, "vivo");
  assert.equal(h!.tono, "bueno");
  assert.match(h!.detalle!, /3\+ victorias al hilo/);
});
