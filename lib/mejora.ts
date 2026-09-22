/**
 * "Mejora": el motor determinístico de aprendizaje personal.
 *
 * La app ya sabía contar QUÉ pasó. Esto es lo otro: convertir eso en algo
 * sobre lo que se pueda trabajar. El recorrido es
 *
 *   partida → diagnóstico → patrón → objetivo → próximas → evaluación
 *
 * y NO empieza por un chatbot. Todo lo de acá son reglas y números; un
 * modelo puede venir después a explicar lo que esto ya calculó, pero la
 * pantalla tiene que servir sin él.
 *
 * ── Las dos reglas que ordenan el archivo ────────────────────────────────
 *
 * 1. **Contra uno mismo, no contra una constante.** Está medido sobre las
 *    1.276 partidas guardadas y es contundente: la mediana de CS por minuto
 *    va de 1,4 (support) a 7,7 (ADC), y el percentil 25 de diferencia de oro
 *    a los 10 va de −283 (support) a −552 (top). Un umbral fijo tipo
 *    "≥ −300 de oro" es cómodo para un support y casi imposible para un top,
 *    así que TODO se compara contra la propia línea de base del jugador. Ver
 *    DECISIONES.
 *
 * 2. **Describir, no dictaminar.** Los datos guardados son de UN carril, no
 *    del mapa entero. Se puede decir "la diferencia de oro pasó de −213 a
 *    −1.491" porque es lo que pasó; no se puede decir "perdiste por eso".
 *    Ninguna función de acá afirma una causa.
 *
 * Y la de siempre: si el dato no alcanza, no se publica. Cada función
 * devuelve null o una lista más corta antes que inventar una observación.
 */

// ── Métricas ──────────────────────────────────────────────────────────────

export type ClaveMetrica =
  | "goldDiff10"
  | "goldDiff15"
  | "csPorMin"
  | "muertes"
  | "visionPorMin"
  | "participacion"
  | "danoPorMin";

/** Una partida con lo que necesita el motor. Ya filtrada (ranked solo, sin remakes). */
export interface PartidaMejora {
  matchId: string;
  champion: string;
  /** El rival del MISMO carril. Null si Riot no resolvió la posición. */
  oponente: string | null;
  rol: string | null;
  win: boolean;
  playedAt: string;
  duracionS: number;
  kills: number;
  deaths: number;
  assists: number;
  csPorMin: number;
  visionScore: number;
  participacion: number;
  danoAChampions: number;
  goldDiff10: number | null;
  goldDiff15: number | null;
  goldDiff20: number | null;
}

export interface Metrica {
  clave: ClaveMetrica;
  /** Cómo se la nombra en pantalla. */
  etiqueta: string;
  /** La unidad, para pegarle al número. */
  unidad: string;
  /** true cuando MÁS es mejor. `muertes` es la única donde menos es mejor. */
  masEsMejor: boolean;
  /** Cuántos decimales muestra. Las diferencias de oro son enteros; el CS por minuto no. */
  decimales: number;
  /** Saca el valor de una partida. Null cuando esa partida no lo tiene guardado. */
  de: (p: PartidaMejora) => number | null;
  /** Una línea explicando qué mide, para el InfoTip. */
  explica: string;
}

/**
 * El catálogo. Son siete y no veinte a propósito: el plan pide no tirar
 * veinte recomendaciones juntas, y cada métrica de más es una fila más de
 * ruido en una pantalla que tiene que caber en la cabeza.
 *
 * Todas salen de columnas que están guardadas para CASI TODAS las partidas
 * —medido: 1.267 de 1.276 tienen diferencia de oro a los 10, y el resto de
 * las columnas están al 100%— así que ninguna sección va a aparecer vacía.
 */
