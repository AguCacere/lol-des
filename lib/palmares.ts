/**
 * El historial de la liga: títulos, márgenes y cómo se definió cada edición.
 *
 * Cálculo puro sobre lo que ya está guardado — no pide nada ni inventa nada.
 * Todo sale de `liga_semanas`: la fila de cada semana cerrada y su `resumen`,
 * que es la foto final entera (ver el header de lib/liga-cierre.ts).
 *
 * La regla de la casa vale acá igual que en el resto: **si el dato no alcanza,
 * la función devuelve null y la pantalla no dibuja la sección**. Un margen
 * inventado o una narración armada a ojo son peores que un hueco, porque esto
 * es justamente lo que va a quedar como registro de quién ganó qué.
 */

/** Una fila de la tabla final de una semana, como la guarda el resumen. */
export interface FilaFinal {
  puuid: string;
  name: string;
  puntos: number;
  victorias: number;
  derrotas: number;
  habilitado: boolean;
  porDia?: number[];
}

/** Una edición cerrada, con lo mínimo para contarla. */
export interface Edicion {
  semana: string;
  puuid: string | null;
  nombre: string | null;
  iconUrl: string | null;
  puntos: number | null;
  jugadores: number;
  /** El nombre del segundo y por cuánto ganó el campeón. Null si no se puede afirmar. */
  duelo?: { segundo: string; margen: number } | null;
  /** El récord del campeón esa semana. Opcional: las semanas viejas no lo tienen. */
  record?: { victorias: number; derrotas: number } | null;
  /** Los tres de arriba. Null cuando la semana cerró sin guardar su foto. */
  podio?: EnPodio[] | null;
  /** Una línea sobre CÓMO se ganó (ver lib/momentos.ts). Null cuando no hay nada que contar. */
  relato?: string | null;
}

/**
 * Por cuánto ganó el campeón, y contra quién.
 *
 * **Solo cuando el campeón terminó PRIMERO.** Puede no haberlo hecho: la liga
 * la gana el mejor de los que cumplen los mínimos, así que el que encabeza la
 * tabla y el que cobra pueden ser dos personas distintas. En ese caso el
 * "ganó por X" daría negativo —el campeón tiene menos puntos que el de
 * arriba—, y una resta con el signo al revés no es un margen: es una frase que
 * miente. Ahí devuelve null y la pantalla cuenta la otra historia, la de que
 * arriba terminó otro sin los mínimos.
 */
export function dueloDeLaEdicion(tabla: FilaFinal[], ganadorPuuid: string | null): { segundo: string; margen: number } | null {
  if (!ganadorPuuid || tabla.length < 2) return null;
  const orden = [...tabla].sort((a, b) => b.puntos - a.puntos);
  if (orden[0].puuid !== ganadorPuuid) return null;
  const margen = Math.round((orden[0].puntos - orden[1].puntos) * 100) / 100;
  return { segundo: orden[1].name, margen };
}

/** Un puesto del podio de una edición, para la tarjeta del historial. */
export interface EnPodio {
  puuid: string;
  nombre: string;
  puntos: number;
  /** Si además es el que COBRÓ. Puede no ser el primero: ver dueloDeLaEdicion. */
  campeon: boolean;
}

/**
 * Los tres de arriba de una edición.
 *
 * La tarjeta del historial mostraba al campeón y al segundo, y con eso no se
 * puede saber si la semana estuvo cerrada o si el tercero quedó a diez puntos.
 * El tercero es barato —ya está en el mismo `resumen`— y es lo que convierte
 * "ganó fulano" en "así quedó la semana".
 *
 * Ordenado por puntos, como la clasificación final. El campeón va marcado y no
 * movido a la primera posición: cuando el de arriba no llegó a los mínimos, el
 * podio real y quién cobró son dos cosas distintas y la tarjeta las cuenta por
 * separado.
 */
export function podioDeLaEdicion(tabla: FilaFinal[], ganadorPuuid: string | null, cuantos = 3): EnPodio[] {
  return [...tabla]
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, cuantos)
    .map((f) => ({ puuid: f.puuid, nombre: f.name, puntos: f.puntos, campeon: f.puuid === ganadorPuuid }));
}

/** Cuántos títulos tiene cada uno, de más a menos. La segunda competencia de la liga. */
export interface EnPalmares {
  puuid: string | null;
  nombre: string;
  iconUrl: string | null;
  titulos: number;
}

