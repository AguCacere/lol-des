import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * La ventana de un torneo: cuándo arranca, cuándo cierra y qué hay que cumplir.
 *
 * Existe porque hasta acá la liga **no tenía fechas: las deducía**.
 * `inicioDeSemana(ahora)` calculaba el lunes y `finDeSemana` le sumaba siete
 * días, y de ahí salía todo. Eso alcanzaba mientras un torneo fuera siempre una
 * semana de lunes a domingo, y dejó de alcanzar el día que hubo que agregarle
 * un lunes porque había gente que no podía jugar el domingo.
 *
 * El "7" no era un número suelto: estaba clavado en `diasCorridos`
 * (`Math.min(7, …)`), en `etiquetasDeDias` (un array de largo 7) y —la peor— en
 * `mensajeDelDia`, que hace `if (dias >= 7) return null`. O sea que el día que
 * se agregaba era justo el día en que el bot dejaba de hablar. Por eso esto no
 * se pudo arreglar moviendo la hora de cierre y nada más.
 *
 * Ahora la ventana es un dato de la tabla `liga_torneos` y todo lo demás la
 * lee. Agregarle un día a un torneo en curso pasa a ser editar un campo.
 *
 * **Sin la tabla, todo sigue funcionando exactamente igual que antes**: si no
 * hay fila para el momento que se pregunta, `torneoDerivado` arma el lunes a
 * domingo de siempre, con los mínimos de siempre. Es el mismo modo de fallar
 * que eligió `/api/liga` con `liga_ajustes`, y es lo que permite desplegar esto
 * sin que la migración esté corrida y sin que nadie note nada.
 */

/**
 * Argentina está en UTC-3 todo el año — no mueve el reloj desde 2009. Si algún
 * día vuelve el horario de verano, esto es lo único que hay que revisar.
 *
 * Vive acá y no en `lib/liga.ts` porque este módulo es la capa de CALENDARIO y
 * aquel la de puntaje: liga.ts importa de acá, nunca al revés.
 */
export const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * El lunes en que la liga arrancó de verdad. NADA anterior a esta fecha cuenta:
 * ni aparece en la tabla ni se cierra ni se anuncia.
 *
 * Hace falta porque la app tiene meses de LP guardado y la liga no. Sin esta
 * línea, la primera corrida del cron encontró una semana "terminada" del 24 de
 * agosto —anterior a que la liga existiera—, la cerró y le anunció un ganador
 * al Discord. Un campeón de una competencia que todavía no había empezado.
 *
 * Es el lunes 7/9 a las 23:30 hora argentina (02:30 UTC del 8), que es la hora
 * que se anunció en el Discord.
 */
export const LIGA_INICIO = new Date(Date.UTC(2026, 8, 8, 2, 30, 0));

/** Los mínimos por defecto, los de siempre. Cada torneo guardado lleva los suyos. */
export const MINIMO_TOTAL_POR_DEFECTO = 10;
export const MINIMO_ULTIMO_POR_DEFECTO = 3;

export interface Torneo {
  /** El id de la fila, o null si es el lunes a domingo deducido. */
  id: string | null;
  nombre: string | null;
  /** Cuándo empieza a contar. Ya viene recortado por LIGA_INICIO. */
  arranca: Date;
  /** El instante en que deja de contar (exclusivo). */
  cierra: Date;
  /** Partidas mínimas en TODO el torneo para cobrar. */
  minimoTotal: number;
  /** Partidas mínimas en el "último día". */
  minimoUltimo: number;
  /**
   * Desde cuándo cuenta el "último día". Se guarda aparte y no se deduce del
   * cierre a propósito: al extender un torneo en curso, mover el último día
   * automáticamente le cambia la regla a alguien que ya organizó su semana
   * para cumplirla el domingo. Guardándolo, se decide.
   */
  ultimoDesde: Date;
  premio: string | null;
  /** false = no hay fila, es el derivado. Sirve para decir en pantalla si es editable. */
  guardado: boolean;
}

