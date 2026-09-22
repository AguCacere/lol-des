import { rankScore, tierFor } from "./ladder";
import { wilsonLower } from "./wilson";
import { winrateExacto } from "./winrate";
import type { TierKey } from "./types";

/**
 * La radiografía del grupo: lo que mira la pestaña Estadísticas.
 *
 * Antes esa pestaña eran tres rankings estáticos sobre "toda la historia
 * guardada", y eso tiene dos problemas que se notan enseguida:
 *
 * 1. NO CAMBIA NUNCA. Con 150 partidas guardadas por cabeza, una semana buena
 *    mueve el winrate de temporada medio punto. La pestaña se veía igual el
 *    lunes que el domingo, así que nadie la abría dos veces.
 * 2. LOS PORCENTAJES VENÍAN SOLOS. "62%" sin decir sobre cuántas partidas es
 *    un número que no se puede leer: puede ser 8 de 13 o 93 de 150.
 *
 * Esto arregla las dos: todo se calcula sobre una VENTANA elegible (7 días,
 * 30 días o toda la temporada guardada) y toda cifra viaja con su muestra al
 * lado. Es cálculo puro —entran filas, salen números— así que se puede probar
 * sin base ni red.
 *
 * La regla de la casa acá es una sola: **si el dato no alcanza, no se
 * publica**. Un récord de LP no puede ser más viejo que la primera foto de LP
 * guardada, y un "100% de winrate" sobre tres partidas no es un récord. Cada
 * función de abajo devuelve menos filas antes que inventar una.
 */

export type Periodo = "7d" | "30d" | "temporada";

export const PERIODOS: { clave: Periodo; etiqueta: string; dias: number | null }[] = [
  { clave: "7d", etiqueta: "7 días", dias: 7 },
  { clave: "30d", etiqueta: "30 días", dias: 30 },
  { clave: "temporada", etiqueta: "Temporada", dias: null },
];

/**
 * Cuántas partidas con un campeón hacen falta para llamarlo "especialista",
 * según la ventana.
 *
 * Los tres números salieron de CONTAR sobre las 1.276 partidas guardadas, no
 * de elegirlos a ojo. El umbral que había —50 partidas, heredado del ranking
 * viejo por campeón— dejaba la sección con TRES filas en total, que es
 * exactamente el "empty state gigante" que había que sacar. Midiendo:
 *
 * | umbral | 7 días | 30 días | temporada |
 * |---|---|---|---|
 * | 50 | — | — | 3 pares |
 * | 20 | — | — | 7 pares |
 * | 15 | — | 12 | **15 pares, 11 jugadores** |
 * | 10 | — | **18** | 25 |
 * | 5  | **16** | — | — |
 *
 * Se eligió el umbral más alto que todavía llena la lista en cada ventana:
 * 15/10/5 dan 15, 18 y 16 filas. Uno más exigente vacía la sección; uno más
 * flojo la llena de 3-de-4 que no dicen nada. Si el grupo junta el doble de
 * partidas, estos números suben — y para eso están acá arriba y no clavados
 * adentro de una función.
 */
export const MINIMO_ESPECIALISTA: Record<Periodo, number> = {
  "7d": 5,
  "30d": 10,
  temporada: 15,
};

/**
 * Partidas mínimas para entrar al ranking de winrate del período. Más bajo
 * que el de especialistas porque acá se mide al JUGADOR, no a un campeón
 * suyo: quien jugó diez partidas en la semana jugó la semana entera.
 */
export const MINIMO_WINRATE: Record<Periodo, number> = {
  "7d": 10,
  "30d": 20,
  temporada: 30,
};

/** Para el récord de campeón del salón de la fama, que es de toda la historia. */
export const MINIMO_RECORD_CAMPEON = 20;

/**
 * Cuántos campeones muestra cada lista. Es un número de PANTALLA, no un
 * umbral: el primero va grande y los demás en una tira horizontal, y con
 * ocho la tira dejaba doscientos píxeles muertos a la derecha en escritorio.
 * No toca qué califica ni cómo se ordena.
 */
const CAMPEONES_MOSTRADOS = 10;

/** Cuántas partidas mira "la forma": las últimas diez de cada uno. */
export const VENTANA_FORMA = 10;

// ── Lo que entra ──────────────────────────────────────────────────────────

export interface PersonaRadiografia {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
}

/** Una partida, con lo mínimo que hace falta acá. Ya filtrada (ranked solo, sin remakes). */
export interface PartidaRadiografia {
  puuid: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  /** ISO. */
  playedAt: string;
}

/** Una foto de LP de soloQ. Ya filtrada por queue_type. */
export interface FotoRadiografia {
  puuid: string;
  lp: number;
  tier: TierKey;
  division: number;
  /** ISO. */
  capturedAt: string;
}

