"use client";

import { useState } from "react";
import { lineAreaGeometry } from "@/lib/chart";

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
 * La primera versión de esto no se entendía, y por tres cosas que se
 * arreglaron acá:
 *
 * 1. NO TENÍA EJE Y. Siete líneas flotando sin una sola marca de cuánto. Una
 *    altura sin escala no dice nada: se veía que había una arriba y un montón
 *    abajo, y eso ya lo decía la tabla. Ahora hay grilla con los puntos
 *    escritos y el cero marcado.
 * 2. NO SE SABÍA DE QUIÉN ERA CADA LÍNEA sin ir a tocar un chip. Ahora cada
 *    una termina con el nombre escrito al lado, separados para que no se
 *    pisen: se leen de arriba abajo en el orden en que van.
 * 3. ERA MUY CHATA. El viewBox de 620 se estiraba a 1150px reales —casi el
 *    doble— y eso aplasta las pendientes hasta que todo parece plano. Ahora el
 *    viewBox arranca cerca del ancho real y es bastante más alto.
 */

export interface CorredorCarrera {
  puuid: string;
  name: string;
  /** El acumulado al cierre de cada día, arrancando en 0. Ver puntosPorDia. */
  porDia: number[];
  puntos: number;
}

/**
 * El viewBox. Ancho cerca del que se dibuja de verdad en una pantalla de
 * escritorio (~1150px): con preserveAspectRatio="none", cuanto más lejos esté,
 * más se estira todo a lo ancho y más chatas quedan las pendientes.
 */
const W = 1000;
const H = 250;
/** El pasillo de la derecha donde van los nombres, fuera del dibujo. */
const PASILLO = 128;
/** Y el de la izquierda, para los números del eje. */
const EJE = 34;
const PAD_Y = 20;
/** Hasta dónde llega el dibujo. De acá a W está el pasillo de los nombres. */
const PLOT = W - PASILLO;
/**
 * Piso de recorrido, en puntos. Un lunes en el que todos están entre −1 y +1
 * no se puede dibujar a fondo de escala: serían montañas sobre nada. Cuatro
 * puntos son cuatro victorias netas, que en esta liga ya es una diferencia de
 * verdad.
 */
const MIN_RECORRIDO = 4;
/** Cuánto tienen que separarse dos nombres del pasillo para no pisarse. */
const SEPARACION = 17;

/** "+9,75" / "−1,5" / "0", con coma y con el menos de verdad. */
function pts(n: number): string {
  const redondeado = Math.round(n * 100) / 100;
  if (redondeado === 0) return "0";
  const cuerpo = Math.abs(redondeado).toString().replace(".", ",");
  return (redondeado > 0 ? "+" : "−") + cuerpo;
}

/**
 * Las marcas del eje: valores redondos, entre tres y cinco. Se eligen de una
 * lista de pasos "lindos" en vez de dividir el recorrido en partes iguales —
 * un eje que dice 2,83 y 5,66 es peor que no tener eje.
 */
