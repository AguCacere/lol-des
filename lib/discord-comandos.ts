import type { SupabaseClient } from "@supabase/supabase-js";
import { conReintento } from "./supabase";
import COMANDOS from "./discord-comandos.json";
import { formatRelativeTime, rankScore, tieneDivisiones, tierFor } from "./ladder";
import { tierKeyFromRiot, divisionFromRiot } from "./mapping";
import { roastMessage, worstDisaster, type RoastCandidate } from "./roast";
import { DURACION_MINIMA_S, RANKED_SOLO_QUEUE_ID } from "./refresh";
import { tablaDeSemanaEnBase } from "./liga-cierre";
import { ganadorDe, puntajeDe, puntajeTexto, puntosDeSecuencia } from "./liga";
import { claveDeTorneo, diaCorriente, duracionEnDias, empezoElUltimoDia, esTorneoDeLiga, torneoDe } from "./torneo";
import { apuestasDeLaSemana, errorDeApuestas, mensajeDePronosticos, mensajeDeQuiniela, pronosticosDeLaSemana } from "./quiniela";

/**
 * Los cuatro comandos del bot: de Supabase al texto que sale en el canal.
 *
 * Todos salen de Supabase. Ninguno le pregunta nada a Riot, que es lo que los
 * mantiene baratos y predecibles — y lo que deja el rate limit entero para el
 * cron de refresco, que es el que lo necesita.
 *
 * **Uno solo escribe: `/apostar`.** Y lo que lo autoriza no es la firma de
 * Discord —que prueba que el pedido vino de Discord, no quién lo tipeó— sino
 * que el `discord_id` de quien tipea esté vinculado a un invocador. Esa
 * columna ES la lista de permitidos. Lo que sigue sin estar expuesto es la
 * cerradura de la app: anotarse a la liga, refrescar o anular una partida no
 * se hacen desde un canal donde cualquiera del server puede tipear, y la
 * contraseña del grupo no viaja por acá ni de casualidad.
 *
 * La respuesta la arma acá adentro y no el route handler a propósito: es la
 * misma regla que el resto de `lib/` —el handler junta, no calcula— y además
 * deja que cada comando se pueda probar sin levantar Discord.
 *
 * **Todo comando devuelve un texto, nunca tira.** Un error contestado como
 * texto se lee en el canal y se arregla; una excepción deja el "la aplicación
 * no respondió" de Discord, que no dice nada.
 */

/** Discord corta los mensajes en 2000 caracteres. Mejor recortar nosotros que comernos un 400. */
const TOPE_DISCORD = 2000;

/** 1..4 → "I".."IV", que es como Riot escribe la división. Maestro no tiene y no entra acá. */
const NUMERO_DE_DIVISION: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

/**
 * Las definiciones que se le registran a Discord.
 *
 * Viven en un JSON al lado y no acá adentro porque el script que las registra
 * (`scripts/registrar-comandos.mjs`) es JavaScript suelto y no puede importar
 * un `.ts`. Con el JSON los dos leen lo mismo: si algún día se agrega un
 * comando, no hay forma de registrarlo con una descripción y responderlo con
 * otra.
 *
 * El jugador va como texto con `autocomplete` y no como opción de tipo USER.
 * Con USER, Discord devuelve un id de Discord y el bot no sabría a qué
 * invocador corresponde hasta que esa persona esté vinculada — o sea que el
 * bot no serviría hasta terminar de cargar los `discord_id` a mano. Con
 * autocompletado anda desde el minuto cero, la lista sale de la base así que
 * no hay forma de escribir mal un nombre, y el valor que viaja es el puuid: la
 * resolución es exacta y no por nombre parecido.
 */
export { COMANDOS };

interface Invocador {
  puuid: string;
  game_name: string;
  tag_line: string;
}

/** "Fulano#LAS", que es como se lo nombra en todos lados. */
function etiqueta(s: Invocador): string {
  return `${s.game_name}#${s.tag_line}`;
}

function recortar(texto: string): string {
  return texto.length <= TOPE_DISCORD ? texto : `${texto.slice(0, TOPE_DISCORD - 1)}…`;
}

/**
 * Cuándo se actualizaron los datos por última vez, para el pie de cada
 * respuesta.
 *
 * En la web el cartel de "actualizado hace X" está al lado del dato y se
 * entiende solo. En un canal de Discord el mensaje queda ahí para siempre y a
 * los diez minutos ya no se sabe si es de ahora o de anoche, así que el pie no
 * es decoración: es lo que evita que alguien discuta una tabla vieja.
 */
