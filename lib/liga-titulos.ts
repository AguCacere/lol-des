import { championLabel } from "./champion-names";
import type { FilaLiga, TituloDeSemana } from "./liga";

/**
 * Los títulos de la semana: un reconocimiento por persona, aparte del puesto.
 *
 * Existen por el problema más grande que tenía la liga, y no era técnico: son
 * cinco o seis jugando por UN premio. El miércoles ya hay tres que no llegan al
 * podio y para esos tres el jueves, el viernes y el sábado no tienen nada. La
 * liga se les terminó a mitad de semana. Y el mensaje del domingo lo empeoraba:
 * nombra a uno como campeón y a los demás como un chiste. Eso es gracioso una
 * vez; la tercera vez que sos "agua" te vas.
 *
 * La regla que hace que esto funcione —y la que hay que respetar si alguien
 * agrega títulos— es que **cada uno se lleva EXACTAMENTE UNO**. Si el que ganó
 * la liga se lleva además tres títulos, volvimos al mismo lugar. Por eso no es
 * "el líder de cada categoría gana esa categoría", que es lo obvio y está mal:
 * es un reparto, donde cada persona termina con el título en el que más se
 * destaca de los que quedan libres. Ver `repartirTitulos`.
 *
 * Y NINGUNO RESTA. Son todas cosas que se ganan. La liga ya probó que un
 * arranque en negativo hace que la gente deje de jugar, así que acá no hay
 * castigos: el peor título posible sigue siendo un título.
 */

/** Un título repartido. El tipo vive en lib/liga.ts — ver TituloDeSemana. */
export type Titulo = TituloDeSemana;

/**
 * Las categorías, en el orden que desempata.
 *
 * `valor` saca el número de cada uno; el que lo tiene más alto es el candidato.
 * `detalle` escribe el número como se lee en el mensaje — tiene que ser el
 * MISMO número que se usó para elegir, porque un título sin su cifra al lado es
 * una palmadita y con la cifra es un dato.
 *
 * `minimo` es el piso para que el título se entregue, y de acá sale la única
 * regla que hay que entender para agregar categorías nuevas:
 *
 * - Los **relativos** —el fierro, el carnicero, el generoso, el kamikaze, el
 *   turista— dicen "el que más X del grupo". Eso es cierto cualquiera sea el
 *   número, así que NO llevan piso y siempre tienen dueño.
 * - Los **absolutos** —no faltó, la racha, la maratón, el fiel, la remontada—
 *   afirman algo por su cuenta. "La racha: 1 al hilo" no reconoce nada: deja en
 *   evidencia que no había nada que reconocer. Esos sí llevan piso.
 *
 * Y tiene que haber SIEMPRE tantos relativos como gente pueda jugar, porque son
 * los que garantizan que nadie se quede afuera una semana floja, cuando casi
 * nadie llega a los pisos de los absolutos. Hoy son SEIS —el fierro, el
 * carnicero, el quirúrgico, el generoso, el kamikaze y el turista— para un
 * grupo de hasta seis. **Si se anota un séptimo, hay que agregar un relativo
 * más**, o la peor semana posible va a dejar a alguien sin nada.
 */
interface Categoria {
  clave: string;
  emoji: string;
  etiqueta: string;
  minimo: number;
  valor: (f: FilaLiga) => number;
  /** `duracion` son los días que dura ESTE torneo, que ya no es siempre siete. */
  detalle: (f: FilaLiga, duracion: number) => string;
}

/** Las partidas de la semana de esa fila. */
const partidas = (f: FilaLiga) => f.victorias + f.derrotas;

/**
 * Cuánto subió desde su peor momento hasta el final.
 *
 * Sale de la curva por día, que ya se calcula para el gráfico. Es el título que
 * más le sirve al que arrancó mal: mide la recuperación, no la posición, así
 * que se puede ganar desde el último puesto.
 */
function remontada(f: FilaLiga): number {
  const serie = f.porDia ?? [];
  if (serie.length < 2) return 0;
  const piso = Math.min(...serie);
  return (serie[serie.length - 1] ?? 0) - piso;
}

