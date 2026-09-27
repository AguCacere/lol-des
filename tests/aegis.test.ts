/**
 * Aegis of Valor. Lo que se prueba acá es sobre todo lo que NO tiene que
 * detectar: la prioridad es precisión, no cantidad.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarAegis, MIN_VICTORIAS, MIN_VICTORIAS_ALTA, RATIO_ALTO } from "../lib/aegis";
import type { PartidaUbicable } from "../lib/atribucion";
import type { LpHistoryPoint } from "../lib/types";

const T0 = Date.parse("2026-09-01T18:00:00.000Z");
/** Cada partida vive en su propia hora, así que nunca comparten tramo. */
const HORA = 3_600_000;

/**
 * Arma un historial entero: una foto antes de cada partida y otra después,
 * con los contadores de victorias/derrotas moviéndose como corresponde.
 *
 * `deltas` es lo que dio cada partida (positivo = victoria). `romperWL`
 * escribe contadores incoherentes en esas posiciones, para el caso de la
 * ventana que no se puede verificar.
 */
function historial(deltas: number[], romperWL: number[] = []) {
  const fotos: LpHistoryPoint[] = [];
  const partidas: PartidaUbicable[] = [];
  let lp = 40;
  let division = 2;
  let wins = 100;
  let losses = 90;
  fotos.push({ capturedAt: new Date(T0).toISOString(), lp, tier: "platinum", division, wins, losses });
  deltas.forEach((delta, i) => {
    const arranca = T0 + (i + 1) * HORA;
    const dur = 30 * 60;
    partidas.push({
      matchId: `m${i}`,
      playedAt: new Date(arranca).toISOString(),
      durationS: dur,
      win: delta > 0,
    });
    lp += delta;
    while (lp >= 100) {
      lp -= 100;
      division = Math.max(1, division - 1);
    }
    while (lp < 0) {
      lp += 100;
      division = Math.min(4, division + 1);
    }
    if (delta > 0) wins += romperWL.includes(i) ? 2 : 1;
    else losses += 1;
    fotos.push({
      capturedAt: new Date(arranca + dur * 1000 + 5 * 60_000).toISOString(),
      lp,
      tier: "platinum",
      division,
      wins,
      losses,
    });
  });
  return { fotos, partidas };
}

/** Victorias normales de sobra, para que la mediana propia sea sólida. */
const NORMALES = [28, -17, 29, 27, -18, 30, 29, 28, -16, 27, 30, 29, 28, -17, 29, 27];

test("una victoria de ~2x la mediana propia, con muestra, se detecta", () => {
  const { fotos, partidas } = historial([...NORMALES, 58]);
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.equal(a.detections.length, 1);
  const d = a.detections[0];
  assert.equal(d.matchId, `m${NORMALES.length}`);
  assert.equal(d.lpDelta, 58);
  assert.equal(d.baselineLp, 28);
  assert.ok(d.ratio >= RATIO_ALTO, `ratio ${d.ratio}`);
  assert.equal(d.confidence, "high");
});

test("la variación normal de LP no se detecta", () => {
  const { fotos, partidas } = historial([...NORMALES, 33]);
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.deepEqual(a.detections, []);
  assert.ok(a.sampleSize >= MIN_VICTORIAS);
});

test("sin muestra propia suficiente no se afirma nada", () => {
  // Cuatro victorias, una de ellas enorme: no alcanza ni para la mediana.
  const { fotos, partidas } = historial([28, -17, 29, 27, 58]);
  assert.equal(detectarAegis(fotos, partidas), null);
});

test("con muestra justa la detección existe pero no es alta", () => {
  const pocas = NORMALES.slice(0, 11); // 8 victorias, 3 derrotas
  const { fotos, partidas } = historial([...pocas, 58]);
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.ok(a.sampleSize >= MIN_VICTORIAS && a.sampleSize < MIN_VICTORIAS_ALTA, `muestra ${a.sampleSize}`);
  assert.equal(a.detections.length, 1);
  assert.equal(a.detections[0].confidence, "possible");
});