export const METRICAS: Metrica[] = [
  {
    clave: "goldDiff10",
    etiqueta: "Diferencia de oro @10",
    unidad: "",
    masEsMejor: true,
    decimales: 0,
    de: (p) => p.goldDiff10,
    explica: "Tu oro menos el del rival de tu misma línea, al minuto 10. Es la foto de cómo salió la línea antes de que el resto del mapa se meta.",
  },
  {
    clave: "goldDiff15",
    etiqueta: "Diferencia de oro @15",
    unidad: "",
    masEsMejor: true,
    decimales: 0,
    de: (p) => p.goldDiff15,
    explica: "Lo mismo al minuto 15, cuando ya suele haber pasado la primera pelea y las torres de afuera.",
  },
  {
    clave: "csPorMin",
    etiqueta: "CS por minuto",
    unidad: "",
    masEsMejor: true,
    decimales: 1,
    de: (p) => p.csPorMin,
    explica: "Súbditos por minuto. Cambia muchísimo según la línea —la mediana del grupo va de 1,4 en support a 7,7 en ADC— así que solo se compara contra vos mismo.",
  },
  {
    clave: "muertes",
    etiqueta: "Muertes",
    unidad: "",
    masEsMejor: false,
    decimales: 1,
    de: (p) => p.deaths,
    explica: "Cuántas veces moriste. La única de la lista donde menos es mejor.",
  },
  {
    clave: "visionPorMin",
    etiqueta: "Visión por minuto",
    unidad: "",
    masEsMejor: true,
    decimales: 2,
    de: (p) => (p.duracionS > 0 ? (p.visionScore * 60) / p.duracionS : null),
    explica: "Puntaje de visión repartido por la duración, porque una partida de 45 minutos junta más visión que una de 22 sin que nadie haya hecho nada distinto.",
  },
  {
    clave: "participacion",
    etiqueta: "Participación",
    unidad: "%",
    masEsMejor: true,
    decimales: 0,
    de: (p) => p.participacion,
    explica: "De cada 100 asesinatos de tu equipo, en cuántos estuviste (matando o asistiendo).",
  },
  {
    clave: "danoPorMin",
    etiqueta: "Daño por minuto",
    unidad: "",
    masEsMejor: true,
    decimales: 0,
    de: (p) => (p.duracionS > 0 ? (p.danoAChampions * 60) / p.duracionS : null),
    explica: "Daño a campeones repartido por la duración. Igual que la visión: sin dividir, las partidas largas parecen mejores solas.",
  },
];

export function metrica(clave: ClaveMetrica): Metrica {
  const m = METRICAS.find((x) => x.clave === clave);
  if (!m) throw new Error(`Métrica desconocida: ${clave}`);
  return m;
}

/** El valor como se muestra, con su unidad y el signo cuando corresponde. */
export function formatearMetrica(m: Metrica, valor: number): string {
  const n = valor.toFixed(m.decimales).replace(".", ",");
  // Las diferencias de oro llevan signo siempre: "+84" y "84" se leen igual
  // de rápido, pero "−84" y "84" son cosas opuestas.
  const signo = m.clave.startsWith("goldDiff") && valor > 0 ? "+" : "";
  return `${signo}${n}${m.unidad}`;
}

// ── Línea de base ─────────────────────────────────────────────────────────

/**
 * Con menos de esto no se calcula una línea de base. Diez partidas es el
 * mismo piso que usa "la forma" en Estadísticas, y por la misma razón: abajo
 * de ahí una mediana se mueve entera con dos partidas raras.
 */
export const MINIMO_BASELINE = 10;

export interface Baseline {
  metrica: ClaveMetrica;
  /** Cuántas partidas tenían el dato. */
  muestra: number;
  p25: number;
  mediana: number;
  p75: number;
}

function percentil(ordenados: number[], q: number): number {
  if (ordenados.length === 0) return 0;
  if (ordenados.length === 1) return ordenados[0];
  const pos = (ordenados.length - 1) * q;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) return ordenados[bajo];
  return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo);
}

/** La línea de base del jugador para una métrica. Null si no hay muestra. */
export function baselineDe(partidas: PartidaMejora[], clave: ClaveMetrica): Baseline | null {
  const m = metrica(clave);
  const valores = partidas
    .map((p) => m.de(p))
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (valores.length < MINIMO_BASELINE) return null;
  return {
    metrica: clave,
    muestra: valores.length,
    p25: percentil(valores, 0.25),
    mediana: percentil(valores, 0.5),
    p75: percentil(valores, 0.75),
  };
}

