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

/** Las tablas se crean a mano, así que su ausencia se cuenta, no se traga. */
export function errorDeApuestas(detalle: string): string {
  if (/liga_apuestas|liga_pronosticos/.test(detalle)) {
    return "Todavía no están creadas las tablas de apuestas. Hay que correr la migración de `supabase/schema.sql` desde el editor SQL.";
  }
  return `No pude leer las apuestas: ${detalle}`;
}

/* ──────────────────────── El pronóstico: sube o baja ────────────────────────
 *
 * La otra mitad de la apuesta, y es un juego distinto al de la quiniela: acá
 * no se elige al mejor, se elige a alguien y se dice para dónde va. Se le puede
 * pegar apostando a que el peor del grupo se hunde todavía más.
 *
 * Tabla aparte (`liga_pronosticos`) y no una columna en `liga_apuestas`, por
 * algo chiquito pero que importa: las dos cosas quieren la MISMA clave
 * primaria —una por persona y por semana— y meterlas juntas obligaba a una
 * clave de tres campos con un check cruzado para que nadie apueste sube y baja
 * del mismo jugador. Dos tablas con la clave obvia salen más baratas, y además
 * la de la quiniela ya estaba escrita en una migración sin correr.
 */

export type Direccion = "sube" | "baja";

/** Un pronóstico, ya resuelto a nombres. */
export interface PronosticoResuelto {
  quien: string;
  aQuien: string;
  puuid: string;
  direccion: Direccion;
}

/** Cómo se dice una dirección en una línea de texto. */
const FLECHA: Record<Direccion, string> = { sube: "▲ sube", baja: "▼ baja" };

/**
 * Cuánto LP movió de verdad en la semana.
 *
 * NO es `lpNeto` pelado: ese viene con el tope de 22 por victoria, que es una
 * regla de la liga para que una cuenta nueva no saque ventaja — no una
 * afirmación sobre qué le pasó al LP de nadie. Para "subió o bajó" lo que vale
 * es lo que pasó, así que se le devuelve lo recortado. Sin esto, alguien que
 * ganó +40 reales con el tope en +22 podría aparecer bajando si además perdió,
 * y el pronóstico se pagaría al revés.
 */
export function lpRealDeLaSemana(f: { lpNeto: number; lpRecortado: number }): number {
  return f.lpNeto + f.lpRecortado;
}

/** Cómo va la tabla de pronósticos, para contestar `/apostar` sin argumentos. */
export function mensajeDePronosticos(pronosticos: PronosticoResuelto[], cerrada: boolean): string {
  if (pronosticos.length === 0) return "";
  const lineas = ["", `📈 **Sube o baja** · ${pronosticos.length}`, ""];
  // Por apostado y después alfabético: así el mismo jugador queda junto y la
  // lista no se reordena sola entre una corrida y la siguiente.
  const orden = [...pronosticos].sort(
    (x, y) => x.aQuien.localeCompare(y.aQuien, "es") || x.quien.localeCompare(y.quien, "es"),
  );
  for (const p of orden) {
    lineas.push(`**${p.aQuien}** ${FLECHA[p.direccion]} — ${p.quien}`);
  }
  if (!cerrada) lineas.push("", "_Se apuesta con `/apostar jugador:<alguien> direccion:<sube|baja>`._");
  return lineas.join("\n");
}

/**
 * El resultado de los pronósticos, para pegarlo abajo del cierre.
 *
 * `netos` es el LP real de cada uno en la semana (ver `lpRealDeLaSemana`).
 * Quien no esté en ese mapa no jugó la liga esa semana y su pronóstico se
 * anula: inventarle un 0 sería pagarle al que apostó a "baja" por una semana
 * que esa persona no jugó.
 */
export function mensajeDeResultadoPronosticos(
  pronosticos: PronosticoResuelto[],
  netos: Map<string, number>,
): string {
  if (pronosticos.length === 0) return "";

  const acertaron: string[] = [];
  const erraron: string[] = [];
  const anulados: string[] = [];

  for (const p of pronosticos) {
    const neto = netos.get(p.puuid);
    // Clavado en 0 tampoco subió ni bajó. Es rarísimo y es un empate, no una
    // derrota: nadie pierde una apuesta porque el otro no se movió.
    if (neto === undefined || neto === 0) {
      anulados.push(`**${p.quien}** (${p.aQuien})`);
      continue;
    }
    const pegó = p.direccion === "sube" ? neto > 0 : neto < 0;
    const signo = neto > 0 ? `+${neto}` : `${neto}`;
    const linea = `**${p.quien}** → **${p.aQuien}** ${FLECHA[p.direccion]} (${signo} LP)`;
    (pegó ? acertaron : erraron).push(linea);
  }

  const lineas = ["📈 **Sube o baja:**"];
  if (acertaron.length > 0) {
    lineas.push(`Le pegaron: ${acertaron.join(", ")}.`);
  } else {
    lineas.push("No le pegó nadie. Ni uno.");
  }
  if (erraron.length > 0) lineas.push(`Erraron: ${erraron.join(", ")}.`);
  if (anulados.length > 0) {
    lineas.push(`Se anulan ${anulados.join(", ")}: no se movió de donde estaba.`);
  }
  return lineas.join("\n");
}

/**
 * Los pronósticos de una semana, ya resueltos a nombres.
 *
 * Mismo trato que `apuestasDeLaSemana`: devuelve un string cuando no se pudo
 * leer, porque la tabla se crea con una migración a mano.
 */
export async function pronosticosDeLaSemana(
  supabase: SupabaseClient,
  semana: string,
): Promise<PronosticoResuelto[] | string> {
  const { data, error } = await supabase
    .from("liga_pronosticos")
    .select("discord_id, puuid, direccion")
    .eq("semana", semana)
    .returns<{ discord_id: string; puuid: string; direccion: Direccion }[]>();
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

  return data.map((p) => ({
    quien: porDiscordId.get(p.discord_id) ?? `<@${p.discord_id}>`,
    aQuien: porPuuid.get(p.puuid) ?? "alguien que ya no está",
    puuid: p.puuid,
    direccion: p.direccion,
  }));
}
