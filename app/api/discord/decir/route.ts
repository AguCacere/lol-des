import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { mandarMensaje, reaccionar } from "@/lib/discord";

/**
 * POST /api/discord/decir — mandar un mensaje propio, como el bot.
 *
 * Todo lo demás que sale al canal lo genera el código: la cargada, la
 * carrileada, el parte diario, el cierre. Esto es la puerta para lo que no
 * genera nadie — anunciar que cambió una regla, abrir una votación, avisar que
 * el torneo se extendió.
 *
 * Sale firmado por el bot y no por una persona, que es la gracia: se lee como
 * anuncio y no como opinión de alguien. Y puede dejar las reacciones puestas,
 * que es lo que un webhook nunca pudo hacer.
 *
 *   fetch("/api/discord/decir", { method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ texto: "Se extendió el torneo al lunes." })
 *   }).then(r => r.json())
 *
 * **Sin `mandar: true` no manda nada**, devuelve la vista previa. Es el mismo
 * criterio que `/api/liga/anunciar` y `/api/liga/diario`, y no es paranoia: de
 * un canal de Discord un mensaje no se borra tan fácil, y este es el único que
 * escribe texto libre.
 *
 * Con `reacciones: ["👍","👎"]` las deja puestas, para una votación.
 */
export const dynamic = "force-dynamic";

/** El tope de Discord. Se corta acá para dar un error claro en vez de un 400 de la API. */
const TOPE = 2000;

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  let body: { texto?: unknown; mandar?: unknown; reacciones?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — mandá JSON." }, { status: 400 });
  }

  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (!texto) return NextResponse.json({ error: "Falta `texto`." }, { status: 400 });
  if (texto.length > TOPE) {
    return NextResponse.json(
      { error: `El mensaje tiene ${texto.length} caracteres y Discord corta en ${TOPE}.` },
      { status: 400 },
    );
  }

  const reacciones = Array.isArray(body.reacciones)
    ? body.reacciones.filter((e): e is string => typeof e === "string" && e.length > 0).slice(0, 5)
    : [];

  if (body.mandar !== true) {
    return NextResponse.json({
      preview: true,
      texto,
      reacciones,
      aviso: "Esto NO se mandó. Repetí con { mandar: true } cuando lo quieras publicar.",
    });
  }

  const mandado = await mandarMensaje(texto);
  if (!mandado.ok) {
    return NextResponse.json({ error: "Discord no aceptó el mensaje." }, { status: 502 });
  }

  // Las reacciones solo existen por el camino del bot: un webhook no tiene
  // identidad con la cual reaccionar. Si salió por el respaldo, `id` viene null
  // y esto queda en false sin romper nada.
  const reaccionado = reacciones.length > 0 && mandado.id ? await reaccionar(mandado.id, reacciones) : false;

  return NextResponse.json({
    enviado: true,
    via: mandado.via,
    id: mandado.id,
    reaccionado,
    texto,
  });
}
