/**
 * Juego, objetos y total.
 *
 * La regla que esto protege es una sola y es la más importante del sistema:
 * **un objeto nunca toca el puntaje de juego.** Si una Blue Shell pudiera
 * mover `puntosJuego`, el detalle de la fila —que explica el puntaje partida
 * por partida— dejaría de cerrar con el número de al lado, y ahí la liga se
 * vuelve indiscutible en el mal sentido.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PUNTOS_DERROTA, PUNTOS_EN_RACHA, PUNTOS_VICTORIA, RACHA_DESDE, puntosDeSecuencia, tablaDeLaSemana } from "../lib/liga";

const LUNES = new Date("2026-10-05T03:00:00Z");
const finDe = (dias: number) => new Date(LUNES.getTime() + dias * 86400000);

const participante = (puuid: string) =>
  ({ puuid, name: puuid, tag: "LAS", profileIconUrl: null, desde: LUNES }) as never;

const record = (victorias: number, derrotas: number) => ({
  victorias, derrotas, racha: null, champion: null, linea: null,
  secuencia: [...Array(victorias).fill(true), ...Array(derrotas).fill(false)],
  ultimas: [], ultimoDia: 10, hoy: 0, detalle: undefined, porDia: [0, victorias - derrotas],
});

function tabla(objetos?: Map<string, number>, ajustes?: Map<string, { puntos: number; motivo: string }>) {
  return tablaDeLaSemana(
    [participante("a"), participante("b")],
    [],
    LUNES,
    finDe(7),
    new Map([["a", record(8, 2) as never], ["b", record(5, 5) as never]]),
    ajustes as never,
    { total: 10, ultimo: 3 },
    objetos,
  );
}

/* ── 11 y 12 ── */

test("sin objetos, el total es el puntaje de juego y nada cambió", () => {
  const t = tabla();
  const a = t.find((f) => f.puuid === "a")!;
  assert.equal(a.puntosObjetos, 0);
  assert.equal(a.puntos, a.puntosJuego);
});

test("un objeto mueve el TOTAL y deja el puntaje de juego intacto", () => {
  const sin = tabla().find((f) => f.puuid === "a")!;
  const con = tabla(new Map([["a", -0.5]])).find((f) => f.puuid === "a")!;
  // Lo que salió de jugar es exactamente el mismo número.
  assert.equal(con.puntosJuego, sin.puntosJuego);
  assert.equal(con.puntosObjetos, -0.5);
  assert.equal(con.puntos, Math.round((sin.puntosJuego - 0.5) * 100) / 100);
});

test("total = juego + objetos, siempre", () => {
  for (const monto of [-2, -0.5, 0, 0.5, 3.25]) {
    for (const f of tabla(new Map([["a", monto], ["b", -monto]]))) {
      assert.equal(f.puntos, Math.round((f.puntosJuego + f.puntosObjetos) * 100) / 100, `monto ${monto}, ${f.puuid}`);
    }
  }
});

test("el ajuste a mano y las shells van a la MISMA bolsa de objetos", () => {
  const f = tabla(new Map([["a", -0.5]]), new Map([["a", { puntos: -2, motivo: "penalización" }]]))
    .find((x) => x.puuid === "a")!;
  assert.equal(f.puntosObjetos, -2.5);
});

test("los objetos corren la curva entera y no le inventan un escalón a un día", () => {
  const sin = tabla().find((f) => f.puuid === "a")!;
  const con = tabla(new Map([["a", -0.5]])).find((f) => f.puuid === "a")!;
  assert.equal(con.porDia!.length, sin.porDia!.length);
  con.porDia!.forEach((v, i) => assert.equal(v, Math.round((sin.porDia![i] - 0.5) * 100) / 100));
});

test("medio punto no se pierde en punto flotante", () => {
  const f = tabla(new Map([["a", 0.1]]), new Map([["a", { puntos: 0.2, motivo: "x" }]]))
    .find((x) => x.puuid === "a")!;
  assert.equal(f.puntosObjetos, 0.3);
});

/* ── El scoring base NO cambió ── */

test("las constantes del puntaje siguen siendo las de siempre", () => {
  assert.equal(PUNTOS_VICTORIA, 1);
  assert.equal(PUNTOS_DERROTA, -0.75);
  assert.equal(RACHA_DESDE, 4);
  assert.equal(PUNTOS_EN_RACHA, 1.25);
});

test("la cuarta al hilo sigue valiendo 1,25 y ni una shell lo cambia", () => {
  const c = puntosDeSecuencia([true, true, true, true, true]);
  // 1 + 1 + 1 + 1,25 + 1,25
  assert.equal(c.total, 5.5);
});

/* ── 17 y 18. Ediciones de 7 y de 14 días ── */

test("una edición de 14 días se calcula igual que una de 7", () => {
  const corta = tablaDeLaSemana([participante("a")], [], LUNES, finDe(7),
    new Map([["a", record(8, 2) as never]]), undefined, { total: 10, ultimo: 3 });
  const larga = tablaDeLaSemana([participante("a")], [], LUNES, finDe(14),
    new Map([["a", record(8, 2) as never]]), undefined, { total: 10, ultimo: 3 });
  // Mismo récord, mismo puntaje: la duración no entra en la cuenta de puntos.
  assert.equal(larga[0].puntos, corta[0].puntos);
  assert.equal(larga[0].puntosJuego, corta[0].puntosJuego);
});

test("una edición histórica sin objetos sigue dando exactamente lo mismo", () => {
  // La llamada VIEJA, sin el parámetro nuevo. Si esto cambiara, cada semana
  // cerrada del historial se recalcularía distinta.
  const vieja = tablaDeLaSemana([participante("a")], [], LUNES, finDe(7),
    new Map([["a", record(8, 2) as never]]));
  assert.equal(vieja[0].puntosObjetos, 0);
  assert.equal(vieja[0].puntos, vieja[0].puntosJuego);
});
