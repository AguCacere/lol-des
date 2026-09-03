/**
 * "Análisis del pool" — le pasamos a Claude los datos REALES del jugador
 * (su pool de campeones con winrates, sus enfrentamientos de línea con el
 * oro a los 15, su rango y su rol) y le pedimos campeones recomendados y
 * los cruces que más le cuestan.
 *
 * La decisión de diseño que separa esto de un chatbot opinando: el QUÉ mirar
 * sale siempre de los datos del jugador, el POR QUÉ puede apoyarse en
 * conocimiento general de LoL. Un modelo que no ve datos te dice "jugá
 * Draven que está fuerte"; uno que ve que perdiste 5 de 7 contra Darius con
 * Shen te dice otra cosa. Por eso cada ítem del resultado tiene un campo
 * `dato` obligatorio con el número del historial que lo justifica — si el
 * modelo no puede llenarlo, la recomendación no debería existir.
 */
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { championLabel } from "./champion-names";
import type { ChampionMatchups } from "./matchups";

/** Lo que se le muestra al jugador. `dato` es el ancla: sin número del historial, no hay recomendación. */
export const CoachReportSchema = z.object({
  resumen: z.string().describe("Dos o tres frases sobre el estado del pool de este jugador. Español rioplatense, directo, sin floreo."),
  recomendados: z
    .array(
      z.object({
        campeon: z.string().describe("Nombre del campeón"),
        dato: z.string().describe("El número CONCRETO del historial del jugador que justifica esto, ej. '64% en 14 partidas'"),
        porque: z.string().describe("Una frase de por qué le conviene, apoyada en el dato y en cómo funciona ese campeón"),
      })
    )
    .describe("Campeones que le conviene jugar más, ordenados por cuánto lo respaldan sus propios datos. Vacío si los datos no alcanzan."),
  counters: z
    .array(
      z.object({
        tuCampeon: z.string(),
        rival: z.string(),
        dato: z.string().describe("El récord real de ese cruce en su historial, ej. '2V-5D con -616 de oro a los 15'"),
        consejo: z.string().describe("Qué hacer concretamente en ese enfrentamiento"),
      })
    )
    .describe("Los cruces de línea que peor le salen según SUS partidas. Vacío si ningún cruce tiene muestra suficiente."),
});

export type CoachReport = z.infer<typeof CoachReportSchema>;

const SYSTEM = `Sos un analista de League of Legends que trabaja con los datos reales de UN jugador puntual, no con estadísticas globales del servidor.

Reglas que no se negocian:

1. Toda afirmación sobre el rendimiento del jugador sale de los datos que te paso abajo. Nunca inventes un número, y nunca cites winrates globales del parche o tier lists: no los tenés y no los podés verificar.
2. El conocimiento general de LoL sí lo podés usar, pero solo para EXPLICAR y para el consejo — qué hace fuerte a un campeón, por qué un matchup es duro, qué hacer en línea. El QUÉ mirar siempre sale de sus datos.
3. El tamaño de muestra manda. Con menos de 5 partidas no afirmes una tendencia; si igual la mencionás, decí explícitamente que la muestra es chica.
4. Si los datos no alcanzan para recomendar algo, devolvé la lista vacía. Una lista vacía es una respuesta correcta; inventar para llenarla no.
5. El campo "dato" de cada ítem tiene que citar un número que aparezca en los datos de abajo. Si no podés llenarlo con algo real, no incluyas ese ítem.

Escribí en español rioplatense, directo, sin adjetivos de relleno. Le hablás al jugador de vos.`;

/** Datos crudos del jugador que alimentan el análisis. Todo sale de partidas guardadas, nada de Riot en vivo. */
export interface CoachDossier {
  gameName: string;
  rol: string;
  rango: string;
  totalPartidas: number;
  pool: { champ: string; games: number; wins: number; winrate: number; avgKda: number }[];
  matchups: ChampionMatchups[];
  maestria: { champ: string; level: number }[];
}

/**
 * El dossier como texto. Se arma acá y no en el prompt para que sea legible
 * y para poder verlo en un log cuando algo salga raro — un prompt armado a
 * pedazos entre llamadas es imposible de depurar.
 */
export function renderDossier(d: CoachDossier): string {
  const lineas: string[] = [];
  lineas.push(`JUGADOR: ${d.gameName} — ${d.rol}, ${d.rango}, ${d.totalPartidas} partidas ranked guardadas.`);

  lineas.push("", "POOL DE CAMPEONES (de sus partidas ranked guardadas):");
  for (const c of d.pool) {
    lineas.push(`- ${championLabel(c.champ)}: ${c.games} partidas, ${c.wins}V-${c.games - c.wins}D (${c.winrate}%), KDA ${c.avgKda}`);
  }

  lineas.push("", "MAESTRÍA DE RIOT (toda su carrera, todas las colas — NO es el historial de arriba):");
  for (const m of d.maestria) lineas.push(`- ${championLabel(m.champ)}: nivel ${m.level}`);

  if (d.matchups.length > 0) {
    lineas.push("", "ENFRENTAMIENTOS DE LÍNEA (su campeón contra el rival del mismo carril):");
    for (const g of d.matchups) {
      for (const o of g.opponents) {
        const oro = o.avgGoldDiff15 === null ? "sin dato de oro" : `${o.avgGoldDiff15 > 0 ? "+" : ""}${o.avgGoldDiff15} de oro a los 15`;
        lineas.push(`- ${championLabel(g.champ)} contra ${championLabel(o.opponent)}: ${o.wins}V-${o.losses}D (${o.winrate}%), ${oro}`);
      }
    }
  } else {
    lineas.push("", "ENFRENTAMIENTOS DE LÍNEA: todavía no hay ningún cruce repetido con muestra suficiente.");
  }

  return lineas.join("\n");
}

/**
 * Huella del dossier: se hashea el TEXTO exacto que va al modelo, no los
 * datos sueltos. Si este hash no cambió, la entrada del modelo sería
 * idéntica byte por byte.
 *
 * Sirve para no gastar en una regeneración que no puede dar nada nuevo. Y
 * conviene ser explícito sobre por qué hace falta: la API no tiene memoria
 * entre llamadas — el modelo no "se acuerda" del informe anterior ni aprendió
 * nada de él. Cada llamada manda el dossier entero de nuevo y se paga entero
 * de nuevo. Lo único que se puede hacer es no llamar, y eso es exactamente lo
 * que habilita comparar este hash.
 */
export function dossierHash(dossier: CoachDossier): string {
  return createHash("sha256").update(renderDossier(dossier)).digest("hex");
}

/**
 * Llama a la API de Claude y devuelve el informe ya validado contra el
 * schema. Tira si falta la API key o si el modelo devuelve algo que no
 * matchea — mejor un error visible que un informe a medias.
 */
export async function generateCoachReport(dossier: CoachDossier): Promise<CoachReport> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en el entorno — agregala en Vercel para habilitar el análisis.");
  }
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${renderDossier(dossier)}

Con esos datos: decime qué campeones le conviene jugar más y cuáles son los cruces de línea que peor le están saliendo, con un consejo concreto para cada uno.`,
      },
    ],
    output_config: { format: zodOutputFormat(CoachReportSchema) },
  });

  // parsed_output viene null si la respuesta no validó contra el schema.
  if (!response.parsed_output) {
    throw new Error("El modelo no devolvió un informe con el formato esperado.");
  }
  return response.parsed_output;
}