/** El lunes 00:00 (hora argentina) de la semana en la que cae `ahora`, como instante real. */
export function inicioDeSemana(ahora: Date = new Date()): Date {
  // Corriendo el reloj, los campos UTC de esta fecha son la hora argentina.
  const arg = new Date(ahora.getTime() - ARG_OFFSET_MS);
  const desdeElLunes = (arg.getUTCDay() + 6) % 7; // domingo=6, lunes=0
  const lunesArg = Date.UTC(arg.getUTCFullYear(), arg.getUTCMonth(), arg.getUTCDate() - desdeElLunes);
  return new Date(lunesArg + ARG_OFFSET_MS);
}

/** El lunes siguiente: el instante en el que una semana normal deja de contar. */
export function finDeSemana(inicio: Date): Date {
  return new Date(inicio.getTime() + 7 * UN_DIA_MS);
}

/**
 * El torneo de siempre —lunes a domingo, mínimos 10 y 3— para cuando no hay
 * fila guardada. Es lo que hace que esto se pueda desplegar antes de correr la
 * migración sin que cambie nada.
 */
export function torneoDerivado(ahora: Date = new Date()): Torneo {
  const lunes = inicioDeSemana(ahora);
  const cierra = finDeSemana(lunes);
  return {
    id: null,
    nombre: null,
    // La PRIMERA semana arranca cuando arrancó la liga y no antes: si contara
    // desde el lunes 00:00, las horas jugadas antes del pistoletazo entrarían
    // al marcador y el campeonato empezaría con gente ya puntuando.
    arranca: new Date(Math.max(lunes.getTime(), LIGA_INICIO.getTime())),
    cierra,
    minimoTotal: MINIMO_TOTAL_POR_DEFECTO,
    minimoUltimo: MINIMO_ULTIMO_POR_DEFECTO,
    ultimoDesde: new Date(cierra.getTime() - UN_DIA_MS),
    premio: null,
    guardado: false,
  };
}

/** Si ese torneo es de la liga: alcanza con que TERMINE después del arranque de todo. */
export function esTorneoDeLiga(t: Torneo): boolean {
  return t.cierra.getTime() > LIGA_INICIO.getTime();
}

/**
 * La clave con la que se archiva un torneo en `liga_semanas`: la fecha de
 * arranque en hora argentina, AAAA-MM-DD.
 *
 * Sigue siendo una FECHA y no el id de la fila porque `liga_semanas.semana` es
 * la PK que ya existe y tiene semanas cerradas adentro. Cambiarla obligaría a
 * migrar el historial para ganar nada.
 */