/** El dúo con más partidas juntas, que se calcula en la ruta y entra acá ya resuelto. */
export interface DuoRadiografia {
  aName: string;
  bName: string;
  games: number;
  wins: number;
}

// ── Lo que sale ───────────────────────────────────────────────────────────

export type ClaveDestacado = "winrate" | "racha" | "partidas" | "subida" | "caida" | "actividad";

export interface Destacado {
  clave: ClaveDestacado;
  titulo: string;
  persona: PersonaRadiografia;
  /** Ya formateado: es texto para leer, no para ordenar. */
  valor: string;
  /** La muestra o el detalle. Nunca vacío: un número sin contexto es el bug que esto arregla. */
  contexto: string;
  tono: "good" | "bad" | "neutral";
}

/**
 * Una fila del estado de forma: TODO lo que se sabe de esa persona en el
 * período, junto.
 *
 * Antes eran dos listas —"quién está on fire" y "mayor winrate"— que en
 * pantalla quedaban una abajo de la otra contando casi lo mismo. La fusión
 * es de COMPOSICIÓN, no de cálculo: cada número se sigue calculando igual
 * que antes, con los mismos filtros y el mismo mínimo. Lo único nuevo es que
 * viajan en la misma fila en vez de en dos listas separadas.
 */
export interface FilaWinrate {
  persona: PersonaRadiografia;
  partidas: number;
  victorias: number;
  derrotas: number;
  winrate: number;
  /**
   * Si llega a `MINIMO_WINRATE` del período. Antes esta lista venía ya
   * filtrada y quien no llegaba simplemente no existía; ahora viaja con la
   * marca puesta para que la pantalla pueda mostrarlo aparte y apagado en
   * vez de tragárselo. El mínimo NO cambió: sigue decidiendo quién entra al
   * ranking, solo que ahora el que no entra se ve.
   */
  alcanzaMinimo: boolean;
  /** Lo que se abre al tocar la fila. Mismos cálculos, expuestos por persona. */
  mejorRacha: number;
  /** Días argentinos distintos con al menos una partida. */
  dias: number;
  /** Movimiento de rankScore en la ventana. Null si no hay dos fotos que comparar. */
  lpDelta: number | null;
  /** El campeón que más jugó en el período. */
  campeon: { champion: string; partidas: number; victorias: number } | null;
  /**
   * Sus últimas diez de SIEMPRE (no del período) contra su propio promedio —
   * es la misma `FilaForma` de antes, pegada acá. Null si todavía no tiene
   * diez partidas guardadas.
   */
  forma: FilaForma | null;
}

export interface FilaCampeon {
  persona: PersonaRadiografia;
  champion: string;
  partidas: number;
  victorias: number;
  derrotas: number;
  winrate: number;
  kda: number;
}

export interface FilaForma {
  persona: PersonaRadiografia;
  /** Las últimas VENTANA_FORMA, de la más nueva a la más vieja. */
  ultimas: boolean[];
  victorias: number;
  derrotas: number;
  winrate: number;
  /** Diferencia en puntos porcentuales contra su propio winrate de temporada. */
  contraSuPromedio: number;
  /** Cuándo fue la última de esas partidas, ISO. */
  ultimaEl: string;
}

export type ClaveRecord = "racha" | "subidaDia" | "caidaDia" | "partidasDia" | "pico" | "duo" | "campeon";

export interface RecordGrupo {
  clave: ClaveRecord;
  titulo: string;
  /** null para el dúo, que son dos. */
  persona: PersonaRadiografia | null;
  quien: string;
  valor: string;
  contexto: string;
  /** ISO del día en que pasó, cuando se puede fechar. */
  cuando: string | null;
}

/**
 * La historia del período: UN dato protagonista y el resto como notas al
 * costado.
 *
 * Reemplaza a la fila de seis fichas iguales. No hay cálculo nuevo: el
 * protagonista es el primero del ranking de winrate —el mismo que antes
 * ocupaba la ficha "Mejor winrate"— y lo que lo rodea son sus propios
 * números del período, que ya se calculaban por separado en otras fichas.
 * Lo que cambia es que dejan de ser seis datos sueltos para ser una frase.
 */
export interface HistoriaDelPeriodo {
  protagonista: {
    persona: PersonaRadiografia;
    /** "dominó la semana" / "dominó el mes" / "dominó la temporada". */
    titular: string;
    winrate: number;
    victorias: number;
    derrotas: number;
    partidas: number;
    /** Su mejor racha ganadora del período. 0 si no llegó a tres. */
    racha: number;
    lpDelta: number | null;
  } | null;
  /** Lo demás que pasó, sin repetir lo que ya cuenta el protagonista. */
  secundarias: Destacado[];
}