/**
 * El umbral que se propone por defecto para un objetivo: LA PROPIA MEDIANA.
 *
 * Es la misma para las dos direcciones —"llegar a tu mediana o más" y "bajar
 * a tu mediana o menos" son el mismo número—, así que no hay ternario acá:
 * lo que cambia según `masEsMejor` es el comparador, no el umbral.
 *
 * Y es la mediana y no el percentil 75 a propósito: un objetivo que se
 * cumple una de cada cuatro veces se abandona. La mediana es "hacé lo tuyo
 * de siempre, pero todas las veces", que es subir el piso en vez de mover el
 * techo. Se puede editar a mano.
 */
export function objetivoSugerido(b: Baseline): number {
  const m = metrica(b.metrica);
  // Redondeado a algo que se pueda decir en voz alta: nadie se propone
  // "llegar a −287 de oro".
  if (m.decimales === 0) return Math.round(b.mediana / 25) * 25;
  return Number(b.mediana.toFixed(m.decimales));
}

// ── 8.2 · Diagnóstico de una partida ──────────────────────────────────────

export interface CapaDiagnostico {
  /** El texto, ya en castellano. */
  texto: string;
  /** El número que lo sostiene, para mostrarlo al lado. Puede faltar. */
  dato: string | null;
}

export interface Diagnostico {
  /** Lo que marcó la partida. Estrictamente descriptivo. */
  marco: CapaDiagnostico | null;
  /** Lo que hizo bien, contra su propia base. */
  bien: CapaDiagnostico | null;
  /** Para la próxima: una acción con un número que se pueda verificar. */
  proxima: CapaDiagnostico | null;
  /** Sobre cuántas partidas se comparó. Va siempre a la vista. */
  muestra: number;
}

/**
 * Las tres capas del plan, para UNA partida, comparada contra el historial
 * previo de esa misma persona.
 *
 * `historial` tiene que ser lo ANTERIOR a esta partida: si se le pasa el
 * historial incluyéndola, la partida se compara contra sí misma y una
 * actuación extrema se diluye sola.
 */
