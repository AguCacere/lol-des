import type { AegisDetection } from "@/lib/types";
import { ShieldIcon } from "./StatIcons";

/**
 * La señal de Aegis, pegada a la partida que la recibió.
 *
 * Reemplaza al bloque "Aegis of Valor (estimado)" que vivía suelto en el
 * Resumen y decía "3 posibles doble LP": un número que no se podía ir a
 * mirar. Aegis pasa a ser una propiedad DE UNA PARTIDA —que es lo que es— y
 * por eso aparece en el renglón de esa partida y como marca en el gráfico de
 * progresión, no como una sección propia.
 *
 * Es una chapa chica con el globo de explicación al lado, no una tarjeta.
 * Reusa la mecánica de `.info-tip` (hover, foco con teclado, toque en el
 * teléfono) en vez de escribir otra: la clase `info-tip` va en la chapa
 * misma, y `.aegis-sen.info-tip` le gana en especificidad a las medidas del
 * ⓘ sin depender del orden en la hoja.
 *
 * El texto dice "Aegis detectado" o "Posible Aegis" según la confianza, y el
 * globo cuenta con qué se comparó. Nunca un porcentaje de probabilidad: no
 * tenemos con qué calcularlo y sería un número inventado con cara de dato.
 */
export function AegisSenal({ d }: { d: AegisDetection }) {
  const alta = d.confidence === "high";
  const ratio = d.ratio.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <span className={`aegis-sen info-tip${alta ? " alta" : ""}`} tabIndex={0}>
      <ShieldIcon />
      {/* El texto en su propio span para poder esconderlo cuando la columna
          de partidas es angosta y dejar el escudo solo — mismo truco que la
          chapa de "Para repasar", y por el mismo motivo medido: a 390 el
          nombre del campeón salía "S…". */}
      <b className="aegis-sen-txt">{alta ? "Aegis" : "Posible Aegis"}</b>
      <span className="info-tip-bubble aegis-globo" role="tooltip">
        <b>{alta ? "Aegis detectado" : "Posible Aegis"}</b>
        {`+${d.lpDelta} LP en esta partida, contra los ~${d.baselineLp} que le suele dar una victoria: ${ratio}× lo habitual. `}
        {alta
          ? "Riot no publica este dato, así que sigue siendo una inferencia: sale de comparar el LP real de esta partida contra la mediana de sus propias victorias."
          : "Se dice “posible” y no “detectado” porque le falta alguna de las tres: acercarse a 2×, tener suficientes victorias con LP propio para comparar, o que los contadores de victorias de la foto confirmen que en ese rato jugó esta y nada más."}
      </span>
    </span>
  );
}