export interface VentanaRadiografia {
  /** Partidas del grupo entero dentro de la ventana — el denominador de toda la pantalla. */
  partidas: number;
  jugadores: number;
  historia: HistoriaDelPeriodo;
  /**
   * Se sigue mandando aunque la pantalla nueva no lo dibuje: durante la
   * ventana de caché del CDN hay pestañas con el bundle viejo recibiendo
   * este JSON. Ver DECISIONES → roleDistribution.
   */
  destacados: Destacado[];
  winrate: FilaWinrate[];
  especialistas: FilaCampeon[];
  masJugados: FilaCampeon[];
  minimoEspecialista: number;
  minimoWinrate: number;
}

export interface Radiografia {
  ventanas: Record<Periodo, VentanaRadiografia>;
  forma: FilaForma[];
  records: RecordGrupo[];
  /** La primera partida guardada del grupo, ISO. Null si no hay ninguna. */
  desde: string | null;
  /** La primera foto de LP guardada, ISO. Los récords de LP no pueden ser más viejos que esto, y la pantalla lo dice. */
  lpDesde: string | null;
}

// ── Días argentinos ───────────────────────────────────────────────────────

/**
 * Argentina está en UTC−3 todo el año. Duplicado a propósito de liga.ts y
 * ladder.ts por la misma razón que allá: importarlo sería un ciclo. Si vuelve
 * el horario de verano, ahora son cuatro lugares.
 */
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

function diaArgentino(ms: number): number {
  return Math.floor((ms - ARG_OFFSET_MS) / 86400000);
}

/** El día argentino como fecha ISO, para poder fechar un récord. */
function fechaDelDia(dia: number): string {
  return new Date(dia * 86400000 + ARG_OFFSET_MS).toISOString();
}

// ── Utilidades ────────────────────────────────────────────────────────────