export function diagnostico(p: PartidaMejora, historial: PartidaMejora[]): Diagnostico {
  const bases = new Map<ClaveMetrica, Baseline>();
  for (const m of METRICAS) {
    const b = baselineDe(historial, m.clave);
    if (b) bases.set(m.clave, b);
  }
  const muestra = historial.length;

  /** Cuántos percentiles por encima/debajo de lo suyo estuvo, con signo "bueno". */
  const desvio = (m: Metrica): { valor: number; base: Baseline; bueno: boolean; fuerte: boolean } | null => {
    const base = bases.get(m.clave);
    const valor = m.de(p);
    if (!base || valor === null || !Number.isFinite(valor)) return null;
    const porEncima = valor > base.mediana;
    const bueno = m.masEsMejor ? porEncima : !porEncima;
    // "Fuerte" = fuera del rango intercuartil propio. No es un test
    // estadístico: es "esto no es un día normal tuyo".
    const fuerte = valor > base.p75 || valor < base.p25;
    return { valor, base, bueno, fuerte };
  };

  // ── Lo que marcó la partida ─────────────────────────────────────────────
  // Primero la diferencia de oro, porque es la única que cuenta una
  // TRAYECTORIA (cómo cambió entre dos momentos) y no un total.
  let marco: CapaDiagnostico | null = null;
  if (p.goldDiff10 !== null && p.goldDiff20 !== null) {
    const d = p.goldDiff20 - p.goldDiff10;
    if (Math.abs(d) >= 800) {
      const m10 = formatearMetrica(metrica("goldDiff10"), p.goldDiff10);
      const m20 = formatearMetrica(metrica("goldDiff10"), p.goldDiff20);
      marco = {
        texto:
          d < 0
            ? `La diferencia de oro de tu línea pasó de ${m10} a los 10 a ${m20} a los 20.`
            : `Tu línea se abrió: de ${m10} a los 10 a ${m20} a los 20.`,
        dato: `${d > 0 ? "+" : ""}${Math.round(d)} entre el 10 y el 20`,
      };
    }
  }
  if (!marco) {
    // Si el oro no dice nada llamativo, la capa la ocupa la métrica que más
    // se salió de lo normal de esa persona, para el lado que sea.
    let peor: { m: Metrica; d: NonNullable<ReturnType<typeof desvio>> } | null = null;
    for (const m of METRICAS) {
      const d = desvio(m);
      if (!d || !d.fuerte) continue;
      if (!peor || Math.abs(d.valor - d.base.mediana) / (Math.abs(d.base.mediana) || 1) > Math.abs(peor.d.valor - peor.d.base.mediana) / (Math.abs(peor.d.base.mediana) || 1)) {
        peor = { m, d };
      }
    }
    if (peor) {
      marco = {
        texto: `${peor.m.etiqueta}: ${formatearMetrica(peor.m, peor.d.valor)}, contra ${formatearMetrica(peor.m, peor.d.base.mediana)} que es tu mediana.`,
        dato: `sobre ${peor.d.base.muestra} partidas tuyas`,
      };
    }
  }

  // ── Lo que hiciste bien ─────────────────────────────────────────────────
  // La métrica donde más por encima de lo suyo estuvo. Existe casi siempre,
  // incluso en una derrota — que es justamente el punto.
  let bien: CapaDiagnostico | null = null;
  let mejor: { m: Metrica; d: NonNullable<ReturnType<typeof desvio>>; dist: number } | null = null;
  for (const m of METRICAS) {
    const d = desvio(m);
    if (!d || !d.bueno) continue;
    const dist = Math.abs(d.valor - d.base.mediana) / (Math.abs(d.base.mediana) || 1);
    if (!mejor || dist > mejor.dist) mejor = { m, d, dist };
  }
  if (mejor) {
    bien = {
      texto: `${mejor.m.etiqueta} mejor que lo habitual tuyo: ${formatearMetrica(mejor.m, mejor.d.valor)} contra ${formatearMetrica(mejor.m, mejor.d.base.mediana)}.`,
      dato: `tu mediana sobre ${mejor.d.base.muestra}`,
    };
  }

  // ── Para la próxima ─────────────────────────────────────────────────────
  // La métrica donde MÁS abajo de lo suyo estuvo, convertida en un número
  // verificable: no "jugá mejor la línea", sino "llegá al 10 con ≥ −250".
  let proxima: CapaDiagnostico | null = null;
  let flojo: { m: Metrica; d: NonNullable<ReturnType<typeof desvio>>; dist: number } | null = null;
  for (const m of METRICAS) {
    const d = desvio(m);
    if (!d || d.bueno) continue;
    const dist = Math.abs(d.valor - d.base.mediana) / (Math.abs(d.base.mediana) || 1);
    if (!flojo || dist > flojo.dist) flojo = { m, d, dist };
  }
  if (flojo) {
    const m = flojo.m;
    const meta = objetivoSugerido(flojo.d.base);
    proxima = {
      texto: m.masEsMejor
        ? `Para la próxima: ${m.etiqueta.toLowerCase()} de ${formatearMetrica(m, meta)} o más.`
        : `Para la próxima: ${m.etiqueta.toLowerCase()} de ${formatearMetrica(m, meta)} o menos.`,
      dato: `esta vez: ${formatearMetrica(m, flojo.d.valor)}`,
    };
  }

  return { marco, bien, proxima, muestra };
}

// ── 8.5 · Patrones ────────────────────────────────────────────────────────

export interface Patron {
  metrica: ClaveMetrica;
  /** La frase, con la frecuencia adentro: "en 5 de tus últimas 7…". */
  texto: string;
  /** Cuántas de la ventana cumplen la condición. */
  cuantas: number;
  /** El tamaño de la ventana efectivamente mirada. */
  de: number;
  /** A favor o en contra. */
  tono: "good" | "bad";
}

