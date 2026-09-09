import { rankScore } from "./ladder";
import { divisionFromRiot, tierKeyFromRiot } from "./mapping";
import type { RoleKey, TierKey } from "./types";

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

/**
 * El lunes en que la liga arranca de verdad. NADA anterior a esta fecha
 * cuenta: ni aparece en la tabla ni se cierra ni se anuncia.
 *
 * Hace falta porque la app tiene meses de LP guardado y la liga no. Sin esta
 * línea, la primera corrida del cron encontró una semana "terminada" del 24
 * de agosto —anterior a que la liga existiera—, la cerró y le anunció un
 * ganador al Discord. Un campeón de una competencia que todavía no había
 * empezado.
 *
 * Es el lunes 7/9 a las 23:30 hora argentina (02:30 UTC del 8), que es la hora
 * que se anunció en el Discord.
 */
export const LIGA_INICIO = new Date(Date.UTC(2026, 8, 8, 2, 30, 0));

/**
 * Si esa semana es de la liga. Alcanza con que TERMINE después del arranque:
 * la primera semana empieza a mitad de camino —el pistoletazo fue un lunes a
 * las 23:30— y aun así es una semana de la liga, solo que más corta.
 */
export function esSemanaDeLiga(inicio: Date): boolean {
  return finDeSemana(inicio).getTime() > LIGA_INICIO.getTime();
}

/**
 * La ventana que se mide de verdad para esa semana.
 *
 * Normalmente es el lunes entero, pero la PRIMERA arranca cuando arrancó la
 * liga y no antes: si contara desde el lunes 00:00, las horas jugadas antes
 * del pistoletazo entrarían al marcador y el campeonato empezaría con gente
 * ya puntuando.
 */
export function ventanaDeSemana(ahora: Date = new Date()): { desde: Date; hasta: Date } {
  const inicio = inicioDeSemana(ahora);
  return {
    desde: new Date(Math.max(inicio.getTime(), LIGA_INICIO.getTime())),
    hasta: finDeSemana(inicio),
  };
}

/** Lo mismo para una semana puntual (la que cierra el cron). */
export function ventanaDe(inicio: Date): { desde: Date; hasta: Date } {
  return {
    desde: new Date(Math.max(inicio.getTime(), LIGA_INICIO.getTime())),
    hasta: finDeSemana(inicio),
  };
}

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
  /**
   * Partidas netas: victorias menos derrotas. Es lo que puntúa con
   * MODO_LIGA = "netas", y vale lo mismo para todos sin importar en qué
   * cuenta se juegue.
   */
  netas: number;
  /**
   * El LP neto de la semana, con el tope por victoria. Con MODO_LIGA =
   * "netas" NO decide nada — se sigue calculando y mostrando como dato de
   * contexto, porque es lo que la gente mira para entender su semana.
   */
  lpNeto: number;
  /**
   * Cuánto LP le recortó el tope esta semana. 0 en la enorme mayoría de los
   * casos. Se muestra para que nadie saque la cuenta a mano y crea que la
   * tabla está mal.
   */
  lpRecortado: number;
  victorias: number;
  derrotas: number;
  /** Si todavía no jugó nada esta semana. Se muestra distinto de un 0 conseguido jugando. */
  sinJugar: boolean;
  /** Dónde está parado ahora — el rango de su última foto. Null si no tiene ninguna. */
  rango: { tier: TierKey; division: number; lp: number } | null;
  /**
   * Cómo fue variando el NETO dentro de la semana, para dibujar la curva.
   * Arranca siempre en 0 —el punto de partida de cada uno— y de ahí sube o
   * baja. Antes eran los puntos absolutos (2400 y pico), y con eso la curva no
   * podía "ir en negativo": se veía subir o bajar, pero no contra qué.
   *
   * Nunca viene con menos de dos valores: con uno solo no hay línea que
   * dibujar y la fila quedaba con un gráfico vacío al lado de un 0, que es
   * justo cuando más falta hace ver la línea plana.
   */
  serie: number[];
  /** Si entró después de que la semana arrancó, cuándo. Null si compitió desde el principio. */
  entroTarde: string | null;
  /** Con qué racha viene dentro de la semana. Null si no jugó. */
  racha: { resultado: "W" | "L"; cantidad: number } | null;
  /** Con qué campeón y en qué línea jugó la semana. Null si no jugó. */
  champion: string | null;
  linea: RoleKey | null;
  /** Las últimas partidas de la semana con el LP de cada una, para abrir la fila. */
  ultimas: PartidaLiga[];
}