function porcentaje(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function puntosLp(n: number): string {
  const signo = n > 0 ? "+" : "";
  return `${signo}${n} PL`;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** La racha ganadora más larga de una secuencia ordenada por fecha. */
function rachaMasLarga(resultados: boolean[]): number {
  let mejor = 0;
  let actual = 0;
  for (const win of resultados) {
    actual = win ? actual + 1 : 0;
    if (actual > mejor) mejor = actual;
  }
  return mejor;
}

// ── El cálculo ────────────────────────────────────────────────────────────

interface AcumuladoJugador {
  partidas: PartidaRadiografia[];
  victorias: number;
  porCampeon: Map<string, { partidas: number; victorias: number; k: number; d: number; a: number }>;
  dias: Set<number>;
}

function acumular(partidas: PartidaRadiografia[]): Map<string, AcumuladoJugador> {
  const porJugador = new Map<string, AcumuladoJugador>();
  for (const p of partidas) {
    const acc: AcumuladoJugador = porJugador.get(p.puuid) ?? {
      partidas: [],
      victorias: 0,
      porCampeon: new Map(),
      dias: new Set<number>(),
    };
    acc.partidas.push(p);
    if (p.win) acc.victorias += 1;
    acc.dias.add(diaArgentino(Date.parse(p.playedAt)));
    const c = acc.porCampeon.get(p.champion) ?? { partidas: 0, victorias: 0, k: 0, d: 0, a: 0 };
    c.partidas += 1;
    if (p.win) c.victorias += 1;
    c.k += p.kills;
    c.d += p.deaths;
    c.a += p.assists;
    acc.porCampeon.set(p.champion, c);
    porJugador.set(p.puuid, acc);
  }
  // Las partidas entran en el orden en que vengan; acá se ordenan de la más
  // vieja a la más nueva UNA vez, porque rachas y forma dependen del orden.
  for (const acc of porJugador.values()) {
    acc.partidas.sort((x, y) => (x.playedAt < y.playedAt ? -1 : 1));
  }
  return porJugador;
}

/**
 * Cuánto se movió cada uno en la ventana, en la escala de rankScore.
 *
 * Con rankScore y no con el LP crudo porque el LP se resetea al ascender:
 * quien pasó de Esmeralda 2 con 98 PL a Esmeralda 1 con 12 tuvo la mejor
 * semana del grupo, y restando LP crudo sale −86.
 *
 * Solo cuenta a quien tenga al menos DOS fotos dentro de la ventana: con una
 * sola no hay movimiento que medir, y devolver 0 lo pondría empatado con
 * quien de verdad no se movió.
 */
function movimientoDeLp(
  fotos: FotoRadiografia[],
  desde: number
): { movimiento: Map<string, number>; desdeReal: number | null } {
  const porJugador = new Map<string, { primera: FotoRadiografia; ultima: FotoRadiografia }>();
  for (const f of fotos) {
    if (Date.parse(f.capturedAt) < desde) continue;
    const cur = porJugador.get(f.puuid);
    if (!cur) {
      porJugador.set(f.puuid, { primera: f, ultima: f });
      continue;
    }
    if (f.capturedAt < cur.primera.capturedAt) cur.primera = f;
    if (f.capturedAt > cur.ultima.capturedAt) cur.ultima = f;
  }
  const movimiento = new Map<string, number>();
  // Hasta dónde llegan las fotos de verdad. No siempre es `desde`: las de LP
  // arrancan bastante después que las partidas, así que en la ventana
  // "Temporada" el movimiento no es el de la temporada entera y la pantalla
  // tiene que poder decirlo en vez de dejarlo creer.
  let desdeReal: number | null = null;
  for (const [puuid, { primera, ultima }] of porJugador) {
    if (primera.capturedAt === ultima.capturedAt) continue;
    movimiento.set(
      puuid,
      rankScore(ultima.tier, ultima.division, ultima.lp) - rankScore(primera.tier, primera.division, primera.lp)
    );
    const t = Date.parse(primera.capturedAt);
    if (desdeReal === null || t < desdeReal) desdeReal = t;
  }
  return { movimiento, desdeReal };
}

/** "26 ago", para decir desde cuándo se está midiendo. */
function fechaCorta(ms: number): string {
  return new Date(ms).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function ventana(
  periodo: Periodo,
  partidas: PartidaRadiografia[],
  fotos: FotoRadiografia[],
  personas: Map<string, PersonaRadiografia>,
  formaPorPuuid: Map<string, FilaForma>,
  ahora: number
): VentanaRadiografia {
  const dias = PERIODOS.find((p) => p.clave === periodo)?.dias ?? null;
  const desde = dias === null ? 0 : ahora - dias * 86400000;
  const dentro = partidas.filter((p) => Date.parse(p.playedAt) >= desde);
  const porJugador = acumular(dentro);
  const { movimiento, desdeReal } = movimientoDeLp(fotos, desde);
  // Si las fotos no llegan hasta el arranque de la ventana —por más de un
  // día—, el pie dice desde cuándo se mide de verdad.
  const pieDeLp =
    desdeReal !== null && desdeReal - desde > 86400000
      ? `desde el ${fechaCorta(desdeReal)}, que es de cuando hay datos`
      : "de punta a punta del período";
  const minimoEspecialista = MINIMO_ESPECIALISTA[periodo];
  const minimoWinrate = MINIMO_WINRATE[periodo];

  // ── El estado de forma del período ─────────────────────────────────────
  // Entran TODOS los que jugaron; el mínimo se marca, no excluye. Quien no
  // llega sigue sin estar en el ranking —la pantalla lo pone aparte y
  // apagado—, pero deja de desaparecer sin explicación.
  const winrate: FilaWinrate[] = [];
  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona) continue;
    let mejorCampeon: { champion: string; partidas: number; victorias: number } | null = null;
    for (const [champion, c] of acc.porCampeon) {
      if (!mejorCampeon || c.partidas > mejorCampeon.partidas) {
        mejorCampeon = { champion, partidas: c.partidas, victorias: c.victorias };
      }
    }
    winrate.push({
      persona,
      partidas: acc.partidas.length,
      victorias: acc.victorias,
      derrotas: acc.partidas.length - acc.victorias,
      winrate: winrateExacto(acc.victorias, acc.partidas.length),
      alcanzaMinimo: acc.partidas.length >= minimoWinrate,
      mejorRacha: rachaMasLarga(acc.partidas.map((p) => p.win)),
      dias: acc.dias.size,
      lpDelta: movimiento.get(puuid) ?? null,
      campeon: mejorCampeon,
      forma: formaPorPuuid.get(puuid) ?? null,
    });
  }
  // Los que llegan al mínimo primero, y adentro de cada grupo por winrate.
  winrate.sort(
    (a, b) =>
      Number(b.alcanzaMinimo) - Number(a.alcanzaMinimo) || b.winrate - a.winrate || b.partidas - a.partidas
  );
  const ranqueados = winrate.filter((f) => f.alcanzaMinimo);

  // ── Especialistas y más jugados ────────────────────────────────────────
  const todosLosCampeones: FilaCampeon[] = [];
  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona) continue;
    for (const [champion, c] of acc.porCampeon) {
      todosLosCampeones.push({
        persona,
        champion,
        partidas: c.partidas,
        victorias: c.victorias,
        derrotas: c.partidas - c.victorias,
        winrate: winrateExacto(c.victorias, c.partidas),
        kda: Number(((c.k + c.a) / Math.max(1, c.d)).toFixed(2)),
      });
    }
  }
  // Dos filtros, no uno. El de muestra es obvio; el de 50% lo puso la
  // pantalla: con solo el primero, la lista se completaba hasta ocho con lo
  // que hubiera, y quedaba un "Especialistas: Lee Sin, 38,1%" arriba de todo.
  // Un especialista es alguien que GANA con ese campeón — si no llegan ocho,
  // la lista sale más corta y listo.
  //
  // El orden es por el límite inferior de Wilson y no por el winrate crudo:
  // con umbrales tan bajos como cinco partidas, ordenar por el porcentaje
  // pelado pone un 5-de-5 arriba de un 14-de-20, y eso no es un ranking de
  // especialistas, es un ranking de quién jugó menos. Ver lib/wilson.ts.
  const especialistas = todosLosCampeones
    .filter((f) => f.partidas >= minimoEspecialista && f.victorias > f.derrotas)
    .sort((a, b) => wilsonLower(b.victorias, b.partidas) - wilsonLower(a.victorias, a.partidas))
    .slice(0, CAMPEONES_MOSTRADOS);
  const masJugados = [...todosLosCampeones].sort((a, b) => b.partidas - a.partidas).slice(0, CAMPEONES_MOSTRADOS);

  // ── Destacados ─────────────────────────────────────────────────────────
  const destacados: Destacado[] = [];
  const agregar = (d: Destacado | null) => {
    if (d) destacados.push(d);
  };

  // El mejor winrate del período, sobre los que llegan al mínimo.
  if (ranqueados.length > 0) {
    const mejor = ranqueados[0];
    agregar({
      clave: "winrate",
      titulo: "Mejor winrate",
      persona: mejor.persona,
      valor: porcentaje(mejor.winrate),
      contexto: `${mejor.victorias}V · ${mejor.derrotas}D`,
      tono: mejor.victorias > mejor.derrotas ? "good" : "neutral",
    });
  }

  // La racha ganadora más larga DENTRO de la ventana.
  let mejorRacha: { persona: PersonaRadiografia; largo: number } | null = null;
  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona) continue;
    const largo = rachaMasLarga(acc.partidas.map((p) => p.win));
    if (largo >= 3 && (!mejorRacha || largo > mejorRacha.largo)) mejorRacha = { persona, largo };
  }
  if (mejorRacha) {
    agregar({
      clave: "racha",
      titulo: "Mejor racha",
      persona: mejorRacha.persona,
      valor: plural(mejorRacha.largo, "ganada", "al hilo"),
      contexto: "sin perder ninguna en el medio",
      tono: "good",
    });
  }

  // Quién más jugó.
  let masPartidas: { persona: PersonaRadiografia; n: number } | null = null;
  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona) continue;
    if (!masPartidas || acc.partidas.length > masPartidas.n) masPartidas = { persona, n: acc.partidas.length };
  }
  if (masPartidas) {
    const acc = porJugador.get(masPartidas.persona.puuid);
    agregar({
      clave: "partidas",
      titulo: "Más partidas",
      persona: masPartidas.persona,
      valor: String(masPartidas.n),
      contexto: acc ? `en ${plural(acc.dias.size, "día", "días")}` : "",
      tono: "neutral",
    });
  }

  // Subida y caída de LP. Solo si hay movimiento real en esa dirección: un
  // "mayor caída: +12 PL" sería mentira con cara de dato.
  let subida: { puuid: string; delta: number } | null = null;
  let caida: { puuid: string; delta: number } | null = null;
  for (const [puuid, delta] of movimiento) {
    if (!personas.has(puuid)) continue;
    if (delta > 0 && (!subida || delta > subida.delta)) subida = { puuid, delta };
    if (delta < 0 && (!caida || delta < caida.delta)) caida = { puuid, delta };
  }
  if (subida) {
    const persona = personas.get(subida.puuid)!;
    agregar({
      clave: "subida",
      titulo: "El que más subió",
      persona,
      valor: puntosLp(subida.delta),
      contexto: pieDeLp,
      tono: "good",
    });
  }
  if (caida) {
    const persona = personas.get(caida.puuid)!;
    agregar({
      clave: "caida",
      titulo: "El que más bajó",
      persona,
      valor: puntosLp(caida.delta),
      contexto: pieDeLp,
      tono: "bad",
    });
  }

  // Actividad: días distintos con al menos una partida. Es otra cosa que el
  // total de partidas — se puede jugar veinte en dos días.
  let masDias: { persona: PersonaRadiografia; n: number; partidas: number } | null = null;
  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona) continue;
    if (!masDias || acc.dias.size > masDias.n) masDias = { persona, n: acc.dias.size, partidas: acc.partidas.length };
  }
  // Solo si le gana a "más partidas": si es el mismo, el destacado repite
  // persona y no cuenta nada nuevo.
  if (masDias && masDias.persona.puuid !== masPartidas?.persona.puuid) {
    agregar({
      clave: "actividad",
      titulo: "El más constante",
      persona: masDias.persona,
      valor: plural(masDias.n, "día", "días"),
      contexto: `${plural(masDias.partidas, "partida", "partidas")} repartidas`,
      tono: "neutral",
    });
  }

  // ── La historia del período ────────────────────────────────────────────
  // El protagonista es el primero del ranking: el mismo que antes ocupaba la
  // ficha "Mejor winrate". Lo que lo acompaña son sus propios números, que
  // antes vivían desparramados en otras fichas de la misma fila.
  const TITULARES: Record<Periodo, string> = {
    "7d": "dominó la semana",
    "30d": "dominó el mes",
    temporada: "domina la temporada",
  };
  const primero = ranqueados[0] ?? null;
  const historia: HistoriaDelPeriodo = {
    protagonista: primero
      ? {
          persona: primero.persona,
          titular: TITULARES[periodo],
          winrate: primero.winrate,
          victorias: primero.victorias,
          derrotas: primero.derrotas,
          partidas: primero.partidas,
          // Tres o más, que es el piso desde el que una racha se cuenta en
          // toda la app. Abajo de eso no es una racha, son dos partidas.
          racha: primero.mejorRacha >= 3 ? primero.mejorRacha : 0,
          lpDelta: primero.lpDelta,
        }
      : null,
    secundarias: notasSecundarias(destacados, primero),
  };

  return {
    partidas: dentro.length,
    jugadores: porJugador.size,
    historia,
    destacados,
    winrate,
    especialistas,
    masJugados,
    minimoEspecialista,
    minimoWinrate,
  };
}