/**
 * Cuántas de la ventana tienen que caer del mismo lado para que sea un
 * patrón y no una racha corta. Sobre 10 partidas, 7 es el punto donde deja
 * de parecer azar sin volverse tan exigente que nunca salte nada.
 */
const FRACCION_PATRON = 0.7;

/**
 * Qué viene pasando seguido en las últimas `ventana` partidas, contra la
 * línea de base de TODO lo anterior.
 *
 * El plan es explícito: no sacar conclusiones de una partida. Acá una
 * observación necesita repetirse en la mayoría de una ventana, y el texto
 * siempre dice sobre cuántas — "en 7 de tus últimas 10" es una afirmación
 * que se puede verificar; "venís flojo de CS" no.
 */
export function patrones(partidas: PartidaMejora[], ventana = 10): Patron[] {
  // Más nuevas primero: la ventana son las últimas.
  const orden = [...partidas].sort((a, b) => (a.playedAt < b.playedAt ? 1 : -1));
  const recientes = orden.slice(0, ventana);
  const anteriores = orden.slice(ventana);
  if (recientes.length < 5) return [];

  const salida: Patron[] = [];
  for (const m of METRICAS) {
    // La base es lo ANTERIOR a la ventana. Si se incluyeran las recientes,
    // la ventana estaría empujando su propia mediana y un cambio real se
    // vería más chico de lo que es.
    const base = baselineDe(anteriores, m.clave);
    if (!base) continue;
    const valores = recientes.map((p) => m.de(p)).filter((v): v is number => v !== null && Number.isFinite(v));
    if (valores.length < 5) continue;
    // Los dos lados se cuentan por separado y en SENTIDO ESTRICTO: quedar
    // exactamente en la mediana no es ni mejor ni peor, y contarlo de un
    // lado era un bug con dientes. `muertes` es un entero y la mediana del
    // grupo es 6,0 clavado, así que media ventana empata: con
    // `mejores = total - peores`, nueve partidas de exactamente tu mediana
    // publicaban "en 9 de tus últimas 10 las muertes quedaron por debajo de
    // tu mediana", que es falso. Los empates ahora diluyen, que es lo
    // correcto: si siempre caés justo en tu mediana, no hay patrón.
    const peores = valores.filter((v) => (m.masEsMejor ? v < base.mediana : v > base.mediana)).length;
    const mejores = valores.filter((v) => (m.masEsMejor ? v > base.mediana : v < base.mediana)).length;
    const piso = Math.ceil(valores.length * FRACCION_PATRON);
    if (peores >= piso) {
      salida.push({
        metrica: m.clave,
        texto: `En ${peores} de tus últimas ${valores.length}, ${m.etiqueta.toLowerCase()} quedó ${m.masEsMejor ? "por debajo" : "por encima"} de tu mediana (${formatearMetrica(m, base.mediana)}).`,
        cuantas: peores,
        de: valores.length,
        tono: "bad",
      });
    } else if (mejores >= piso) {
      salida.push({
        metrica: m.clave,
        texto: `En ${mejores} de tus últimas ${valores.length}, ${m.etiqueta.toLowerCase()} quedó ${m.masEsMejor ? "por encima" : "por debajo"} de tu mediana (${formatearMetrica(m, base.mediana)}).`,
        cuantas: mejores,
        de: valores.length,
        tono: "good",
      });
    }
  }
  // Lo que más se repite primero.
  return salida.sort((a, b) => b.cuantas / b.de - a.cuantas / a.de);
}

// ── 8.6 · Progreso ────────────────────────────────────────────────────────

export interface Progreso {
  metrica: ClaveMetrica;
  /** De la más vieja a la más nueva, para leerla como una línea de tiempo. */
  puntos: { valor: number; playedAt: string; win: boolean }[];
  /** La mediana de los primeros contra la de los últimos, para decir si se movió. */
  antes: number;
  ahora: number;
  /** Ya con el signo "bueno" aplicado: positivo = mejoró, sea cual sea la métrica. */
  mejoro: boolean;
  muestra: number;
}

