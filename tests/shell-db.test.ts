/**
 * Blue Shells contra la base, con un doble de Supabase.
 *
 * Lo que se prueba es lo que NO se puede probar con cálculo puro: que la shell
 * se consuma exactamente una vez, que un reintento de Discord no duplique
 * nada, que nadie se la tire a sí mismo, y que una misma partida no descuente
 * dos veces el progreso de un efecto.
 *
 * El doble es un Supabase de juguete con las cuatro tablas en memoria. Es
 * deliberadamente tonto: lo único que imita de verdad son las tres piezas de
 * las que depende la corrección —el índice único parcial sobre
 * `interaccion_id`, el lock por (edición, jugador) y el todo-o-nada de la
 * función `lanzar_blue_shell`—. Y un doble que imita una transacción no
 * demuestra que la transacción exista: eso se verificó contra la base real.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inventarioDeLaEdicion, lanzarShell, objetosDeLaEdicion, otorgarShell, fallo } from "../lib/shell-db";
import { cerrarEfectosPendientes } from "../lib/shell-cron";

type Fila = Record<string, unknown>;

/** Un Supabase de juguete: cuatro tablas en memoria y los índices que importan. */
function baseFalsa(inicial: Record<string, Fila[]> = {}) {
  const tablas: Record<string, Fila[]> = {
    liga_shells: [], liga_eventos: [], liga_efectos: [], matches: [], summoners: [], ...inicial,
  };
  let seq = 0;

  function constructor(tabla: string) {
    const filtros: ((f: Fila) => boolean)[] = [];
    let columnas: string[] = [];
    const api = {
      select(cols: string) { columnas = cols.split(",").map((c) => c.trim()); return api; },
      eq(c: string, v: unknown) { filtros.push((f) => f[c] === v); return api; },
      gt(c: string, v: string) { filtros.push((f) => String(f[c]) > v); return api; },
      gte(c: string, v: unknown) { filtros.push((f) => Number(f[c]) >= Number(v)); return api; },
      in(c: string, vs: unknown[]) { filtros.push((f) => vs.includes(f[c])); return api; },
      order() { return api; },
      limit() { return api; },
      returns() { return api; },
      then(res: (r: { data: Fila[]; error: null }) => void) {
        const filas = tablas[tabla].filter((f) => filtros.every((p) => p(f)));
        res({ data: filas.map((f) => Object.fromEntries(columnas.map((c) => [c, f[c]]))), error: null });
      },
      insert(fila: Fila) {
        // El índice único parcial sobre interaccion_id — la pieza clave.
        if (tabla === "liga_eventos" && fila.interaccion_id) {
          if (tablas.liga_eventos.some((e) => e.interaccion_id === fila.interaccion_id)) {
            const err = { code: "23505", message: "duplicate key" };
            return { select: () => ({ single: async () => ({ data: null, error: err }) }), then: (r: (x: unknown) => void) => r({ error: err }) };
          }
        }
        // Y el de los premios: (semana, puuid, origen, periodo).
        if (tabla === "liga_shells" && fila.periodo != null) {
          const choca = tablas.liga_shells.some(
            (e) => e.semana === fila.semana && e.puuid === fila.puuid && e.origen === fila.origen && e.periodo === fila.periodo,
          );
          if (choca) return { select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }), then: (r: (x: unknown) => void) => r({ error: { code: "23505" } }) };
        }
        const guardada = { id: `id${++seq}`, ...fila };
        tablas[tabla].push(guardada);
        return {
          select: () => ({ single: async () => ({ data: { id: guardada.id }, error: null }) }),
          then: (r: (x: unknown) => void) => r({ error: null }),
        };
      },
      update(cambios: Fila) {
        const api2 = {
          eq(c: string, v: unknown) {
            for (const f of tablas[tabla]) if (f[c] === v) Object.assign(f, cambios);
            return api2;
          },
          then: (r: (x: unknown) => void) => r({ error: null }),
        };
        return api2;
      },
    };
    return api;
  }
  /**
   * El doble de `lanzar_blue_shell`.
   *
   * Imita las DOS propiedades de las que depende la corrección: el lock por
   * (edición, jugador) —acá, una cola en memoria que serializa al mismo
   * actor— y el todo-o-nada —acá, un snapshot de las tres tablas que se
   * restaura si algo falla—.
   *
   * **No reemplaza probar la función de verdad.** Lo que esto fija es el
   * CONTRATO que el TypeScript espera; que el PL/pgSQL cumpla ese contrato se
   * verificó contra la base real. Un doble que imita una transacción no
   * demuestra que la transacción exista.
   */
  const colas = new Map<string, Promise<unknown>>();
  async function rpc(nombre: string, p: Record<string, unknown>) {
    if (nombre !== "lanzar_blue_shell") return { data: null, error: { message: "función desconocida" } };
    const llave = `${p.p_semana}|${p.p_actor}`;
    const anterior = colas.get(llave) ?? Promise.resolve();
    let liberar!: () => void;
    colas.set(llave, new Promise<void>((r) => { liberar = r; }));
    await anterior;
    try {
      return { data: cuerpoDelRpc(p), error: null };
    } catch (e) {
      // PostgREST no tira: un error de la función vuelve como `{ error }`, y
      // la transacción ya hizo rollback del otro lado.
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    } finally {
      liberar();
    }
  }

  function cuerpoDelRpc(p: Record<string, unknown>) {
    // 1. Self-target.
    if (!p.p_actor || !p.p_objetivo || p.p_actor === p.p_objetivo) {
      return { ok: false, error: "self" };
    }
    // 2. Idempotencia, YA bajo el lock.
    if (p.p_interaccion) {
      const ya = tablas.liga_eventos.find((e) => e.interaccion_id === p.p_interaccion);
      if (ya) {
        return {
          ok: true, repetida: true, evento_id: ya.id, efecto: ya.efecto,
          rebotado: ya.rebotado, final: ya.final_puuid,
          campeon: (ya.meta as { campeon?: string } | undefined)?.campeon ?? null,
        };
      }
    }
    // 3. Inventario, bajo el lock.
    const saldo = tablas.liga_shells
      .filter((x) => x.semana === p.p_semana && x.puuid === p.p_actor)
      .reduce((acc, x) => acc + Number(x.delta), 0);
    if (saldo < 1) return { ok: false, error: "sin_shells" };

    // 4. Las tres escrituras, con rollback si alguna falla.
    const foto = {
      liga_eventos: [...tablas.liga_eventos],
      liga_shells: [...tablas.liga_shells],
      liga_efectos: [...tablas.liga_efectos],
    };
    try {
      if (fallarEfecto && p.p_efecto !== "STEAL_POINTS") {
        // Se escriben las dos primeras y revienta la tercera, que es el modo
        // de falla exacto que la transacción tiene que deshacer.
        const id = `ev${++seq}`;
        tablas.liga_eventos.push({ id, semana: p.p_semana, tipo: "SHELL_LANZADA", efecto: p.p_efecto,
          actor_puuid: p.p_actor, objetivo_puuid: p.p_objetivo, final_puuid: p.p_final,
          rebotado: p.p_rebotado, monto: p.p_monto, interaccion_id: p.p_interaccion,
          meta: { campeon: p.p_campeon, prohibidos: p.p_prohibidos } });
        tablas.liga_shells.push({ semana: p.p_semana, puuid: p.p_actor, delta: -1, origen: "USO", evento_id: id });
        throw new Error("falló el insert del efecto");
      }
      const id = `ev${++seq}`;
      tablas.liga_eventos.push({ id, semana: p.p_semana, tipo: "SHELL_LANZADA", efecto: p.p_efecto,
        actor_puuid: p.p_actor, objetivo_puuid: p.p_objetivo, final_puuid: p.p_final,
        rebotado: p.p_rebotado, monto: p.p_monto, interaccion_id: p.p_interaccion,
        meta: { campeon: p.p_campeon, prohibidos: p.p_prohibidos } });
      tablas.liga_shells.push({ semana: p.p_semana, puuid: p.p_actor, delta: -1, origen: "USO", evento_id: id });
      if (p.p_efecto !== "STEAL_POINTS") {
        tablas.liga_efectos.push({ id: `ef${++seq}`, evento_id: id, semana: p.p_semana, puuid: p.p_final,
          efecto: p.p_efecto, estado: "PENDIENTE", campeon: p.p_campeon,
          prohibidos: p.p_efecto === "MAIN_BAN" ? p.p_prohibidos : null, faltan: p.p_faltan, matches: [] });
      }
      return { ok: true, repetida: false, evento_id: id };
    } catch (e) {
      // ROLLBACK: las tres tablas vuelven a como estaban.
      tablas.liga_eventos.length = 0; tablas.liga_eventos.push(...foto.liga_eventos);
      tablas.liga_shells.length = 0; tablas.liga_shells.push(...foto.liga_shells);
      tablas.liga_efectos.length = 0; tablas.liga_efectos.push(...foto.liga_efectos);
      throw e;
    }
  }

  let fallarEfecto = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cliente: { from: constructor, rpc } as any, tablas, romperEfecto: () => { fallarEfecto = true; } };
}

