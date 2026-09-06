import { rankScore } from "./ladder";
import { divisionFromRiot, tierKeyFromRiot } from "./mapping";
import type { TierKey } from "./types";

/**
 * La liga semanal: una competencia interna por LP neto, aparte del ladder.
 *
 * El ladder mide dónde llegaste. Esto mide cuánto te MOVISTE esta semana, que
 * es otra cosa y es la que se puede pelear cuando el elo de cada uno ya está
 * más o menos definido.
 *
 * Dos decisiones que cambian todo lo demás:
 *
 * 1. La semana es de lunes 00:00 a domingo 23:59 hora argentina, un corte
 *    FIJO. Una ventana móvil de siete días nunca termina, y sin final no hay
 *    premio que entregar.
 * 2. Se anota el que quiere. No compite todo el que está trackeado: hay una
 *    marca por invocador que solo se puede tocar con la contraseña.
 */

/**
 * Argentina está en UTC-3 todo el año — no mueve el reloj desde 2009. Si algún
 * día vuelve el horario de verano, esto es lo único que hay que revisar.
 */
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

/** El lunes 00:00 (hora argentina) de la semana en la que cae `ahora`, como instante real. */
export function inicioDeSemana(ahora: Date = new Date()): Date {
  // Corriendo el reloj, los campos UTC de esta fecha son la hora argentina.
  const arg = new Date(ahora.getTime() - ARG_OFFSET_MS);
  const desdeElLunes = (arg.getUTCDay() + 6) % 7; // domingo=6, lunes=0
  const lunesArg = Date.UTC(arg.getUTCFullYear(), arg.getUTCMonth(), arg.getUTCDate() - desdeElLunes);
  return new Date(lunesArg + ARG_OFFSET_MS);
}

/** El lunes siguiente: el instante en el que la semana deja de contar. */
export function finDeSemana(inicio: Date): Date {
  return new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/** La clave con la que se guarda una semana: la fecha del lunes, en argentina. AAAA-MM-DD. */
export function claveDeSemana(inicio: Date): string {
  return new Date(inicio.getTime() - ARG_OFFSET_MS).toISOString().slice(0, 10);
}

/** Una foto de rango, tal como sale de lp_snapshots. */
export interface Snapshot {
  puuid: string;
  tier: string;
  division: string;
  lp: number;
  wins: number;
  losses: number;
  captured_at: string;
}

function puntos(s: Snapshot): number {
  return rankScore(tierKeyFromRiot(s.tier), divisionFromRiot(s.division), s.lp);
}

export interface FilaLiga {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  /** Lo que se mide: puntos ganados (o perdidos) en la semana. */
  lpNeto: number;
  victorias: number;
  derrotas: number;
  /** Si todavía no jugó nada esta semana. Se muestra distinto de un 0 conseguido jugando. */
  sinJugar: boolean;
  /** Dónde está parado ahora — el rango de su última foto. Null si no tiene ninguna. */
  rango: { tier: TierKey; division: number; lp: number } | null;
  /** Los puntos de cada foto DENTRO de la semana, para dibujar cómo la fue haciendo. */
  serie: number[];
}

export interface Participante {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
}

/** Partidas de la semana, contadas de verdad. Ver la nota en tablaDeLaSemana. */
export interface RecordSemanal {
  victorias: number;
  derrotas: number;
}

/**
 * La tabla de la semana.
 *
 * El punto de partida de cada uno es su ÚLTIMA foto ANTES del lunes, no la
 * primera de la semana: si el domingo a la noche estaba en 40 LP y la primera
 * foto del lunes lo agarra en 20, esos 20 los perdió dentro de la semana y
 * tienen que contar. Recién si no hay ninguna foto anterior —alguien que se
 * sumó a mitad de semana— se arranca desde la primera que haya.
 *
 * Las victorias y derrotas NO salen de los snapshots. Los contadores de
 * lp_snapshots son acumulados de la season, y restar dos acumulados solo da
 * bien si los dos son válidos: si la foto base tiene 0 —un invocador recién
 * agregado, una entrada de ranked que Riot todavía no devolvía— la resta
 * escupe la season entera y aparece un "222V-225D" en una semana. Se cuentan
 * las partidas reales de la ventana, que es un dato exacto y no una inferencia.
 */
export function tablaDeLaSemana(
  participantes: Participante[],
  snapshots: Snapshot[],
  inicio: Date,
  fin: Date,
  recordPorPuuid: Map<string, RecordSemanal>,
): FilaLiga[] {
  const desde = inicio.getTime();
  const hasta = fin.getTime();

  const porPuuid = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const arr = porPuuid.get(s.puuid) ?? [];
    arr.push(s);
    porPuuid.set(s.puuid, arr);
  }

  const filas: FilaLiga[] = [];
  for (const p of participantes) {
    const suyas = (porPuuid.get(p.puuid) ?? []).sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
    const dentro = suyas.filter((s) => {
      const t = Date.parse(s.captured_at);
      return t >= desde && t < hasta;
    });
    const previas = suyas.filter((s) => Date.parse(s.captured_at) < desde);
    const base = previas.length > 0 ? previas[previas.length - 1] : dentro[0];
    const ultima = dentro.length > 0 ? dentro[dentro.length - 1] : base;

    const { victorias, derrotas } = recordPorPuuid.get(p.puuid) ?? { victorias: 0, derrotas: 0 };
    const rango = ultima
      ? { tier: tierKeyFromRiot(ultima.tier), division: divisionFromRiot(ultima.division), lp: ultima.lp }
      : null;

    if (!base || !ultima) {
      filas.push({ ...p, lpNeto: 0, victorias, derrotas, sinJugar: victorias + derrotas === 0, rango, serie: [] });
      continue;
    }

    filas.push({
      ...p,
      lpNeto: puntos(ultima) - puntos(base),
      victorias,
      derrotas,
      sinJugar: victorias + derrotas === 0,
      rango,
      // La curva arranca en el punto de partida aunque sea de antes del lunes:
      // sin él, una semana con una sola foto no dibuja nada.
      serie: [puntos(base), ...dentro.map(puntos)],
    });
  }

  // Más LP primero; a igual LP, el que jugó menos partidas para conseguirlo.
  // Y el que no jugó nada va al fondo aunque su neto sea 0, porque un 0 sin
  // jugar no es lo mismo que un 0 después de veinte partidas.
  return filas.sort((a, b) => {
    if (a.sinJugar !== b.sinJugar) return a.sinJugar ? 1 : -1;
    if (b.lpNeto !== a.lpNeto) return b.lpNeto - a.lpNeto;
    return a.victorias + a.derrotas - (b.victorias + b.derrotas);
  });
}