export interface Participante {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  /**
   * Desde cuándo compite. Null si se anotó antes de que arrancara la semana.
   * El que entra a mitad de semana empieza a contar ahí y no antes: si no,
   * bastaría con mirar cómo viene la tabla y anotarse solo cuando conviene.
   */
  desde?: Date | null;
}

/** Una partida de la semana, con lo que le movió el LP. */
export interface PartidaLiga {
  matchId: string;
  champion: string | null;
  win: boolean;
  playedAt: string;
  /**
   * Lo que sumó o restó esa partida. Null si no se pudo atribuir.
   *
   * Sale de comparar dos fotos consecutivas de lp_snapshots: la diferencia de
   * `wins`/`losses` dice cuántas partidas pasaron en el medio y la de puntos
   * cuánto se movió. Solo se atribuye cuando en ese tramo hubo UNA sola
   * partida, que con el cron cada 15 minutos y partidas de ~30 es el caso
   * normal.
   *
   * Si cayeron dos o más en el mismo tramo queda en null y NO se reparte. Un
   * reparto en partes iguales le pondría +5 a una DERROTA, y todo esto existe
   * justamente para que el grupo pueda verificar el cálculo: un número
   * inventado que contradice el resultado destruye lo único que aporta.
   */
  lp: number | null;
  /** Por qué no hay número: "varias" = cayeron juntas en el mismo tramo. Null si sí lo hay. */
  sinLp: "varias" | "sin-foto" | null;
}

/**
 * Le pone a cada partida el LP que movió, cruzando las fotos con los horarios.
 *
 * Existe porque el grupo desconfía del cálculo —con razón: el LP por victoria
 * no es igual para todos— y la forma de terminar la discusión es mostrar
 * partida por partida cuánto dio cada una.
 */
export function lpPorPartida(snapshots: Snapshot[], partidas: PartidaLiga[]): PartidaLiga[] {
  const fotos = [...snapshots].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const porMatch = new Map<string, { lp: number | null; sinLp: "varias" | "sin-foto" | null }>();

  for (let i = 1; i < fotos.length; i++) {
    const a = fotos[i - 1];
    const b = fotos[i];
    const jugadas = b.wins - a.wins + (b.losses - a.losses);
    if (jugadas <= 0) continue;
    const desde = Date.parse(a.captured_at);
    const hasta = Date.parse(b.captured_at);
    const enElTramo = partidas.filter((m) => {
      const t = Date.parse(m.playedAt);
      return t > desde && t <= hasta;
    });
    if (enElTramo.length === 0) continue;
    if (enElTramo.length > 1) {
      for (const m of enElTramo) porMatch.set(m.matchId, { lp: null, sinLp: "varias" });
      continue;
    }
    porMatch.set(enElTramo[0].matchId, { lp: puntos(b) - puntos(a), sinLp: null });
  }

  return partidas.map((m) => {
    const v = porMatch.get(m.matchId);
    return { ...m, lp: v?.lp ?? null, sinLp: v ? v.sinLp : "sin-foto" };
  });
}

