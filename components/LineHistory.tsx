import type { HistorialLineas } from "@/lib/lineas";
import { ROLES } from "@/lib/ladder";
import { RoleIcon } from "./RoleIcon";
import { InfoTip } from "./InfoTip";

const pct = (wins: number, games: number) => (games > 0 ? Math.round((100 * wins) / games) : 0);

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
  const wrPrincipal = pct(h.enPrincipal.wins, h.enPrincipal.games);
  const wrFuera = pct(h.fuera.wins, h.fuera.games);
  // ROLES[].label viene capitalizado para usarse como título ("Jungla",
  // "ADC"), pero en el medio de una frase "De Jungla gana el 56%" queda raro.
  // Se pasa a minúscula salvo ADC, que es una sigla: "De adc gana el 51%" es
  // directamente un error de ortografía.
  const principal = h.principal === "adc" ? "ADC" : ROLES[h.principal].label.toLowerCase();

  return (
    <div className="lineas">
      <div className="lineas-filas">
        {jugadas.map((l) => {
          const wr = pct(l.wins, l.games);
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
              <span className={`lineas-wr ${wr >= 50 ? "good" : "bad"}`}>{wr}%</span>
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
            <strong className={wrPrincipal >= 50 ? "gd-pos" : "gd-neg"}>{wrPrincipal}%</strong>; fuera de ahí, el{" "}
            <strong className={wrFuera >= 50 ? "gd-pos" : "gd-neg"}>{wrFuera}%</strong>.
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
