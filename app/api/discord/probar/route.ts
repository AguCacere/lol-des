import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import { apiDelBot, borrarMensaje, estadoDeDiscord, mandarMensaje, reaccionar } from "@/lib/discord";

/**
 * POST /api/discord/probar — ¿los anuncios están saliendo por el bot o por el
 * webhook?
 *
 * Existe porque esa pregunta no se puede contestar mirando. Que un comando
 * conteste NO prueba que los anuncios funcionen: son dos caminos distintos. La
 * respuesta a una interacción viaja por el token de esa interacción y anda sin
 * importar los permisos del canal; los anuncios van por
 * `POST /channels/{id}/messages`, que necesita que `DISCORD_CHANNEL_ID` sea el
 * correcto y que el bot pueda escribir en ESE canal. Y cuando eso falla no se
 * rompe nada —cae al webhook, el mensaje sale igual— así que el síntoma es
 * justamente que no hay síntoma.
 *
 *   fetch("/api/discord/probar", { method: "POST" }).then(r => r.json())
 *
 * Sin body no manda nada: pregunta quién es el bot y a qué canal apunta, que es
 * lo que caza los dos errores comunes —token mal copiado, canal equivocado— sin
 * escribirle a nadie.
 *
 * Con `{ mandar: true }` prueba el camino entero de verdad: manda un mensaje,
 * le pone una reacción y lo borra. No deja nada en el canal. Y NO cae al
 * webhook a propósito: un fallback acá contestaría que todo anda sin haber
 * probado lo que se quería probar.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  const estado = estadoDeDiscord();
  const pasos: string[] = [];

  if (!estado.bot) {
    // Se nombra la que falta, no "una de las dos". El bot necesita las dos
    // juntas —sin canal no sabe a dónde escribir— así que es normal llegar acá
    // con el token puesto y creer que está todo hecho.
    const faltan = [!estado.token && "DISCORD_BOT_TOKEN", !estado.canal && "DISCORD_CHANNEL_ID"]
      .filter(Boolean)
      .join(" y ");
    return NextResponse.json({
      camino: estado.webhook ? "webhook" : "nada",
      diagnostico: estado.webhook
        ? `Falta ${faltan} en Vercel. Hasta que esté, los anuncios salen por el webhook —como antes, sin reacciones automáticas y firmados con el nombre del webhook—. Acordate de redesplegar: una variable nueva no entra en un deploy viejo.`
        : `Falta ${faltan}, y tampoco hay webhook: las notificaciones están apagadas.`,
      ...estado,
    });
  }

  // 1. ¿El token sirve? Devuelve el nombre del bot, que además confirma a ojo
  //    que es la aplicación que uno cree.
  const quienSoy = await apiDelBot("/users/@me");
  if (!quienSoy.ok) {
    return NextResponse.json({
      camino: "webhook",
      diagnostico:
        "DISCORD_BOT_TOKEN no sirve: Discord lo rechazó. Suele ser que se copió el Client Secret en vez del token del Bot, o que el token se reseteó después de cargarlo en Vercel.",
      detalle: quienSoy.cuerpo,
      ...estado,
    });
  }
  const bot = JSON.parse(quienSoy.cuerpo) as { username?: string };
  pasos.push(`El token es de **${bot.username ?? "?"}**.`);

  // 2. ¿El canal existe y el bot lo ve? Un 404 acá es casi siempre un
  //    DISCORD_CHANNEL_ID de otro server, o el bot sin acceso a ese canal.
  const canal = await apiDelBot(`/channels/${estado.canal}`);
  if (!canal.ok) {
    return NextResponse.json({
      camino: "webhook",
      diagnostico:
        "El bot no puede ver el canal de DISCORD_CHANNEL_ID. O el id es de otro canal, o el bot no está en ese server, o el canal tiene permisos propios que lo dejan afuera.",
      detalle: canal.cuerpo,
      pasos,
      ...estado,
    });
  }
  const c = JSON.parse(canal.cuerpo) as { name?: string };
  pasos.push(`Ve el canal **#${c.name ?? "?"}**.`);

  let body: { mandar?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Sin body: solo los chequeos de arriba, que no le escriben a nadie.
  }

  if (body.mandar !== true) {
    return NextResponse.json({
      camino: "bot",
      diagnostico:
        "El token y el canal están bien. Para probar que además puede ESCRIBIR ahí, repetí con { mandar: true }: manda un mensaje, le pone una reacción y lo borra.",
      pasos,
      ...estado,
    });
  }

  // 3. La prueba de verdad, por el mismo camino que los anuncios.
  const mandado = await mandarMensaje(
    "🔧 Probando el camino de los anuncios. Este mensaje se borra solo.",
    { soloBot: true },
  );
  if (!mandado.ok || !mandado.id) {
    return NextResponse.json({
      camino: "webhook",
      diagnostico:
        "El bot ve el canal pero no pudo escribir en él: le falta el permiso Enviar mensajes ahí. Los anuncios van a seguir saliendo por el webhook. Se arregla en Editar canal → Permisos, agregando al bot.",
      pasos,
      ...estado,
    });
  }
  pasos.push("Escribió en el canal.");

  const reaccionado = await reaccionar(mandado.id, ["👍"]);
  pasos.push(
    reaccionado
      ? "Puso la reacción (el 👍 de las votaciones va a quedar solo)."
      : "NO pudo reaccionar: le falta el permiso Agregar reacciones. Todo lo demás anda.",
  );

  const borrado = await borrarMensaje(mandado.id);
  pasos.push(
    borrado
      ? "Y borró el mensaje de prueba."
      : "No pudo borrar el mensaje de prueba (le falta Gestionar mensajes): borralo a mano.",
  );

  return NextResponse.json({
    camino: "bot",
    diagnostico: reaccionado
      ? "Todo bien: los anuncios salen firmados por el bot y con las reacciones automáticas."
      : "Los anuncios salen por el bot, pero sin reacciones automáticas — ver los pasos.",
    pasos,
    ...estado,
  });
}
