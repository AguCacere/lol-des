/**
 * Los momentos de una edición cerrada: qué pasó adentro de la semana, no cómo
 * terminó.
 *
 * El marcador final ya lo cuenta la clasificación. Lo que no contaba nadie es
 * que la semana del 14 de septiembre se definió así: marlboro se escapó +11 el
 * martes, VORE lideró tres días, Simiestro se hundió −6 el miércoles, el
 * viernes 1º y 2º estuvieron a 0,25 y el domingo marlboro iba SEGUNDO y lo dio
 * vuelta el último día. Todo eso estaba en la curva y no se leía en ningún
 * lado.
 *
 * Regla de la casa, igual que en lib/palmares.ts: **todo sale de una resta
 * sobre `porDia`**, que es la misma serie que dibuja la carrera. Nada se
 * infiere, nada se redondea hacia una frase más linda, y cuando el dato no
 * alcanza la función devuelve null y la pantalla no dibuja esa pieza.
 *
 * `porDia` arranca en 0 y tiene un punto MÁS que `dias`: el índice i es el
 * cierre del día i−1. Esa rareza está en todo el archivo y es la fuente de
 * casi todos los off-by-one que se pueden cometer acá.
 */

import type { FilaFinal } from "./palmares";

/**
 * Un movimiento de UN día: quién, cuánto, qué día y —lo importante— EN QUÉ
 * PUNTO de la curva.
 *
 * El índice va además del nombre porque el nombre no identifica un día: el
 * torneo del 14 de septiembre duró ocho días y su lista es
 * `lun mar mié jue vie sáb dom lun`. Buscar "lun" con indexOf devolvía el
 * primero, así que la marca del último día se dibujaba sobre el primero. Lo
 * encontró un test con los datos reales de esa semana.
 */
export interface MomentoDia {
  puuid: string;
  nombre: string;
  /** El nombre del día tal como lo guardó el cierre ("mié"). Para escribirlo, no para buscarlo. */
  dia: string;
  /** El índice dentro de `porDia`: el cierre de ese día. */
  i: number;
  /** Lo que sumó o perdió ESE día. */
  delta: number;
}

/** El día en que la punta estuvo más peleada. */
export interface MomentoCerrado {
  dia: string;
  /** El índice dentro de `porDia`. Ver MomentoDia. */
  i: number;
  diferencia: number;
  lider: string;
  segundo: string;
}

/** El que llegó al último día abajo y terminó arriba (o al revés). */
export interface MomentoVuelta {
  puuid: string;
  nombre: string;
  /** Su puesto al cierre del anteúltimo día. */
  desde: number;
  /** Y el final. */
  hasta: number;
  /** El día en que se dio vuelta, o sea el último. */
  dia: string;
  /** El índice dentro de `porDia`. Ver MomentoDia. */
  i: number;
}

export interface Momentos {
  mayorSubida: MomentoDia | null;
  mayorCaida: MomentoDia | null;
  masCerrado: MomentoCerrado | null;
  vuelta: MomentoVuelta | null;
  /** Cuántas veces cambió de manos la punta después del primer día. */
  cambiosDeLider: number;
}

/** Una marca sobre la curva. Pocas y cortas: el gráfico no es un texto. */
export interface Hito {
  /** Índice dentro de `porDia` (o sea, el cierre de ese día). */
  i: number;
  puuid: string;
  /** Dos o tres palabras. Lo largo va en la franja de momentos. */
  texto: string;
  tono: "bueno" | "malo" | "neutro";
}

/** Cuántos hitos se dibujan como máximo sobre la carrera. */
export const MAX_HITOS = 3;

/**
 * Cuánto tiene que valer un movimiento de un día para que se lo llame un
 * momento, en proporción al recorrido de toda la semana.
 *
 * Con un número fijo no se puede: en una semana en la que todos terminan entre
 * −2 y +3, un +2 es la historia de la semana; en una de +15 es el martes de
 * cualquiera. 25% del recorrido total es el corte, y está acá arriba en vez de
 * enterrado en el cuerpo para que se vea que es una decisión y no un accidente.
 */
const FRACCION_MOMENTO = 0.25;

/** Rellena una serie corta repitiendo su último valor: no jugó, no se movió. */
function serieDe(f: FilaFinal, largo: number): number[] {
  const s = [...(f.porDia ?? [])];
  if (s.length === 0) return [];
  while (s.length < largo) s.push(s[s.length - 1]);
  return s;
}

/** El puesto de cada puuid al cierre del punto `i`, empezando en 1. */
function puestosEn(series: { puuid: string; serie: number[] }[], i: number): Map<string, number> {
  const orden = [...series]
    .map((s) => ({ puuid: s.puuid, v: s.serie[Math.min(i, s.serie.length - 1)] }))
    .sort((a, b) => b.v - a.v);
  const m = new Map<string, number>();
  orden.forEach((o, idx) => m.set(o.puuid, idx + 1));
  return m;
}