const CATEGORIAS: Categoria[] = [
  {
    clave: "fierro",
    emoji: "🔧",
    etiqueta: "el fierro",
    minimo: 1,
    valor: partidas,
    detalle: (f) => `${partidas(f)} partidas`,
  },
  {
    clave: "presente",
    emoji: "📅",
    etiqueta: "no faltó",
    // Dos días no es "no faltar". Desde tres empieza a significar algo.
    minimo: 3,
    valor: (f) => f.detalle?.dias ?? 0,
    // "8 días de siete" es lo que decía el anuncio del torneo extendido: el
    // siete estaba escrito a mano acá también. Son los cinco lugares anotados
    // en el header de lib/torneo.ts, más agruparPorDia, más este.
    detalle: (f, duracion) => {
      const d = f.detalle?.dias ?? 0;
      if (d >= duracion) return duracion === 7 ? "los siete días" : `los ${duracion} días`;
      return `${d} de ${duracion} días`;
    },
  },
  {
    clave: "carnicero",
    emoji: "🔪",
    etiqueta: "el carnicero",
    // Sin piso: es RELATIVO. "El que más mató del grupo" es cierto sea cual sea
    // el número. Ver la nota de arriba sobre relativos y absolutos.
    minimo: Number.NEGATIVE_INFINITY,
    valor: (f) => f.detalle?.kills ?? 0,
    detalle: (f) => `${f.detalle?.kills ?? 0} asesinatos`,
  },
  {
    clave: "quirurgico",
    emoji: "🎯",
    etiqueta: "el quirúrgico",
    // El mejor KDA, que es otra cosa que matar mucho: mide no morir. Separados
    // a propósito — el que farmea kills muriendo diez veces no es el mismo que
    // el que termina 8/1/14, y con un solo título uno de los dos se queda sin
    // nada que lo describa.
    minimo: Number.NEGATIVE_INFINITY,
    valor: (f) => kda(f) ?? 0,
    detalle: (f) => `${(kda(f) ?? 0).toFixed(1).replace(".", ",")} de KDA`,
  },
  {
    clave: "remontada",
    emoji: "📈",
    etiqueta: "la remontada",
    // Menos de dos puntos de recuperación no es una remontada, es ruido.
    minimo: 2,
    valor: remontada,
    detalle: (f) => `+${remontada(f).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} desde su peor momento`,
  },
  {
    clave: "fiel",
    emoji: "💍",
    etiqueta: "el fiel",
    minimo: 3,
    valor: (f) => f.detalle?.conSuCampeon ?? 0,
    detalle: (f) =>
      `${f.detalle?.conSuCampeon ?? 0} con ${f.champion ? championLabel(f.champion) : "el mismo campeón"}`,
  },
  {
    clave: "racha",
    emoji: "🔥",
    etiqueta: "la racha",
    // Dos al hilo le pasa a cualquiera.
    minimo: 3,
    valor: (f) => f.detalle?.rachaMax ?? 0,
    detalle: (f) => `${f.detalle?.rachaMax ?? 0} ganadas al hilo`,
  },
  {
    clave: "maraton",
    emoji: "☕",
    etiqueta: "la maratón",
    // Menos de cuatro en un día no es una sentada larga.
    minimo: 4,
    valor: (f) => f.detalle?.maratonDia ?? 0,
    detalle: (f) => `${f.detalle?.maratonDia ?? 0} partidas en un solo día`,
  },
  {
    clave: "generoso",
    emoji: "🤝",
    etiqueta: "el generoso",
    // También relativo, y es el contrapeso del carnicero: uno premia matar y
    // este acompañar. Sin piso por el mismo motivo.
    minimo: Number.NEGATIVE_INFINITY,
    valor: (f) => f.detalle?.assists ?? 0,
    detalle: (f) => `${f.detalle?.assists ?? 0} asistencias`,
  },
  {
    // El que menos jugó. Es el único sin piso, y está para eso: es la red que
    // hace que nadie se quede sin nada. Sin él, el que entró dos veces en la
    // semana no llegaba a ningún mínimo, se iba con las manos vacías Y con la
    // cargada de último encima — que es exactamente lo que estos títulos vienen
    // a evitar. Dos partidas no son una hazaña, pero son un hecho, y un hecho
    // con nombre es mejor que un renglón que no existe.
    //
    // Va ANTEÚLTIMO en la lista a propósito: los empates se rompen por orden,
    // así que este solo gana cuando de verdad no hay nada mejor que decir.
    clave: "turista",
    emoji: "🧳",
    etiqueta: "el turista",
    minimo: Number.NEGATIVE_INFINITY,
    valor: (f) => -partidas(f),
    detalle: (f) => `pasó a saludar, ${partidas(f)} ${partidas(f) === 1 ? "partida" : "partidas"}`,
  },
  {
    clave: "kamikaze",
    emoji: "💀",
    etiqueta: "el kamikaze",
    minimo: 1,
    valor: (f) => f.detalle?.deaths ?? 0,
    detalle: (f) => `${f.detalle?.deaths ?? 0} muertes`,
  },
];

