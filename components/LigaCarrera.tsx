"use client";

import { useId, useState } from "react";
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
 * Tres rondas de arreglos, cada una por algo que se vio en pantalla:
 *
 * 1. No tenía EJE Y. Siete líneas flotando sin una marca de cuánto: se veía que
 *    había una arriba y un montón abajo, o sea lo mismo que ya decía la tabla.
 * 2. No se sabía DE QUIÉN era cada línea sin ir a tocar un chip. Un gráfico que
 *    no se entiende sin tocarlo no se entiende.
 * 3. Quedaba TOSCO: polilínea pelada sobre fondo negro, sin relleno, sin
 *    jerarquía arriba y sin nada que separara los días. Ahora la curva es
 *    suave, la que está en foco lleva su degradado abajo, la grilla tiene
 *    columnas por día y el encabezado tiene tres niveles en vez de un renglón
 *    con todo apretado.
 *
 * La selección va por CLICK y no por hover. Con seis líneas, el hover hacía que
 * el resaltado saltara de una a otra con solo cruzar el gráfico con el mouse:
 * el dibujo se movía solo mientras uno intentaba leerlo. El hover quedó nada
 * más como afordancia —la línea de abajo del mouse se aclara un poco— que avisa
 * que se puede tocar sin cambiar nada.
 *
 * La curva suave es `smoothLinePath` (lib/chart.ts): interpolación cúbica
 * monótona, o sea que PASA por cada punto y no se pasa entre dos. Las dos
 * propiedades importan acá — la primera porque el gráfico marca cada cierre de
 * día con un círculo y si la curva no lo toca se contradice sola, la segunda
 * porque una Catmull-Rom inventaría picos que los datos no tienen.
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
const H = 264;
/** El pasillo de la derecha donde van los nombres, fuera del dibujo. */
const PASILLO = 152;
/** Y el de la izquierda, para los números del eje. */
const EJE = 40;
const PAD_Y = 24;
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
const SEPARACION = 18;

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
  const gid = "carrera-" + useId().replace(/:/g, "");

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
    const g = lineAreaGeometry(serie, PLOT + EJE, H, EJE, MIN_RECORRIDO, PAD_Y, "curva", escala);
    return { ...c, line: g.line, area: g.area, last: g.last, points: g.points, yOf: g.yOf };
  });
  const enFocoTrazo = trazos.find((t) => t.puuid === foco.puuid) ?? trazos[0];
  const { yOf, points } = enFocoTrazo;

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
  const sobra = nombres[nombres.length - 1].y - (H - 8);
  if (sobra > 0) for (const n of nombres) n.y -= sobra;

  const marcas = marcasDelEje(min, max).map((v) => ({ v, y: yOf(v) }));

  // La ventaja del primero sobre el segundo, para decir en una línea qué está
  // pasando. Sale de los datos, no de una interpretación: es una resta.
  const orden = [...utiles].sort((a, b) => b.puntos - a.puntos);
  const ventaja = orden.length > 1 ? orden[0].puntos - orden[1].puntos : null;

  return (
    <div className="carrera">
      {/* Tres niveles y no un renglón con todo adentro: el rótulo dice qué
          sección es, el titular dice qué está pasando y el pie dice qué se
          está midiendo. Antes iban los tres apretados en una línea de 11px y
          el bloque entero se leía como una nota al pie. */}
      <div className="carrera-head">
        <span className="carrera-rotulo">La carrera</span>
        <strong className="carrera-titular">
          {ventaja != null && ventaja > 0 ? (
            <>
              {orden[0].name} va <span className="carrera-ventaja">{pts(ventaja)}</span> arriba del segundo
            </>
          ) : (
            "La semana está pareja arriba"
          )}
        </strong>
        <span className="carrera-pie">
          Puntos acumulados al cierre de cada día · clic en un nombre para seguirlo
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
          <defs>
            {/* El degradado de abajo de la línea en foco. Se apaga rápido: es
                para darle cuerpo a la línea, no para leer un área — el dato es
                la altura de la curva, no la superficie. */}
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="carrera-area-arriba" />
              {/* El stop del medio existe para matar la pared: el relleno
                  termina en un corte vertical abajo del último punto, y con un
                  degradado lineal parejo ese corte se ve como un muro. Cayendo
                  rápido, a media altura ya casi no hay tinta que dibuje el
                  borde. */}
              <stop offset="45%" className="carrera-area-medio" />
              <stop offset="100%" className="carrera-area-abajo" />
            </linearGradient>
            {/* El mismo brillo contenido que usa SparkChart: sin él la línea se
                lee como un pelo plano sobre el fondo. Poco radio a propósito —
                más se empasta en una mancha abajo del trazo. */}
            <filter id={`${gid}-glow`} filterUnits="userSpaceOnUse" x={-12} y={-12} width={W + 24} height={H + 24}>
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Las columnas de cada día. Son lo que convierte seis líneas
              flotando en una grilla: sin ellas no había con qué relacionar una
              altura con un día más que bajando la vista hasta las etiquetas. */}
          {points.slice(1).map(([x], i) => (
            <line key={`d${i}`} x1={x} y1={PAD_Y - 8} x2={x} y2={H - PAD_Y + 8} className="carrera-columna" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Y la grilla de valores. El cero va aparte y más marcado: es la
              línea que separa la semana ganada de la perdida, no una marca
              más. */}
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

          {/* El relleno va solo abajo de la que está en foco. Con seis rellenos
              superpuestos no se ve ninguna línea: se convierte en un manchón. */}
          <path d={enFocoTrazo.area} fill={`url(#${gid})`} stroke="none" />

          {/* Los que NO están en foco, primero, para que queden por debajo. */}
          {trazos
            .filter((t) => t.puuid !== foco.puuid)
            .map((t) => (
              <g key={t.puuid} onClick={() => setEnFoco(t.puuid)}>
                {/* Un trazo ancho e invisible encima para agarrar el mouse: una
                    línea de 1,5px es imposible de apuntar, y que el gráfico no
                    reaccione a nada es la mitad de la sensación de tosco. */}
                <path d={t.line} className="carrera-agarre" />
                <path d={t.line} className="carrera-linea" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          <path d={enFocoTrazo.line} className="carrera-linea en-foco" vectorEffect="non-scaling-stroke" filter={`url(#${gid}-glow)`} />
          {points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 4 : 2.8} className="carrera-punto" />
          ))}
        </svg>

        {/* Todas las etiquetas van en HTML encima del SVG y no adentro: el
            <text> de un SVG escala con la caja, y con preserveAspectRatio="none"
            en un celular "mié" cae a 4px. */}
        {marcas.map((m) => (
          <span key={m.v} className={`carrera-eje${m.v === 0 ? " es-cero" : ""}`} style={{ top: `${(m.y / H) * 100}%` }}>
            {pts(m.v)}
          </span>
        ))}

        {/* El nombre al final de cada línea, con su marquita adelante. Sin la
            marca el nombre es texto suelto al costado; con ella se lee como la
            continuación de la línea, que es lo que es. */}
        {nombres.map((n) => (
          <span
            key={n.puuid}
            className={`carrera-nombre${n.puuid === foco.puuid ? " en-foco" : ""}`}
            style={{ top: `${(n.y / H) * 100}%`, left: `${(PLOT / W) * 100}%` }}
            onClick={() => setEnFoco(n.puuid)}
          >
            <span className="carrera-marca" aria-hidden />
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
          const medio = (points[i][0] + points[i + 1][0]) / 2;
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
          >
            <span className="carrera-chip-nombre">{t.name}</span>
            <span className="carrera-chip-pts">{pts(t.puntos)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