/** Partidas de la semana, contadas de verdad. Ver la nota en tablaDeLaSemana. */
export interface RecordSemanal {
  victorias: number;
  derrotas: number;
  /**
   * La racha con la que viene DENTRO de la semana, no la de la season. En una
   * liga que dura siete días, "ganó las últimas cuatro" dice mucho más que su
   * racha histórica: es lo que está pasando ahora en la competencia.
   */
  racha: { resultado: "W" | "L"; cantidad: number } | null;
  /** El campeón que más jugó DENTRO de la semana. Null si no jugó. */
  champion: string | null;
  /** La línea en la que más jugó DENTRO de la semana. Null si no jugó o si Riot no la dio. */
  linea: RoleKey | null;
  /**
   * Los resultados de la semana en orden cronológico (true = ganó). Con
   * MODO_LIGA = "netas" es lo que dibuja la curva: si el número grande son
   * partidas netas, la curva tiene que contar lo mismo. Una curva de LP al
   * lado de un puntaje de netas se contradice — y justo la iban a mirar los
   * que ya desconfían del cálculo.
   */
  secuencia: boolean[];
  /** Las últimas de la semana, de la más nueva a la más vieja, con su LP. */
  ultimas: PartidaLiga[];
}

/**
 * Con qué se puntúa la liga.
 *
 * - "netas": cada victoria vale 1 y cada derrota resta 1. El LP real no entra
 *   en el marcador.
 * - "lp": el LP neto de la semana, con el tope por victoria de más abajo.
 *
 * Está en "netas" porque el LP no es comparable entre cuentas: Riot le da
 * bastante más por partida a una cuenta nueva, y con el tope solo se acortaba
 * la diferencia (sus victorias seguían valiendo 22 contra 18) — el grupo
 * entero se quejó de eso. Contando partidas netas, una victoria vale
 * exactamente lo mismo para todos, que es lo que se pidió.
 *
 * OJO con lo que esto NO arregla: quien juega en una cuenta muy por debajo de
 * su nivel gana más PARTIDAS, no solo más LP por partida. Eso no lo empareja
 * ningún esquema de puntaje; lo único que lo emparejaría es que esa cuenta no
 * puntúe. Queda dicho para no creer que está resuelto del todo.
 *
 * Es un solo valor y está pensado para volver a "lp" cuando el grupo esté
 * todo en cuentas comparables.
 */
export const MODO_LIGA: "netas" | "lp" = "netas";

/** El número con el que se ordena y se corona, según el modo. */
export function puntajeDe(f: { netas: number; lpNeto: number }): number {
  return MODO_LIGA === "netas" ? f.netas : f.lpNeto;
}

/**
 * Lo máximo que puede sumar UNA victoria.
 *
 * Riot le da bastante más LP por partida a una cuenta nueva, porque su MMR
 * real está muy por encima del rango que muestra. En una liga que se mide por
 * LP neto eso no es jugar mejor, es tener otra tabla de premios: se vio
 * 4V-1D dando +141 al lado de otro 4V-1D dando +54.
 *
 * En equilibrio una victoria da 15-20 LP, y alguien que viene subiendo bien
 * ronda los 22. De 25 para arriba ya es una cuenta sin asentar. El tope en 22
 * deja pasar entera cualquier victoria normal —incluso una buena racha— y solo
 * recorta las infladas.
 *
 * Es UN número y está pensado para tocarse: subirlo hace la liga más
 * permisiva, bajarlo la aplana.
 */
export const TOPE_LP_POR_VICTORIA = 22;

/**
 * El neto de la semana con el tope aplicado, y cuánto se recortó.
 *
 * Se camina foto por foto en vez de restar las dos puntas, porque el tope es
 * POR VICTORIA y para eso hay que saber cuántas partidas hubo en cada tramo.
 * Eso se puede: lp_snapshots guarda `wins` y `losses` al lado del LP, así que
 * la diferencia entre dos fotos consecutivas dice exactamente cuántas se
 * ganaron y cuántas se perdieron en el medio. No es una estimación.
 *
 * Los puntos se comparan con `puntos()` (rankScore) y no con el LP crudo: al
 * ascender de división el LP vuelve a cero y la resta daría un desplome.
 *
 * Las DERROTAS no se tocan. El inflado de una cuenta nueva también hace que
 * pierda menos por derrota, pero taparlo pediría un piso —o sea inventarle
 * derrotas más caras que las reales— y eso ya no es emparejar la cancha, es
 * penalizar. Queda como diferencia conocida y chica al lado de la de las
 * victorias.
 */