/** Cómo se lee una fecha de semana en el mensaje del bot. */
function fechaCorta(d: Date): string {
  return new Date(d.getTime() - ARG_OFFSET_MS).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** El anuncio de que arranca la liga. Se manda a mano una sola vez, desde la app. */
export function mensajeDeArranque(inicio: Date, premio: string | null): string {
  const fin = new Date(finDeSemana(inicio).getTime() - 1);
  const plata = premio ? ` Hay **${premio}** para el que gana.` : " Hay premio $$$ para el que gana.";
  return [
    "🏆 **ARRANCA LA LIGA DE LA GRIETA** 🏆",
    "",
    `Del **lunes ${fechaCorta(inicio)}** al **domingo ${fechaCorta(fin)}**, y se mide una sola cosa: **cuánto LP neto ganás en la semana**.${plata}`,
    "",
    "No importa en qué elo estés — importa cuánto te movés. El que sube 200 puntos desde Plata le gana al que sube 50 desde Diamante.",
    "",
    "**El que reacciona a este mensaje participa.** 👇",
  ].join("\n");
}

/** El anuncio del ganador cuando la semana cierra. */
export function mensajeDeCierre(inicio: Date, tabla: FilaLiga[]): string {
  const fin = new Date(finDeSemana(inicio).getTime() - 1);
  const jugaron = tabla.filter((f) => !f.sinJugar);

  if (jugaron.length === 0) {
    return `🏆 **Cerró la semana** (${fechaCorta(inicio)} – ${fechaCorta(fin)}) y no jugó **nadie**. Un papelón. La semana que viene arranca otra.`;
  }

  const g = jugaron[0];
  const signo = g.lpNeto >= 0 ? "+" : "";
  const lineas = [
    `🏆 **CERRÓ LA SEMANA** — ${fechaCorta(inicio)} al ${fechaCorta(fin)}`,
    "",
    g.lpNeto > 0
      ? `Gana **${g.name}** con **${signo}${g.lpNeto} puntos** en ${g.victorias}V-${g.derrotas}D. A cobrar.`
      : `Gana **${g.name}**… con **${signo}${g.lpNeto} puntos**. Ganó porque los demás estuvieron peor, que es la victoria más triste que hay.`,
    "",
  ];

  const resto = jugaron.slice(1, 5);
  if (resto.length > 0) {
    lineas.push("**Detrás:**");
    for (const [i, f] of resto.entries()) {
      lineas.push(`${i + 2}. ${f.name} — ${f.lpNeto >= 0 ? "+" : ""}${f.lpNeto} (${f.victorias}V-${f.derrotas}D)`);
    }
    lineas.push("");
  }
  lineas.push("El lunes a las 00:00 arranca de cero. 🔁");
  return lineas.join("\n");
}
