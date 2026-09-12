"use client";

import { useState } from "react";
import { lineAreaGeometry } from "@/lib/chart";
import { puntajeTexto } from "@/lib/liga";

/**
 * La carrera de la semana: los puntos de todos, día por día, en un solo
 * gráfico.
 *
 * Es lo que la columna de curvitas no podía contar. Siete miniaturas separadas
 * dicen la forma de cada semana por su cuenta, pero nunca cuándo el primero se
 * escapó ni quién iba ganando el miércoles — para eso las líneas tienen que
 * compartir la caja.
 *
 * El eje X va por DÍA y no por partida: cada uno juega una cantidad distinta,
 * así que la partida 5 de uno y la 5 de otro pasaron en momentos distintos de
 * la semana, y cruzarlas en el mismo eje no significaría nada. Ver puntosPorDia
 * en lib/liga.ts.
 *
 * Y una sola línea a la vez en color, el resto en gris. Con siete colores a la
 * par no se distingue ninguna —y bajo daltonismo, menos—: el gráfico se
 * convierte en un plato de fideos. Una en foco y seis de contexto es la forma
 * que se lee, y quién está en foco lo elige el que mira.
 */

export interface CorredorCarrera {
  puuid: string;
  name: string;
  /** El acumulado al cierre de cada día, arrancando en 0. Ver puntosPorDia. */
  porDia: number[];
  puntos: number;
}

const W = 620;
const H = 168;
const PAD_X = 16;
const PAD_Y = 14;
/**
 * Piso de recorrido, en puntos. Un lunes en el que todos están entre −1 y +1
 * no se puede dibujar a fondo de escala: serían montañas sobre nada. Cuatro
 * puntos son cuatro victorias netas, que en esta liga ya es una diferencia de
 * verdad.
 */
const MIN_RECORRIDO = 4;

export function LigaCarrera({ corredores, dias }: { corredores: CorredorCarrera[]; dias: string[] }) {
  const [enFoco, setEnFoco] = useState<string | null>(null);

  // Con un solo día corrido —el lunes a la mañana— no hay carrera que dibujar:
  // son siete puntos en la misma vertical. Se espera al segundo cierre.
  const utiles = corredores.filter((c) => c.porDia && c.porDia.length >= 2);
  if (utiles.length === 0 || dias.length < 2) return null;

  // El foco por defecto es el puntero: el que va ganando es de quien se quiere
  // ver la línea antes de tocar nada.
  const foco = utiles.find((c) => c.puuid === enFoco) ?? utiles[0];

  /**
   * La escala la comparten los siete por definición —están en la misma caja—,
   * pero hay que calcularla sobre TODOS y no sobre el que está en foco: si no,
   * cambiar de jugador movería el eje y las líneas de los demás saltarían de
   * lugar sin que haya pasado nada.
   */
  const todos = utiles.flatMap((c) => c.porDia);
  let min = Math.min(0, ...todos);
  let max = Math.max(0, ...todos);
  const falta = MIN_RECORRIDO - (max - min);
  if (falta > 0) {
    min -= falta / 2;
    max += falta / 2;
  }
  const escala = { min, max };

  // Todos se dibujan con la misma cantidad de días aunque a alguno le falte
  // (una respuesta vieja del CDN, alguien que se anotó ayer): se repite su
  // último valor hasta el final, que es lo que de verdad pasó — no jugó y no
  // se movió.
  const largo = Math.max(...utiles.map((c) => c.porDia.length));
  const trazos = utiles.map((c) => {
    const serie = [...c.porDia];
    while (serie.length < largo) serie.push(serie[serie.length - 1]);
    const g = lineAreaGeometry(serie, W, H, PAD_X, MIN_RECORRIDO, PAD_Y, "recta", escala);
    return { ...c, serie, line: g.line, last: g.last, points: g.points, yOf: g.yOf };
  });
  const enFocoTrazo = trazos.find((t) => t.puuid === foco.puuid) ?? trazos[0];
  const yCero = enFocoTrazo.yOf(0);
  const ceroVisible = yCero > PAD_Y && yCero < H - PAD_Y;

  return (
    <div className="carrera">
      <div className="carrera-head">
        <span className="carrera-titulo">La carrera</span>
        <span className="carrera-sub">
          Cómo se fue armando el puntaje de cada uno, día por día. Tocá un nombre para seguirlo.
        </span>
      </div>

      <div className="carrera-caja">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="carrera-svg" role="img" aria-label="La carrera de la semana">
          {ceroVisible && <line x1={PAD_X} y1={yCero} x2={W - PAD_X} y2={yCero} className="carrera-cero" vectorEffect="non-scaling-stroke" />}
          {/* Los que NO están en foco, primero, para que queden por debajo. */}
          {trazos
            .filter((t) => t.puuid !== foco.puuid)
            .map((t) => (
              <path key={t.puuid} d={t.line} className="carrera-linea" vectorEffect="non-scaling-stroke" />
            ))}
          <path d={enFocoTrazo.line} className="carrera-linea en-foco" vectorEffect="non-scaling-stroke" />
          {enFocoTrazo.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.6} className="carrera-punto" />
          ))}
        </svg>

        {/* Las etiquetas van en HTML encima del SVG y no adentro: el <text> de
            un SVG escala con la caja, y con preserveAspectRatio="none" en un
            celular "mié" cae a 4px. */}
        <span
          className="carrera-marca"
          style={{ left: `${(enFocoTrazo.last[0] / W) * 100}%`, top: `${(enFocoTrazo.last[1] / H) * 100}%` }}
        >
          {puntajeTexto(foco.puntos)}
        </span>
      </div>

      {/* Cada día debajo de SU punto, no repartidos parejo por el ancho: el
          primer punto de la serie es el arranque en 0 y no lleva etiqueta, así
          que un reparto parejo los dejaría a todos corridos un lugar. El left
          se recorta a los costados para que el lunes y el domingo no se salgan
          de la caja. */}
      <div className="carrera-dias" aria-hidden>
        {dias.slice(0, largo - 1).map((d, i) => (
          <span
            key={`${d}-${i}`}
            style={{ left: `${Math.min(Math.max((enFocoTrazo.points[i + 1][0] / W) * 100, 4), 96)}%` }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* La leyenda es también el control: con siete líneas grises, el nombre
          en foco es lo único que dice de quién es la que está pintada. */}
      <div className="carrera-chips">
        {trazos.map((t) => (
          <button
            key={t.puuid}
            type="button"
            className={`carrera-chip${t.puuid === foco.puuid ? " en-foco" : ""}`}
            onClick={() => setEnFoco(t.puuid)}
            onMouseEnter={() => setEnFoco(t.puuid)}
          >
            <span className="carrera-chip-nombre">{t.name}</span>
            <span className="carrera-chip-pts">{puntajeTexto(t.puntos)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
