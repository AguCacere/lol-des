import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { comoTerminoLaSemana, rescatarResumen } from "@/lib/liga-cierre";
import { esTorneoDeLiga, torneoDe } from "@/lib/torneo";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * GET /api/liga/semana?semana=2026-09-07 — cómo terminó una semana.
 *
 * Existe para no tener que navegar a ningún lado: el cartel de la pestaña de la
 * liga abre esto encima de lo que ya estabas mirando y muestra la foto de ese
 * torneo. Una pantalla aparte para algo que se mira diez segundos obliga a irse
 * y volver, que es exactamente lo que se pidió evitar.
 *
 * El GET solo lee. Se pide de a una semana y no todas juntas: son ocho como
 * mucho en la vitrina y nadie las abre todas.
 *
 * El POST es el rescate a mano de una semana vieja que se quedó sin foto — ver
 * `rescatarResumen`. Pide la contraseña porque escribe.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clave = new URL(req.url).searchParams.get("semana");
  // Formato estricto: esto entra a un `new Date` y de ahí a una query.
  if (!clave || !/^\d{4}-\d{2}-\d{2}$/.test(clave)) {
    return NextResponse.json({ error: "Falta el parámetro `semana` (YYYY-MM-DD)." }, { status: 400 });
  }
  const mediodia = new Date(`${clave}T12:00:00Z`);
  if (Number.isNaN(mediodia.getTime())) {
    return NextResponse.json({ error: "Esa fecha no existe." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  // El torneo se busca DESPUÉS de tener el cliente: la ventana ya no se deduce
  // del calendario, sale de `liga_torneos` (o del lunes a domingo si no hay
  // fila). El mediodía de ese día cae siempre adentro de la ventana, así que
  // pegar la URL con un miércoles devuelve el torneo correcto igual.
  const torneo = await torneoDe(supabase, mediodia);
  if (!esTorneoDeLiga(torneo)) {
    return NextResponse.json({ error: "Esa semana es anterior al arranque de la liga." }, { status: 404 });
  }

  // Sin este try, una consulta que falla sale como 200 con la tabla vacía y la
  // pantalla dice "esa semana no jugó nadie" — un error invisible que encima
  // miente sobre el dato.
  let datos;
  try {
    datos = await comoTerminoLaSemana(supabase, torneo);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("liga/semana falló:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
  // Una semana con gente anotada y CERO partidas casi siempre es una consulta
  // que falló, no una semana en la que nadie jugó. Esa no se cachea: guardar
  // seis horas un resultado vacío convierte un parpadeo de la base en una tarde
  // entera de pantalla rota, y es exactamente lo que pasó la primera vez.
  const sospechoso = datos.tabla.length === 0 && datos.anotados > 0;
  return NextResponse.json(datos, {
    // Una semana CERRADA ya no cambia: lo único que la movería es un repair que
    // rellene partidas viejas, y eso pasa una vez cada muchas lunas. Seis horas
    // de CDN para que abrir el cartel cuatro veces seguidas no toque la base
    // cuatro veces — el pool de Nano es de 15 conexiones y ya se llenó una vez.
    headers: {
      "Cache-Control": sospechoso ? "no-store" : "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}

/**
 * POST /api/liga/semana?semana=2026-09-07 — rescata la foto de esa semana.
 *
 * Es de una sola vez y a mano. Reconstruye la tabla con todo el que jugó ranked
 * en la ventana, ignorando quién está anotado hoy, y la guarda. Mirá que
 * `reconstruidos` coincida con `registrados` antes de creerle: si no coincide,
 * la reconstrucción metió (o perdió) gente y conviene no dejarla guardada.
 */
export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  const clave = new URL(req.url).searchParams.get("semana");
  if (!clave || !/^\d{4}-\d{2}-\d{2}$/.test(clave)) {
    return NextResponse.json({ error: "Falta el parámetro `semana` (YYYY-MM-DD)." }, { status: 400 });
  }
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const torneo = await torneoDe(supabase, new Date(`${clave}T12:00:00Z`));
  if (!esTorneoDeLiga(torneo)) {
    return NextResponse.json({ error: "Esa semana no es de la liga." }, { status: 400 });
  }

  try {
    return NextResponse.json(await rescatarResumen(supabase, torneo));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("liga/semana rescate falló:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