/** (asesinatos + asistencias) / muertes. Null si no jugó. */
function kda(f: FilaLiga): number | null {
  const d = f.detalle;
  if (!d || partidas(f) === 0) return null;
  // Sin muertes se divide por 1 y no por 0: una semana perfecta no puede dar
  // infinito y llevarse el título para siempre.
  return (d.kills + d.assists) / Math.max(1, d.deaths);
}

/**
 * Reparte los títulos: cada uno se lleva uno, el que más lo destaca.
 *
 * Se recorre buscando, entre todos los pares (persona sin título, título
 * libre), el que tiene la posición más alta: si alguien es el número 1 en algo,
 * se lo lleva antes que nadie. Después el siguiente más destacado, y así. Eso
 * es lo que hace que el reparto no dependa del orden en que vengan las filas ni
 * del orden de las categorías, salvo para desempatar.
 *
 * Todo el que jugó al menos una se lleva algo: la categoría "el turista" no
 * tiene piso justamente para eso. Las demás sí lo tienen, porque un título que
 * dice "la racha: 1 al hilo" no reconoce nada — deja en evidencia que no había
 * nada que reconocer.
 */
export function repartirTitulos(tabla: FilaLiga[], duracion = 7): Titulo[] {
  const jugaron = tabla.filter((f) => !f.sinJugar && partidas(f) > 0);
  if (jugaron.length === 0) return [];

  // La posición de cada uno en cada categoría, de mejor a peor.
  const posicion = new Map<string, Map<string, number>>();
  for (const c of CATEGORIAS) {
    const orden = [...jugaron].sort((a, b) => c.valor(b) - c.valor(a));
    const m = new Map<string, number>();
    orden.forEach((f, i) => m.set(f.puuid, i));
    posicion.set(c.clave, m);
  }

  const sinTitulo = new Set(jugaron.map((f) => f.puuid));
  const libres = new Set(CATEGORIAS.map((c) => c.clave));
  const porPuuid = new Map(jugaron.map((f) => [f.puuid, f]));
  const titulos: Titulo[] = [];

  while (sinTitulo.size > 0 && libres.size > 0) {
    let mejor: { puuid: string; c: Categoria; pos: number } | null = null;
    for (const puuid of sinTitulo) {
      const f = porPuuid.get(puuid)!;
      for (const c of CATEGORIAS) {
        if (!libres.has(c.clave)) continue;
        if (c.valor(f) < c.minimo) continue;
        const pos = posicion.get(c.clave)!.get(puuid)!;
        // El empate lo rompe el orden de CATEGORIAS, que es estable: dos
        // corridas sobre la misma semana reparten igual.
        if (!mejor || pos < mejor.pos) mejor = { puuid, c, pos };
      }
    }
    if (!mejor) break;
    const f = porPuuid.get(mejor.puuid)!;
    titulos.push({
      puuid: f.puuid,
      name: f.name,
      emoji: mejor.c.emoji,
      etiqueta: mejor.c.etiqueta,
      detalle: mejor.c.detalle(f, duracion),
    });
    sinTitulo.delete(mejor.puuid);
    libres.delete(mejor.c.clave);
  }

  return titulos;
}
