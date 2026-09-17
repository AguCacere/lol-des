/**
 * El camino de salida al Discord del grupo.
 *
 * Hasta acá esto era un webhook y nada más. El webhook alcanza para tirar un
 * mensaje, pero no tiene identidad propia: no puede reaccionar a lo que él
 * mismo escribió ni editar un mensaje ya mandado. Por eso los 👍👎 de cada
 * votación los venía poniendo alguien a mano.
 *
 * Con el bot de verdad (`DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID`) sale por la
 * API de Discord y las dos cosas se destraban. **El webhook queda de
 * respaldo**: si el token no está configurado, todo lo de antes anda igual que
 * siempre. Los dos caminos existen a propósito y no hay que "limpiar" uno — el
 * día que se rote el token, el parte diario de esa noche no se puede perder.
 *
 * Nada de acá TIRA nunca: un Discord caído no puede romper el cron de refresco.
 * Por eso todo devuelve un booleano y loguea, en vez de propagar el error.
 */

const API = "https://discord.com/api/v10";

/** El par token+canal, o null si el bot no está configurado y hay que ir por el webhook. */
function bot(): { token: string; canal: string } | null {
  const token = process.env.DISCORD_BOT_TOKEN;
  const canal = process.env.DISCORD_CHANNEL_ID;
  return token && canal ? { token, canal } : null;
}

/**
 * Qué caminos hay configurados, sin decir los secretos.
 *
 * El id del canal sí viaja: no es un secreto y es justo el valor que hay que
 * poder comparar a ojo cuando los anuncios salen en el canal equivocado.
 */
export function estadoDeDiscord(): { bot: boolean; webhook: boolean; canal: string | null } {
  return {
    bot: bot() !== null,
    webhook: Boolean(process.env.DISCORD_WEBHOOK_URL),
    canal: process.env.DISCORD_CHANNEL_ID ?? null,
  };
}

/** La llamada cruda a la API de Discord con el token del bot. Devuelve null si no hay bot. */
export async function apiDelBot(
  ruta: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; cuerpo: string }> {
  const b = bot();
  if (!b) return { ok: false, status: 0, cuerpo: "El bot no está configurado." };
  try {
    const res = await fetch(`${API}${ruta}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bot ${b.token}` },
    });
    return { ok: res.ok, status: res.status, cuerpo: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, cuerpo: err instanceof Error ? err.message : String(err) };
  }
}

export interface MensajeMandado {
  /** Si salió, por el camino que sea. */
  ok: boolean;
  /** El id del mensaje en Discord, para reaccionarle o editarlo. */
  id: string | null;
  /** Por dónde salió. Sirve para explicar en la respuesta de una ruta por qué no hay reacciones. */
  via: "bot" | "webhook" | null;
}

/**
 * Manda un mensaje al canal y devuelve con qué quedó.
 *
 * Primero intenta por el bot; si el bot falla —token vencido, permiso que
 * falta— cae al webhook en vez de perder el mensaje. Ese fallback es la razón
 * de que un `ok: true` pueda venir con `via: "webhook"` aunque el bot esté
 * configurado, y de que ahí no haya `id` útil para reaccionar.
 */
export async function mandarMensaje(
  content: string,
  opciones: { soloBot?: boolean } = {},
): Promise<MensajeMandado> {
  const b = bot();
  if (b) {
    try {
      const res = await fetch(`${API}/channels/${b.canal}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bot ${b.token}` },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
      if (res.ok) {
        const msg = (await res.json()) as { id?: string };
        return { ok: true, id: msg.id ?? null, via: "bot" };
      }
      console.error(`Discord (bot) devolvió ${res.status} ${await res.text()} — pruebo con el webhook.`);
    } catch (err) {
      console.error("Discord (bot) falló —", err instanceof Error ? err.message : err);
    }
  }
  // `soloBot` es para el diagnóstico y nada más. Ahí caer al webhook sería
  // exactamente lo contrario de lo que se quiere: la pregunta que se está
  // haciendo es si el camino del bot funciona, y un fallback que "arregla" el
  // síntoma contestaría que sí sin haberlo probado.
  if (opciones.soloBot) return { ok: false, id: null, via: null };
  return mandarPorWebhook(content);
}