const OPCIONES = {
  semana: "2026-10-05",
  actor: "agus",
  objetivo: "simi",
  mainsDe: async () => ["Lux", "Ahri", "Orianna"],
  campeonPara: async () => "Volibear",
};

/* ── 4 y 5. La shell se consume exactamente una vez ── */

test("sin shells no se puede lanzar, y no se escribe nada", async () => {
  const { cliente, tablas } = baseFalsa();
  const r = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: () => 0.5 });
  assert.ok(fallo(r));
  assert.match(r.error, /No tenés ninguna Blue Shell/);
  assert.equal(tablas.liga_eventos.length, 0);
  assert.equal(tablas.liga_shells.length, 0);
});

test("un lanzamiento consume exactamente una shell", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  const r = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: () => 0.5 });
  assert.ok(!fallo(r));
  assert.equal(r.repetida, false);
  assert.equal(tablas.liga_eventos.length, 1);
  const usos = tablas.liga_shells.filter((s) => s.delta === -1);
  assert.equal(usos.length, 1);
  assert.equal((await inventarioDeLaEdicion(cliente, "2026-10-05")).get("agus"), 0);
  // Con 0.5 el sorteo cae en MAIN_BAN y no rebota: el efecto tiene que quedar
  // pendiente contra la víctima, colgado del MISMO evento.
  assert.equal(r.efecto, "MAIN_BAN");
  assert.equal(r.final, "simi");
  assert.equal(tablas.liga_efectos.length, 1);
  assert.equal(tablas.liga_efectos[0].evento_id, tablas.liga_eventos[0].id);
  assert.equal(tablas.liga_efectos[0].puuid, "simi");
  assert.equal(tablas.liga_efectos[0].estado, "PENDIENTE");
});