/**
 * Las notas que acompañan al protagonista: UNA por persona.
 *
 * Se sacan dos cosas. La primera es obvia: lo que el protagonista ya cuenta
 * en su propio bloque (su winrate, su racha, su LP) no se repite al costado.
 *
 * La segunda es la que se veía fea en pantalla. Los destacados son de
 * CATEGORÍAS distintas, pero nada impide que la misma persona gane dos: el
 * que más jugó suele ser también el de la mejor racha, porque jugó más. Y
 * entonces la portada decía "marlboro de diez tuvo la mejor racha" arriba de
 * "marlboro de diez fue el que más jugó", que parece un bug aunque las dos
 * sean ciertas.
 *
 * Se queda con la PRIMERA de cada persona, y el orden en que vienen los
 * destacados es el que decide cuál la destaca más (racha antes que volumen,
 * volumen antes que constancia). Es la misma regla que `repartirTitulos` en
 * lib/liga-titulos.ts, que da un título por persona y no el líder de cada
 * categoría — y está acá por la misma razón.
 *
 * La nota que se cae NO se le pasa al segundo: "fue el que más jugó" sobre
 * alguien que no fue el que más jugó sería mentira. Simplemente no se
 * publica esa categoría en esta ventana.
 */
function notasSecundarias(destacados: Destacado[], primero: FilaWinrate | null): Destacado[] {
  const yaSalio = new Set<string>();
  if (primero) yaSalio.add(primero.persona.puuid);
  const notas: Destacado[] = [];
  for (const d of destacados) {
    // El winrate ES el protagonista, no una nota al costado.
    if (d.clave === "winrate") continue;
    if (yaSalio.has(d.persona.puuid)) continue;
    yaSalio.add(d.persona.puuid);
    notas.push(d);
  }
  return notas;
}