/**
 * El camino viejo. `?wait=true` no es un detalle: sin eso Discord contesta 204
 * y no hay forma de saber si el mensaje se creó de verdad. Con eso devuelve el
 * mensaje entero y el `ok` significa algo.
 */
async function mandarPorWebhook(content: string): Promise<MensajeMandado> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  // Que no esté configurado no es un error: es "notificaciones apagadas"
  // (dev local, preview). Por eso no se loguea nada acá.
  if (!url) return { ok: false, id: null, via: null };
  try {
    const conWait = new URL(url);
    conWait.searchParams.set("wait", "true");
    const res = await fetch(conWait, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) {
      console.error(`Discord (webhook) devolvió ${res.status} ${await res.text()}`);
      return { ok: false, id: null, via: null };
    }
    const msg = (await res.json()) as { id?: string };
    return { ok: true, id: msg.id ?? null, via: "webhook" };
  } catch (err) {
    console.error("Discord (webhook) falló —", err instanceof Error ? err.message : err);
    return { ok: false, id: null, via: null };
  }
}

/**
 * La puerta de siempre, la que usan el cron, las cargadas y el cierre.
 *
 * Devuelve si salió. Antes era `Promise<void>` y `/api/liga/diario` ya hacía
 * `const ok = await sendDiscordNotification(...)`: el `mandado` de esa
 * respuesta venía `undefined` y el log del scheduler no distinguía un parte
 * mandado de uno que se perdió.
 */
export async function sendDiscordNotification(content: string): Promise<boolean> {
  return (await mandarMensaje(content)).ok;
}

/**
 * Deja las reacciones puestas en un mensaje propio.
 *
 * Solo funciona por bot: un webhook no tiene identidad con la cual reaccionar,
 * y ese era justamente el motivo de que las votaciones necesitaran una mano
 * humana. Devuelve false sin ruido si el bot no está configurado — es el estado
 * normal hasta que se cargue el token.
 *
 * Van de a una y en orden: Discord ordena las reacciones por orden de llegada,
 * así que mandarlas en paralelo sale a veces 👎👍. Son dos llamadas, no vale la
 * pena el paralelo para que salga al revés la mitad de las veces.
 */
export async function reaccionar(mensajeId: string, emojis: string[]): Promise<boolean> {
  const b = bot();
  if (!b) return false;
  for (const emoji of emojis) {
    try {
      const res = await fetch(
        `${API}/channels/${b.canal}/messages/${mensajeId}/reactions/${encodeURIComponent(emoji)}/@me`,
        { method: "PUT", headers: { Authorization: `Bot ${b.token}` } },
      );
      if (!res.ok) {
        console.error(`No pude reaccionar con ${emoji}: ${res.status} ${await res.text()}`);
        return false;
      }
    } catch (err) {
      console.error("Reacción fallida —", err instanceof Error ? err.message : err);
      return false;
    }
  }
  return true;
}

/**
 * Borra un mensaje del bot. Existe para el diagnóstico: manda uno de prueba,
 * comprueba el camino entero y lo levanta, así probar no deja basura en el
 * canal del grupo.
 */
export async function borrarMensaje(mensajeId: string): Promise<boolean> {
  const b = bot();
  if (!b) return false;
  const res = await apiDelBot(`/channels/${b.canal}/messages/${mensajeId}`, { method: "DELETE" });
  if (!res.ok) console.error(`No pude borrar el mensaje: ${res.status} ${res.cuerpo}`);
  return res.ok;
}

/** Reescribe un mensaje que mandó el bot. Como `reaccionar`, no existe por webhook. */
export async function editarMensaje(mensajeId: string, content: string): Promise<boolean> {
  const b = bot();
  if (!b) return false;
  try {
    const res = await fetch(`${API}/channels/${b.canal}/messages/${mensajeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bot ${b.token}` },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) console.error(`No pude editar el mensaje: ${res.status} ${await res.text()}`);
    return res.ok;
  } catch (err) {
    console.error("Edición fallida —", err instanceof Error ? err.message : err);
    return false;
  }
}
