import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { sendDiscordNotification } from "@/lib/discord";
import { inicioDeSemana, finDeSemana, mensajeDeArranque } from "@/lib/liga";

/**
 * POST /api/liga/anunciar — el aviso de que arranca la liga.
 *
 * Dos pasos a propósito. Con `{ preview: true }` devuelve el texto y NO manda
 * nada; recién con `{ preview: false }` sale al Discord. Un mensaje al canal
 * del grupo no se puede deshacer, así que se mira antes de tirarlo.
 *
 * Se manda a mano y no por cron porque es de una sola vez: el que reacciona
 * participa, y después vos los anotás en la app.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { preview?: unknown; premio?: unknown; proxima?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Sin body: se asume vista previa, que es el lado seguro.
  }

  // `proxima` arma el mensaje para la semana que VIENE, que es el caso real:
  // el aviso sale un domingo a la noche para una liga que empieza el lunes.
  const inicio = body.proxima === false ? inicioDeSemana() : finDeSemana(inicioDeSemana());
  const premio = typeof body.premio === "string" && body.premio.trim().length > 0 ? body.premio.trim() : null;
  const texto = mensajeDeArranque(inicio, premio);

  if (body.preview !== false) {
    return NextResponse.json({ preview: true, texto, desde: inicio.toISOString() });
  }

  try {
    await sendDiscordNotification(texto);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Discord no aceptó el mensaje." }, { status: 502 });
  }
  return NextResponse.json({ enviado: true, texto });
}
