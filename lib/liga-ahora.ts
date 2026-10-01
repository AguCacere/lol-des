/**
 * **Qué está pasando en la liga AHORA**, en dos o tres hechos.
 *
 * Esto no narra: enumera. Cada acontecimiento es una resta o una comparación
 * sobre datos que ya están en la tabla, y si la resta no se puede hacer no se
 * escribe nada. No hay "está jugando mejor", no hay "viene dominando" y sobre
 * todo no hay "seguramente gana": una liga que se define por 0,25 puntos no
 * admite que la pantalla opine.
 *
 * El corte en TRES no es estético. Un bloque de acontecimientos que crece con
 * la cantidad de gente deja de ser un titular y se vuelve otra tabla, que es
 * exactamente lo que esta pantalla ya tiene abajo. Tres es lo que se lee sin
 * decidir qué leer.
 *
 * Para las semanas CERRADAS está lib/momentos.ts, que es otra cosa: aquello
 * cuenta cómo se definió una edición terminada mirando la curva entera. Esto
 * mira el estado de hoy.
 */

/** Lo que cada acontecimiento necesita de una fila. Es un subconjunto de FilaLiga. */
export interface FilaAhora {
  puuid: string;
  name: string;
  victorias: number;
  derrotas: number;
  sinJugar: boolean;
  puntos?: number;
  netas?: number;
  ultimoDia?: number;
  habilitado?: boolean;
  porDia?: number[];
  racha?: { resultado: "W" | "L"; cantidad: number } | null;
}

export interface Acontecimiento {
  /** Para la key de React y para no repetir dos veces el mismo tipo. */
  clase: "racha" | "margen" | "subio" | "minimo";
  /** El ícono, que es un carácter y no un componente: son cuatro y no se repiten. */
  icono: string;
  texto: string;
}

/** El puntaje con el que se compite, con las mismas guardas que usa la pantalla. */
export function puntajeDeFila(f: FilaAhora): number {
  return f.puntos ?? f.netas ?? f.victorias - f.derrotas;
}

/** "1,25" / "0,5" — sin signo, para meterlo en una frase donde el signo no dice nada. */
function coma(n: number): string {
  return (Math.round(Math.abs(n) * 100) / 100).toString().replace(".", ",");
}

/**
 * Desde cuántas victorias al hilo vale contarlo.
 *
 * Tres y no dos: con dos, en un grupo de siete, casi siempre hay alguien en
 * racha y el renglón deja de ser una noticia para ser decoración fija.
 */
const RACHA_MINIMA = 3;

/**
 * En qué puesto iba cada uno al cierre del día anterior.
 *
 * Sale de `porDia`, que es el acumulado al final de cada día —la misma curva
 * que dibuja la carrera—, así que el puesto de ayer es real y no una
 * reconstrucción. Devuelve null cuando no hay al menos dos cierres: con uno
 * solo no hay "ayer" contra el cual comparar.
 */
function puestosDeAyer(filas: FilaAhora[]): Map<string, number> | null {
  const conCurva = filas.filter((f) => f.porDia && f.porDia.length >= 2);
  if (conCurva.length < 2) return null;
  // El ANTEÚLTIMO punto de la curva es el cierre de ayer; el último es hoy,
  // que todavía está abierto y se mueve.
  const ayer = conCurva.map((f) => ({ puuid: f.puuid, v: f.porDia![f.porDia!.length - 2] }));
  ayer.sort((a, b) => b.v - a.v);
  return new Map(ayer.map((x, i) => [x.puuid, i + 1]));
}

/**
 * Los hechos de la semana en curso, como mucho tres.
 *
 * `minimoSemanal` puede venir null: la respuesta del CDN anterior a un deploy
 * no lo trae, y sin ese número no se puede afirmar que alguien "ya cumplió".
 */
