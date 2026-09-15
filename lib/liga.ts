import { championLabel } from "./champion-names";
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

/**
 * Cuántas partidas hay que jugar el ÚLTIMO día para llevarse el premio.
 *
 * Existe por una jugada que ya se vio: agarrar ventaja el martes y no volver a
 * jugar para no arriesgarla. Una liga en la que conviene NO jugar está rota, y
 * el domingo es el día en que eso se nota.
 *
 * No arregla el parking de toda la semana —se puede no jugar de martes a
 * sábado y hacer las tres el domingo a las once de la noche—, para eso haría
 * falta además un mínimo semanal. Es a propósito: se empieza por lo simple.
 */
export const MINIMO_ULTIMO_DIA = 3;

/**
 * Y cuántas hay que jugar en TODA la semana.
 *
 * Es la otra mitad de lo mismo: el mínimo del domingo obliga a aparecer el
 * último día, pero solo con eso se puede parkear de martes a sábado y hacer
 * las tres el domingo a la noche. Con las dos condiciones juntas hay que jugar
 * la semana entera.
 *
 * Diez y no quince: quince era el primer número que se habló y sale a algo más
 * de dos partidas por día, que para este grupo deja a casi todos afuera. Una
 * semana que cierra sin premio porque nadie llegó al mínimo es peor que no
 * tener la regla. Está acá arriba y solo, para moverlo sin buscar nada.
 */
export const MINIMO_SEMANAL = 10;

/**
 * Las últimas 24 horas de la semana: el domingo argentino entero.
 *
 * Se calcula desde el FIN y no desde el lunes, así vale igual para la primera
 * semana de la liga, que arrancó un lunes a las 23:30.
 */
export function ventanaUltimoDia(inicio: Date): { desde: Date; hasta: Date } {
  const fin = finDeSemana(inicio);
  return { desde: new Date(fin.getTime() - 24 * 60 * 60 * 1000), hasta: fin };
}

/** Si el último día ya arrancó: recién ahí el mínimo del domingo tiene sentido. */
export function empezoElUltimoDia(inicio: Date, ahora: Date = new Date()): boolean {
  return ahora.getTime() >= ventanaUltimoDia(inicio).desde.getTime();
}

/**
 * Cuántos días de la semana ya arrancaron, contando el de hoy. Entre 1 y 7.
 *
 * La cuadrícula de días es de días CALENDARIO argentinos, y por eso lo primero
 * que hace es normalizar al lunes 00:00 — pasarle cualquier instante de la
 * semana da lo mismo.
 *
 * Esa normalización no es defensiva de más: ya se rompió. La barra de la semana
 * marcaba "viernes" un sábado porque se le pasaba el arranque de la VENTANA, y
 * la primera semana de la liga arrancó un lunes a las 23:30 — así que los
 * "días" eran bloques de 24 horas corridos desde las 23:30, o sea de viernes
 * 23:30 a sábado 23:30, etiquetados con el día en que EMPIEZAN. Un bloque que
 * es 97% sábado se llamaba viernes. Medido: con el arranque de la ventana daba
 * 5 días corridos, con el lunes 00:00 da 6, que es el correcto.
 */
export function diasCorridos(cualquierDiaDeLaSemana: Date, ahora: Date = new Date()): number {
  const lunes = inicioDeSemana(cualquierDiaDeLaSemana);
  const corridos = Math.floor((ahora.getTime() - lunes.getTime()) / 86400000) + 1;
  return Math.min(7, Math.max(1, corridos));
}

/**
 * El puntaje acumulado al cierre de cada día de la semana, para dibujar la
 * carrera: quién iba ganando el miércoles y cuándo se escapó el que se escapó.
 *
 * Por DÍA y no por partida: cada uno juega una cantidad distinta, así que la
 * partida número 5 de uno y la número 5 de otro pasaron en momentos distintos
 * de la semana y cruzarlas en el mismo eje no significaría nada. El día, en
 * cambio, es el mismo para todos y son siete, que es una cantidad que se lee.
 *
 * El acumulado sale de UNA sola pasada por la secuencia entera: el bonus de
 * racha depende del orden, así que contar cada día por separado daría otro
 * número que el de la tabla y la carrera terminaría en un puesto distinto al
 * del marcador.
 *
 * Arranca siempre en 0 —el lunes todos empiezan igual— así que devuelve un
 * valor más que días corridos. Los días sin jugar repiten el anterior, que es
 * lo que de verdad pasó: no sumó ni perdió nada.
 */
