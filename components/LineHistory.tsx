import type { HistorialLineas } from "@/lib/lineas";
import { ROLES } from "@/lib/ladder";
import { RoleIcon } from "./RoleIcon";
import { InfoTip } from "./InfoTip";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";



/**
 * "Sus líneas" — cuánto jugó cada una, cómo le fue, y si lo están sacando de
 * la suya. Sale de team_position, la posición REAL que Riot asigna partida a
 * partida.
 *
 * La barra dice el winrate y el número también: el verde y el rojo de la app
 * están a ΔE 7.1 en visión deuteranope, así que el color solo no puede ser el
 * único que lo diga.
 */
export function LineHistory({ h }: { h: HistorialLineas }) {
  const jugadas = h.lineas.filter((l) => l.games > 0);
  if (jugadas.length === 0) return null;

  const maxPartidas = jugadas[0].games;
  // ROLES[].label viene capitalizado para usarse como título ("Jungla",
  // "ADC"), pero en el medio de una frase "De Jungla gana el 56%" queda raro.
  // Se pasa a minúscula salvo ADC, que es una sigla: "De adc gana el 51%" es
  // directamente un error de ortografía.
  const principal = h.principal === "adc" ? "ADC" : ROLES[h.principal].label.toLowerCase();

  return (
    <div className="lineas">
      <div className="lineas-filas">
        {jugadas.map((l) => {
          return (
            <div className="lineas-fila" key={l.role}>
              <span className="lineas-rol" title={ROLES[l.role].label}>
                <RoleIcon role={l.role} />
              </span>
              <span className="lineas-nombre">{ROLES[l.role].label}</span>
              {/* Victorias y derrotas apiladas, y el LARGO total proporcional
                  a cuánto jugó esa línea. Las dos cosas de una: una línea de
                  5 partidas es una rayita corta aunque tenga 60%, que es
                  justo lo que hay que ver. Superponer dos barras no servía —
                  la del winrate tapaba a la del volumen y una línea de 5
                  partidas dibujaba más largo que una de 105. */}
              <span className="lineas-barra" aria-hidden>
                <span className="lineas-barra-total" style={{ width: `${(100 * l.games) / maxPartidas}%` }}>
                  <span className="lineas-barra-v" style={{ width: `${(100 * l.wins) / l.games}%` }} />
                  <span className="lineas-barra-d" />
                </span>
              </span>
              <span className={`lineas-wr ${tonoDeWinrate(l.wins, l.games)}`}>{winrateTexto(l.wins, l.games)}</span>
              <span className="lineas-detalle">
                {l.wins}V-{l.games - l.wins}D
                {l.kda !== null && <span className="lineas-kda">KDA {l.kda.toFixed(2)}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* La conclusión, que es lo que la tabla sola no dice. */}
      <p className="lineas-conclusion">
        {h.fuera.games === 0 ? (
          <>
            Solo jugó de <strong>{principal}</strong>: las {h.enPrincipal.games} partidas guardadas son en esa línea.
          </>
        ) : (
          <>
            De <strong>{principal}</strong> gana el{" "}
            <strong className={tonoDeWinrate(h.enPrincipal.wins, h.enPrincipal.games) === "bad" ? "gd-neg" : "gd-pos"}>
              {winrateTexto(h.enPrincipal.wins, h.enPrincipal.games)}
            </strong>; fuera de ahí, el{" "}
            <strong className={tonoDeWinrate(h.fuera.wins, h.fuera.games) === "bad" ? "gd-neg" : "gd-pos"}>
              {winrateTexto(h.fuera.wins, h.fuera.games)}
            </strong>.
            {h.loSacanDeSuLinea && (
              <>
                {" "}
                Y lo están sacando seguido: {h.recientesFuera} de las últimas {h.recientes} fueron en otra línea.
                <InfoTip text="Riot no dice qué línea pediste en la cola, así que esto no es el autofill de verdad: es que la mayoría de su historial es una línea y últimamente está jugando bastante en otras. Puede ser autofill o puede ser que haya cambiado de main." />
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