function netoConTope(tramos: Snapshot[]): { neto: number; recortado: number } {
  let neto = 0;
  let recortado = 0;
  for (let i = 1; i < tramos.length; i++) {
    const a = tramos[i - 1];
    const b = tramos[i];
    const delta = puntos(b) - puntos(a);
    const ganadas = b.wins - a.wins;
    // Solo se recorta una subida que venga de victorias contadas. Si el tramo
    // no registra partidas, el movimiento es de Riot (una corrección, un
    // decay) y no hay nada que topear.
    if (delta > 0 && ganadas > 0) {
      const tope = ganadas * TOPE_LP_POR_VICTORIA;
      if (delta > tope) recortado += delta - tope;
      neto += Math.min(delta, tope);
    } else {
      neto += delta;
    }
  }
  return { neto, recortado };
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
    // El arranque de CADA uno: el de la semana, o el momento en que se anotó
    // si fue después.
    const suDesde = Math.max(desde, p.desde ? p.desde.getTime() : 0);
    const suyas = (porPuuid.get(p.puuid) ?? []).sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
    const dentro = suyas.filter((s) => {
      const t = Date.parse(s.captured_at);
      return t >= suDesde && t < hasta;
    });
    const previas = suyas.filter((s) => Date.parse(s.captured_at) < suDesde);
    const base = previas.length > 0 ? previas[previas.length - 1] : dentro[0];
    const ultima = dentro.length > 0 ? dentro[dentro.length - 1] : base;

    const { victorias, derrotas, racha, champion, linea, secuencia, ultimas } =
      recordPorPuuid.get(p.puuid) ?? { victorias: 0, derrotas: 0, racha: null, champion: null, linea: null, secuencia: [], ultimas: [] };
    // El neto de cada foto contra el punto de partida. Si no hay ninguna foto
    // dentro de la ventana todavía no se movió: línea plana en 0, no un
    // gráfico vacío.
    // La curva se arma con los MISMOS tramos topeados que el número: si el
    // gráfico dibujara el neto crudo, la línea y el "+68" de al lado se
    // contradirían.
    const tramos = base ? [base, ...dentro] : dentro;
    let serieNeta: number[];
    if (MODO_LIGA === "netas") {
      // Un escalón por partida: +1 ganando, −1 perdiendo. Es literalmente el
      // puntaje contándose.
      let acum = 0;
      const pasos = secuencia.map((gano) => (acum += gano ? 1 : -1));
      serieNeta = pasos.length > 0 ? [0, ...pasos] : [0, 0];
    } else {
      const acumulada: number[] = [0];
      for (let i = 1; i < tramos.length; i++) {
        acumulada.push(netoConTope(tramos.slice(0, i + 1)).neto);
      }
      serieNeta = acumulada.length > 1 ? acumulada : [0, 0];
    }
    const entroTarde = suDesde > desde ? new Date(suDesde).toISOString() : null;
    const rango = ultima
      ? { tier: tierKeyFromRiot(ultima.tier), division: divisionFromRiot(ultima.division), lp: ultima.lp }
      : null;

    if (!base || !ultima) {
      // Sin una sola foto no hay nada que medir, pero igual va la línea
      // plana en 0: un gráfico vacío parece roto, y "no se movió" es
      // información.
      filas.push({ ...p, netas: victorias - derrotas, lpNeto: 0, lpRecortado: 0, victorias, derrotas, racha, champion, linea, ultimas, sinJugar: victorias + derrotas === 0, rango, serie: [0, 0], entroTarde });
      continue;
    }

    const { neto, recortado } = netoConTope(tramos);
    filas.push({
      ...p,
      netas: victorias - derrotas,
      lpNeto: neto,
      lpRecortado: recortado,
      victorias,
      derrotas,
      racha,
      champion,
      linea,
      ultimas,
      sinJugar: victorias + derrotas === 0,
      rango,
      // Relativa al punto de partida y no en puntos absolutos: lo que la
      // liga mide es el neto, así que la curva arranca en 0 y de ahí sube o
      // baja. Con dos fotos iguales queda plana en 0, que es lo correcto.
      serie: serieNeta,
      entroTarde,
    });
  }

  // Más LP primero; a igual LP, el que jugó menos partidas para conseguirlo.
  // Y el que no jugó nada va al fondo aunque su neto sea 0, porque un 0 sin
  // jugar no es lo mismo que un 0 después de veinte partidas.
  return filas.sort((a, b) => {
    if (a.sinJugar !== b.sinJugar) return a.sinJugar ? 1 : -1;
    const pa = puntajeDe(a);
    const pb = puntajeDe(b);
    if (pb !== pa) return pb - pa;
    return a.victorias + a.derrotas - (b.victorias + b.derrotas);
  });
}