export function puntosPorDia(
  partidas: { win: boolean; playedAt: string }[],
  cualquierDiaDeLaSemana: Date,
  ahora: Date = new Date(),
): number[] {
  // Días CALENDARIO argentinos, no bloques de 24 horas desde el arranque de la
  // ventana. Ver diasCorridos: con el arranque, la primera semana de la liga
  // partía los días a las 23:30 y todo quedaba corrido un día.
  const lunes = inicioDeSemana(cualquierDiaDeLaSemana);
  const dias = diasCorridos(lunes, ahora);
  const enOrden = [...partidas].sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));
  const { acumulado } = puntosDeSecuencia(enOrden.map((p) => p.win));
  const serie = [0];
  let i = 0;
  let ultimo = 0;
  for (let d = 0; d < dias; d++) {
    const cierra = lunes.getTime() + (d + 1) * 86400000;
    while (i < enOrden.length && Date.parse(enOrden[i].playedAt) < cierra) {
      ultimo = acumulado[i];
      i++;
    }
    serie.push(ultimo);
  }
  return serie;
}

/**
 * Los nombres de los SIETE días de la semana, en hora argentina: "lun", "mar"…
 *
 * Se arman acá y no en pantalla porque el huso vive de este lado: el cliente
 * está en el reloj del que mira, y alguien viajando vería la semana corrida un
 * día. Van los siete y no solo los corridos porque la pantalla dibuja la semana
 * ENTERA —con los días que faltan en gris— y el gráfico se queda con los
 * primeros `diasCorridos`, que es lo que tiene datos.
 */
export function etiquetasDeDias(cualquierDiaDeLaSemana: Date): string[] {
  // Normalizado al lunes 00:00 por la misma razón que diasCorridos: con el
  // arranque de la ventana, la primera semana etiquetaba cada bloque con el día
  // en que EMPIEZA, y un bloque de viernes 23:30 a sábado 23:30 se llamaba
  // viernes siendo 97% sábado.
  const lunes = inicioDeSemana(cualquierDiaDeLaSemana);
  return Array.from({ length: 7 }, (_, d) =>
    // Corriendo el reloj, los campos UTC de esta fecha son la hora argentina —
    // el mismo truco que inicioDeSemana.
    new Date(lunes.getTime() + d * 86400000 - ARG_OFFSET_MS).toLocaleDateString("es-AR", {
      weekday: "short",
      timeZone: "UTC",
    })
  );
}

/**
 * El que se lleva el premio: el primero que además cumplió el mínimo del
 * domingo. Puede no haber ninguno, y esa es una respuesta válida — la semana
 * se cierra sin premio.
 */
