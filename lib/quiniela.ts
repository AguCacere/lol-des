/**
 * **La quiniela de la liga**: cada uno apuesta a quién gana la semana.
 *
 * Una apuesta por persona y por semana, y se puede cambiar hasta que arranca
 * el último día del torneo — después no, porque a esa altura ya se ve venir y
 * dejaría de ser una apuesta. El cierre lo resuelve `empezoElUltimoDia`
 * (lib/torneo.ts), que es la misma regla que ya define el mínimo del último
 * día para cobrar el premio.
 *
 * Esto es lo PRIMERO que el bot escribe en la base. Hasta ahora era de solo
 * lectura a propósito, y lo que habilita escribir no es la firma de Discord
 * —que solo prueba que el pedido vino de Discord, no quién lo tipeó— sino que
 * el `discord_id` de quien tipea esté vinculado a un invocador. Esa columna ES
 * la lista de permitidos. La contraseña del grupo no entra acá ni de casualidad.
 *
 * Acá vive la feature entera: la lectura de la base, quién le apostó a quién,
 * quién acertó y cómo se escribe. Junta y no repartida porque la usan dos
 * lados —el comando y el cierre de la liga— y si la lectura viviera en el
 * comando, el cierre tendría que importarlo; `discord-comandos` ya importa a
 * `liga-cierre`, así que eso sería un ciclo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Una apuesta, ya resuelta a nombres. */
export interface ApuestaResuelta {
  /** Quién apostó, con el nombre de invocador: es como se conocen en el canal. */
  quien: string;
  /** A quién le apostó. */
  aQuien: string;
  /** El puuid del apostado, que es con lo que se compara contra el ganador. */
  puuid: string;
}

/** Agrupa por apostado, del más votado al menos. Empate: alfabético, para que no baile. */
export function porCandidato(apuestas: ApuestaResuelta[]): { aQuien: string; puuid: string; quienes: string[] }[] {
  const mapa = new Map<string, { aQuien: string; puuid: string; quienes: string[] }>();
  for (const a of apuestas) {
    const e = mapa.get(a.puuid) ?? { aQuien: a.aQuien, puuid: a.puuid, quienes: [] };
    e.quienes.push(a.quien);
    mapa.set(a.puuid, e);
  }
  return [...mapa.values()]
    .map((e) => ({ ...e, quienes: [...e.quienes].sort((x, y) => x.localeCompare(y, "es")) }))
    .sort((x, y) => y.quienes.length - x.quienes.length || x.aQuien.localeCompare(y.aQuien, "es"));
}

/** Cómo va la quiniela, para contestar `/apostar` sin argumentos. */
export function mensajeDeQuiniela(titulo: string, apuestas: ApuestaResuelta[], cerrada: boolean): string {
  if (apuestas.length === 0) {
    return cerrada
      ? `🎲 **${titulo}** — las apuestas cerraron y no apostó nadie. Qué grupo de valientes.`
      : `🎲 **${titulo}** — todavía no apostó nadie. Se apuesta con \`/apostar\` y se puede cambiar hasta que arranque el último día.`;
  }
  const lineas = [
    `🎲 **${titulo}** · ${apuestas.length} ${apuestas.length === 1 ? "apuesta" : "apuestas"}`,
    "",
  ];
  for (const c of porCandidato(apuestas)) {
    lineas.push(`**${c.aQuien}** ← ${c.quienes.join(", ")}`);
  }
  lineas.push("");
  lineas.push(
    cerrada
      ? "_Cerradas: arrancó el último día._"
      : "_Se puede cambiar hasta que arranque el último día._",
  );
  return lineas.join("\n");
}

/**
 * El resultado, para pegarlo abajo del cierre de la semana.
 *
 * Devuelve cadena vacía cuando no hay nada que decir — sin apuestas no se
 * manda un mensaje para avisar que no hubo apuestas.
 */