const redondo = (n: number) => Math.round(n * 100) / 100;

export function momentosDeLaSemana(tabla: FilaFinal[], dias: string[]): Momentos | null {
  const conCurva = tabla.filter((f) => (f.porDia?.length ?? 0) >= 2);
  // Con un solo cierre no hay semana que contar: hay un resultado.
  if (conCurva.length === 0 || dias.length < 2) return null;
  const largo = Math.max(...conCurva.map((f) => f.porDia!.length));
  if (largo < 3) return null;
  const series = conCurva.map((f) => ({ puuid: f.puuid, nombre: f.name, serie: serieDe(f, largo) }));

  // El recorrido de la semana entera, para saber contra qué medir un día.
  const todos = series.flatMap((s) => s.serie);
  const recorrido = Math.max(...todos) - Math.min(...todos);
  const piso = Math.max(0.5, recorrido * FRACCION_MOMENTO);

  let mayorSubida: MomentoDia | null = null;
  let mayorCaida: MomentoDia | null = null;
  for (const s of series) {
    for (let i = 1; i < s.serie.length; i++) {
      const delta = redondo(s.serie[i] - s.serie[i - 1]);
      // El día i-ésimo de la curva es el día i−1 de la lista de nombres.
      const dia = dias[i - 1];
      if (!dia) continue;
      if (delta > 0 && (!mayorSubida || delta > mayorSubida.delta)) {
        mayorSubida = { puuid: s.puuid, nombre: s.nombre, dia, i, delta };
      }
      if (delta < 0 && (!mayorCaida || delta < mayorCaida.delta)) {
        mayorCaida = { puuid: s.puuid, nombre: s.nombre, dia, i, delta };
      }
    }
  }
  if (mayorSubida && mayorSubida.delta < piso) mayorSubida = null;
  if (mayorCaida && Math.abs(mayorCaida.delta) < piso) mayorCaida = null;

  // El día en que la punta estuvo más peleada, y cuántas veces cambió de
  // manos. Los dos salen del mismo recorrido por los cierres, y ninguno mira
  // el punto 0: ahí están todos en cero y el "líder" sería el primero de la
  // lista, que no significa nada.
  let masCerrado: MomentoCerrado | null = null;
  let cambiosDeLider = 0;
  let liderPrevio: string | null = null;
  if (series.length >= 2) {
    for (let i = 1; i < largo; i++) {
      const dia = dias[i - 1];
      if (!dia) continue;
      const orden = series
        .map((s) => ({ nombre: s.nombre, puuid: s.puuid, v: s.serie[Math.min(i, s.serie.length - 1)] }))
        .sort((a, b) => b.v - a.v);
      const diferencia = redondo(orden[0].v - orden[1].v);
      if (!masCerrado || diferencia < masCerrado.diferencia) {
        masCerrado = { dia, i, diferencia, lider: orden[0].nombre, segundo: orden[1].nombre };
      }
      if (liderPrevio !== null && orden[0].puuid !== liderPrevio) cambiosDeLider++;
      liderPrevio = orden[0].puuid;
    }
  }

  /**
   * La vuelta en el cierre: quién ganó más puestos EL ÚLTIMO DÍA.
   *
   * Se mira contra el anteúltimo cierre y no contra el mejor o el peor puesto
   * de la semana entera. El lunes están todos empatados en cero, así que
   * cualquier comparación contra los primeros días dice "remontó de 6º a 1º"
   * de alguien que simplemente jugó. Lo del último día, en cambio, es la
   * pregunta que la gente se hace: ¿estaba ganando el que ganó?
   */
  let vuelta: MomentoVuelta | null = null;
  const diaFinal = dias[largo - 2];
  if (largo >= 3 && diaFinal) {
    const antes = puestosEn(series, largo - 2);
    const fin = puestosEn(series, largo - 1);
    for (const s of series) {
      const desde = antes.get(s.puuid)!;
      const hasta = fin.get(s.puuid)!;
      // Solo el que TERMINÓ PRIMERO sin serlo: "subió de 5º a 4º el último
      // día" no es una vuelta, es una fila que se movió.
      if (hasta === 1 && desde > 1 && (!vuelta || desde > vuelta.desde)) {
        vuelta = { puuid: s.puuid, nombre: s.nombre, desde, hasta, dia: diaFinal, i: largo - 1 };
      }
    }
  }

  return { mayorSubida, mayorCaida, masCerrado, vuelta, cambiosDeLider };
}

/**
 * Las marcas que van ENCIMA de la curva: un subconjunto de los momentos, con
 * el texto recortado a lo que entra al lado de un punto.
 *
 * No se dibujan todas las que existen. Tres marcas ya son tres textos flotando
 * sobre siete líneas, y el gráfico es el dibujo — no el soporte de un texto.
 * Lo largo se cuenta abajo, en la franja de momentos.
 *
 * Cada momento ya trae su índice, así que acá no se busca nada: el nombre del
 * día NO sirve para ubicar un punto (ver MomentoDia).
 */