/**
 * "Quién está on fire": las últimas diez de cada uno, comparadas contra su
 * propio winrate de temporada.
 *
 * Contra su propio promedio y no contra el 50% a propósito: alguien que vive
 * en 57% y viene de 6-4 no está on fire, está por debajo de lo suyo. Es la
 * misma idea de lib/form.ts, pero sobre el resultado pelado y para todo el
 * grupo de una.
 */
function calcularForma(
  partidas: PartidaRadiografia[],
  personas: Map<string, PersonaRadiografia>
): FilaForma[] {
  const porJugador = acumular(partidas);
  const filas: FilaForma[] = [];
  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona || acc.partidas.length < VENTANA_FORMA) continue;
    const ultimas = acc.partidas.slice(-VENTANA_FORMA);
    const victorias = ultimas.filter((p) => p.win).length;
    const wr = winrateExacto(victorias, ultimas.length);
    filas.push({
      persona,
      // De la más nueva a la más vieja: es como se leen las rachas en toda la app.
      ultimas: [...ultimas].reverse().map((p) => p.win),
      victorias,
      derrotas: ultimas.length - victorias,
      winrate: wr,
      contraSuPromedio: Number((wr - winrateExacto(acc.victorias, acc.partidas.length)).toFixed(1)),
      ultimaEl: ultimas[ultimas.length - 1].playedAt,
    });
  }
  return filas.sort((a, b) => b.winrate - a.winrate || b.contraSuPromedio - a.contraSuPromedio);
}