export function ganadorDe(tabla: FilaLiga[]): FilaLiga | null {
  return tabla.find((f) => !f.sinJugar && f.habilitado) ?? null;
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
   * El puntaje de la semana: lo que decide la liga. Sale de la tabla de puntos
   * —1 por victoria, −0,75 por derrota, 1,25 desde la cuarta al hilo— aplicada
   * a las partidas EN ORDEN. Vale lo mismo para todos sin importar en qué
   * cuenta se juegue, que es lo que se pidió cuando el LP daba 30 por victoria
   * en una cuenta nueva y 18 en una vieja.
   */
  puntos: number;
  /**
   * Victorias menos derrotas, sin la tabla de puntos. Ya no decide nada; se
   * calcula igual porque es la cuenta que la gente hace de cabeza.
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
  /** Cuántas jugó el último día de la semana. Ver MINIMO_ULTIMO_DIA. */
  ultimoDia: number;
  /**
   * Si cumple las dos condiciones para cobrar: el mínimo del último día y el
   * de la semana. Sin esto no cobra, por más arriba que esté en la tabla — la
   * posición sigue siendo la que le dan sus netas, lo que se pierde es el
   * premio.
   */
  habilitado: boolean;
  /** Dónde está parado ahora — el rango de su última foto. Null si no tiene ninguna. */
  rango: { tier: TierKey; division: number; lp: number } | null;
  /**
   * El acumulado al cierre de cada día de la semana: lo que dibuja la carrera
   * que va arriba de la tabla. Arranca siempre en 0 —el lunes todos empiezan
   * igual— y de ahí sube o baja.
   *
   * Antes de esto había una `serie` por PARTIDA, una curvita por fila. Contaba
   * la forma de cada semana por separado pero nunca la carrera, que es la
   * pregunta de una liga: quién iba ganando el miércoles. Por partida no se
   * puede, porque la partida 5 de uno y la 5 de otro pasaron en momentos
   * distintos. Ver puntosPorDia.
   */
  porDia: number[];
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
   * Cómo jugó esa partida. Opcionales por dos motivos: el cierre de semana
   * arma su propio `RecordSemanal` sin estas columnas, y una respuesta anterior
   * al deploy que las agregó no las trae. Si faltan, la línea del historial se
   * dibuja sin el KDA en vez de con ceros — "0/0/0" es un dato, "nada" es la
   * verdad.
   */
  kills?: number;
  deaths?: number;
  assists?: number;
  /**
   * Lo que sumó o restó ESA partida sola. Null si cayó junta con otras.
   *
   * Sale de comparar dos fotos consecutivas de lp_snapshots: la diferencia de
   * `wins`/`losses` dice cuántas partidas pasaron en el medio y la de puntos
   * cuánto se movió. Solo se atribuye cuando en ese tramo hubo UNA sola
   * partida, que con el cron cada 15 minutos y partidas de ~30 es el caso
   * normal.
   */
  lp: number | null;
  /** Por qué no hay número propio: "varias" = cayeron juntas en el mismo tramo. Null si sí lo hay. */
  sinLp: "varias" | "sin-foto" | null;
  /**
   * Cuánto sumó o restó esta partida al puntaje: 1, 1,25 (cuarta al hilo o
   * más) o −0,75. Se guarda por partida y no se recalcula en pantalla porque
   * depende de la RACHA, o sea de las partidas anteriores, que el detalle de
   * las últimas cinco no tiene.
   */
  puntos: number;
  /**
   * El LP del tramo ENTERO cuando cayeron varias partidas entre las mismas dos
   * fotos: el mismo número en todas ellas, mostrado como lo que es.
   *
   * No se reparte en partes iguales, y por eso hay dos campos en vez de uno: un
   * reparto le pondría "+5" a una DERROTA, y todo esto existe justamente para
   * que el grupo pueda verificar el cálculo — un número inventado que
   * contradice el resultado destruye lo único que aporta. El total del tramo,
   * en cambio, es medido: dice "estas dos juntas dieron +18" y eso es cierto.
   */
  lpTramo: number | null;
  /** Cuántas partidas comparten ese `lpTramo`. 0 cuando no aplica. */
  juntas: number;
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
  const porMatch = new Map<
    string,
    { lp: number | null; sinLp: "varias" | "sin-foto" | null; lpTramo: number | null; juntas: number }
  >();

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
    const movio = puntos(b) - puntos(a);
    if (enElTramo.length > 1) {
      // Sin número propio, pero con el del grupo: antes esto era un guion y la
      // pregunta "¿y esta cuánto dio?" se quedaba sin ninguna respuesta.
      for (const m of enElTramo) {
        porMatch.set(m.matchId, { lp: null, sinLp: "varias", lpTramo: movio, juntas: enElTramo.length });
      }
      continue;
    }
    porMatch.set(enElTramo[0].matchId, { lp: movio, sinLp: null, lpTramo: null, juntas: 0 });
  }

  return partidas.map((m) => {
    const v = porMatch.get(m.matchId);
    return {
      ...m,
      lp: v?.lp ?? null,
      sinLp: v ? v.sinLp : "sin-foto",
      lpTramo: v?.lpTramo ?? null,
      juntas: v?.juntas ?? 0,
    };
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
  /** Cuántas jugó dentro de las últimas 24 horas de la semana. */
  ultimoDia: number;
  /** El acumulado al cierre de cada día, para la carrera. Ver puntosPorDia. */
  porDia: number[];
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
export const MODO_LIGA: "puntos" | "netas" | "lp" = "puntos";

/**
 * La tabla de puntos.
 *
 * Una victoria vale 1 y una derrota resta 0,75 — no 1. El castigo por perder
 * fija en qué winrate te conviene jugar más: con −1 el equilibrio está en 50%
 * y jugar de más no suma nada; con −0,5 baja a 33% y la liga la gana el que
 * tiene más tiempo libre (se probó con la tabla de esa semana: el último,
 * 10V-11D, pasaba a primero). Con −0,75 el equilibrio queda en 43%: jugar
 * mucho suma, pero solo si ganás más de dos de cada cinco.
 *
 * Y desde la CUARTA ganada al hilo cada victoria vale 1,25. Es chico a
 * propósito —una racha de seis son 0,50 extra, no da vuelta una tabla— y está
 * para que valga la pena seguir jugando cuando venís bien en vez de guardar la
 * ventaja.
 *
 * OJO con lo que la racha reabre: el que juega en una cuenta muy por debajo de
 * su nivel encadena seis y siete de rutina, y el que juega en su elo real rara
 * vez pasa de cuatro. Es la misma ventaja del smurf que se cerró sacando el
 * LP, más chica. Si se nota, el arreglo es subir RACHA_DESDE o volver
 * PUNTOS_EN_RACHA a 1.
 */
export const PUNTOS_VICTORIA = 1;
export const PUNTOS_DERROTA = -0.75;
export const RACHA_DESDE = 4;
export const PUNTOS_EN_RACHA = 1.25;

/**
 * Lo que vale cada partida de una secuencia, en orden, y el acumulado.
 *
 * Devuelve las dos cosas juntas porque la curva de la fila TIENE que dibujar
 * el mismo acumulado que el número de al lado: si una cuenta la racha y la
 * otra no, el gráfico y el puntaje se contradicen en la misma fila.
 *
 * `secuencia` va de la partida más VIEJA a la más nueva.
 */
export function puntosDeSecuencia(secuencia: boolean[]): { total: number; cadaUna: number[]; acumulado: number[] } {
  let alHilo = 0;
  let acum = 0;
  const cadaUna: number[] = [];
  const acumulado: number[] = [];
  for (const gano of secuencia) {
    if (gano) {
      alHilo++;
      cadaUna.push(alHilo >= RACHA_DESDE ? PUNTOS_EN_RACHA : PUNTOS_VICTORIA);
    } else {
      alHilo = 0;
      cadaUna.push(PUNTOS_DERROTA);
    }
    acum += cadaUna[cadaUna.length - 1];
    // Se redondea en cada paso y no al final: 0,75 y 1,25 son exactos en
    // binario, pero sumarlos veinte veces igual arrastra basura y "3.9999999"
    // en pantalla es peor que cualquier error de redondeo.
    acum = Math.round(acum * 100) / 100;
    acumulado.push(acum);
  }
  return { total: acum, cadaUna, acumulado };
}

/** El número con el que se ordena y se corona, según el modo. */
export function puntajeDe(f: { puntos: number; netas: number; lpNeto: number }): number {
  if (MODO_LIGA === "puntos") return f.puntos;
  return MODO_LIGA === "netas" ? f.netas : f.lpNeto;
}

/**
 * Cómo se escribe un puntaje: "3,25", "4", "−0,75". Coma decimal y sin ceros
 * al pepe — un "4,00" en la columna del marcador es ruido.
 */
export function puntajeTexto(p: number): string {
  const abs = Math.abs(p).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${abs}`;
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

    const { victorias, derrotas, racha, champion, linea, secuencia, ultimas, ultimoDia, porDia } =
      recordPorPuuid.get(p.puuid) ?? { victorias: 0, derrotas: 0, racha: null, champion: null, linea: null, secuencia: [], ultimas: [], ultimoDia: 0, porDia: [0] };
    // Las dos condiciones, juntas: aparecer el último día y haber jugado la
    // semana. Cualquiera de las dos sola se esquiva.
    const habilitado = ultimoDia >= MINIMO_ULTIMO_DIA && victorias + derrotas >= MINIMO_SEMANAL;
    // El neto de cada foto contra el punto de partida. Si no hay ninguna foto
    // dentro de la ventana todavía no se movió: línea plana en 0, no un
    // gráfico vacío.
    // La curva se arma con los MISMOS tramos topeados que el número: si el
    // gráfico dibujara el neto crudo, la línea y el "+68" de al lado se
    // contradirían.
    const tramos = base ? [base, ...dentro] : dentro;
    // El puntaje y la curva salen de la MISMA pasada por la secuencia. Si el
    // número contara la racha y el gráfico no, la fila se contradiría sola.
    const cuenta = puntosDeSecuencia(secuencia);
    const puntos = MODO_LIGA === "puntos" ? cuenta.total : victorias - derrotas;
    const entroTarde = suDesde > desde ? new Date(suDesde).toISOString() : null;
    const rango = ultima
      ? { tier: tierKeyFromRiot(ultima.tier), division: divisionFromRiot(ultima.division), lp: ultima.lp }
      : null;

    if (!base || !ultima) {
      // Sin una sola foto no hay nada que medir, pero igual va la línea
      // plana en 0: un gráfico vacío parece roto, y "no se movió" es
      // información.
      filas.push({ ...p, puntos, netas: victorias - derrotas, lpNeto: 0, lpRecortado: 0, victorias, derrotas, racha, champion, linea, ultimas, ultimoDia, habilitado, sinJugar: victorias + derrotas === 0, rango, porDia, entroTarde });
      continue;
    }

    const { neto, recortado } = netoConTope(tramos);
    filas.push({
      ...p,
      puntos,
      netas: victorias - derrotas,
      lpNeto: neto,
      lpRecortado: recortado,
      victorias,
      derrotas,
      racha,
      champion,
      linea,
      ultimas,
      ultimoDia,
      habilitado,
      sinJugar: victorias + derrotas === 0,
      rango,
      porDia,
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

/**
 * "7 – 13 sept" a partir de la clave de una semana ("2026-09-07").
 *
 * Se formatea en UTC y NO en hora argentina, al revés que todo lo demás que
 * escribe fechas en este repo: la clave de una semana es una fecha de
 * CALENDARIO, no un instante, y `new Date("2026-09-07")` ya es medianoche UTC —
 * pasarla por America/Argentina/Buenos_Aires la corre tres horas atrás y la
 * pantalla diría que la semana arrancó un domingo.
 */
export function rangoDeSemana(clave: string): string {
  const lunes = new Date(`${clave}T00:00:00Z`);
  if (Number.isNaN(lunes.getTime())) return clave;
  const domingo = new Date(lunes.getTime() + 6 * 86400000);
  const mes = (d: Date) => d.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return mes(lunes) === mes(domingo)
    ? `${lunes.getUTCDate()} – ${domingo.getUTCDate()} ${mes(domingo)}`
    : `${lunes.getUTCDate()} ${mes(lunes)} – ${domingo.getUTCDate()} ${mes(domingo)}`;
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

/** "A", "A y B", "A, B y C" — la enumeración de siempre, con "y" antes del último. */
function listaY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * El anuncio del cierre: el podio con una cargada por puesto.
 *
 * La versión vieja era un ranking prolijo —"Gana Fulano con +5. Detrás: 2., 3.,
 * 4."— y un ranking prolijo no lo lee nadie en un canal de amigos. Los textos
 * de acá los escribió el grupo y son fijos a propósito: el primero se los
 * garchó a todos, el segundo no le dio el pitulín, el tercero ni pinchó ni
 * cortó, los del medio son agua y el último nadó en caca.
 *
 * Tres cosas que hay que respetar si se toca:
 *
 * 1. Los puestos se reparten por POSICIÓN en la tabla, no por premio. Y la
 *    línea del último arranca recién en el cuarto puesto: con tres jugadores el
 *    tercero ya tiene la suya, y dos cargadas encima del mismo tipo se leen
 *    como una sola mal escrita.
 * 2. Los del medio van SIN números. El chiste es que no los conoce nadie, y
 *    ponerles el récord al lado los nombra.
 * 3. El premio NO se nombra acá. Llegó a estar —una línea abajo del podio que
 *    aclaraba quién cobraba cuando el primero de la tabla no cumplía los
 *    mínimos— y se sacó a pedido: el anuncio es la cargada y nada más, y la
 *    explicación de los mínimos la da la app. Quien lo vuelva a poner que sepa
 *    que ya se probó y no se quiso.
 */
export function mensajeDeCierre(inicio: Date, tabla: FilaLiga[]): string {
  const fin = new Date(finDeSemana(inicio).getTime() - 1);
  const jugaron = tabla.filter((f) => !f.sinJugar);

  if (jugaron.length === 0) {
    return `🏆 **Cerró la semana** (${fechaCorta(inicio)} – ${fechaCorta(fin)}) y no jugó **nadie**. Un papelón. La semana que viene arranca otra.`;
  }

  // El puntaje Y el récord. Solo el récord no alcanza: con la tabla de puntos
  // dos tipos con 5V-3D pueden estar en puestos distintos, y ahí el anuncio
  // parece mal hecho. Solo el puntaje tampoco: "+4,25" no dice cómo le fue.
  const marcador = (f: FilaLiga) => `${puntajeTexto(puntajeDe(f))} (${f.victorias}V-${f.derrotas}D)`;

  const lineas = [`🏆 **CERRÓ LA SEMANA** — ${fechaCorta(inicio)} al ${fechaCorta(fin)}`, ""];

  const primero = jugaron[0];
  const conQue = primero.champion ? ` con **${championLabel(primero.champion)}**` : "";
  lineas.push(
    puntajeDe(primero) > 0
      ? `🥇 **${primero.name}** ganó la liga${conQue} y se los re garchó a todos. Felicidades 👑 — ${marcador(primero)}`
      : `🥇 **${primero.name}** ganó la liga${conQue}… en verde no terminó nadie, ganó porque los demás estuvieron peor. Felicidades igual 👑 — ${marcador(primero)}`,
  );

  const ultimo = jugaron.length >= 4 ? jugaron[jugaron.length - 1] : null;
  if (jugaron[1]) {
    lineas.push(`🥈 **${jugaron[1].name}** no le dio el pitulín y quedó en segundo lugar — ${marcador(jugaron[1])}`);
  }
  if (jugaron[2]) {
    lineas.push(`🥉 **${jugaron[2].name}** quedó tercero, ni pinchó ni cortó, un tarado jajaja — ${marcador(jugaron[2])}`);
  }
  // El medio puede ser UNO solo (con cinco jugadores lo es siempre), así que la
  // cargada tiene las dos conjugaciones. En plural sobre una persona sola se
  // nota enseguida que es una plantilla, y ahí el chiste se cae.
  const medio = ultimo ? jugaron.slice(3, -1) : jugaron.slice(3);
  if (medio.length === 1) {
    lineas.push(`🫠 **${medio[0].name}**: ni se le paró el pitito, fue agua, no lo conoce nadie.`);
  } else if (medio.length > 1) {
    lineas.push(
      `🫠 ${listaY(medio.map((f) => `**${f.name}**`))}: ni se les paró el pitito, fueron agua, no los conoce nadie.`,
    );
  }
  if (ultimo) {
    lineas.push(`💩 **${ultimo.name}** realmente nadó en caca, quedó último, maleta total. Suerte la próxima — ${marcador(ultimo)}`);
  }

  lineas.push("", "El lunes a las 00:00 arranca de cero. 🔁");
  return lineas.join("\n");
}