test("los contadores W/L incoherentes no producen confianza alta", () => {
  // La ventana del salto dice DOS victorias: el delta no es de una sola
  // partida, así que ese candidato no puede afirmarse.
  const i = NORMALES.length;
  const { fotos, partidas } = historial([...NORMALES, 58], [i]);
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.equal(
    a.detections.filter((d) => d.confidence === "high").length,
    0,
    "una ventana contradicha nunca se afirma",
  );
});

test("una derrota nunca produce una detección, por grande o chica que sea", () => {
  // Una derrota de -2 cuando las suyas son de -17: la versión anterior la
  // marcaba como "protegida". Ahora no existe esa señal.
  const { fotos, partidas } = historial([...NORMALES, -2]);
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.deepEqual(a.detections, []);
});

test("dos partidas en el mismo tramo no pueden generar un Aegis falso", () => {
  // Dos victorias seguidas entre las mismas dos fotos suman ~2x la mediana:
  // es el caso que fabricaría un doble LP inventado. No se atribuyen, así
  // que no entran ni como candidatas ni como muestra.
  const { fotos, partidas } = historial(NORMALES);
  const ultima = fotos[fotos.length - 1];
  const arranca = Date.parse(ultima.capturedAt) + 60_000;
  const dur = 20 * 60;
  partidas.push(
    { matchId: "juntas-a", playedAt: new Date(arranca).toISOString(), durationS: dur, win: true },
    { matchId: "juntas-b", playedAt: new Date(arranca + dur * 1000 + 60_000).toISOString(), durationS: dur, win: true },
  );
  fotos.push({
    capturedAt: new Date(arranca + 2 * dur * 1000 + 5 * 60_000).toISOString(),
    lp: ultima.lp + 56,
    tier: ultima.tier,
    division: ultima.division,
    wins: ultima.wins + 2,
    losses: ultima.losses,
  });
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.deepEqual(a.detections, []);
});

test("una partida sin fotos alrededor no contamina la mediana", () => {
  const { fotos, partidas } = historial(NORMALES);
  // Una partida muy anterior al primer snapshot: no se atribuye, no entra.
  partidas.push({
    matchId: "prehistorica",
    playedAt: new Date(T0 - 40 * HORA).toISOString(),
    durationS: 1800,
    win: true,
  });
  const a = detectarAegis(fotos, partidas);
  assert.ok(a);
  assert.equal(a.sampleSize, NORMALES.filter((d) => d > 0).length);
});

test("sin fotos suficientes devuelve null en vez de inventar", () => {
  assert.equal(detectarAegis([], []), null);
  const { partidas } = historial(NORMALES);
  assert.equal(detectarAegis([], partidas), null);
});

test("el remake ya viene filtrado del flujo, y si llegara no aportaría LP", () => {
  // La consulta de /api/ladder descarta remakes por duración, así que nunca
  // llegan acá. Pero aunque llegara uno, cae en su propio tramo sin
  // movimiento de LP: no puede subir ni bajar la mediana de las victorias,
  // porque no es una victoria.
  const { fotos, partidas } = historial(NORMALES);
  const base = detectarAegis(fotos, partidas);
  const ultima = fotos[fotos.length - 1];
  const arranca = Date.parse(ultima.capturedAt) + 60_000;
  partidas.push({ matchId: "remake", playedAt: new Date(arranca).toISOString(), durationS: 200, win: false });
  fotos.push({
    capturedAt: new Date(arranca + 10 * 60_000).toISOString(),
    lp: ultima.lp,
    tier: ultima.tier,
    division: ultima.division,
    wins: ultima.wins,
    losses: ultima.losses,
  });
  const con = detectarAegis(fotos, partidas);
  assert.ok(base && con);
  assert.equal(con.baselineLp, base.baselineLp);
  assert.equal(con.sampleSize, base.sampleSize);
});
