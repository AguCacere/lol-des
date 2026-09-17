import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { mandarMensaje, reaccionar } from "@/lib/discord";
import { vistaPreviaDeCierre } from "@/lib/liga-cierre";
import { inicioDeSemana, finDeSemana, mensajeDeArranque } from "@/lib/liga";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * POST /api/liga/anunciar — el aviso de que arranca la liga.
 *
 * Dos pasos a propósito. Con `{ preview: true }` devuelve el texto y NO manda
 * nada; recién con `{ preview: false }` sale al Discord. Un mensaje al canal
 * del grupo no se puede deshacer, así que se mira antes de tirarlo.
 *
 * Se manda a mano y no por cron porque es de una sola vez: el que reacciona
 * participa, y después vos los anotás en la app. El 👍 lo deja puesto el bot
 * —antes había que ponerlo a mano—, así que anotarse es un toque y no dos.
 *
 * Con `{ tipo: "cierre" }` devuelve, en cambio, el anuncio del FINAL de la
 * semana —el podio con la cargada de cada puesto— armado con la gente y los
 * números que hay en la base ahora mismo. Ese nunca se manda desde acá por más
 * que se pida: el cierre lo dispara el cron, que además registra la semana en
 * `liga_semanas` para que no se anuncie dos veces. Sin ese registro, mandarlo
 * a mano sería un anuncio duplicado esperando a pasar. Acá es solo para verlo.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { preview?: unknown; premio?: unknown; proxima?: unknown; tipo?: unknown; semana?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Sin body: se asume vista previa, que es el lado seguro.
  }

  if (body.tipo === "cierre") {
    const enCurso = inicioDeSemana();
    // Por defecto la semana que está corriendo: la pregunta que uno se hace es
    // "cómo quedaría el mensaje si cerrara ahora". `semana: "anterior"` es para
    // revisar el que ya salió.
    const inicio = body.semana === "anterior" ? new Date(enCurso.getTime() - 7 * 24 * 60 * 60 * 1000) : enCurso;
    let supabase;
    try {
      supabase = getSupabaseServerClient();
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
    }
    const previa = await vistaPreviaDeCierre(supabase, inicio);
    return NextResponse.json({ preview: true, tipo: "cierre", ...previa, desde: inicio.toISOString() });
  }

  // `proxima` arma el mensaje para la semana que VIENE, que es el caso real:
  // el aviso sale un domingo a la noche para una liga que empieza el lunes.
  const inicio = body.proxima === false ? inicioDeSemana() : finDeSemana(inicioDeSemana());
  const premio = typeof body.premio === "string" && body.premio.trim().length > 0 ? body.premio.trim() : null;
  const texto = mensajeDeArranque(inicio, premio);

  if (body.preview !== false) {
    return NextResponse.json({ preview: true, texto, desde: inicio.toISOString() });
  }

  const mandado = await mandarMensaje(texto);
  if (!mandado.ok) {
    return NextResponse.json({ error: "Discord no aceptó el mensaje." }, { status: 502 });
  }

  // El 👍 queda puesto solo. Este mensaje termina con "el que reacciona
  // participa", y hasta ahora la primera reacción la tenía que poner alguien a
  // mano: un webhook no tiene identidad con la cual reaccionar. Con el bot sí.
  // Si el bot no está configurado devuelve false y el aviso sale igual — sin la
  // reacción sembrada, como salía antes.
  const reaccionado = mandado.id ? await reaccionar(mandado.id, ["👍"]) : false;
  return NextResponse.json({ enviado: true, texto, via: mandado.via, reaccionado });
}