function marcasDelEje(min: number, max: number): number[] {
  const recorrido = max - min;
  const paso = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50].find((p) => recorrido / p <= 5) ?? 100;
  const marcas: number[] = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) {
    marcas.push(Math.round(v * 100) / 100);
  }
  return marcas;
}

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
    // El ancho que se le pasa es PLOT + EJE con padX = EJE: así los puntos
    // caen entre EJE y PLOT, y de PLOT a W queda el pasillo de los nombres.
    const g = lineAreaGeometry(serie, PLOT + EJE, H, EJE, MIN_RECORRIDO, PAD_Y, "recta", escala);
    return { ...c, line: g.line, last: g.last, points: g.points, yOf: g.yOf };
  });
  const enFocoTrazo = trazos.find((t) => t.puuid === foco.puuid) ?? trazos[0];
  const { yOf } = enFocoTrazo;

  /**
   * Los nombres del pasillo, empujados hacia abajo hasta que ninguno se pise.
   * Se recorre de arriba abajo y después se acomoda para atrás si el último se
   * pasó del borde — con seis o siete que terminan casi empatados, sin esto
   * quedan todos escritos uno encima del otro.
   */
  const nombres = trazos
    .map((t) => ({ puuid: t.puuid, name: t.name, puntos: t.puntos, y: t.last[1] }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < nombres.length; i++) {
    nombres[i].y = Math.max(nombres[i].y, nombres[i - 1].y + SEPARACION);
  }
  const sobra = nombres[nombres.length - 1].y - (H - 6);
  if (sobra > 0) for (const n of nombres) n.y -= sobra;

  const marcas = marcasDelEje(min, max).map((v) => ({ v, y: yOf(v) }));

  // La ventaja del primero sobre el segundo, para decir en una línea qué está
  // pasando. Sale de los datos, no de una interpretación: es una resta.
  const orden = [...utiles].sort((a, b) => b.puntos - a.puntos);
  const ventaja = orden.length > 1 ? orden[0].puntos - orden[1].puntos : null;

  return (
    <div className="carrera">
      <div className="carrera-head">
        <span className="carrera-titulo">La carrera</span>
        <span className="carrera-sub">
          Puntos acumulados, día por día.
          {ventaja != null && ventaja > 0 && (
            <>
              {" "}
              <b>{orden[0].name}</b> va {pts(ventaja)} arriba del segundo.
            </>
          )}
        </span>
      </div>

      <div className="carrera-caja">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="carrera-svg"
          role="img"
          aria-label="Puntos acumulados de cada uno, día por día"
        >
          {/* La grilla primero, bien apagada: es la referencia, no el dato. El
              cero va más marcado que el resto — es la línea que separa la
              semana ganada de la perdida. */}
          {marcas.map((m) => (
            <line
              key={m.v}
              x1={EJE}
              y1={m.y}
              x2={PLOT}
              y2={m.y}
              className={m.v === 0 ? "carrera-cero" : "carrera-grilla"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* Los que NO están en foco, primero, para que queden por debajo. */}
          {trazos
            .filter((t) => t.puuid !== foco.puuid)
            .map((t) => (
              <path key={t.puuid} d={t.line} className="carrera-linea" vectorEffect="non-scaling-stroke" />
            ))}
          <path d={enFocoTrazo.line} className="carrera-linea en-foco" vectorEffect="non-scaling-stroke" />
          {enFocoTrazo.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3} className="carrera-punto" />
          ))}
        </svg>

        {/* Todas las etiquetas van en HTML encima del SVG y no adentro: el
            <text> de un SVG escala con la caja, y con preserveAspectRatio="none"
            en un celular "mié" cae a 4px. */}
        {marcas.map((m) => (
          <span key={m.v} className="carrera-eje" style={{ top: `${(m.y / H) * 100}%` }}>
            {pts(m.v)}
          </span>
        ))}

        {/* El nombre al final de cada línea. Es lo que faltaba: sin esto había
            que ir a tocar un chip para saber de quién era cada una, y un
            gráfico que no se entiende sin tocarlo no se entiende. */}
        {nombres.map((n) => (
          <span
            key={n.puuid}
            className={`carrera-nombre${n.puuid === foco.puuid ? " en-foco" : ""}`}
            style={{ top: `${(n.y / H) * 100}%`, left: `${(PLOT / W) * 100}%` }}
            onMouseEnter={() => setEnFoco(n.puuid)}
          >
            <span className="carrera-nombre-txt">{n.name}</span>
            <span className="carrera-nombre-pts">{pts(n.puntos)}</span>
          </span>
        ))}
      </div>

      {/* Cada día CENTRADO en su tramo, no debajo del punto: el tramo entre dos
          puntos ES el día, y el punto es el cierre. Con la etiqueta debajo del
          punto, "lun" caía sobre el cierre del lunes y se leía corrido. */}
      <div className="carrera-dias" aria-hidden>
        {dias.slice(0, largo - 1).map((d, i) => {
          const medio = (enFocoTrazo.points[i][0] + enFocoTrazo.points[i + 1][0]) / 2;
          return (
            <span key={`${d}-${i}`} style={{ left: `${(medio / W) * 100}%` }}>
              {d}
            </span>
          );
        })}
      </div>

      {/* Los chips siguen siendo el control —y en el teléfono, donde los
          nombres del pasillo no entran, también la leyenda. */}
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
            <span className="carrera-chip-pts">{pts(t.puntos)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