/**
 * Cómo viene evolucionando una métrica contra uno mismo.
 *
 * Parte la ventana al medio y compara las dos mitades por mediana, no por
 * promedio: una partida catastrófica corre el promedio entero y haría decir
 * "empeoraste" a alguien que mejoró en nueve de diez.
 */
export function progreso(partidas: PartidaMejora[], clave: ClaveMetrica, ventana = 20): Progreso | null {
  const m = metrica(clave);
  const orden = [...partidas].sort((a, b) => (a.playedAt < b.playedAt ? -1 : 1));
  const puntos = orden
    .map((p) => ({ valor: m.de(p), playedAt: p.playedAt, win: p.win }))
    .filter((x): x is { valor: number; playedAt: string; win: boolean } => x.valor !== null && Number.isFinite(x.valor))
    .slice(-ventana);
  if (puntos.length < MINIMO_BASELINE) return null;

  const mitad = Math.floor(puntos.length / 2);
  const medianaDe = (xs: number[]) => percentil([...xs].sort((a, b) => a - b), 0.5);
  const antes = medianaDe(puntos.slice(0, mitad).map((x) => x.valor));
  const ahora = medianaDe(puntos.slice(mitad).map((x) => x.valor));
  return {
    metrica: clave,
    puntos,
    antes,
    ahora,
    mejoro: m.masEsMejor ? ahora > antes : ahora < antes,
    muestra: puntos.length,
  };
}

// ── 8.7 · Matchups ────────────────────────────────────────────────────────

/** Con menos cruces que esto no se dice nada de un matchup: 2-1 no es un dato. */
export const MINIMO_MATCHUP = 4;

export interface MatchupMejora {
  /** Contra quién. Es la clave del cruce. */
  rival: string;
  /** El campeón con el que más veces te lo cruzaste, para dar contexto. */
  propio: string;
  /** Cuántos campeones distintos usaste en ese cruce. >1 se dice en pantalla. */
  propios: number;
  partidas: number;
  victorias: number;
  /** Mediana propia de diferencia de oro @10 en ESE cruce. Null si no hay dato. */
  goldDiff10: number | null;
  /** La misma mediana pero de TODAS tus partidas, para tener contra qué leerla. */
  goldDiff10General: number | null;
}

/**
 * Los cruces de línea que se repiten, medidos contra vos mismo.
 *
 * **Se agrupa por RIVAL, no por el par (tu campeón, rival).** Las dos cosas
 * se pueden llamar "matchup" y la elección la decidió el conteo: sobre las
 * 1.276 partidas guardadas, agrupando por el par solo 22 cruces llegan a
 * cuatro partidas y pertenecen a 4 de los 14 jugadores — la sección no
 * existiría para diez personas. Agrupando por rival son 83 cruces y 11 de
 * los 14. Ver DECISIONES.
 *
 * Y además es la unidad de aprendizaje más útil: el campeón que llevás
 * cambia, el que te toca enfrente es lo que aprendés a manejar. Con qué lo
 * jugaste sigue estando, al costado.
 *
 * No hay un "este matchup es malo" absoluto: lo que se dice es que en ESE
 * cruce salís del minuto 10 peor (o mejor) de lo que salís normalmente. Eso
 * es comparable y es tuyo; un winrate sacado de toda la región no lo sería.
 */