/**
 * El salón de la fama. Todo de la historia ENTERA guardada, y cada récord
 * existe solo si se puede calcular bien:
 *
 * - los de partidas (racha, partidas en un día, campeón) salen de `matches`,
 *   que arranca en abril para algunos;
 * - los de LP (subida y caída en un día, pico de rango) salen de
 *   `lp_snapshots`, que arranca MUCHO después. Por eso `lpDesde` viaja al
 *   cliente: la pantalla lo aclara en vez de dejar creer que es de siempre.
 */
function calcularRecords(
  partidas: PartidaRadiografia[],
  fotos: FotoRadiografia[],
  personas: Map<string, PersonaRadiografia>,
  duo: DuoRadiografia | null
): RecordGrupo[] {
  const records: RecordGrupo[] = [];
  const porJugador = acumular(partidas);

  // Racha ganadora más larga de la historia.
  let racha: { persona: PersonaRadiografia; largo: number } | null = null;
  // Más partidas en un día argentino.
  let diaLargo: { persona: PersonaRadiografia; n: number; dia: number; victorias: number } | null = null;
  // Mejor récord con un campeón, con muestra.
  let campeon: FilaCampeon | null = null;

  for (const [puuid, acc] of porJugador) {
    const persona = personas.get(puuid);
    if (!persona) continue;

    const largo = rachaMasLarga(acc.partidas.map((p) => p.win));
    if (!racha || largo > racha.largo) racha = { persona, largo };

    const porDia = new Map<number, { n: number; victorias: number }>();
    for (const p of acc.partidas) {
      const dia = diaArgentino(Date.parse(p.playedAt));
      const d = porDia.get(dia) ?? { n: 0, victorias: 0 };
      d.n += 1;
      if (p.win) d.victorias += 1;
      porDia.set(dia, d);
    }
    for (const [dia, d] of porDia) {
      // Empate a partidas: gana el día más reciente. Sin este desempate el
      // récord dependía del orden del Map, o sea de en qué orden volvió la
      // consulta — dos veces el mismo dato podía mostrar días distintos.
      if (!diaLargo || d.n > diaLargo.n || (d.n === diaLargo.n && dia > diaLargo.dia)) {
        diaLargo = { persona, n: d.n, dia, victorias: d.victorias };
      }
    }

    for (const [champion, c] of acc.porCampeon) {
      if (c.partidas < MINIMO_RECORD_CAMPEON) continue;
      const fila: FilaCampeon = {
        persona,
        champion,
        partidas: c.partidas,
        victorias: c.victorias,
        derrotas: c.partidas - c.victorias,
        winrate: winrateExacto(c.victorias, c.partidas),
        kda: Number(((c.k + c.a) / Math.max(1, c.d)).toFixed(2)),
      };
      if (!campeon || wilsonLower(fila.victorias, fila.partidas) > wilsonLower(campeon.victorias, campeon.partidas)) {
        campeon = fila;
      }
    }
  }

  if (racha && racha.largo >= 3) {
    records.push({
      clave: "racha",
      titulo: "Racha más larga",
      persona: racha.persona,
      quien: racha.persona.name,
      valor: plural(racha.largo, "ganada", "ganadas al hilo"),
      contexto: "sobre todo lo guardado",
      cuando: null,
    });
  }

  if (diaLargo) {
    records.push({
      clave: "partidasDia",
      titulo: "Más partidas en un día",
      persona: diaLargo.persona,
      quien: diaLargo.persona.name,
      valor: String(diaLargo.n),
      contexto: `${diaLargo.victorias}V · ${diaLargo.n - diaLargo.victorias}D`,
      cuando: fechaDelDia(diaLargo.dia),
    });
  }

  // ── Los de LP ──────────────────────────────────────────────────────────
  // Por día argentino: la primera y la última foto de ese día. Un día sin dos
  // fotos no se puede medir y no entra.
  const porJugadorYDia = new Map<string, Map<number, { primera: FotoRadiografia; ultima: FotoRadiografia }>>();
  let pico: { persona: PersonaRadiografia; foto: FotoRadiografia; score: number } | null = null;
  for (const f of fotos) {
    const persona = personas.get(f.puuid);
    if (!persona) continue;
    const score = rankScore(f.tier, f.division, f.lp);
    if (!pico || score > pico.score) pico = { persona, foto: f, score };
    const dias = porJugadorYDia.get(f.puuid) ?? new Map();
    const dia = diaArgentino(Date.parse(f.capturedAt));
    const cur = dias.get(dia);
    if (!cur) dias.set(dia, { primera: f, ultima: f });
    else {
      if (f.capturedAt < cur.primera.capturedAt) cur.primera = f;
      if (f.capturedAt > cur.ultima.capturedAt) cur.ultima = f;
    }
    porJugadorYDia.set(f.puuid, dias);
  }

  let subida: { persona: PersonaRadiografia; delta: number; dia: number } | null = null;
  let caida: { persona: PersonaRadiografia; delta: number; dia: number } | null = null;
  for (const [puuid, dias] of porJugadorYDia) {
    const persona = personas.get(puuid)!;
    for (const [dia, { primera, ultima }] of dias) {
      if (primera.capturedAt === ultima.capturedAt) continue;
      const delta =
        rankScore(ultima.tier, ultima.division, ultima.lp) - rankScore(primera.tier, primera.division, primera.lp);
      // Mismo desempate por fecha que arriba, por la misma razón.
      if (delta > 0 && (!subida || delta > subida.delta || (delta === subida.delta && dia > subida.dia))) {
        subida = { persona, delta, dia };
      }
      if (delta < 0 && (!caida || delta < caida.delta || (delta === caida.delta && dia > caida.dia))) {
        caida = { persona, delta, dia };
      }
    }
  }

  if (subida) {
    records.push({
      clave: "subidaDia",
      titulo: "Mayor subida en un día",
      persona: subida.persona,
      quien: subida.persona.name,
      valor: puntosLp(subida.delta),
      contexto: "en un solo día",
      cuando: fechaDelDia(subida.dia),
    });
  }
  if (caida) {
    records.push({
      clave: "caidaDia",
      titulo: "Mayor caída en un día",
      persona: caida.persona,
      quien: caida.persona.name,
      valor: puntosLp(caida.delta),
      contexto: "en un solo día",
      cuando: fechaDelDia(caida.dia),
    });
  }
  if (pico) {
    records.push({
      clave: "pico",
      titulo: "El pico más alto",
      persona: pico.persona,
      quien: pico.persona.name,
      valor: `${tierFor(pico.foto.tier).name} ${pico.foto.division}`,
      contexto: `con ${pico.foto.lp} PL`,
      cuando: pico.foto.capturedAt,
    });
  }

  if (duo && duo.games >= 10) {
    records.push({
      clave: "duo",
      titulo: "El dúo más pesado",
      persona: null,
      quien: `${duo.aName} y ${duo.bName}`,
      valor: plural(duo.games, "partida juntos", "partidas juntos"),
      contexto: `${duo.wins}V · ${duo.games - duo.wins}D`,
      cuando: null,
    });
  }

  if (campeon) {
    const c: FilaCampeon = campeon;
    records.push({
      clave: "campeon",
      titulo: "Mejor registro con un campeón",
      persona: c.persona,
      quien: `${c.persona.name} con ${c.champion}`,
      valor: porcentaje(c.winrate),
      contexto: `${c.victorias}V · ${c.derrotas}D`,
      cuando: null,
    });
  }

  return records;
}