/* ── 6. El reintento de Discord ── */

test("el mismo interaction_id NO duplica el efecto: devuelve el primero", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [
      { semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" },
      { semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" },
    ],
  });
  const a = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "misma", rnd: () => 0.5 });
  const b = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "misma", rnd: () => 0.5 });
  assert.ok(!fallo(a));
  // Antes el reintento devolvía error, y el que lo veía era el que había
  // tirado bien: Discord reintenta solo, nadie se tiró dos shells. Ahora el
  // reintento contesta LO MISMO que la primera vez, marcado como repetido
  // para que el bot no lo vuelva a anunciar.
  assert.ok(!fallo(b));
  assert.equal(b.repetida, true);
  assert.equal(a.repetida, false);
  assert.equal(b.eventoId, a.eventoId);
  assert.equal(b.efecto, a.efecto);
  assert.equal(b.final, a.final);
  assert.equal(b.rebotado, a.rebotado);
  // Un solo evento, un solo descuento y un solo efecto, aunque tenía dos shells.
  assert.equal(tablas.liga_eventos.length, 1);
  assert.equal(tablas.liga_shells.filter((s) => s.delta === -1).length, 1);
  assert.equal(tablas.liga_efectos.length, 1);
  assert.equal((await inventarioDeLaEdicion(cliente, "2026-10-05")).get("agus"), 1);
});

