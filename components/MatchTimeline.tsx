import type { Match } from "@/lib/types";
import { lecturaDeOro, hitosDe, mmss, oro } from "@/lib/match-story";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";

/**
 * TU LÍNEA y LA PARTIDA: dos cosas distintas, dibujadas por separado.
 *
 * Antes eran un solo bloque llamado "Cómo se dio la partida" que mezclaba la
 * diferencia de oro contra tu rival con la primera sangre, el dragón, la torre
 * y el barón. Son dos dimensiones que no se explican entre sí —el barón no
 * dice nada de cómo te fue en tu línea, y tu línea no dice quién lo mató— y
 * ponerlas juntas invitaba a leer una causa donde solo hay dos hechos.
 *
 * Así que ahora:
 *
 *   - **TU LÍNEA** es la trayectoria de la diferencia de oro contra tu rival,
 *     con su pico y una frase descriptiva (ver lib/match-story.ts).
 *   - **LA PARTIDA** es la lista de hitos con su minuto. Lista, no relato.
 *
 * ## Sobre el gráfico
 *
 * Los puntos se unen con RECTAS. Antes era una curva suave por puntos medios,
 * con el argumento de que entre el 10′ y el 15′ no sabemos qué pasó y la curva
 * lo decía mejor. Es al revés: una curva dibuja un recorrido —con su
 * aceleración y su inflexión— que nadie midió. La recta no afirma nada sobre
 * el medio, solo une dos cosas que sí sabemos. Es la misma regla que ya usa
 * LigaCarrera.
 *
 * Se destaca UN punto, el pico. Los otros quedan chicos: llenar el gráfico de
 * marcas iguales es pedirle al que mira que decida cuál importa.
 *
 * Sobre cómo está armado: el SVG estira SOLO a lo ancho
 * (preserveAspectRatio="none" con la altura del viewBox igual a la altura real
 * en px). Eso hace que el eje vertical sea 1:1 con los píxeles, y por eso los
 * textos y los puntos son HTML posicionado por encima en vez de elementos del
 * SVG: adentro escalaban con el ancho del contenedor y un mismo font-size
 * terminaba enorme en desktop y diminuto en mobile.
 */

/** Unidades del viewBox a lo ancho. Arbitrario: el SVG se estira al ancho real. */
const W = 1000;
/**
 * Aire a los costados. A la derecha hay más porque ahí termina la última
 * medición y el punto necesita lugar para no comerse el borde.
 */
const PAD_L = 16;
const PAD_R = 34;
/** Alto de la banda de la curva. Bajó de 76: con dos o tres puntos, el aire de más solo estiraba el perfil. */
const PLOT_H = 62;
/** Espacio arriba de la curva, para que el punto del pico no toque el borde. */
const PLOT_TOP = 10;
/** Espacio debajo del eje para los minutos. */
const PIE_H = 18;
/**
 * Piso de la escala vertical. Sin esto, una partida pareja (±80 de oro) se
 * dibujaría como una montaña rusa: la curva se autoescala al máximo real y
 * exageraría diferencias que no significan nada.
 */
const ESCALA_MINIMA = 600;

const EJE_Y = PLOT_TOP + PLOT_H;
const H = EJE_Y + PIE_H;
/** Mitad de la altura útil de la curva, con aire para que el punto no toque el borde. */
const AMPLITUD = PLOT_H / 2 - 7;

/**
 * TU LÍNEA: el matchup, el pico, la trayectoria y una frase.
 *
 * Devuelve null cuando no hay ninguna medición guardada. No hay versión
 * degradada con un "sin datos" en el medio: si no sabemos, el bloque no está.
 */
