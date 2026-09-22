import type { RecordGrupo } from "@/lib/radiografia";
import { PlayerAvatar } from "./PlayerAvatar";

/**
 * La pared de récords.
 *
 * Eran siete divs idénticos en una grilla: la composición decía que los
 * siete valen lo mismo, y no valen lo mismo. Una racha de once ganadas al
 * hilo no es del mismo tamaño que "más partidas en un día".
 *
 * Acá el peso lo da la jerarquía, no una caja: tres tamaños de récord
 * (`grande`, `medio`, `chico`) repartidos por importancia, separados por
 * líneas finas y apoyados sobre el fondo de la página. El orden y el tamaño
 * salen de PESOS, que está escrito una sola vez abajo; si mañana entra un
 * récord nuevo, se le pone su peso ahí y la pared se reacomoda sola.
 */

/**
 * Qué tan grande va cada récord, y en qué orden.
 *
 * El criterio no es estético: es cuánto cuesta conseguirlo. Una racha larga
 * y un pico de rango son de toda la historia y de una persona; "más
 * partidas en un día" es sobre todo aguante. Los de LP van juntos porque se
 * leen de a pares (lo que subió contra lo que bajó).
 */
const PESOS: Record<string, { tamano: "grande" | "medio" | "chico"; orden: number }> = {
  racha: { tamano: "grande", orden: 1 },
  pico: { tamano: "grande", orden: 2 },
  subidaDia: { tamano: "medio", orden: 3 },
  caidaDia: { tamano: "medio", orden: 4 },
  partidasDia: { tamano: "medio", orden: 5 },
  duo: { tamano: "chico", orden: 6 },
  campeon: { tamano: "chico", orden: 7 },
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function EstRecords({ records, lpDesde }: { records: RecordGrupo[]; lpDesde: string | null }) {
  if (records.length === 0) return null;

  const ordenados = [...records].sort(
    (a, b) => (PESOS[a.clave]?.orden ?? 99) - (PESOS[b.clave]?.orden ?? 99)
  );
  // Los récords de puntos no pueden ser más viejos que la primera foto de LP
  // guardada. Decirlo es la diferencia entre un récord y una mentira cómoda.
  const deLp = records.some((r) => r.clave === "subidaDia" || r.clave === "caidaDia" || r.clave === "pico");

  return (
    <section className="er">
      <div className="section-head">
        <h2>Récords de Grieta Central</h2>
        {deLp && lpDesde ? (
          <span className="meta">Los de puntos, desde el {fecha(lpDesde)} — que es cuando se empezaron a guardar</span>
        ) : null}
      </div>

      <div className="er-pared">
        {ordenados.map((r) => {
          const tamano = PESOS[r.clave]?.tamano ?? "chico";
          return (
            <div className={`er-item er-${tamano}`} key={r.clave}>
              <span className="er-valor">{r.valor}</span>
              <span className="er-que">{r.titulo}</span>
              <span className="er-quien">
                {r.persona ? (
                  <PlayerAvatar name={r.persona.name} iconUrl={r.persona.profileIconUrl} className="er-cara" />
                ) : null}
                {r.quien}
              </span>
              <span className="er-pie">
                {r.contexto}
                {r.cuando ? ` · ${fecha(r.cuando)}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
