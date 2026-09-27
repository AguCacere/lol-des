/**
 * La atribución de LP: la pieza de la que cuelgan el gráfico de progresión y
 * la detección de Aegis. Si esto miente, mienten las dos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { atribuirLp, coherenciaWL, type PartidaUbicable } from "../lib/atribucion";
import { progresionPorPartida } from "../lib/progresion";
import type { LpHistoryPoint, TierKey } from "../lib/types";

const T0 = Date.parse("2026-09-10T20:00:00.000Z");
const min = (n: number) => n * 60_000;

function foto(
  minutos: number,
  lp: number,
  extra: { tier?: TierKey; division?: number; wins?: number; losses?: number } = {},
): LpHistoryPoint {
  return {
    capturedAt: new Date(T0 + min(minutos)).toISOString(),
    lp,
    tier: extra.tier ?? "platinum",
    division: extra.division ?? 2,
    wins: extra.wins ?? 100,
    losses: extra.losses ?? 90,
  };
}

function partida(
  id: string,
  arrancaMin: number,
  duracionMin: number,
  win: boolean,
): PartidaUbicable {
  return {
    matchId: id,
    playedAt: new Date(T0 + min(arrancaMin)).toISOString(),
    durationS: duracionMin * 60,
    win,
  };
}

test("una victoria aislada entre dos fotos recibe el delta exacto", () => {
  const fotos = [foto(0, 40), foto(45, 62, { wins: 101 })];
  const { atribuidas, sinAtribuir } = atribuirLp(fotos, [partida("m1", 5, 30, true)]);
  assert.equal(sinAtribuir.length, 0);
  assert.equal(atribuidas.length, 1);
  assert.equal(atribuidas[0].lp, 22);
  assert.equal(atribuidas[0].partida.matchId, "m1");
});

test("una derrota aislada recibe un delta negativo", () => {
  const fotos = [foto(0, 40), foto(45, 22, { losses: 91 })];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 5, 30, false)]);
  assert.equal(atribuidas.length, 1);
  assert.equal(atribuidas[0].lp, -18);
});

test("dos partidas en el mismo tramo quedan las DOS sin atribuir", () => {
  const fotos = [foto(0, 40), foto(90, 80, { wins: 102 })];
  const { atribuidas, sinAtribuir } = atribuirLp(fotos, [
    partida("m1", 5, 25, true),
    partida("m2", 35, 25, true),
  ]);
  assert.equal(atribuidas.length, 0, "ninguna se lleva el LP del tramo compartido");
  assert.deepEqual(sinAtribuir.map((m) => m.matchId).sort(), ["m1", "m2"]);
});

test("la partida se ubica por cuándo TERMINÓ, no por cuándo empezó", () => {
  // Arranca 20:37 y termina 21:08. Las fotos son 20:45 y 21:15: mirando el
  // principio cae en el primer tramo —el que la agarró jugando, que no
  // incluye el resultado— y mirando el final cae en el segundo, que es el
  // correcto.
  const fotos = [foto(0, 40), foto(45, 40), foto(75, 65, { wins: 101 })];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 37, 31, true)]);
  assert.equal(atribuidas.length, 1);
  assert.equal(atribuidas[0].lp, 25, "toma el tramo 20:45→21:15, no el 20:00→20:45");
  assert.equal(atribuidas[0].antes.capturedAt, fotos[1].capturedAt);
});

test("un cambio de división se calcula con rankScore y no con el LP crudo", () => {
  // Platino 2 · 88 LP → Platino 1 · 12 LP. En LP pelado son 76 MENOS; de
  // verdad ganó 24.
  const fotos = [foto(0, 88, { division: 2 }), foto(45, 12, { division: 1, wins: 101 })];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 5, 30, true)]);
  assert.equal(atribuidas[0].lp, 24);
});

test("un ascenso de tier también", () => {
  // Platino 1 · 92 LP → Esmeralda 4 · 14 LP.
  const fotos = [
    foto(0, 92, { tier: "platinum", division: 1 }),
    foto(45, 14, { tier: "emerald", division: 4, wins: 101 }),
  ];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 5, 30, true)]);
  assert.equal(atribuidas[0].lp, 22);
});

test("una partida anterior a la primera foto no se atribuye", () => {
  const fotos = [foto(100, 40), foto(150, 62, { wins: 101 })];
  const { atribuidas, sinAtribuir } = atribuirLp(fotos, [partida("vieja", 0, 30, true)]);
  assert.equal(atribuidas.length, 0);
  assert.equal(sinAtribuir.length, 1);
});

test("una partida posterior a la última foto tampoco", () => {
  const fotos = [foto(0, 40), foto(45, 62, { wins: 101 })];
  const { atribuidas, sinAtribuir } = atribuirLp(fotos, [partida("nueva", 60, 30, true)]);
  assert.equal(atribuidas.length, 0);
  assert.equal(sinAtribuir.length, 1);
});

test("un hueco del cron deja la partida sin atribuir", () => {
  // Las fotos saltan de 20:00 a 20:45 y la partida termina 21:20: no hay
  // tramo que la contenga.
  const fotos = [foto(0, 40), foto(45, 40)];
  const { atribuidas, sinAtribuir } = atribuirLp(fotos, [partida("m1", 50, 30, true)]);
  assert.equal(atribuidas.length, 0);
  assert.equal(sinAtribuir.length, 1);
});

test("los contadores W/L coherentes marcan la ventana como verificada", () => {
  const fotos = [foto(0, 40, { wins: 100, losses: 90 }), foto(45, 62, { wins: 101, losses: 90 })];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 5, 30, true)]);
  assert.equal(atribuidas[0].wl, "ok");
});

test("los contadores que dicen otra cosa marcan la ventana como contradicha", () => {
  // Dos victorias según los contadores, una sola partida guardada: el delta
  // NO es de esa partida sola.
  const fotos = [foto(0, 40, { wins: 100 }), foto(45, 88, { wins: 102 })];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 5, 30, true)]);
  assert.equal(atribuidas[0].wl, "contradice");
});

test("sin contadores usables la atribución vive igual, con menos respaldo", () => {
  const fotos = [foto(0, 40, { wins: 0, losses: 0 }), foto(45, 62, { wins: 0, losses: 0 })];
  const { atribuidas } = atribuirLp(fotos, [partida("m1", 5, 30, true)]);
  assert.equal(atribuidas.length, 1, "el LP se atribuye igual");
  assert.equal(atribuidas[0].wl, "sin-datos");
});

test("coherenciaWL no confunde una derrota con una victoria", () => {
  const a = foto(0, 40, { wins: 100, losses: 90 });
  const b = foto(45, 22, { wins: 100, losses: 91 });
  assert.equal(coherenciaWL(a, b, false), "ok");
  assert.equal(coherenciaWL(a, b, true), "contradice");
});

test("contadores que retroceden (reset de season) no contradicen nada", () => {
  const a = foto(0, 40, { wins: 100, losses: 90 });
  const b = foto(45, 62, { wins: 1, losses: 0 });
  assert.equal(coherenciaWL(a, b, true), "sin-datos");
});

test("la progresión del perfil usa esta misma atribución", () => {
  const fotos = [foto(0, 40), foto(45, 62, { wins: 101 }), foto(90, 44, { wins: 101, losses: 91 })];
  const pr = progresionPorPartida(fotos, [
    { ...partida("m1", 5, 30, true), champ: "Ahri", k: 8, d: 2, a: 6 },
    { ...partida("m2", 50, 30, false), champ: "Lulu", k: 1, d: 5, a: 12 },
  ]);
  assert.equal(pr.puntos.length, 2);
  assert.equal(pr.sinAtribuir, 0);
  assert.deepEqual(
    pr.puntos.map((p) => p.lp),
    [22, -18],
  );
  assert.equal(pr.neto, 4);
  assert.equal(pr.victorias, 1);
  assert.equal(pr.derrotas, 1);
});