export function TuLinea({ match, ddragonVersion }: { match: Match; ddragonVersion: string | null }) {
  const m = match;
  const lectura = lecturaDeOro(m);
  if (!lectura) return null;

  const { medidas, pico, picoEs, frase } = lectura;
  // El color del pico sale del PICO, no de dónde terminó la línea. Con
  // −800 / −100 / +500 el tono general es "good" (terminó arriba) y el número
  // grande es −800: pintarlo de verde decía lo contrario de lo que dice el
  // signo. Misma fuente para la etiqueta y para el color.
  const tonoPico = picoEs === "ventaja" ? "good" : picoEs === "desventaja" ? "bad" : "neutral";

  // El eje termina en la ÚLTIMA MEDICIÓN, no al final de la partida.
  //
  // Antes llegaba hasta m.dur (39′) y los tres puntos se amontonaban en la
  // mitad izquierda, con un "Final" al borde derecho. Eso sugería que el
  // último valor —−521— era el del minuto 39, cuando es el del 20. Ahora el
  // eje dice exactamente hasta dónde sabemos, y los minutos van abajo de cada
  // punto.
  const finMin = Math.max(...medidas.map((p) => p.min), 1);
  const x = (min: number) => PAD_L + (min / finMin) * (W - PAD_L - PAD_R);
  const xp = (min: number) => (x(min) / W) * 100;

  const escala = Math.max(ESCALA_MINIMA, ...medidas.map((p) => Math.abs(p.valor)));
  const zeroY = PLOT_TOP + PLOT_H / 2;
  const y = (valor: number) => zeroY - (valor / escala) * AMPLITUD;

  // El arranque es cero porque a los 0 minutos nadie sacó ventaja todavía:
  // ese punto no es una interpolación, es una definición.
  const puntos = [{ x: x(0), y: zeroY }, ...medidas.map((p) => ({ x: x(p.min), y: y(p.valor) }))];
  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const finArea = puntos[puntos.length - 1].x;
  const area = `${linea} L ${finArea} ${zeroY} L ${puntos[0].x} ${zeroY} Z`;

  return (
    <section className="linea-bloque">
      <header className="linea-cab">
        <h4 className="linea-titulo">Tu línea</h4>
        {/* Con las dos caras: la sección se entiende como un matchup antes de
            leer una palabra. Sigue siendo una línea de texto, no una tarjeta
            nueva. */}
        <span className="linea-vs">
          <span className="linea-lado">
            <ChampIcon champ={m.champ} version={ddragonVersion} className="linea-cara" />
            {championLabel(m.champ)}
          </span>
          {m.opponent && (
            <>
              <span className="linea-vs-sep">vs</span>
              <span className="linea-lado rival">
                <ChampIcon champ={m.opponent} version={ddragonVersion} className="linea-cara" />
                {championLabel(m.opponent)}
              </span>
            </>
          )}
        </span>
      </header>

      {/* El pico como dato con su rótulo, no como una frase con adjetivos.
          "Mayor brecha / −717 oro · 15′" dice qué se midió y cuándo. */}
      <p className={`linea-pico ${tonoPico}`}>
        <span className="linea-pico-k">
          {picoEs === "ventaja" ? "Mayor ventaja" : picoEs === "desventaja" ? "Mayor desventaja" : "Mayor diferencia"}
          <InfoTip text="El punto más lejos de la igualdad entre las mediciones guardadas (10′, 15′ y 20′). Es diferencia de oro contra tu rival de línea, no contra el equipo entero." />
        </span>
        <span className="linea-pico-v">
          {oro(pico.valor)} <span className="linea-pico-u">oro</span>
          <span className="linea-pico-min">· {pico.min}&#8242;</span>
        </span>
      </p>

      {/* El único contexto sobre el TAMAÑO de la brecha, y solo cuando el
          historial propio lo sostiene (décimo más extremo, con 40 partidas
          como mínimo). Si no, el número va pelado: mejor eso que inventar un
          "desventaja moderada" que no sale de ningún lado. */}
      {m.brechaRara && pico.min === 15 && (
        <p className="linea-contexto">
          {m.brechaRara === "abajo"
            ? "Pocas veces estuviste tan abajo a los 15\u2032."
            : "Pocas veces estuviste tan arriba a los 15\u2032."}
        </p>
      )}

      <div className="linea-plot" style={{ height: `${H}px` }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Diferencia de oro contra el rival de línea">
          <defs>
            {/* El área se pinta dos veces con el mismo recorte partido en la
                línea del cero: el verde es exactamente el tramo de arriba y el
                rojo el de abajo, sin degradados que mientan sobre el cruce. */}
            <clipPath id="ln-arriba">
              <rect x="0" y={PLOT_TOP} width={W} height={zeroY - PLOT_TOP} />
            </clipPath>
            <clipPath id="ln-abajo">
              <rect x="0" y={zeroY} width={W} height={EJE_Y - zeroY} />
            </clipPath>
          </defs>

          {/* Ya no hace falta desvanecer el final: el eje TERMINA en la última
              medición, así que no queda nada después que se pueda leer como
              un derrumbe. */}
          <path className="ln-area good" d={area} clipPath="url(#ln-arriba)" />
          <path className="ln-area bad" d={area} clipPath="url(#ln-abajo)" />
          <path className="ln-trazo" d={linea} vectorEffect="non-scaling-stroke" />

          <line className="ln-cero" vectorEffect="non-scaling-stroke" x1={PAD_L} x2={W - 4} y1={zeroY} y2={zeroY} />
        </svg>

        {/* La referencia del cero dicha con palabras. Una línea punteada en el
            medio no se explica sola, y sin saber que ahí está la igualdad el
            gráfico entero no quiere decir nada. */}
        <span className="ln-cero-k" style={{ top: `${zeroY}px` }}>
          igualdad
        </span>

        {medidas.map((p) => {
          const esPico = p.min === pico.min;
          return (
            <span
              key={p.min}
              className={`ln-punto ${p.valor >= 0 ? "good" : "bad"}${esPico ? " pico" : ""}`}
              style={{ left: `${xp(p.min)}%`, top: `${y(p.valor)}px` }}
              title={`${p.min}′: ${oro(p.valor)} de oro`}
            />
          );
        })}

        {/* El minuto real abajo de cada punto. "Inicio" y "Final" no eran los
            de la partida —que duró 39— sino los de los datos, y eso era
            justamente lo que confundía. */}
        {medidas.map((p) => (
          <span key={`min${p.min}`} className="ln-min" style={{ left: `${xp(p.min)}%`, top: `${EJE_Y + 3}px` }}>
            {p.min}&#8242;
          </span>
        ))}
      </div>

      {/* Una frase, descriptiva, o ninguna. Nunca un bloque de color con una
          conclusión: lo que se afirma acá es solo lo que se midió. */}
      {frase && <p className="linea-frase">{frase}</p>}
    </section>
  );
}

/**
 * LA PARTIDA: los hitos con su minuto, y nada más.
 *
 * Antes el barón venía con un remate —"Igual la ganaron: se definió en otra
 * parte del mapa"— que con una diferencia de oro y cuatro tiempos no se puede
 * sostener. Acá cada hito dice cuándo pasó y de quién fue. Punto.
 */
export function LaPartida({ match }: { match: Match }) {
  const hitos = hitosDe(match);
  if (hitos.length === 0) return null;

  // El riel va del primer hito al último, no de 0 al final de la partida: con
  // la primera sangre a los 2:54 y el barón a los 24:38 en una partida de 39,
  // anclarlo al cero dejaba todo apelotonado en el primer tercio.
  const desde = hitos[0].s;
  const hasta = hitos[hitos.length - 1].s;
  const span = Math.max(1, hasta - desde);
  // Con un solo hito no hay recorrido: va al medio y sin riel.
  const pos = (s: number) => (hitos.length === 1 ? 50 : ((s - desde) / span) * 100);

  return (
    <section className="partida-bloque">
      <h4 className="linea-titulo">La partida</h4>
      {/* Una línea de tiempo y no una tira de números: los objetivos pasaron
          en un orden y a una distancia, y eso es justo lo que una lista de
          cuatro textos seguidos no deja ver. El color dice de qué equipo fue
          cada uno. Nada más: estos datos no explican el resultado. */}
      <div className={`partida-riel${hitos.length === 1 ? " solo" : ""}`}>
        {hitos.length > 1 && <span className="partida-via" />}
        {hitos.map((h, i) => (
          <span
            key={`${h.label}-${h.s}`}
            // El primero y el último se anclan a su borde con una clase propia
            // y no con :first-of-type, que matcheaba el riel —también es un
            // span— y dejaba al primer hito centrado, saliéndose 38px por la
            // izquierda. Medido, no supuesto.
            className={[
              "partida-hito",
              h.mio === true ? "mio" : h.mio === false ? "suyo" : "",
              hitos.length > 1 && i === 0 ? "primero" : "",
              hitos.length > 1 && i === hitos.length - 1 ? "ultimo" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left: `${pos(h.s)}%` }}
          >
            <span className="partida-hito-t">{mmss(h.s)}</span>
            <span className="partida-punto" />
            <span className="partida-hito-k">{h.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