/**
 * El palmarés: quién ganó más veces.
 *
 * Se cuenta por **puuid** cuando está y por nombre cuando no. El puuid es para
 * siempre y el "Nombre#TAG" no —cualquiera se lo puede cambiar— así que contar
 * por nombre partiría el palmarés de alguien que se renombró en dos personas
 * con un título cada una. Las semanas viejas guardadas sin puuid caen al
 * nombre, que es lo único que tienen.
 *
 * Empate: NO se desempata. Se ordena por títulos y, dentro del mismo número,
 * alfabéticamente — que no es un criterio deportivo y no pretende serlo, es
 * solo un orden estable para que la lista no baile entre renders.
 */
export function palmares(ediciones: Edicion[]): EnPalmares[] {
  const por = new Map<string, EnPalmares>();
  for (const e of ediciones) {
    if (!e.nombre) continue; // una semana que no ganó nadie no reparte título
    const clave = e.puuid ?? `nombre:${e.nombre}`;
    const previo = por.get(clave);
    if (previo) {
      previo.titulos++;
      // La foto más nueva gana: es la que el invocador tiene hoy.
      if (!previo.iconUrl && e.iconUrl) previo.iconUrl = e.iconUrl;
    } else {
      por.set(clave, { puuid: e.puuid, nombre: e.nombre, iconUrl: e.iconUrl, titulos: 1 });
    }
  }
  return [...por.values()].sort((a, b) => b.titulos - a.titulos || a.nombre.localeCompare(b.nombre, "es"));
}

/** Cuántos títulos tiene el ganador de esa semana, para la copita de su fila. */
export function titulosDe(ediciones: Edicion[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of palmares(ediciones)) m.set(p.puuid ?? `nombre:${p.nombre}`, p.titulos);
  return m;
}

/** El puntaje sin signo, para meterlo en una frase donde el signo no significa nada. */
function sinSigno(n: number): string {
  return (Math.round(Math.abs(n) * 100) / 100).toString().replace(".", ",");
}

/**
 * "Cómo se definió", armado con una resta y no con un modelo.
 *
 * Sale de `porDia` —el acumulado al cierre de cada día, la misma curva que
 * dibuja la carrera— así que dice exactamente lo que muestra el gráfico de
 * arriba. Es determinístico a propósito: una narración generada podría decir
 * "se escapó el miércoles" de una semana que se definió el domingo, y esto va
 * a quedar como el registro de cómo se ganó cada edición.
 *
 * Devuelve null cuando no alcanza: sin curva, sin días, con un solo día de
 * torneo o sin segundo, no hay nada que contar que no sea el marcador final,
 * que ya está treinta píxeles más arriba.
 */
export function comoSeDefinio(
  tabla: FilaFinal[],
  dias: string[],
  ganadorPuuid: string | null,
): string | null {
  const duelo = dueloDeLaEdicion(tabla, ganadorPuuid);
  if (!duelo) return null;
  const campeon = tabla.find((f) => f.puuid === ganadorPuuid);
  const curva = campeon?.porDia;
  // La curva lleva un punto MÁS que los días: arranca en el 0 del comienzo.
  // Con menos de tres puntos no hay "venía así y terminó asá", hay un final.
  if (!campeon || !curva || curva.length < 3 || dias.length < 2) return null;

  const final = curva[curva.length - 1];
  const anteUltimo = curva[curva.length - 2];
  // El día en que estaba parado ese anteúltimo cierre. La curva tiene el 0
  // adelante, así que el cierre del índice i es el final del día i-1.
  const diaPrevio = dias[curva.length - 3];
  if (!diaPrevio) return null;

  // El último día se saca de la CURVA y no de `dias`: si la curva quedó más
  // corta que el torneo —una semana cerrada antes de tiempo, por ejemplo— el
  // último día de `dias` sería uno que la curva ni siquiera tiene.
  const ultimoDia = dias[curva.length - 2];
  if (!ultimoDia) return null;

  const puntoOPuntos = Math.abs(duelo.margen) === 1 ? "punto" : "puntos";
  const movio = Math.round((final - anteUltimo) * 100) / 100;
  const cierre =
    movio === 0
      ? `no se movió el ${ultimoDia} y cerró igual en ${sinSigno(final)}`
      : movio > 0
        ? `sumó ${sinSigno(movio)} el ${ultimoDia} y cerró en ${sinSigno(final)}`
        : `perdió ${sinSigno(movio)} el ${ultimoDia} y cerró en ${sinSigno(final)}`;

  const remate =
    duelo.margen === 0
      ? `empatado con ${duelo.segundo}`
      : `${sinSigno(duelo.margen)} ${puntoOPuntos} arriba de ${duelo.segundo}`;

  return `Llegó al ${diaPrevio} con ${sinSigno(anteUltimo)}, ${cierre}: ${remate}.`;
}
