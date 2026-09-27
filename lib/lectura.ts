/**
 * La lectura del perfil: **qué hace bien y qué le conviene corregir**, ya
 * interpretado.
 *
 * Esto existe porque había una pestaña entera llamada "Mejorar" que mostraba
 * las siete métricas del rol en una tabla y dejaba el trabajo de leerla del
 * lado de la persona. Una tabla de siete filas donde tres dicen "+6%", "+5%" y
 * "+3%" no es una lectura: es la materia prima de una lectura. Y "+6% de CS
 * por minuto" no merece aparecer en "lo que hacés mejor" — dos poblaciones
 * distintas nunca dan el mismo número.
 *
 * Así que el trabajo lo hace la app: de las siete, se quedan **las que se
 * despegan de verdad** (arriba de `MATERIAL_PCT`), como mucho tres de cada
 * lado, y el foco es UNO solo — el que más abajo está. Si ninguna se despega,
 * no hay nada que decir y la sección no se dibuja.
 *
 * El cálculo NO cambió: son los mismos ejes del radar, calculados en el
 * servidor sobre TODAS las partidas de esa persona en su línea contra TODAS
 * las del grupo en esa misma línea. Lo único nuevo es que acá se decide qué
 * vale la pena mostrar.
 */

import { RADAR_AXIS, type RadarMetric, type RadarProfile } from "./radar";

/**
 * Cuánto tiene que despegarse del promedio del rol para que se muestre.
 *
 * 8% es el mismo umbral que ya usaba `lib/insights.ts` y después
 * `ProfileMejorar` para decidir si teñía o no la diferencia. Lo que cambia es
 * la consecuencia: antes una diferencia del 3% se dibujaba igual, apagada;
 * ahora directamente no entra. Un renglón gris que dice "no significa nada"
 * ocupa el mismo espacio que uno que sí significa algo.
 */
export const MATERIAL_PCT = 8;

/** Cuántas se muestran de cada lado. Tres es una lectura; siete es la tabla otra vez. */
export const MAXIMO = 3;

export interface FilaLectura {
  key: RadarMetric;
  /** Su promedio y el del resto de su línea, ya formateados para la pantalla. */
  valor: string;
  rol: string;
  /** La diferencia contra el rol, en % y redondeada. */
  pct: number;
  /** Desvíos estándar. Es lo que ORDENA: tiene en cuenta cuánto varía el grupo. */
  z: number;
}

export interface Lectura {
  /** Lo que hace mejor que su línea, de lo que más se despega para abajo. */
  fuerte: FilaLectura[];
  /** El foco: UNA sola, la que más abajo está. Null si ninguna se despega. */
  foco: FilaLectura | null;
  /** Cuántas de las siete quedaron adentro del ruido. Se dice al pie. */
  parejas: number;
  /** Las dos muestras, para poder decir contra qué se está comparando. */
  ownGames: number;
  peerGames: number;
}

function formatear(key: RadarMetric, v: number): string {
  const a = RADAR_AXIS[key];
  return `${v.toFixed(a.decimals).replace(".", ",")}${a.suffix ?? ""}`;
}

export function leerElPerfil(radar: RadarProfile | null): Lectura | null {
  if (!radar) return null;
  const filas: FilaLectura[] = radar.axes.map((a) => ({
    key: a.key,
    valor: formatear(a.key, a.value),
    rol: formatear(a.key, a.peerMean),
    pct: Math.round(a.peerMean !== 0 ? ((a.value - a.peerMean) / Math.abs(a.peerMean)) * 100 : 0),
    z: a.z,
  }));

  const materiales = filas.filter((f) => Math.abs(f.pct) >= MATERIAL_PCT);
  // Por el z y no por el %: el z ya tiene en cuenta cuánto varía el grupo en
  // ese eje, así que ordena mejor lo que de verdad se despega. Un +40% en
  // algo donde todos andan disparejos dice menos que un +15% en algo parejo.
  const fuerte = materiales.filter((f) => f.pct > 0).sort((x, y) => y.z - x.z).slice(0, MAXIMO);
  const flojas = materiales.filter((f) => f.pct < 0).sort((x, y) => x.z - y.z);

  return {
    fuerte,
    // UNO solo. Dos focos no son un foco, y la segunda cosa a corregir no
    // sirve hasta que la primera esté corregida.
    foco: flojas[0] ?? null,
    parejas: filas.length - materiales.length,
    ownGames: radar.ownGames,
    peerGames: radar.peerGames,
  };
}

/**
 * La frase del foco: QUÉ MIDE esa métrica, dicho en una línea.
 *
 * Es un diccionario y no un modelo a propósito. Un texto generado podría
 * decir "te falta visión porque jugás muy agresivo", que es una causa que
 * nadie midió.
 *
 * Y dicen qué mide y nada más: ni la causa ni qué hacer al respecto. La
 * primera versión se pasaba de largo en dos —"es la que más se entrena sola,
 * en práctica", "no pide mecánica, pide estar ahí cuando pasan"— y eso ya no
 * es explicar una métrica, es dar un consejo que nadie pidió y que ningún
 * número de acá sostiene. Lo único que sí es descripción de la métrica y se
 * queda es cómo está construida (que el KDA es una división, que el daño
 * depende del campeón): eso es aritmética, no coaching.
 */
export const QUE_SIGNIFICA: Record<RadarMetric, string> = {
  kda: "Es la relación entre lo que aportás y lo que regalás. Como es una división, las muertes la mueven más que las kills.",
  killParticipation: "Es en cuántas de las kills de tu equipo estuviste, matando o asistiendo.",
  dmgShare: "Es qué parte del daño del equipo ponés vos. Depende bastante del campeón, no solo de cómo jugás.",
  objShare: "Es en cuántos dragones, heraldos, barones y torres del equipo estuviste.",
  goldPerMin: "Es cuánto oro generás por minuto, entre farmeo y peleas.",
  csPerMin: "Es cuántos súbditos rematás por minuto.",
  visionPerMin: "Es cuántos guardianes ponés y sacás por minuto.",
};