async function frescura(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("summoners")
    .select("last_refreshed_at")
    .not("last_refreshed_at", "is", null)
    .order("last_refreshed_at", { ascending: false })
    .limit(1)
    .returns<{ last_refreshed_at: string }[]>();
  const iso = data?.[0]?.last_refreshed_at;
  return iso ? `Actualizado ${formatRelativeTime(iso)}.` : "";
}

/** Pega el pie de frescura abajo del cuerpo, en itálica como el resto de los mensajes del bot. */
function conPie(cuerpo: string, pie: string): string {
  return recortar(pie ? `${cuerpo}\n\n*${pie}*` : cuerpo);
}

/**
 * De lo que tipearon al invocador.
 *
 * El orden importa: primero el puuid exacto (es lo que manda el
 * autocompletado, y no hay ambigüedad posible), después el nombre exacto, y
 * recién al final el parecido. Si alguien escribe el nombre entero, gana el
 * exacto aunque haya otro que lo contenga.
 */
async function porTexto(supabase: SupabaseClient, texto: string): Promise<Invocador | null> {
  const { data } = await conReintento("bot: buscar invocador", () =>
    supabase.from("summoners").select("puuid, game_name, tag_line").returns<Invocador[]>(),
  );
  if (!data || data.length === 0) return null;

  const buscado = texto.trim().toLowerCase();
  const porPuuid = data.find((s) => s.puuid === texto.trim());
  if (porPuuid) return porPuuid;
  // Con el tag o sin él: en el canal se escribe "VORE", no "VORE#LAS".
  const exacto = data.find(
    (s) => s.game_name.toLowerCase() === buscado || etiqueta(s).toLowerCase() === buscado,
  );
  if (exacto) return exacto;
  return data.find((s) => s.game_name.toLowerCase().includes(buscado)) ?? null;
}

/**
 * El invocador de quien tipeó, por su id de Discord.
 *
 * Si la columna `discord_id` todavía no existe en la base, esto devuelve null
 * en silencio en vez de romper. Es el mismo modo de fallar que eligió
 * `/api/liga` con `liga_ajustes`: la migración se corre a mano desde el SQL
 * Editor, y hasta que se corra el bot tiene que andar igual — con nombre en vez
 * de "la tuya", que es una comodidad, no el comando.
 */
async function porDiscord(supabase: SupabaseClient, discordId: string | null): Promise<Invocador | null> {
  if (!discordId) return null;
  const { data, error } = await supabase
    .from("summoners")
    .select("puuid, game_name, tag_line")
    .eq("discord_id", discordId)
    .maybeSingle<Invocador>();
  if (error) {
    console.log(`bot: no pude resolver por discord_id (${error.message}) — sigo por nombre.`);
    return null;
  }
  return data;
}

/** El invocador del que habla el comando: el que nombraron, o el que tipeó. */
async function aQuien(
  supabase: SupabaseClient,
  texto: string | null,
  discordId: string | null,
): Promise<Invocador | null> {
  return texto && texto.trim() ? porTexto(supabase, texto) : porDiscord(supabase, discordId);
}

/** El que no se pudo resolver: el mismo texto para los dos comandos que lo necesitan. */
function noSeQuien(texto: string | null): string {
  return texto && texto.trim()
    ? `No tengo a nadie que se llame **${texto.trim()}**. Escribí el nombre y elegí de la lista que aparece.`
    : "No sé quién sos. Pasame el nombre del invocador, o pedile a alguien que te vincule la cuenta.";
}

/** ─────────────────────────── /liga ─────────────────────────── */

