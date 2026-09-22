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
 * Cuáles son LOS dos récords, y en qué orden va el resto.
 *
 * Dos grupos y no tres tamaños. Con tres, la pared era una grilla de seis
 * columnas con spans de 2 y 3 que nunca cerraban: quedaba un hueco al lado
 * de "mayor caída" y media fila vacía abajo del último. Ahora son dos
 * bloques —los dos grandes arriba, los otros cinco en una fila pareja— y no
 * hay espacio muerto en ninguna parte.
 *
 * Los dos grandes no se eligieron por estética: son los únicos dos de TODA
 * la historia y de una sola persona. El resto son de un día o de un par.
 */
const GRANDES = new Set(["racha", "pico"]);

const ORDEN: Record<string, number> = {
  racha: 1,
  pico: 2,
  subidaDia: 3,
  caidaDia: 4,
  partidasDia: 5,
  duo: 6,
  campeon: 7,
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

  const ordenados = [...records].sort((a, b) => (ORDEN[a.clave] ?? 99) - (ORDEN[b.clave] ?? 99));
  const grandes = ordenados.filter((r) => GRANDES.has(r.clave));
  const resto = ordenados.filter((r) => !GRANDES.has(r.clave));
  // Los récords de puntos no pueden ser más viejos que la primera foto de LP
  // guardada. Decirlo es la diferencia entre un récord y una mentira cómoda.
  const deLp = records.some((r) => r.clave === "subidaDia" || r.clave === "caidaDia" || r.clave === "pico");

  const item = (r: RecordGrupo, clase: string) => (
    <div className={clase} key={r.clave}>
      <span className="er-valor">{r.valor}</span>
      <span className="er-que">{r.titulo}</span>
      <span className="er-quien">
        {r.persona ? <PlayerAvatar name={r.persona.name} iconUrl={r.persona.profileIconUrl} className="er-cara" /> : null}
        {r.quien}
      </span>
      <span className="er-pie">
        {r.contexto}
        {r.cuando ? ` · ${fecha(r.cuando)}` : ""}
      </span>
    </div>
  );

  return (
    <section className="er">
      <div className="section-head">
        <h2>Récords de Grieta Central</h2>
        {deLp && lpDesde ? (
          <span className="meta">Los de puntos, desde el {fecha(lpDesde)} — que es cuando se empezaron a guardar</span>
        ) : null}
      </div>

      {grandes.length > 0 ? <div className="er-grandes">{grandes.map((r) => item(r, "er-item er-grande"))}</div> : null}
      {resto.length > 0 ? <div className="er-resto">{resto.map((r) => item(r, "er-item er-chico"))}</div> : null}
    </section>
  );
}