test("un reintento de un ROBO no mueve los puntos dos veces", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [
      { semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" },
      { semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" },
    ],
  });
  const dados = () => dadosFijos(0.9, 0.99);
  const a = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "misma", rnd: dados() });
  const b = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "misma", rnd: dados() });
  assert.ok(!fallo(a));
  assert.ok(!fallo(b));
  assert.equal(b.repetida, true);
  assert.equal(tablas.liga_eventos.length, 1);
  const objetos = await objetosDeLaEdicion(cliente, "2026-10-05");
  assert.equal(objetos.get("agus"), 0.5);
  assert.equal(objetos.get("simi"), -0.5);
});

/* ── Nunca contra uno mismo, y se corta antes de tocar la base ── */

test("tirarse una shell a uno mismo se rechaza sin escribir nada", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  const r = await lanzarShell(cliente, {
    ...OPCIONES, objetivo: "agus", interaccionId: "i1", rnd: () => 0.5,
  });
  assert.ok(fallo(r));
  assert.match(r.error, /a vos mismo/);
  // 1) no se consumió la shell, 2) no hay evento, 3) no hay efecto,
  // 4) no se movió un punto, 5) el inventario quedó igual.
  assert.equal(tablas.liga_shells.filter((s) => s.delta === -1).length, 0);
  assert.equal(tablas.liga_eventos.length, 0);
  assert.equal(tablas.liga_efectos.length, 0);
  assert.equal((await objetosDeLaEdicion(cliente, "2026-10-05")).size, 0);
  assert.equal((await inventarioDeLaEdicion(cliente, "2026-10-05")).get("agus"), 1);
});

test("el rechazo del self-target no depende del sorteo: el robo tampoco pasa", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  // Dados que caerían en STEAL_POINTS. Ni se tiran: el corte es antes.
  const r = await lanzarShell(cliente, {
    ...OPCIONES, objetivo: "agus", interaccionId: "i1", rnd: dadosFijos(0.9, 0.99),
  });
  assert.ok(fallo(r));
  assert.equal(tablas.liga_eventos.length, 0);
  assert.equal((await objetosDeLaEdicion(cliente, "2026-10-05")).size, 0);
});

/* ── Todo o nada: si falla una escritura, no queda media shell gastada ── */

test("si revienta el insert del efecto, no queda evento ni shell consumida", async () => {
  const { cliente, tablas, romperEfecto } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  romperEfecto();
  const r = await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: () => 0.5 });
  assert.ok(fallo(r));
  // Esto es lo que el orden de tres INSERT sueltos NO garantizaba: con el
  // evento y la shell ya escritos, un error en el efecto dejaba al jugador
  // sin la shell y sin nada que la justifique.
  assert.equal(tablas.liga_eventos.length, 0);
  assert.equal(tablas.liga_efectos.length, 0);
  assert.equal(tablas.liga_shells.filter((s) => s.delta === -1).length, 0);
  assert.equal((await inventarioDeLaEdicion(cliente, "2026-10-05")).get("agus"), 1);
});

/* ── Dos /tirar al mismo tiempo con una sola shell ── */