export function mensajeDeResultado(
  apuestas: ApuestaResuelta[],
  ganadorPuuid: string | null,
  ganadorLabel: string | null,
): string {
  if (apuestas.length === 0) return "";

  if (!ganadorPuuid || !ganadorLabel) {
    return [
      "🎲 **La quiniela queda vacante**: la semana cerró sin nadie que cumpliera los mínimos, así que no acertó nadie.",
      `Habían apostado: ${porCandidato(apuestas).map((c) => `**${c.aQuien}** (${c.quienes.length})`).join(", ")}.`,
    ].join("\n");
  }

  const acertaron = apuestas.filter((a) => a.puuid === ganadorPuuid);
  const seAutoapostó = acertaron.find((a) => a.quien === ganadorLabel);

  if (acertaron.length === 0) {
    return [
      `🎲 **No acertó nadie.** Ganó **${ganadorLabel}** y no le había apostado ni el loro.`,
      `Las apuestas eran: ${porCandidato(apuestas).map((c) => `**${c.aQuien}** (${c.quienes.length})`).join(", ")}.`,
    ].join("\n");
  }

  const nombres = acertaron.map((a) => `**${a.quien}**`).sort((x, y) => x.localeCompare(y, "es"));
  const lineas = [
    acertaron.length === apuestas.length && apuestas.length > 1
      ? `🎲 **Le apostaron todos a ${ganadorLabel}** y todos cobran. Previsible, eh.`
      : `🎲 **La quiniela:** ${nombres.join(", ")} ${nombres.length === 1 ? "le había apostado" : "le habían apostado"} a **${ganadorLabel}**. Cobran.`,
  ];
  if (seAutoapostó) lineas.push(`Y **${seAutoapostó.quien}** se apostó a sí mismo y le salió. Mirá vos.`);
  const erraron = apuestas.length - acertaron.length;
  if (erraron > 0) lineas.push(`Los otros ${erraron} erraron.`);
  return lineas.join("\n");
}

/**
 * Las apuestas de una semana, ya resueltas a nombres.
 *
 * Devuelve un string cuando no se pudo leer, para que quien llame lo conteste
 * tal cual: la tabla `liga_apuestas` se crea con una migración a mano, así que
 * "todavía no la corriste" tiene que leerse y no tragarse.
 */
export async function apuestasDeLaSemana(
  supabase: SupabaseClient,
  semana: string,
): Promise<ApuestaResuelta[] | string> {
  const { data, error } = await supabase
    .from("liga_apuestas")
    .select("discord_id, puuid")
    .eq("semana", semana)
    .returns<{ discord_id: string; puuid: string }[]>();
  if (error) return errorDeApuestas(error.message);
  if (!data || data.length === 0) return [];

  const { data: gente } = await supabase
    .from("summoners")
    .select("puuid, game_name, discord_id")
    .returns<{ puuid: string; game_name: string; discord_id: string | null }[]>();
  const porPuuid = new Map((gente ?? []).map((g) => [g.puuid, g.game_name]));
  const porDiscordId = new Map(
    (gente ?? []).filter((g) => g.discord_id).map((g) => [g.discord_id as string, g.game_name]),
  );

  return data.map((a) => ({
    // Si el que apostó se desvinculó, se lo nombra por el id y no se pierde
    // la apuesta: borrarla sería cambiar el resultado.
    quien: porDiscordId.get(a.discord_id) ?? `<@${a.discord_id}>`,
    aQuien: porPuuid.get(a.puuid) ?? "alguien que ya no está",
    puuid: a.puuid,
  }));
}

/** La tabla se crea a mano, así que su ausencia se cuenta, no se traga. */
export function errorDeApuestas(detalle: string): string {
  if (/liga_apuestas/.test(detalle)) {
    return "Todavía no está creada la tabla de apuestas. Hay que correr la migración de `supabase/schema.sql` desde el editor SQL.";
  }
  return `No pude leer las apuestas: ${detalle}`;
}