export function acontecimientos(
  tabla: FilaAhora[],
  minimoSemanal: number | null,
  minimoUltimoDia: number | null,
): Acontecimiento[] {
  const jugaron = tabla.filter((f) => !f.sinJugar);
  if (jugaron.length === 0) return [];

  const out: Acontecimiento[] = [];
  const lider = jugaron[0];

  // 1. El margen con el segundo. Es el dato que define si la semana está
  //    abierta o resuelta, así que va primero.
  if (jugaron.length >= 2) {
    const margen = Math.round((puntajeDeFila(lider) - puntajeDeFila(jugaron[1])) * 100) / 100;
    if (margen === 0) {
      out.push({
        clase: "margen",
        icono: "⚔",
        texto: `${lider.name} y ${jugaron[1].name} están empatados arriba`,
      });
    } else {
      out.push({
        clase: "margen",
        icono: "⚔",
        texto: `${jugaron[1].name} está a ${coma(margen)} de ${lider.name}`,
      });
    }
  }

  // 2. La racha más larga, si alguna llega al mínimo. Solo victorias: "4
  //    derrotas seguidas" es una cargada, y para eso está el bot.
  const enRacha = jugaron
    .filter((f) => f.racha && f.racha.resultado === "W" && f.racha.cantidad >= RACHA_MINIMA)
    .sort((a, b) => b.racha!.cantidad - a.racha!.cantidad)[0];
  if (enRacha) {
    out.push({
      clase: "racha",
      icono: "🔥",
      texto: `${enRacha.name} lleva ${enRacha.racha!.cantidad} victorias seguidas`,
    });
  }

  // 3. El que más subió desde el cierre de ayer. Solo si subió de verdad y
  //    terminó entre los tres primeros: que el décimo pase al noveno no es
  //    una noticia, es ruido con forma de noticia.
  const ayer = puestosDeAyer(jugaron);
  if (ayer) {
    let mejor: { f: FilaAhora; de: number; a: number } | null = null;
    jugaron.forEach((f, i) => {
      const de = ayer.get(f.puuid);
      const a = i + 1;
      if (de == null || de <= a || a > 3) return;
      if (!mejor || de - a > mejor.de - mejor.a) mejor = { f, de, a };
    });
    if (mejor) {
      const m = mejor as { f: FilaAhora; de: number; a: number };
      out.push({ clase: "subio", icono: "↗", texto: `${m.f.name} subió del ${m.de}.º al ${m.a}.º` });
    }
  }

  // 4. Quién ya puede cobrar. Va último porque es el más estático de los
  //    cuatro: una vez que alguien cumple, lo sigue cumpliendo toda la semana.
  if (minimoSemanal != null && minimoUltimoDia != null) {
    const cumplen = jugaron.filter((f) => f.habilitado).map((f) => f.name);
    if (cumplen.length === 1) {
      out.push({ clase: "minimo", icono: "✓", texto: `${cumplen[0]} ya cumple los dos mínimos` });
    } else if (cumplen.length > 1) {
      out.push({ clase: "minimo", icono: "✓", texto: `${cumplen.length} ya cumplen los dos mínimos` });
    }
  }

  return out.slice(0, 3);
}

/** El récord de puntos de la liga, para el dato histórico del historial. */
export interface RecordLiga {
  puntos: number;
  nombre: string;
  semana: string;
}

/**
 * La mejor semana de la historia de la liga.
 *
 * **Se arma de dos fuentes y no de una**, porque la columna `puntos` de
 * `liga_semanas` es nueva: las semanas que cerraron antes la tienen en null y
 * su puntaje vive adentro del `resumen`. La vitrina ya resuelve ese caso para
 * las ocho que muestra, así que acá entran las dos listas y gana el máximo.
 * Una semana vieja, sin `puntos` y fuera de esas ocho, no participa — y eso
 * es preferible a contarla mal. Se arregla solo el día que se rellene la
 * columna.
 *
 * Null cuando ninguna semana tiene un puntaje que mirar: sin dato no hay
 * récord, y un récord inventado en esta pantalla sería el peor de los
 * errores posibles.
 */
export function recordDeLaLiga(
  ediciones: { semana: string; nombre: string | null; puntos: number | null }[],
): RecordLiga | null {
  let mejor: RecordLiga | null = null;
  for (const e of ediciones) {
    if (e.puntos == null || !e.nombre) continue;
    if (!mejor || e.puntos > mejor.puntos) mejor = { puntos: e.puntos, nombre: e.nombre, semana: e.semana };
  }
  return mejor;
}

/**
 * A cuánto está el líder de romper el récord.
 *
 * Devuelve null si ya lo pasó (eso es otra noticia y la cuenta el marcador
 * solo), si está demasiado lejos para que la frase signifique algo, o si no
 * hay récord. **No predice**: dice una resta.
 */
export function cercaDelRecord(puntajeLider: number, record: RecordLiga | null, margen = 4): string | null {
  if (!record || puntajeLider >= record.puntos) return null;
  const falta = Math.round((record.puntos - puntajeLider) * 100) / 100;
  if (falta > margen) return null;
  return `A ${coma(falta)} del récord histórico`;
}
