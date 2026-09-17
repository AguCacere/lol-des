import { NextResponse } from "next/server";
import { exigirSesion } from "@/lib/auth";
import COMANDOS from "@/lib/discord-comandos.json";

/**
 * POST /api/discord/registrar — le registra a Discord el menú de comandos.
 *
 * Hace exactamente lo mismo que `scripts/registrar-comandos.mjs`, pero desde el
 * servidor. Existe porque ese script necesita una consola con Node y acá no
 * siempre hay una: esta ruta se dispara desde la consola del NAVEGADOR, igual
 * que `/api/repair`, y el token del bot nunca sale del servidor.
 *
 *   fetch("/api/discord/registrar", { method: "POST" }).then(r => r.json())
 *
 * Pide sesión porque toca la configuración del bot del grupo. No es que cueste
 * plata: es que registrar una lista equivocada rompe el menú para todos.
 *
 * Esto NO se corre en cada deploy. El código de los comandos se despliega con
 * la app como cualquier ruta; lo que registra esto es el menú que Discord
 * muestra al tipear "/". Son dos cosas distintas, y esa es la confusión típica:
 * si agregás un comando a `lib/discord-comandos.json` y no corrés esto,
 * funciona pero no aparece en la lista.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

  const appId = process.env.DISCORD_APP_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!appId || !token) {
    return NextResponse.json(
      {
        error:
          "Faltan DISCORD_APP_ID y/o DISCORD_BOT_TOKEN en el entorno. Salen de " +
          "discord.com/developers → tu aplicación: el id en General Information, el token en Bot.",
      },
      { status: 503 },
    );
  }

  let body: { global?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Sin body: al server de siempre, que es lo que se quiere el 99% de las veces.
  }

  // Al server puntual salvo que pidan lo contrario: los de guild aparecen al
  // instante y los globales tardan hasta una hora en propagarse. Para un server
  // de amigos el guild gana siempre — si te equivocaste en una descripción, la
  // corrección se ve enseguida.
  const alServer = guildId && body.global !== true;
  const url = alServer
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  let res: Response;
  try {
    // PUT y no POST: PUT reemplaza la lista ENTERA. Con POST, un comando que se
    // saca del JSON queda registrado para siempre y sigue apareciendo en el menú
    // aunque el código ya no lo conteste.
    res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
      body: JSON.stringify(COMANDOS),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `No pude hablar con Discord: ${err instanceof Error ? err.message : err}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    // El cuerpo del error de Discord viaja tal cual: dice qué campo rechazó y
    // por qué, y sin eso "400" no alcanza para arreglar nada.
    return NextResponse.json(
      { error: `Discord rechazó el registro (${res.status})`, detalle: await res.text() },
      { status: 502 },
    );
  }

  const registrados = (await res.json()) as { name: string; description: string }[];
  return NextResponse.json({
    registrados: registrados.length,
    donde: alServer ? `el server ${guildId} (ya aparecen)` : "globales (hasta 1 hora en aparecer)",
    comandos: registrados.map((c) => `/${c.name} — ${c.description}`),
  });
}