/**
 * La puerta del módulo. `ahora` entra por parámetro para poder probarlo: las
 * ventanas de 7 y 30 días se cuentan desde acá.
 */
export function radiografia(
  partidas: PartidaRadiografia[],
  fotos: FotoRadiografia[],
  personas: PersonaRadiografia[],
  duo: DuoRadiografia | null,
  ahora: number = Date.now()
): Radiografia {
  const porPuuid = new Map(personas.map((p) => [p.puuid, p]));
  // La forma se calcula UNA vez, sobre todo lo guardado: son las últimas
  // diez de cada uno, que no dependen del período. Cada ventana se la pega a
  // sus filas por puuid.
  const forma = calcularForma(partidas, porPuuid);
  const formaPorPuuid = new Map(forma.map((f) => [f.persona.puuid, f]));
  const ventanas = {} as Record<Periodo, VentanaRadiografia>;
  for (const { clave } of PERIODOS) {
    ventanas[clave] = ventana(clave, partidas, fotos, porPuuid, formaPorPuuid, ahora);
  }
  let desde: string | null = null;
  for (const p of partidas) if (!desde || p.playedAt < desde) desde = p.playedAt;
  let lpDesde: string | null = null;
  for (const f of fotos) if (!lpDesde || f.capturedAt < lpDesde) lpDesde = f.capturedAt;
  return {
    ventanas,
    forma,
    records: calcularRecords(partidas, fotos, porPuuid, duo),
    desde,
    lpDesde,
  };
}