async function comandoLiga(supabase: SupabaseClient): Promise<string> {
  const torneo = await torneoDe(supabase);
  if (!esTorneoDeLiga(torneo)) return "Esta semana no hay liga.";

  const tabla = await tablaDeSemanaEnBase(supabase, torneo);
  if (!tabla || tabla.length === 0) return "No hay nadie anotado en la liga de esta semana.";

  // "de N" y no "de 7": un torneo puede durar ocho días. Ver lib/torneo.ts.
  const total = duracionEnDias(torneo);
  const titulo = torneo.nombre ?? "La liga de la semana";
  const lineas = [`🍄 **${titulo}** · día ${diaCorriente(torneo)} de ${total}`, ""];

  for (const [i, f] of tabla.entries()) {
    // Podio y después caca, igual que el parte diario: en una liga de seis,
    // "cuarto" ya es estar afuera. Que los dos mensajes del bot usen la misma
    // escala no es estético — si /liga dijera "4." y el parte de la noche 💩,
    // parecerían dos tablas distintas.
    const marca = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "💩";
    const record = f.sinJugar ? "`no jugó`" : `\`${f.victorias}V-${f.derrotas}D\``;
    lineas.push(`${marca} **${i + 1} —** ${f.name} · **${puntajeTexto(puntajeDe(f))}**  ${record}`);
  }

  const pie: string[] = [];
  const cobra = ganadorDe(tabla);
  // Solo se aclara cuando el que cobra NO es el primero. Si coinciden —el caso
  // normal— la línea no agrega nada y el pie se llena de obviedades.
  if (cobra && tabla[0] && cobra.puuid !== tabla[0].puuid) {
    pie.push(`Hoy cobraría ${cobra.name}: ${tabla[0].name} todavía no llega a los mínimos.`);
  } else if (!cobra && empezoElUltimoDia(torneo)) {
    // Y el "no cobra nadie" SOLO el último día. Uno de los mínimos es jugar 3
    // el domingo, así que de lunes a sábado nadie lo cumple todavía y la línea
    // saldría los seis días diciendo algo que no es una noticia — hasta que el
    // domingo, cuando sí lo es, ya nadie la lee.
    pie.push("Así como está no cobra nadie: nadie llega a los mínimos.");
  }
  pie.push(await frescura(supabase));

  return conPie(lineas.join("\n"), pie.filter(Boolean).join(" "));
}

/** ─────────────────────────── /ranking ─────────────────────────── */

interface FilaLadder {
  game_name: string;
  tag_line: string;
  tier: string | null;
  division: string | null;
  lp: number | null;
  wins: number | null;
  losses: number | null;
}

async function comandoRanking(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await conReintento("bot: ladder", () =>
    supabase
      .from("ladder")
      .select("game_name, tag_line, tier, division, lp, wins, losses")
      .returns<FilaLadder[]>(),
  );
  if (error) return `No pude leer el ladder: ${error.message}`;
  if (!data || data.length === 0) return "No hay ningún invocador cargado.";

  // Se ordena acá y no en la consulta porque el orden real es tier → división →
  // LP, y `tier` en la base es el texto de Riot ("EMERALD"): ordenar por esa
  // columna sale alfabético y pone Bronce arriba de Oro.
  const conRango = data
    .filter((f) => f.tier)
    .map((f) => {
      const key = tierKeyFromRiot(f.tier);
      const division = divisionFromRiot(f.division);
      const lp = f.lp ?? 0;
      // El MISMO puntaje que ordena el ladder de la app (lib/ladder.ts). Si acá
      // se ordenara con una cuenta propia, el bot podría decir un orden y la
      // pantalla otro — y el que mira el canal no tiene cómo saber cuál vale.
      return { f, key, division, lp, orden: rankScore(key, division, lp) };
    })
    .sort((a, b) => b.orden - a.orden);

  const sinRango = data.filter((f) => !f.tier);

  const lineas = ["📊 **El ladder**", ""];
  for (const [i, r] of conRango.entries()) {
    const t = tierFor(r.key);
    // Maestro y para arriba no tienen división: escribir "Maestro I" es inventar
    // un escalón que no existe.
    // Romanos como los escribe Riot en Discord, pero la regla de si hay o no
    // división es la misma de toda la app (ver tieneDivisiones en lib/ladder).
    const rango = tieneDivisiones(r.key) ? `${t.name} ${NUMERO_DE_DIVISION[r.division] ?? ""}` : t.name;
    const jugadas = (r.f.wins ?? 0) + (r.f.losses ?? 0);
    const wr = jugadas > 0 ? ` · ${Math.round(((r.f.wins ?? 0) / jugadas) * 100)}%` : "";
    const record = jugadas > 0 ? ` · \`${r.f.wins ?? 0}V-${r.f.losses ?? 0}D\`` : "";
    lineas.push(`**${i + 1}.** ${r.f.game_name} · ${rango} · ${r.lp} LP${record}${wr}`);
  }
  if (sinRango.length > 0) {
    lineas.push("", `*Sin rango todavía: ${sinRango.map((f) => f.game_name).join(", ")}.*`);
  }

  return conPie(lineas.join("\n"), await frescura(supabase));
}

/** ─────────────────────────── /cargar ─────────────────────────── */

/** Cuántas partidas recientes se miran para elegir la peor. El mismo número que /api/roast. */
const VENTANA_CARGADA = 20;

