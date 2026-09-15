import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { sendDiscordNotification } from "@/lib/discord";
import { parteDelDia } from "@/lib/liga-cierre";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * El parte diario de la liga.
 *
 * GET  — lo manda al Discord. Es el que llama el scheduler externo, con
 *        `Authorization: Bearer $CRON_SECRET`, una vez por día a las 23:55
 *        argentinas. Va por GET y no por POST porque los schedulers gratuitos
 *        (cron-job.org y parecidos) mandan GET y nada más.
 * POST  — la vista previa. Pide sesión y NO manda nada: devuelve el texto tal
 *        cual saldría. Un mensaje al canal del grupo no se puede deshacer, así
 *        que se mira antes de tirarlo — el mismo criterio que /api/liga/anunciar.
 *        Con `{ ahora: "2026-09-18T23:55:00-03:00" }` se puede ver cómo quedaría
 *        otro día, que es la única forma de probar un domingo sin esperar al
 *        domingo.
 *
 * Que el parte decida SOLO si hay algo para decir es la mitad del diseño: los
 * domingos se calla —ese día sale el cierre con el podio y las cargadas, y dos
 * mensajes de la liga a la misma hora se pisan— y los días que no jugó nadie
 * también. Un bot que escribe "no se movió nadie" todas las noches es un bot
 * que el canal aprende a saltear, y después no lo lee ni cuando tiene algo.
 *
 * Por eso "no mandé nada" contesta 200 y no un error: es el caso normal, no una
 * falla. El `motivo` está para que en el log del scheduler se vea por qué.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  let parte;
  try {
    parte = await parteDelDia(supabase);
  } catch (err) {
    // El error se TIRA con su mensaje en vez de contestar un 200 vacío. Si
    // Supabase se cae, el parte no sale y eso tiene que verse en el log del
    // scheduler — si no, un "mandado: false" se confunde con un domingo.
    const message = err instanceof Error ? err.message : "No se pudo armar el parte.";
    console.error("parte diario de la liga falló:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!parte.texto) {
    console.log("parte diario: no se manda —", parte.motivo);
    return NextResponse.json({ mandado: false, motivo: parte.motivo });
  }

  const ok = await sendDiscordNotification(parte.texto);
  return NextResponse.json({ mandado: ok, texto: parte.texto });
}

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { ahora?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Sin body: hoy.
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  const ahora = typeof body.ahora === "string" ? new Date(body.ahora) : new Date();
  if (Number.isNaN(ahora.getTime())) {
    return NextResponse.json({ error: "`ahora` no es una fecha válida." }, { status: 400 });
  }

  try {
    const parte = await parteDelDia(supabase, ahora);
    return NextResponse.json({ preview: true, ...parte, ahora: ahora.toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo armar el parte." },
      { status: 502 },
    );
  }
}