export function matchupsDeMejora(partidas: PartidaMejora[]): MatchupMejora[] {
  const m10 = metrica("goldDiff10");
  const generalValores = partidas.map((p) => m10.de(p)).filter((v): v is number => v !== null);
  const general =
    generalValores.length >= MINIMO_BASELINE ? percentil([...generalValores].sort((a, b) => a - b), 0.5) : null;

  const porRival = new Map<string, PartidaMejora[]>();
  for (const p of partidas) {
    if (!p.oponente) continue;
    const arr = porRival.get(p.oponente) ?? [];
    arr.push(p);
    porRival.set(p.oponente, arr);
  }

  const salida: MatchupMejora[] = [];
  for (const [rival, ps] of porRival) {
    if (ps.length < MINIMO_MATCHUP) continue;
    const frecuencia = new Map<string, number>();
    for (const p of ps) frecuencia.set(p.champion, (frecuencia.get(p.champion) ?? 0) + 1);
    let propio = ps[0].champion;
    let mejor = 0;
    for (const [c, n] of frecuencia) {
      if (n > mejor) {
        propio = c;
        mejor = n;
      }
    }
    const valores = ps.map((p) => m10.de(p)).filter((v): v is number => v !== null);
    salida.push({
      rival,
      propio,
      propios: frecuencia.size,
      partidas: ps.length,
      victorias: ps.filter((p) => p.win).length,
      goldDiff10: valores.length > 0 ? percentil([...valores].sort((a, b) => a - b), 0.5) : null,
      goldDiff10General: general,
    });
  }
  // Los que más se repiten primero: son los que más vale la pena trabajar.
  return salida.sort((a, b) => b.partidas - a.partidas);
}

// ── 8.3 y 8.4 · Objetivos y su evaluación ─────────────────────────────────

export type Comparador = "gte" | "lte";

export interface Objetivo {
  id: string;
  puuid: string;
  metrica: ClaveMetrica;
  comparador: Comparador;
  umbral: number;
  /** Sobre cuántas partidas se evalúa. */
  ventana: number;
  creadoAt: string;
  cerradoAt: string | null;
}

export interface PartidaEvaluada {
  matchId: string;
  playedAt: string;
  win: boolean;
  valor: number;
  cumplida: boolean;
}

export interface EvaluacionObjetivo {
  objetivo: Objetivo;
  /** De la más nueva a la más vieja. Solo las que entran en la ventana. */
  partidas: PartidaEvaluada[];
  cumplidas: number;
  /** Las que entraron: puede ser menor que la ventana si todavía no jugó tantas. */
  evaluadas: number;
  /** La frase del objetivo, ya armada: "Llegar @10 con ≥ −250 de oro". */
  enunciado: string;
}

/** "Llegar @10 con −250 de oro o más" — el objetivo dicho en una línea. */
export function enunciadoDeObjetivo(o: Pick<Objetivo, "metrica" | "comparador" | "umbral">): string {
  const m = metrica(o.metrica);
  const v = formatearMetrica(m, o.umbral);
  return o.comparador === "gte" ? `${m.etiqueta} de ${v} o más` : `${m.etiqueta} de ${v} o menos`;
}

/**
 * Cumplido o no, partida por partida, desde que se creó el objetivo.
 *
 * Solo cuentan las partidas POSTERIORES a la creación: un objetivo que se
 * evaluara sobre lo ya jugado nacería cumplido o fallado sin que nadie
 * hubiera intentado nada, y eso no es un objetivo, es una consulta.
 */
export function evaluarObjetivo(o: Objetivo, partidas: PartidaMejora[]): EvaluacionObjetivo {
  const m = metrica(o.metrica);
  const desde = Date.parse(o.creadoAt);
  const evaluadas = partidas
    .filter((p) => Date.parse(p.playedAt) >= desde)
    .sort((a, b) => (a.playedAt < b.playedAt ? 1 : -1))
    .map((p) => ({ p, valor: m.de(p) }))
    .filter((x): x is { p: PartidaMejora; valor: number } => x.valor !== null && Number.isFinite(x.valor))
    .slice(0, o.ventana)
    .map(({ p, valor }) => ({
      matchId: p.matchId,
      playedAt: p.playedAt,
      win: p.win,
      valor,
      cumplida: o.comparador === "gte" ? valor >= o.umbral : valor <= o.umbral,
    }));

  return {
    objetivo: o,
    partidas: evaluadas,
    cumplidas: evaluadas.filter((x) => x.cumplida).length,
    evaluadas: evaluadas.length,
    enunciado: enunciadoDeObjetivo(o),
  };
}