test("dos lanzamientos simultáneos con una sola shell: gasta uno", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  const [a, b] = await Promise.all([
    lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: () => 0.5 }),
    lanzarShell(cliente, { ...OPCIONES, interaccionId: "i2", rnd: () => 0.5 }),
  ]);
  // Los dos pasan el chequeo amable de inventario —leen 1— y los dos llegan
  // a la base. El que decide es el lock de la función, no el TypeScript.
  assert.equal([a, b].filter((r) => !fallo(r)).length, 1);
  const fallido = [a, b].find((r) => fallo(r));
  assert.ok(fallido && fallo(fallido));
  assert.match(fallido.error, /No tenés ninguna Blue Shell/);
  assert.equal(tablas.liga_eventos.length, 1);
  assert.equal(tablas.liga_shells.filter((s) => s.delta === -1).length, 1);
  assert.equal((await inventarioDeLaEdicion(cliente, "2026-10-05")).get("agus"), 0);
});

/* ── 9 y 10 contra la base ── */

test("el robo escribe el movimiento y se lee al derecho", async () => {
  const { cliente } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  // rnd fijo que cae en STEAL_POINTS y no rebota.
  await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: dadosFijos(0.9, 0.99) });
  const objetos = await objetosDeLaEdicion(cliente, "2026-10-05");
  assert.equal(objetos.get("agus"), 0.5);
  assert.equal(objetos.get("simi"), -0.5);
});

test("el robo REBOTADO se lee al revés", async () => {
  const { cliente } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: dadosFijos(0.9, 0.0) });
  const objetos = await objetosDeLaEdicion(cliente, "2026-10-05");
  assert.equal(objetos.get("agus"), -0.5);
  assert.equal(objetos.get("simi"), 0.5);
});

/* ── 15. El campeón se persiste ── */

test("el campeón sorteado queda escrito y no se vuelve a sortear", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: dadosFijos(0.1, 0.99) });
  const efecto = tablas.liga_efectos[0];
  assert.equal(efecto.efecto, "RANDOM_CHAMPION");
  assert.equal(efecto.campeon, "Volibear");
  // Está en la fila: leerla de nuevo da lo mismo, no hay sorteo al refrescar.
  assert.equal(tablas.liga_efectos[0].campeon, "Volibear");
});

/* ── 13. MAIN_BAN arranca en 3 ── */

test("MAIN_BAN arranca en 3 partidas y congela los mains", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_shells: [{ semana: "2026-10-05", puuid: "agus", delta: 1, origen: "ADMIN" }],
  });
  await lanzarShell(cliente, { ...OPCIONES, interaccionId: "i1", rnd: dadosFijos(0.5, 0.99) });
  const e = tablas.liga_efectos[0];
  assert.equal(e.efecto, "MAIN_BAN");
  assert.equal(e.faltan, 3);
  assert.deepEqual(e.prohibidos, ["Lux", "Ahri", "Orianna"]);
});

/* ── 14. Una partida consume el progreso UNA vez ── */

test("una misma partida no descuenta dos veces aunque el cron se repita", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_efectos: [{
      id: "e1", puuid: "simi", efecto: "MAIN_BAN", estado: "PENDIENTE",
      campeon: null, prohibidos: ["Lux"], faltan: 3, matches: [],
      creado_at: "2026-10-05T00:00:00.000Z",
    }],
    matches: [{
      match_id: "M1", puuid: "simi", champion: "Ahri", played_at: "2026-10-05T10:00:00.000Z",
      queue_id: 420, game_duration_s: 1800,
    }],
  });
  await cerrarEfectosPendientes(cliente, "simi");
  assert.equal(tablas.liga_efectos[0].faltan, 2);
  assert.deepEqual(tablas.liga_efectos[0].matches, ["M1"]);
  // El cron corre de nuevo con la MISMA partida: no puede volver a descontar.
  await cerrarEfectosPendientes(cliente, "simi");
  assert.equal(tablas.liga_efectos[0].faltan, 2);
  assert.deepEqual(tablas.liga_efectos[0].matches, ["M1"]);
});

