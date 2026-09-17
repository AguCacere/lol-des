import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { listarTorneos, torneoDe } from "@/lib/torneo";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * /api/torneos — planificar los torneos de la liga.
 *
 * Hasta acá la liga no TENÍA fechas: las deducía del calendario (el lunes de la
 * semana en curso, más siete días). Esto es lo que las convierte en un dato que
 * se puede planificar y corregir. Ver `lib/torneo.ts` para por qué el "7" no
 * era un número suelto.
 *
 *   GET    → los torneos cargados, del más nuevo al más viejo
 *   POST   → crea uno      { nombre?, arranca, cierra, minimoTotal?, minimoUltimo?, ultimoDesde?, premio? }
 *   PATCH  → edita uno     { id, ...los mismos campos }
 *   DELETE → borra uno     ?id=…
 *
 * Todo pide la contraseña del grupo: mover la fecha de cierre de un torneo en
 * curso le cambia las reglas a gente que ya organizó su semana.
 *
 * Las fechas viajan como ISO y se guardan como `timestamptz`. El cierre es
 * EXCLUSIVO: para que un torneo termine el domingo a la noche, `cierra` es el
 * lunes a las 00:00.
 */
export const dynamic = "force-dynamic";

/** Los dos errores que hacen que un torneo no se pueda calcular, y por eso se cortan acá. */
function validar(t: { arranca: Date; cierra: Date; ultimoDesde: Date | null }): string | null {
  if (Number.isNaN(t.arranca.getTime()) || Number.isNaN(t.cierra.getTime())) return "Las fechas no son válidas.";
  if (t.cierra.getTime() <= t.arranca.getTime()) return "El cierre tiene que ser posterior al arranque.";
  if (t.ultimoDesde) {
    if (Number.isNaN(t.ultimoDesde.getTime())) return "La fecha del último día no es válida.";
    if (t.ultimoDesde.getTime() < t.arranca.getTime() || t.ultimoDesde.getTime() >= t.cierra.getTime()) {
      return "El último día tiene que caer adentro del torneo.";
    }
  }
  return null;
}

