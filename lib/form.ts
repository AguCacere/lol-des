/**
 * "Forma reciente" — las últimas FORM_WINDOW_SIZE partidas de un jugador
 * contra TODO lo anterior que tengamos guardado de él. Es la única
 * comparación de la app que no mira a nadie más: no es contra el promedio
 * del rol (eso ya lo hace `roleAverages`) ni contra un rango objetivo, es
 * el jugador contra su propia versión de hace unas semanas.
 *
 * Lógica pura, sin acceso a la API ni a la base — app/api/ladder/route.ts le
 * pasa el historial ranked completo de cada jugador, ya ordenado, y esto
 * devuelve el veredicto.
 *
 * Se parece a lib/matchflags.ts (misma idea de "tu propia base"), pero
 * resuelve otra pregunta: matchflags marca UNA partida atípica contra las
 * 25 que la rodean; esto mide si la FORMA cambió, ventana contra ventana.
 */
import type { FormSplit, RecentForm } from "./types";

/** Cuántas partidas entran en la ventana "reciente". */
export const FORM_WINDOW_SIZE = 20;
/**
 * Mínimo de partidas VIEJAS (fuera de la ventana) para que el histórico
 * signifique algo. Con menos que esto, la comparación es ruido: un jugador
 * con 22 partidas estaría midiendo sus últimas 20 contra 2.
 */
export const FORM_MIN_BASELINE = 10;

/** Lo mínimo de una partida que hace falta acá — el resto de las columnas no se usan. */
export interface FormSample {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMin: number;
  visionScore: number;
  goldEarned: number;
  damageToChamps: number;
  /**
   * % de las kills del equipo en las que participó. Ojo con el 0: la columna
   * se agregó con `not null default 0` (ver el ALTER TABLE de a336cae), así
   * que TODA partida guardada antes del 26/08/2026 tiene 0 y no "0 de
   * verdad". Y son justo las viejas, o sea el histórico — ver killPart() abajo.
   */
  killParticipation: number | null;
  durationS: number;
}

/**
 * El 0 de kill_participation casi siempre es "no había dato cuando se
 * guardó", no "no participó en ninguna kill" — la columna nació con default
 * 0 y nadie hizo backfill. Como las partidas afectadas son las más viejas,
 * dejarlas entrar arrastraba el histórico hacia abajo y la ventana reciente
 * mostraba una mejora enorme que nunca ocurrió. Se saltean: si el histórico
 * queda entero sin dato, la métrica directamente no se muestra.
 *
 * El costo es perder algún 0 real (equipo que terminó la partida con cero
 * kills), que es rarísimo y no vale distorsionar todo el resto por él.
 */
function killPart(s: FormSample): number | null {
  if (s.killParticipation === null) return null;
  // Un 0 con kills o asistencias es imposible: ahí el 0 es la columna sin
  // rellenar, no un dato. Sin takedowns, en cambio, el 0 es verdadero y tiene
  // que contar — descartarlo también sesgaba el promedio para arriba.
  if (s.killParticipation === 0 && s.kills + s.assists > 0) return null;
  return s.killParticipation;
}

/** Minutos reales de la partida, con piso para que un remake no divida por cero. */
function minutes(s: FormSample): number {
  return Math.max(1, s.durationS / 60);
}

/** Promedio simple, o null si no hay nada que promediar (todas las muestras salteadas). */
function avg(samples: FormSample[], pick: (s: FormSample) => number | null): number | null {
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    const v = pick(s);
    if (v === null || !Number.isFinite(v)) continue;
    sum += v;
    n += 1;
  }
  return n === 0 ? null : sum / n;
}

/**
 * Una métrica solo se muestra si AMBAS ventanas tienen dato. Que el
 * histórico esté vacío pasa de verdad: kill_participation es null en todo
 * lo guardado antes de que existiera esa columna, así que un jugador puede
 * tener el dato en sus últimas 20 y no tenerlo en las viejas — ahí la
 * comparación no existe y mostrar "+100%" sería mentira.
 */
function split(
  recent: FormSample[],
  baseline: FormSample[],
  pick: (s: FormSample) => number | null
): FormSplit | null {
  const r = avg(recent, pick);
  const b = avg(baseline, pick);
  return r === null || b === null ? null : { recent: r, baseline: b };
}

/**
 * `matches` es el historial ranked completo de UN jugador, más nuevo
 * primero (el mismo orden en que sale de la query, played_at DESC).
 * Devuelve null si todavía no hay suficiente historial viejo como para que
 * la comparación diga algo.
 */
export function computeRecentForm(matches: FormSample[]): RecentForm | null {
  if (matches.length < FORM_WINDOW_SIZE + FORM_MIN_BASELINE) return null;

  const recent = matches.slice(0, FORM_WINDOW_SIZE);
  const baseline = matches.slice(FORM_WINDOW_SIZE);

  return {
    recentGames: recent.length,
    baselineGames: baseline.length,
    winrate: split(recent, baseline, (s) => (s.win ? 100 : 0)),
    // KDA por partida y después promediado (no (ΣK+ΣA)/ΣD): así una sola
    // partida de 0 muertes no se come el promedio de la ventana entera.
    // Es el mismo criterio que usa roleAggByRole en la ruta del ladder.
    kda: split(recent, baseline, (s) => (s.kills + s.assists) / Math.max(1, s.deaths)),
    csPerMin: split(recent, baseline, (s) => s.csPerMin),
    damagePerMin: split(recent, baseline, (s) => s.damageToChamps / minutes(s)),
    goldPerMin: split(recent, baseline, (s) => s.goldEarned / minutes(s)),
    killParticipation: split(recent, baseline, killPart),
    visionPerMin: split(recent, baseline, (s) => s.visionScore / minutes(s)),
    deathsPerGame: split(recent, baseline, (s) => s.deaths),
  };
}