export function claveDeTorneo(t: Torneo): string {
  return new Date(t.arranca.getTime() - ARG_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Cuántos días de calendario argentinos abarca el torneo. Siete en una semana
 * normal, ocho con el lunes agregado.
 *
 * Se cuenta sobre los días CALENDARIO y no dividiendo la duración por 24hs: un
 * torneo que arranca un lunes a las 23:30 y cierra el domingo siguiente dura
 * menos de siete días enteros pero ocupa siete casilleros en la grilla, que es
 * lo que la pantalla dibuja. Ver la nota de diaCorriente.
 */
export function duracionEnDias(t: Torneo): number {
  const desde = medianocheArgentina(t.arranca);
  // El cierre es EXCLUSIVO: un torneo que cierra el lunes a las 00:00 termina
  // el domingo. Se corre un milisegundo para atrás antes de buscar su día.
  const hasta = medianocheArgentina(new Date(t.cierra.getTime() - 1));
  return Math.max(1, Math.round((hasta - desde) / UN_DIA_MS) + 1);
}

/** Cuántos días del torneo ya arrancaron, contando el de hoy. Entre 1 y la duración. */
export function diaCorriente(t: Torneo, ahora: Date = new Date()): number {
  const desde = medianocheArgentina(t.arranca);
  const corridos = Math.floor((medianocheArgentina(ahora) - desde) / UN_DIA_MS) + 1;
  return Math.min(duracionEnDias(t), Math.max(1, corridos));
}

/**
 * Los nombres de los días del torneo, en hora argentina: "lun", "mar"…
 *
 * Se arman acá y no en pantalla porque el huso vive de este lado: el cliente
 * está en el reloj del que mira, y alguien viajando vería el torneo corrido un
 * día. Van TODOS los días y no solo los corridos porque la pantalla dibuja el
 * torneo entero —con los que faltan en gris— y el gráfico se queda con los
 * primeros `diaCorriente`, que es lo que tiene datos.
 */
export function etiquetasDeDias(t: Torneo): string[] {
  const desde = medianocheArgentina(t.arranca);
  return Array.from({ length: duracionEnDias(t) }, (_, d) =>
    // Corriendo el reloj, los campos UTC de esta fecha son la hora argentina.
    new Date(desde + d * UN_DIA_MS - ARG_OFFSET_MS).toLocaleDateString("es-AR", {
      weekday: "short",
      timeZone: "UTC",
    }),
  );
}

/** "lunes", "domingo"… del día en que cae ese instante, en hora argentina. */
export function nombreDeDia(d: Date): string {
  return new Date(d.getTime() - ARG_OFFSET_MS).toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" });
}

/**
 * El día en que se juega la última partida. NO es el del cierre: el cierre es
 * exclusivo, así que un torneo que cierra el martes 00:00 se define el lunes.
 *
 * La pantalla decía "Cierra el domingo" escrito a mano, y con el torneo
 * extendido al lunes eso pasó a ser mentira sin que nada avisara.
 */
export function diaDeCierre(t: Torneo): string {
  return nombreDeDia(new Date(t.cierra.getTime() - 1));
}

/**
 * Los días que abarca el mínimo del final. Suele ser uno, pero no siempre.
 *
 * Al extender el torneo al lunes dejando el "último día" en el domingo, la
 * ventana del mínimo pasó a cubrir DOS días: se pueden hacer las 3 el domingo
 * o el lunes. Eso es deliberado —así nadie pierde lo que venía planeando— pero
 * la pantalla tiene que poder decirlo, y con un solo nombre de día no puede.
 */
export function diasDelCierre(t: Torneo): string[] {
  const dias: string[] = [];
  const primero = medianocheArgentina(t.ultimoDesde);
  const ultimo = medianocheArgentina(new Date(t.cierra.getTime() - 1));
  for (let d = primero; d <= ultimo; d += UN_DIA_MS) dias.push(nombreDeDia(new Date(d)));
  return dias.length > 0 ? dias : [diaDeCierre(t)];
}

/** Si el último día ya arrancó: recién ahí el mínimo de cierre tiene sentido. */
export function empezoElUltimoDia(t: Torneo, ahora: Date = new Date()): boolean {
  return ahora.getTime() >= t.ultimoDesde.getTime();
}

/** Si el torneo ya terminó. */
export function termino(t: Torneo, ahora: Date = new Date()): boolean {
  return ahora.getTime() >= t.cierra.getTime();
}

/**
 * "7 – 14 sept": el rango del torneo, para el rótulo.
 *
 * El día que se muestra como final es el ANTERIOR al cierre, porque el cierre
 * es exclusivo: un torneo que cierra el lunes 00:00 hay que decir que terminó
 * el domingo, no el lunes.
 */
export function rangoDeTorneo(t: Torneo): string {
  const ini = new Date(t.arranca.getTime() - ARG_OFFSET_MS);
  const fin = new Date(t.cierra.getTime() - 1 - ARG_OFFSET_MS);
  const mes = (d: Date) => d.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return mes(ini) === mes(fin)
    ? `${ini.getUTCDate()} – ${fin.getUTCDate()} ${mes(fin)}`
    : `${ini.getUTCDate()} ${mes(ini)} – ${fin.getUTCDate()} ${mes(fin)}`;
}

/** Los milisegundos de la medianoche argentina del día en que cae ese instante. */
function medianocheArgentina(d: Date): number {
  const arg = new Date(d.getTime() - ARG_OFFSET_MS);
  return Date.UTC(arg.getUTCFullYear(), arg.getUTCMonth(), arg.getUTCDate()) + ARG_OFFSET_MS;
}

/** ─────────────────────── La tabla ─────────────────────── */

interface FilaTorneo {
  id: string;
  nombre: string | null;
  arranca_at: string;
  cierra_at: string;
  minimo_total: number;
  minimo_ultimo: number;
  ultimo_desde: string | null;
  premio: string | null;
}

function deFila(f: FilaTorneo): Torneo {
  const arranca = new Date(f.arranca_at);
  const cierra = new Date(f.cierra_at);
  return {
    id: f.id,
    nombre: f.nombre,
    arranca: new Date(Math.max(arranca.getTime(), LIGA_INICIO.getTime())),
    cierra,
    minimoTotal: f.minimo_total,
    minimoUltimo: f.minimo_ultimo,
    // Sin valor guardado, las últimas 24 horas — que es lo que se venía usando.
    ultimoDesde: f.ultimo_desde ? new Date(f.ultimo_desde) : new Date(cierra.getTime() - UN_DIA_MS),
    premio: f.premio,
    guardado: true,
  };
}

/**
 * El torneo que contiene ese instante, o el derivado si no hay ninguno.
 *
 * NO tira nunca: si la tabla todavía no existe —la migración se corre a mano—
 * loguea y devuelve el derivado. Eso es lo que hace que esto se pueda desplegar
 * antes de correr el SQL sin que nadie note la diferencia.
 */
export async function torneoDe(supabase: SupabaseClient, instante: Date = new Date()): Promise<Torneo> {
  try {
    const iso = instante.toISOString();
    const { data, error } = await supabase
      .from("liga_torneos")
      .select("id, nombre, arranca_at, cierra_at, minimo_total, minimo_ultimo, ultimo_desde, premio")
      .lte("arranca_at", iso)
      .gt("cierra_at", iso)
      // Si por un error de carga hay dos que se pisan, gana el que arrancó
      // último: es el que alguien creó a sabiendas de que ya había otro.
      .order("arranca_at", { ascending: false })
      .limit(1)
      .returns<FilaTorneo[]>();
    if (error) {
      console.log(`torneoDe: sigo con la semana deducida (${error.message})`);
      return torneoDerivado(instante);
    }
    return data && data[0] ? deFila(data[0]) : torneoDerivado(instante);
  } catch (err) {
    console.error("torneoDe falló —", err instanceof Error ? err.message : err);
    return torneoDerivado(instante);
  }
}

/**
 * El último torneo que YA terminó: el candidato a cerrarse.
 *
 * Antes esto era "la semana anterior a la actual", que con ventanas fijas de
 * siete días era lo mismo. Con torneos de duración variable no: entre el cierre
 * de uno y el arranque del siguiente puede no haber ninguna relación.
 *
 * Sin fila cae al derivado —la semana anterior a la de hoy—, que es exactamente
 * lo que se venía haciendo.
 */
export async function torneoAnterior(supabase: SupabaseClient, ahora: Date = new Date()): Promise<Torneo> {
  try {
    const { data, error } = await supabase
      .from("liga_torneos")
      .select("id, nombre, arranca_at, cierra_at, minimo_total, minimo_ultimo, ultimo_desde, premio")
      .lte("cierra_at", ahora.toISOString())
      .order("cierra_at", { ascending: false })
      .limit(1)
      .returns<FilaTorneo[]>();
    if (error) {
      console.log(`torneoAnterior: sigo con la semana deducida (${error.message})`);
      return semanaAnteriorDerivada(ahora);
    }
    return data && data[0] ? deFila(data[0]) : semanaAnteriorDerivada(ahora);
  } catch (err) {
    console.error("torneoAnterior falló —", err instanceof Error ? err.message : err);
    return semanaAnteriorDerivada(ahora);
  }
}

/** La semana de lunes a domingo anterior a la de `ahora`. Un milisegundo antes del lunes cae adentro. */
function semanaAnteriorDerivada(ahora: Date): Torneo {
  return torneoDerivado(new Date(inicioDeSemana(ahora).getTime() - 1));
}

/** Todos los torneos cargados, del más nuevo al más viejo. Para el panel. */
export async function listarTorneos(supabase: SupabaseClient): Promise<Torneo[]> {
  const { data, error } = await supabase
    .from("liga_torneos")
    .select("id, nombre, arranca_at, cierra_at, minimo_total, minimo_ultimo, ultimo_desde, premio")
    .order("arranca_at", { ascending: false })
    .returns<FilaTorneo[]>();
  if (error) throw new Error(`No se pudieron leer los torneos: ${error.message}`);
  return (data ?? []).map(deFila);
}