interface FilaCargada {
  match_id: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  dmg_share: number | null;
  cs: number | null;
  cs_per_min: number | null;
}

/** Las columnas que `lib/roast.ts` necesita para juzgar una partida. */
export const COLUMNAS_CARGADA = "match_id, champion, win, kills, deaths, assists, dmg_share, cs, cs_per_min";

export function candidataDeFila(r: FilaCargada): RoastCandidate {
  return {
    matchId: r.match_id,
    champion: r.champion,
    win: r.win,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    dmgShare: r.dmg_share,
    cs: r.cs,
    csPerMin: r.cs_per_min,
  };
}

async function comandoCargar(
  supabase: SupabaseClient,
  texto: string | null,
  discordId: string | null,
): Promise<string> {
  const quien = await aQuien(supabase, texto, discordId);
  if (!quien) return noSeQuien(texto);

  const { data, error } = await conReintento("bot: cargada", () =>
    supabase
      .from("matches")
      .select(COLUMNAS_CARGADA)
      .eq("puuid", quien.puuid)
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      // Los remakes quedan afuera: cuatro minutos donde nadie hizo nada dejan un
      // 0/2/0 que gana la pulseada de "la peor" sin que haya pasado nada.
      .gte("game_duration_s", DURACION_MINIMA_S)
      .order("played_at", { ascending: false })
      .limit(VENTANA_CARGADA)
      .returns<FilaCargada[]>(),
  );
  if (error) return `No pude leer sus partidas: ${error.message}`;
  if (!data || data.length === 0) return `No tengo ninguna partida guardada de **${etiqueta(quien)}**.`;

  const peor = worstDisaster(data.map(candidataDeFila));
  // Que no haya ninguna que califique es una respuesta, no un error: el filo de
  // la cargada depende de que no salga por cualquier cosa.
  if (!peor) {
    return `De las últimas ${data.length} de **${etiqueta(quien)}** no hay ninguna lo bastante mala. Zafó.`;
  }
  return recortar(roastMessage(etiqueta(quien), peor));
}

/** ─────────────────────────── /ultima ─────────────────────────── */

interface FilaUltima {
  match_id: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number | null;
  played_at: string;
  ally_afk: boolean | null;
}

async function comandoUltima(
  supabase: SupabaseClient,
  texto: string | null,
  discordId: string | null,
): Promise<string> {
  const quien = await aQuien(supabase, texto, discordId);
  if (!quien) return noSeQuien(texto);

  const { data, error } = await conReintento("bot: última partida", () =>
    supabase
      .from("matches")
      .select("match_id, champion, win, kills, deaths, assists, cs, played_at, ally_afk")
      .eq("puuid", quien.puuid)
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .gte("game_duration_s", DURACION_MINIMA_S)
      .order("played_at", { ascending: false })
      .limit(1)
      .returns<FilaUltima[]>(),
  );
  if (error) return `No pude leer sus partidas: ${error.message}`;
  const m = data?.[0];
  if (!m) return `No tengo ninguna partida de soloq guardada de **${etiqueta(quien)}**.`;

  const resultado = m.win ? "**Ganó**" : "**Perdió**";
  const kda = `${m.kills}/${m.deaths}/${m.assists}`;
  const cs = m.cs != null ? ` · ${m.cs} CS` : "";
  const cuerpo =
    `${m.win ? "✅" : "❌"} **${etiqueta(quien)}** · ${m.champion} · ${resultado} · ` +
    `\`${kda}\`${cs} · ${formatRelativeTime(m.played_at)}`;

  const enLaLiga = await valorEnLaLiga(supabase, quien.puuid, m);
  return conPie(enLaLiga ? `${cuerpo}\n${enLaLiga}` : cuerpo, await frescura(supabase));
}

/**
 * Qué valió esa partida en la liga de la semana.
 *
 * No alcanza con mirar si ganó: el bono de racha hace que la misma victoria
 * valga 1 o 1,25 según lo que venga antes. Por eso se rearma la secuencia
 * entera de la semana y se le pregunta a `puntosDeSecuencia` cuánto valió
 * ESA — que es exactamente la cuenta que hace la tabla. Si acá se aproximara,
 * el bot diría un número y la app otro.
 *
 * Devuelve null cuando la partida no tiene nada que ver con la liga (no es de
 * esta semana, no está anotado, la semana no es de liga): ahí la línea no se
 * escribe en vez de escribir "no aplica".
 */
