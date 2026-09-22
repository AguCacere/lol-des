import type { HistoriaDelPeriodo } from "@/lib/radiografia";
import { PlayerAvatar } from "./PlayerAvatar";

/**
 * La portada del período.
 *
 * Reemplaza a seis fichas iguales en fila. El problema de esas fichas no era
 * el estilo: era que seis rectángulos del mismo tamaño dicen "acá hay seis
 * datos" y no dicen cuál importa. Nadie los leía — se escaneaban.
 *
 * Acá hay UNA persona grande y tres o cuatro notas al costado, y la
 * jerarquía la hacen el tamaño y el espacio, no una caja. No hay superficie
 * detrás de nada: el bloque vive sobre el fondo de la página y lo único que
 * lo estructura son una línea fina y la escala tipográfica.
 */
export function EstHistoria({ historia, etiqueta }: { historia: HistoriaDelPeriodo; etiqueta: string }) {
  const p = historia.protagonista;
  if (!p && historia.secundarias.length === 0) return null;

  return (
    <section className="hist-periodo">
      {p ? (
        <div className="hp-protagonista">
          <PlayerAvatar name={p.persona.name} iconUrl={p.persona.profileIconUrl} className="hp-cara" />
          {/* El nombre arriba del titular y los dos como una frase: la página
              es sobre esta gente, así que el que juega va antes que el dato. */}
          <h2 className="hp-titular">
            <span className="hp-nombre">{p.persona.name}</span>
            <span className="hp-verbo">{p.titular}</span>
          </h2>
          <div className="hp-cifra">
            <span className="hp-wr">{p.winrate.toFixed(1).replace(".", ",")}%</span>
            <span className="hp-wr-et">de winrate</span>
          </div>
          <p className="hp-detalle">
            {p.victorias}V — {p.derrotas}D <span className="hp-sep">·</span> {p.partidas} partidas
          </p>
          {/* Solo lo que EXISTE. Sin racha de tres o más, no hay renglón de
              racha: un "0 al hilo" sería ruido con forma de dato. */}
          {p.racha > 0 || p.lpDelta !== null ? (
            <p className="hp-extras">
              {p.racha > 0 ? <span className="hp-extra">{p.racha} victorias al hilo</span> : null}
              {p.lpDelta !== null ? (
                <span className={`hp-extra ${p.lpDelta > 0 ? "good" : p.lpDelta < 0 ? "bad" : ""}`}>
                  {p.lpDelta > 0 ? "+" : ""}
                  {p.lpDelta} PL en {etiqueta.toLowerCase() === "temporada" ? "la temporada" : etiqueta}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {historia.secundarias.length > 0 ? (
        <div className="hp-resto">
          {historia.secundarias.map((d) => (
            <div className="hp-nota" key={d.clave}>
              {/* El nombre primero y en grande; el rótulo abajo, como bajada.
                  Invertido respecto de las fichas viejas, donde el rótulo en
                  mayúsculas mandaba y la persona quedaba de pie de foto. */}
              <span className="hp-nota-quien">{d.persona.name}</span>
              <span className="hp-nota-que">{bajada(d.clave)}</span>
              <span className={`hp-nota-dato ${d.tono}`}>{d.valor}</span>
              <span className="hp-nota-pie">{d.contexto}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** El rótulo pasa de etiqueta de columna a frase: "fue el que más jugó". */
function bajada(clave: string): string {
  switch (clave) {
    case "racha":
      return "tuvo la mejor racha";
    case "partidas":
      return "fue el que más jugó";
    case "subida":
      return "fue el que más subió";
    case "caida":
      return "tuvo la mayor caída";
    case "actividad":
      return "fue el más constante";
    default:
      return "";
  }
}
