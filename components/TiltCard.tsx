import type { TiltState } from "@/lib/tilt";

/**
 * El aviso de tilt (ver lib/tilt.ts para el criterio).
 *
 * Aparece solo cuando hay algo que decir, y dice POR QUÉ: las señales vienen
 * con los números que las dispararon. Un cartel que solo dijera "estás en
 * tilt" es una opinión; uno que dice "morís 10 por partida contra 4.2 de tu
 * promedio" es un dato que se puede mirar y discutir.
 */
export function TiltCard({ tilt }: { tilt: TiltState }) {
  const fuerte = tilt.nivel === "fuerte";
  return (
    <div className={`tilt-card ${tilt.nivel}`}>
      <div className="tilt-card-head">
        <span className="tilt-card-dot" />
        {fuerte ? "Pará un rato" : "Ojo con esto"}
        <span className="tilt-card-streak">{tilt.derrotas} derrotas seguidas</span>
      </div>
      <ul className="tilt-card-list">
        {tilt.senales.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="tilt-card-foot">
        {fuerte
          ? "La que viene no lo arregla. Levantate, tomá algo y volvé en un rato."
          : "Todavía se puede cortar. Una pausa de veinte minutos hace más que la próxima partida."}
      </p>
    </div>
  );
}