test("MAIN_BAN se cierra CUMPLIDO al completar las 3 sin usar un prohibido", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_efectos: [{
      id: "e1", puuid: "simi", efecto: "MAIN_BAN", estado: "PENDIENTE",
      campeon: null, prohibidos: ["Lux"], faltan: 3, matches: [],
      creado_at: "2026-10-05T00:00:00.000Z",
    }],
    matches: ["M1", "M2", "M3"].map((id, i) => ({
      match_id: id, puuid: "simi", champion: "Ahri",
      played_at: `2026-10-05T1${i}:00:00.000Z`, queue_id: 420, game_duration_s: 1800,
    })),
  });
  await cerrarEfectosPendientes(cliente, "simi");
  assert.equal(tablas.liga_efectos[0].estado, "CUMPLIDO");
  assert.equal(tablas.liga_efectos[0].faltan, 0);
});

test("usar un campeón prohibido deja el efecto INCUMPLIDO, pero recién al completar las 3", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_efectos: [{
      id: "e1", puuid: "simi", efecto: "MAIN_BAN", estado: "PENDIENTE",
      campeon: null, prohibidos: ["Lux"], faltan: 3, matches: [],
      creado_at: "2026-10-05T00:00:00.000Z",
    }],
    matches: ["M1", "M2", "M3"].map((id, i) => ({
      match_id: id, puuid: "simi", champion: i === 0 ? "Lux" : "Ahri",
      played_at: `2026-10-05T1${i}:00:00.000Z`, queue_id: 420, game_duration_s: 1800,
    })),
  });
  await cerrarEfectosPendientes(cliente, "simi");
  assert.equal(tablas.liga_efectos[0].estado, "INCUMPLIDO");
});

test("RANDOM_CHAMPION se cierra con la PRIMERA partida posterior", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_efectos: [{
      id: "e1", puuid: "simi", efecto: "RANDOM_CHAMPION", estado: "PENDIENTE",
      campeon: "Volibear", prohibidos: null, faltan: 1, matches: [],
      creado_at: "2026-10-05T00:00:00.000Z",
    }],
    matches: [{
      match_id: "M1", puuid: "simi", champion: "Volibear",
      played_at: "2026-10-05T10:00:00.000Z", queue_id: 420, game_duration_s: 1800,
    }],
  });
  await cerrarEfectosPendientes(cliente, "simi");
  assert.equal(tablas.liga_efectos[0].estado, "CUMPLIDO");
});

test("una partida ANTERIOR a la activación no cuenta", async () => {
  const { cliente, tablas } = baseFalsa({
    liga_efectos: [{
      id: "e1", puuid: "simi", efecto: "RANDOM_CHAMPION", estado: "PENDIENTE",
      campeon: "Volibear", prohibidos: null, faltan: 1, matches: [],
      creado_at: "2026-10-05T12:00:00.000Z",
    }],
    matches: [{
      match_id: "VIEJA", puuid: "simi", champion: "Ahri",
      played_at: "2026-10-05T09:00:00.000Z", queue_id: 420, game_duration_s: 1800,
    }],
  });
  await cerrarEfectosPendientes(cliente, "simi");
  assert.equal(tablas.liga_efectos[0].estado, "PENDIENTE");
});

/* ── 16. El premio de consuelo no se duplica ── */

test("otorgar dos veces el mismo período NO da dos shells", async () => {
  const { cliente, tablas } = baseFalsa();
  assert.equal(await otorgarShell(cliente, "2026-10-05", "simi", "COMEBACK", "0"), true);
  assert.equal(await otorgarShell(cliente, "2026-10-05", "simi", "COMEBACK", "0"), false);
  assert.equal(tablas.liga_shells.length, 1);
  // Pero el período SIGUIENTE sí entrega.
  assert.equal(await otorgarShell(cliente, "2026-10-05", "simi", "COMEBACK", "1"), true);
  assert.equal(tablas.liga_shells.length, 2);
});

function dadosFijos(...xs: number[]) {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
}