async function valorEnLaLiga(
  supabase: SupabaseClient,
  puuid: string,
  partida: FilaUltima,
): Promise<string | null> {
  const torneo = await torneoDe(supabase);
  if (!esTorneoDeLiga(torneo)) return null;

  const { data: quien } = await supabase
    .from("summoners")
    .select("participa_liga, liga_desde")
    .eq("puuid", puuid)
    .maybeSingle<{ participa_liga: boolean | null; liga_desde: string | null }>();
  if (!quien?.participa_liga) return null;

  const desde = torneo.arranca;
  const hasta = torneo.cierra;
  // El que entró tarde arranca cuando entró, no el lunes: contar desde el lunes
  // le metería en la secuencia partidas de antes de competir.
  const arranque = quien.liga_desde && Date.parse(quien.liga_desde) > desde.getTime()
    ? new Date(quien.liga_desde)
    : desde;
  if (Date.parse(partida.played_at) < arranque.getTime() || Date.parse(partida.played_at) >= hasta.getTime()) {
    return null;
  }

  const { data: semana, error } = await supabase
    .from("matches")
    .select("match_id, win, ally_afk")
    .eq("puuid", puuid)
    .eq("queue_id", RANKED_SOLO_QUEUE_ID)
    .gte("game_duration_s", DURACION_MINIMA_S)
    .gte("played_at", arranque.toISOString())
    .lt("played_at", hasta.toISOString())
    .order("played_at")
    .returns<{ match_id: string; win: boolean; ally_afk: boolean | null }[]>();
  if (error || !semana) return null;

  // La derrota con un aliado ido no cuenta, igual que en la tabla. Si la que
  // preguntaron ES una de esas, se dice y se termina acá.
  if (!partida.win && partida.ally_afk === true) {
    return "Para la liga **no contó**: se le fue un compañero.";
  }
  const cuentan = semana.filter((p) => p.win || p.ally_afk !== true);
  const i = cuentan.findIndex((p) => p.match_id === partida.match_id);
  if (i < 0) return null;

  const { cadaUna } = puntosDeSecuencia(cuentan.map((p) => p.win));
  return `Para la liga valió **${puntajeTexto(cadaUna[i])}**.`;
}

/** ─────────────────────────── el despachador ─────────────────────────── */

/**
 * De un comando de Discord al texto de la respuesta.
 *
 * Atrapa todo: cualquier excepción vuelve como texto. Del otro lado hay un
 * canal de Discord, y "se rompió algo leyendo la liga" se puede leer y
 * arreglar; el "la aplicación no respondió" que deja una excepción, no.
 */
/**
 * `/apostar` — la quiniela de la semana.
 *
 * Sin jugador, muestra cómo va. Con jugador, registra o cambia la apuesta de
 * quien tipeó. Es el ÚNICO comando que escribe, y por eso es el único que
 * exige estar vinculado: sin `discord_id` no hay quién apostó, y sin quién no
 * hay apuesta.
 */
