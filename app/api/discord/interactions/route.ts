import { after, NextResponse } from "next/server";
import { responderComando, sugerenciasDeJugador } from "@/lib/discord-comandos";
import { firmaValida } from "@/lib/discord-firma";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * POST /api/discord/interactions — la puerta del bot.
 *
 * Discord tiene dos modos de bot y este es el de **HTTP Interactions**: no hay
 * ningún proceso corriendo esperando mensajes. Se le da esta URL, y cuando
 * alguien tipea un comando Discord manda un POST acá. O sea que el bot es un
 * route handler más y vive en el mismo Vercel que la app — que es lo que hacía
 * que la idea pareciera imposible en el plan Hobby y no lo es.
 *
 * Tres cosas que hay que entender antes de tocar esto:
 *
 * 1. **El cuerpo se lee CRUDO.** La firma se calcula sobre el texto tal cual
 *    llegó; parsearlo y volver a serializarlo mueve un espacio y ya no valida
 *    nunca. Por eso `req.text()` primero y `JSON.parse` después, y nunca
 *    `req.json()`.
 *
 * 2. **La regla de los 3 segundos.** Discord corta si no contestás antes, y
 *    "antes" incluye el arranque en frío de la función. Por eso los comandos
 *    contestan al toque un "pensando…" (el tipo 5) y el trabajo real va en
 *    `after()`, que después EDITA ese mensaje. Con eso el presupuesto pasa de
 *    3 segundos a 15 minutos y deja de importar si la función estaba dormida.
 *    Es el mismo patrón que ya usa `/api/cron/refresh`.
 *
 *    El análisis original decía que para lo que sale de Supabase alcanzaba con
 *    contestar derecho. Alcanza para la consulta; lo que no entra seguro es la
 *    consulta MÁS levantar la función desde cero, que es el caso normal en un
 *    canal donde nadie tipea un comando hace una hora.
 *
 * 3. **El autocompletado no se puede diferir.** Discord quiere las opciones en
 *    el momento. Es una consulta a una tabla de catorce filas: entra.
 *
 * La firma es la única cerradura que tiene esta ruta, y es suficiente porque
 * los cuatro comandos son de lectura. El día que el bot escriba algo, eso NO
 * alcanza: ahí va además una lista de `discord_id` permitidos, porque una firma
 * válida solo prueba que el pedido vino de Discord, no que lo haya tipeado
 * alguien de la casa.
 */
export const dynamic = "force-dynamic";
// Los comandos tardan menos de un segundo, pero el trabajo de `after()` corre
// dentro de esta misma invocación: el tope tiene que cubrirlo a él, no a la
// respuesta.
export const maxDuration = 30;

/** Los tipos de interacción que manda Discord. */
const PING = 1;
const COMANDO = 2;
const AUTOCOMPLETADO = 4;

/** Los tipos de respuesta que espera Discord. */
const PONG = 1;
const MENSAJE = 4;
const DIFERIDA = 5;
const OPCIONES_DE_AUTOCOMPLETADO = 8;

interface OpcionDeComando {
  name: string;
  value?: unknown;
  focused?: boolean;
}

interface Interaccion {
  /**
   * El id de la interacción. Único por invocación y estable entre reintentos:
   * es la llave de idempotencia de `/shell`. Discord reintenta cuando no le
   * contestás a tiempo, y sin esto un reintento lanzaría la shell dos veces.
   */
  id?: string;
  type: number;
  application_id: string;
  token: string;
  data?: { name?: string; options?: OpcionDeComando[] };
  /** En un servidor viene `member.user`; en un DM, `user` suelto. */
  member?: { user?: { id?: string } };
  user?: { id?: string };
}

/** El id de Discord de quien tipeó, que es con lo que se resuelve "la mía". */
function quienTipeo(i: Interaccion): string | null {
  return i.member?.user?.id ?? i.user?.id ?? null;
}

/** Las opciones del comando como un objeto plano, que es como las quiere `responderComando`. */
function opciones(i: Interaccion): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const o of i.data?.options ?? []) {
    if (typeof o.value === "string") salida[o.name] = o.value;
  }
  return salida;
}

export async function POST(req: Request) {
  // CRUDO. Ver el punto 1 del comentario de arriba.
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    // El 401 no es solo prolijidad: Discord PRUEBA el endpoint con una firma
    // inválida a propósito y no deja guardar la URL si no le contesta 401.
    return new NextResponse("firma inválida", { status: 401 });
  }

  let i: Interaccion;
  try {
    i = JSON.parse(cuerpo) as Interaccion;
  } catch {
    return new NextResponse("cuerpo inválido", { status: 400 });
  }

  // El saludo que manda Discord para ver si la URL está viva.
  if (i.type === PING) return NextResponse.json({ type: PONG });

  if (i.type !== COMANDO && i.type !== AUTOCOMPLETADO) {
    // Botones, menús y modales todavía no existen en este bot. Contestar algo
    // es mejor que un 400: del otro lado hay alguien mirando.
    return NextResponse.json({ type: MENSAJE, data: { content: "Eso todavía no lo sé hacer." } });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const detalle = err instanceof Error ? err.message : "sin conexión a Supabase";
    // Cada tipo de interacción tiene que contestar con SU tipo de respuesta: a
    // un autocompletado no se le puede mandar un mensaje, Discord lo rechaza y
    // el que está tipeando ve un error rojo en vez de una lista vacía.
    if (i.type === AUTOCOMPLETADO) {
      return NextResponse.json({ type: OPCIONES_DE_AUTOCOMPLETADO, data: { choices: [] } });
    }
    // Y el error se contesta COMO respuesta del comando y no como un 500: un
    // 500 en Discord se ve igual que si el bot estuviera caído, y la diferencia
    // entre "falta una variable de entorno" y "se cayó todo" es media hora de
    // buscar en el lugar equivocado.
    return NextResponse.json({ type: MENSAJE, data: { content: `No tengo base: ${detalle}` } });
  }

  if (i.type === AUTOCOMPLETADO) {
    const escrito = (i.data?.options ?? []).find((o) => o.focused);
    const choices = await sugerenciasDeJugador(supabase, typeof escrito?.value === "string" ? escrito.value : "");
    return NextResponse.json({ type: OPCIONES_DE_AUTOCOMPLETADO, data: { choices } });
  }

  const nombre = i.data?.name ?? "";
  const opts = opciones(i);
  const discordId = quienTipeo(i);

  // El trabajo real, después de haber contestado. Ver el punto 2.
  after(async () => {
    const texto = await responderComando(supabase, nombre, opts, discordId, i.id ?? null);
    await editarLaRespuesta(i.application_id, i.token, texto);
  });

  return NextResponse.json({ type: DIFERIDA });
}

/**
 * Reemplaza el "pensando…" por la respuesta de verdad.
 *
 * No lleva token de bot: el `token` de la interacción ya autentica esta
 * llamada. Dura 15 minutos y sirve una sola vez para el mensaje original.
 *
 * `allowed_mentions` vacío para que un nombre de invocador que casualmente
 * coincida con un @rol no le toque el teléfono a todo el server.
 */
async function editarLaRespuesta(appId: string, token: string, content: string): Promise<void> {
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) console.error(`bot: no pude editar la respuesta: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("bot: la respuesta diferida falló —", err instanceof Error ? err.message : err);
  }
}