/** La hora, en argentino: "23:30". */
function horaCorta(d: Date): string {
  return new Date(d.getTime() - ARG_OFFSET_MS).toISOString().slice(11, 16);
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
  const { desde, hasta } = ventanaDe(inicio);
  const fin = new Date(hasta.getTime() - 1);
  const plata = premio ? ` Hay **${premio}** para el que gana.` : " Hay premio $$$ para el que gana.";
  // Cuando la liga arranca a mitad de semana se dice la HORA exacta y no
  // "desde ahora": el aviso se manda un rato antes para que la gente tenga
  // tiempo de reaccionar, así que "ahora" sería mentira en el momento de
  // leerlo. Poner el lunes tampoco sirve: prometería horas que no cuentan.
  const cuando =
    desde.getTime() > inicio.getTime()
      ? `**Desde las ${horaCorta(desde)} de hoy** hasta el **domingo ${fechaCorta(fin)} a las 23:59**`
      : `Del **lunes ${fechaCorta(desde)}** al **domingo ${fechaCorta(fin)}**`;
  return [
    "🏆 **ARRANCA LA LIGA DE LA GRIETA** 🏆",
    "",
    `${cuando}, y se mide una sola cosa: ${
      MODO_LIGA === "netas"
        ? "**cuántas partidas netas ganás en la semana** (victorias menos derrotas)"
        : "**cuánto LP neto ganás en la semana**"
    }.${plata}`,
    "",
    MODO_LIGA === "netas"
      ? "No importa en qué elo estés ni cuánto LP te dé Riot por partida: una victoria vale lo mismo para todos."
      : "No importa en qué elo estés — importa cuánto te movés. El que sube 200 puntos desde Plata le gana al que sube 50 desde Diamante.",
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
  // El puntaje del modo activo, no el LP: con MODO_LIGA = "netas" el LP no
  // decide nada y anunciar por LP contradiría a la tabla.
  const pg = puntajeDe(g);
  const signo = pg >= 0 ? "+" : "";
  const unidad = MODO_LIGA === "netas" ? (Math.abs(pg) === 1 ? "partida neta" : "partidas netas") : "puntos";
  const lineas = [
    `🏆 **CERRÓ LA SEMANA** — ${fechaCorta(inicio)} al ${fechaCorta(fin)}`,
    "",
    pg > 0
      ? `Gana **${g.name}** con **${signo}${pg} ${unidad}** en ${g.victorias}V-${g.derrotas}D. A cobrar.`
      : `Gana **${g.name}**… con **${signo}${pg} ${unidad}**. Ganó porque los demás estuvieron peor, que es la victoria más triste que hay.`,
    "",
  ];

  const resto = jugaron.slice(1, 5);
  if (resto.length > 0) {
    lineas.push("**Detrás:**");
    for (const [i, f] of resto.entries()) {
      const pf = puntajeDe(f);
      lineas.push(`${i + 2}. ${f.name} — ${pf >= 0 ? "+" : ""}${pf} (${f.victorias}V-${f.derrotas}D)`);
    }
    lineas.push("");
  }
  lineas.push("El lunes a las 00:00 arranca de cero. 🔁");
  return lineas.join("\n");
}
