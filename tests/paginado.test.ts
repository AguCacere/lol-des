/**
 * El paginador. Lo que se prueba es lo que falló de verdad: una lectura que
 * se corta en mil filas y no avisa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todasLasFilas } from "../lib/paginado";

/** Una base de juguete con `n` filas, que devuelve páginas como PostgREST. */
function base(n: number) {
  const pedidos: [number, number][] = [];
  const pagina = (desde: number, hasta: number) => {
    pedidos.push([desde, hasta]);
    const filas = [];
    for (let i = desde; i <= hasta && i < n; i++) filas.push({ i });
    return Promise.resolve({ data: filas, error: null });
  };
  return { pagina, pedidos };
}

test("menos de una página: una sola consulta", async () => {
  const b = base(37);
  const { data, error } = await todasLasFilas("t", b.pagina);
  assert.equal(error, null);
  assert.equal(data.length, 37);
  assert.equal(b.pedidos.length, 1);
});

test("1124 filas: dos consultas y NINGUNA fila perdida", async () => {
  // El caso real: lp_snapshots tenía 1124 y la app veía 1000.
  const b = base(1124);
  const { data } = await todasLasFilas("t", b.pagina);
  assert.equal(data.length, 1124);
  assert.equal(b.pedidos.length, 2);
  assert.deepEqual(b.pedidos, [[0, 999], [1000, 1999]]);
  // Y en orden, que es lo que hace que la paginación sirva para algo.
  assert.equal(data[0].i, 0);
  assert.equal(data[1123].i, 1123);
});

test("un múltiplo exacto de la página pide una más y la encuentra vacía", async () => {
  // Si cortara al ver 1000 justas, perdería todo lo que viniera después.
  const b = base(2000);
  const { data } = await todasLasFilas("t", b.pagina);
  assert.equal(data.length, 2000);
  assert.equal(b.pedidos.length, 3);
});

test("sin filas no explota", async () => {
  const { data, error } = await todasLasFilas("t", base(0).pagina);
  assert.deepEqual(data, []);
  assert.equal(error, null);
});

test("un error en la segunda página se devuelve, no se traga", async () => {
  let n = 0;
  const { data, error } = await todasLasFilas("t", (desde, hasta) => {
    if (n++ === 0) {
      const filas = [];
      for (let i = desde; i <= hasta; i++) filas.push({ i });
      return Promise.resolve({ data: filas, error: null });
    }
    return Promise.resolve({ data: null, error: { message: "se cayó" } });
  });
  assert.equal(error?.message, "se cayó");
  // Con lo que alcanzó a juntar: quien llama decide qué hacer.
  assert.equal(data.length, 1000);
});

test("pasarse del tope GRITA en el log en vez de devolver media verdad", async () => {
  const errores: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => errores.push(a.join(" "));
  try {
    const { data } = await todasLasFilas("mi-tabla", base(5000).pagina, 2000);
    assert.equal(data.length, 2000);
  } finally {
    console.error = original;
  }
  assert.equal(errores.length, 1);
  assert.match(errores[0], /mi-tabla/);
  assert.match(errores[0], /RECORTADA/);
});

test("data en null se trata como página vacía y termina", async () => {
  const { data, error } = await todasLasFilas("t", () => Promise.resolve({ data: null, error: null }));
  assert.deepEqual(data, []);
  assert.equal(error, null);
});