async function comandoApostar(
  supabase: SupabaseClient,
  jugador: string | null,
  direccion: string | null,
  discordId: string | null,
): Promise<string> {
  const torneo = await torneoDe(supabase);
  if (!esTorneoDeLiga(torneo)) return "Esta semana no hay liga, así que no hay a qué apostarle.";
  const semana = claveDeTorneo(torneo);
  const titulo = torneo.nombre ?? "La liga de la semana";
  const cerrada = empezoElUltimoDia(torneo);

  const haciaDonde = (direccion ?? "").trim().toLowerCase();
  if (haciaDonde && haciaDonde !== "sube" && haciaDonde !== "baja") {
    return "La dirección es `sube` o `baja`, nada más.";
  }
  // La dirección sin jugador no dice nada: "apuesto a que sube" ¿quién.
  if (haciaDonde && !(jugador && jugador.trim())) {
    return "¿Que sube quién? Pasame también el jugador.";
  }

  if (jugador && jugador.trim()) {
    if (cerrada) {
      return `🎲 Las apuestas de **${titulo}** ya cerraron: arrancó el último día. Mirá cómo quedaron con \`/apostar\` sin nada.`;
    }
    // La autorización. No es la firma: es estar vinculado.
    const yo = await porDiscord(supabase, discordId);
    if (!yo) {
      return "Para apostar te tengo que tener vinculado. Pedile a alguien que te cargue el Discord en tu invocador y listo.";
    }
    const aQuien = await porTexto(supabase, jugador);
    if (!aQuien) return noSeQuien(jugador);

    if (haciaDonde) {
      const { error } = await supabase
        .from("liga_pronosticos")
        .upsert(
          { semana, discord_id: discordId, puuid: aQuien.puuid, direccion: haciaDonde },
          { onConflict: "semana,discord_id" },
        );
      if (error) return errorDeApuestas(error.message);
      const flecha = haciaDonde === "sube" ? "▲" : "▼";
      return `📈 Anotado: **${yo.game_name}** apuesta a que **${aQuien.game_name}** ${flecha} **${haciaDonde}** de LP en **${titulo}**. Se paga contra el LP real de la semana, y se puede cambiar hasta que arranque el último día.`;
    }

    const { error } = await supabase
      .from("liga_apuestas")
      .upsert({ semana, discord_id: discordId, puuid: aQuien.puuid }, { onConflict: "semana,discord_id" });
    if (error) return errorDeApuestas(error.message);

    const todas = await apuestasDeLaSemana(supabase, semana);
    if (typeof todas === "string") return todas;
    const cuantas = todas.length;
    return `🎲 Anotado: **${yo.game_name}** le apuesta a **${aQuien.game_name}** para ganar **${titulo}**. Van ${cuantas} ${cuantas === 1 ? "apuesta" : "apuestas"}. Se puede cambiar hasta que arranque el último día.`;
  }

  // Sin argumentos: las dos tablas, una abajo de la otra. Si la de pronósticos
  // está vacía su mensaje es cadena vacía y no se ve — no hace falta avisar
  // que nadie usó la mitad del comando.
  const todas = await apuestasDeLaSemana(supabase, semana);
  if (typeof todas === "string") return todas;
  const pron = await pronosticosDeLaSemana(supabase, semana);
  const quiniela = mensajeDeQuiniela(titulo, todas, cerrada);
  // Un error leyendo los pronósticos NO se come la quiniela: son dos tablas y
  // la migración de la segunda puede no estar corrida.
  if (typeof pron === "string") return `${quiniela}\n\n_${pron}_`;
  return quiniela + mensajeDePronosticos(pron, cerrada);
}

export async function responderComando(
  supabase: SupabaseClient,
  nombre: string,
  opciones: Record<string, string>,
  discordId: string | null,
): Promise<string> {
  try {
    switch (nombre) {
      case "liga":
        return await comandoLiga(supabase);
      case "ranking":
        return await comandoRanking(supabase);
      case "cargar":
        return await comandoCargar(supabase, opciones.jugador ?? null, discordId);
      case "ultima":
        return await comandoUltima(supabase, opciones.jugador ?? null, discordId);
      case "apostar":
        return await comandoApostar(supabase, opciones.jugador ?? null, opciones.direccion ?? null, discordId);
      default:
        // La lista sale del mismo JSON que se registró, así que un comando que
        // quedó registrado de una versión vieja se delata solo: no aparece acá.
        return `No conozco \`/${nombre}\`. Sé estos: ${COMANDOS.map((c) => `\`/${c.name}\``).join(", ")}.`;
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error(`bot: /${nombre} falló —`, detalle);
    return `Se me rompió algo resolviendo \`/${nombre}\`: ${detalle}`;
  }
}

/**
 * El autocompletado del campo `jugador`.
 *
 * Este NO se puede diferir: Discord quiere las opciones en el momento o no
 * muestra nada. Es una sola consulta a una tabla de catorce filas, así que
 * entra de sobra — y si llegara a fallar devuelve la lista vacía, que en la
 * pantalla se ve como "sin sugerencias" y deja escribir el nombre a mano.
 *
 * El `value` que viaja es el puuid: así el comando resuelve exacto y no por
 * nombre parecido. Lo que se ve es "Fulano#LAS".
 */
export async function sugerenciasDeJugador(
  supabase: SupabaseClient,
  escrito: string,
): Promise<{ name: string; value: string }[]> {
  try {
    const { data } = await supabase
      .from("summoners")
      .select("puuid, game_name, tag_line")
      .order("game_name")
      .returns<Invocador[]>();
    if (!data) return [];
    const buscado = escrito.trim().toLowerCase();
    return data
      .filter((s) => !buscado || s.game_name.toLowerCase().includes(buscado))
      // Discord acepta 25 como máximo y rechaza la respuesta entera si se pasa.
      .slice(0, 25)
      .map((s) => ({ name: etiqueta(s), value: s.puuid }));
  } catch (err) {
    console.error("bot: autocompletado falló —", err instanceof Error ? err.message : err);
    return [];
  }
}