export function hitosDeMomentos(m: Momentos | null): Hito[] {
  if (!m) return [];
  const hitos: Hito[] = [];
  const num = (n: number) => redondo(Math.abs(n)).toString().replace(".", ",");
  if (m.mayorSubida) hitos.push({ i: m.mayorSubida.i, puuid: m.mayorSubida.puuid, texto: `+${num(m.mayorSubida.delta)}`, tono: "bueno" });
  if (m.mayorCaida) hitos.push({ i: m.mayorCaida.i, puuid: m.mayorCaida.puuid, texto: `−${num(m.mayorCaida.delta)}`, tono: "malo" });
  if (m.vuelta) hitos.push({ i: m.vuelta.i, puuid: m.vuelta.puuid, texto: "la dio vuelta", tono: "neutro" });
  return hitos.slice(0, MAX_HITOS);
}

/**
 * Una línea sobre CÓMO se ganó la edición, para la tarjeta del historial.
 *
 * Reemplaza a `comoSeDefinio`, que contaba la aritmética del último día —"llegó
 * al dom con 11,75, sumó 3,5 el lun y cerró en 15,25"— o sea tres números que
 * ya están escritos treinta píxeles más arriba. Lo que faltaba era lo único que
 * el marcador no puede decir: **si el que ganó venía ganando**.
 *
 * Tres casos, y ninguno inventa nada:
 *
 * 1. Llegó al último día abajo y lo dio vuelta. Es la mejor historia que puede
 *    tener una edición y estaba completamente escondida.
 * 2. Llegó arriba y el margen fue chico: lo aguantó.
 * 3. Lideraba desde hace varios días: se escapó y no lo alcanzaron.
 *
 * Si no cae en ninguno —o el campeón no terminó primero, que pasa cuando el de
 * arriba no llegó a los mínimos— devuelve null y la tarjeta no escribe nada.
 */
export function relatoDeLaEdicion(
  tabla: FilaFinal[],
  dias: string[],
  ganadorPuuid: string | null,
): string | null {
  if (!ganadorPuuid) return null;
  const m = momentosDeLaSemana(tabla, dias);
  if (!m) return null;
  const conCurva = tabla.filter((f) => (f.porDia?.length ?? 0) >= 2);
  const largo = Math.max(...conCurva.map((f) => f.porDia!.length));
  if (largo < 3) return null;
  const series = conCurva.map((f) => ({ puuid: f.puuid, nombre: f.name, serie: serieDe(f, largo) }));
  const fin = puestosEn(series, largo - 1);
  // El campeón puede no haber terminado primero: la liga la gana el mejor de
  // los que cumplen los mínimos. Ahí el relato sería mentira y lo cuenta la
  // nota de "arriba terminó otro" que ya existe.
  if (fin.get(ganadorPuuid) !== 1) return null;

  const num = (n: number) => redondo(Math.abs(n)).toString().replace(".", ",");
  const ordinal = (n: number) => `${n}º`;

  // 1. La dio vuelta el último día.
  if (m.vuelta && m.vuelta.puuid === ganadorPuuid) {
    const antes = series
      .map((s) => ({ puuid: s.puuid, v: s.serie[largo - 2] }))
      .sort((a, b) => b.v - a.v);
    const suyo = antes.find((a) => a.puuid === ganadorPuuid)!.v;
    const brecha = redondo(antes[0].v - suyo);
    return brecha > 0
      ? `Llegó al último día ${ordinal(m.vuelta.desde)}, a ${num(brecha)} ${brecha === 1 ? "punto" : "puntos"} del puntero, y lo dio vuelta.`
      : `Llegó al último día ${ordinal(m.vuelta.desde)} y lo dio vuelta.`;
  }

  // Desde cuándo viene liderando sin interrupciones.
  let desde = largo - 1;
  for (let i = largo - 1; i >= 1; i--) {
    const lider = series
      .map((s) => ({ puuid: s.puuid, v: s.serie[i] }))
      .sort((a, b) => b.v - a.v)[0];
    if (lider.puuid !== ganadorPuuid) break;
    desde = i;
  }
  const diasArriba = largo - desde;

  // 2. Ganó por poco: lo aguantó.
  const orden = [...tabla].sort((a, b) => b.puntos - a.puntos);
  const margen = orden.length > 1 ? redondo(orden[0].puntos - orden[1].puntos) : null;
  if (margen != null && margen <= 1) {
    return `Aguantó la punta hasta el final: ganó por ${num(margen)}.`;
  }

  // 3. Se escapó. Solo si de verdad lideró varios días — con dos, "lideraba
  //    desde el sábado" de una semana de ocho días es una forma rebuscada de
  //    decir que ganó.
  if (diasArriba >= 3 && dias[desde - 1]) {
    return `Tomó la punta el ${dias[desde - 1]} y no la soltó más.`;
  }
  return null;
}