interface Cuerpo {
  id?: unknown;
  nombre?: unknown;
  arranca?: unknown;
  cierra?: unknown;
  minimoTotal?: unknown;
  minimoUltimo?: unknown;
  ultimoDesde?: unknown;
  premio?: unknown;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function entero(v: unknown, porDefecto: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : porDefecto;
}

async function sinPisarse(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  arranca: Date,
  cierra: Date,
  excepto: string | null,
): Promise<string | null> {
  // Dos torneos que se pisan hacen que `torneoDe` tenga que elegir, y elegir
  // mal ahí significa calcular la tabla con la ventana equivocada sin que nada
  // avise. Es más barato no dejar cargarlos.
  let q = supabase
    .from("liga_torneos")
    .select("id, nombre, arranca_at, cierra_at")
    .lt("arranca_at", cierra.toISOString())
    .gt("cierra_at", arranca.toISOString());
  if (excepto) q = q.neq("id", excepto);
  const { data, error } = await q.returns<{ id: string; nombre: string | null; arranca_at: string }[]>();
  if (error) return null; // Sin tabla todavía: que lo diga el insert, no esto.
  const choque = data?.[0];
  return choque
    ? `Se pisa con "${choque.nombre ?? "otro torneo"}", que arranca el ${choque.arranca_at.slice(0, 10)}.`
    : null;
}

export async function GET(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  try {
    const torneos = await listarTorneos(supabase);
    const enCurso = await torneoDe(supabase);
    return NextResponse.json({
      torneos,
      // Cuál está corriendo ahora, y si sale de una fila o del lunes a domingo
      // deducido. Es lo que la pantalla necesita para decir "todavía no hay
      // ninguno cargado, se está usando la semana de siempre".
      enCurso,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // La tabla se crea a mano desde el SQL Editor. Que falte no es un bug:
    // es que la migración todavía no se corrió, y hay que decirlo así.
    return NextResponse.json(
      { error: message, falta: /liga_torneos/.test(message) ? "Falta correr la migración de liga_torneos (supabase/schema.sql)." : undefined },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: Cuerpo;
  try {
    body = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }

  const arranca = new Date(String(body.arranca));
  const cierra = new Date(String(body.cierra));
  const ultimoDesde = body.ultimoDesde ? new Date(String(body.ultimoDesde)) : null;
  const mal = validar({ arranca, cierra, ultimoDesde });
  if (mal) return NextResponse.json({ error: mal }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const choque = await sinPisarse(supabase, arranca, cierra, null);
  if (choque) return NextResponse.json({ error: choque }, { status: 409 });

  const { data, error } = await supabase
    .from("liga_torneos")
    .insert({
      nombre: texto(body.nombre),
      arranca_at: arranca.toISOString(),
      cierra_at: cierra.toISOString(),
      minimo_total: entero(body.minimoTotal, 10),
      minimo_ultimo: entero(body.minimoUltimo, 3),
      ultimo_desde: ultimoDesde ? ultimoDesde.toISOString() : null,
      premio: texto(body.premio),
    })
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: `No se pudo crear: ${error.message}` }, { status: 502 });
  return NextResponse.json({ creado: data?.id ?? null });
}

export async function PATCH(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: Cuerpo;
  try {
    body = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }
  const id = texto(body.id);
  if (!id) return NextResponse.json({ error: "Falta el id del torneo." }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const { data: actual, error: eActual } = await supabase
    .from("liga_torneos")
    .select("arranca_at, cierra_at, ultimo_desde, minimo_total, minimo_ultimo, nombre, premio")
    .eq("id", id)
    .maybeSingle<{
      arranca_at: string;
      cierra_at: string;
      ultimo_desde: string | null;
      minimo_total: number;
      minimo_ultimo: number;
      nombre: string | null;
      premio: string | null;
    }>();
  if (eActual) return NextResponse.json({ error: `No se pudo leer: ${eActual.message}` }, { status: 502 });
  if (!actual) return NextResponse.json({ error: "No existe ese torneo." }, { status: 404 });

  // Solo se pisa lo que vino. Editar el cierre no tiene por qué borrar el premio.
  const arranca = body.arranca ? new Date(String(body.arranca)) : new Date(actual.arranca_at);
  const cierra = body.cierra ? new Date(String(body.cierra)) : new Date(actual.cierra_at);
  const ultimoDesde =
    body.ultimoDesde === null
      ? null
      : body.ultimoDesde
        ? new Date(String(body.ultimoDesde))
        : actual.ultimo_desde
          ? new Date(actual.ultimo_desde)
          : null;
  const mal = validar({ arranca, cierra, ultimoDesde });
  if (mal) return NextResponse.json({ error: mal }, { status: 400 });

  const choque = await sinPisarse(supabase, arranca, cierra, id);
  if (choque) return NextResponse.json({ error: choque }, { status: 409 });

  // Un torneo YA CERRADO no se toca: su foto está guardada en `liga_semanas` y
  // se anunció un ganador. Mover las fechas después dejaría la pantalla
  // contando una cosa y el anuncio otra, y un resultado ya anunciado es un
  // hecho (ver el comentario de `resumen` en supabase/schema.sql).
  const clave = new Date(new Date(actual.arranca_at).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: cerrada } = await supabase.from("liga_semanas").select("semana").eq("semana", clave).maybeSingle();
  if (cerrada) {
    return NextResponse.json(
      { error: `Ese torneo ya cerró y se anunció (${clave}). Un resultado anunciado no se reescribe.` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("liga_torneos")
    .update({
      nombre: body.nombre !== undefined ? texto(body.nombre) : actual.nombre,
      arranca_at: arranca.toISOString(),
      cierra_at: cierra.toISOString(),
      minimo_total: body.minimoTotal !== undefined ? entero(body.minimoTotal, actual.minimo_total) : actual.minimo_total,
      minimo_ultimo:
        body.minimoUltimo !== undefined ? entero(body.minimoUltimo, actual.minimo_ultimo) : actual.minimo_ultimo,
      ultimo_desde: ultimoDesde ? ultimoDesde.toISOString() : null,
      premio: body.premio !== undefined ? texto(body.premio) : actual.premio,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: `No se pudo editar: ${error.message}` }, { status: 502 });
  return NextResponse.json({ editado: id });
}

export async function DELETE(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const { error } = await supabase.from("liga_torneos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: `No se pudo borrar: ${error.message}` }, { status: 502 });
  // Borrar un torneo no borra nada de lo jugado: la ventana vuelve a ser el
  // lunes a domingo deducido y la tabla se recalcula sola.
  return NextResponse.json({ borrado: id });
}
