import type { HistorialLineas } from "@/lib/lineas";
import { ROLES } from "@/lib/ladder";
import { RoleIcon } from "./RoleIcon";
import { InfoTip } from "./InfoTip";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";

/**
 * "Cómo estás jugando" — cuánto jugó cada línea y cómo le fue. Sale de
 * `team_position`, la posición REAL que Riot asigna partida a partida.
 *
 * Tenía una barra por línea, apilando victorias y derrotas y con el largo
 * total proporcional a las partidas. Dos problemas:
 *
 * 1. Las barras eran lo más grande de la sección y no decían nada que el
 *    winrate de al lado no dijera mejor.
 * 2. Y **mentían por tamaño**: "Support 100% · 2V-0D" con una barra verde
 *    entera se lee como un resultado extraordinario, cuando la muestra son
 *    dos partidas.
 *
 * Ahora es una tabla: línea, partidas, winrate y KDA. Sin barras, mucho más
 * baja, y las muestras chicas van marcadas — que es lo que la barra hacía al
 * revés.
 *
 * Dos reglas más de qué entra: una línea con menos de `FILA_MINIMA` partidas
 * no se dibuja (salvo que sea la principal), y si al final queda una sola se
 * escribe en un renglón en vez de armar una tabla de una fila.
 */

/** Abajo de esto, el winrate no significa nada y la fila lo dice. */
const MUESTRA_MINIMA = 5;

/**
 * Y abajo de esto la línea directamente no entra. Una o dos partidas sueltas
 * en una línea que no juega no son "cómo le va en esa línea": son ruido con
 * formato de fila, y encima empujan a la de verdad hacia abajo. La principal
 * entra siempre, aunque tenga dos.
 */
const FILA_MINIMA = 3;

export function LineHistory({ h }: { h: HistorialLineas }) {
  const jugadas = h.lineas.filter((l) => l.games >= FILA_MINIMA || (l.role === h.principal && l.games > 0));
  if (jugadas.length === 0) return null;

  // Una sola línea no es una tabla: son un encabezado y una fila para decir
  // algo que entra en un renglón. Pasa seguido —un support que solo juega
  // support— y con la tabla la sección prometía más de lo que entregaba.
  if (jugadas.length === 1) {
    const l = jugadas[0];
    const poca = l.games < MUESTRA_MINIMA;
    return (
      <div className="lineas">
        {/* Tres datos alineados como los récords de abajo —número grande,
            rótulo chico— y no una frase. La frase decía lo mismo, pero con
            los números metidos adentro del texto no se podían comparar de un
            vistazo con nada, y era otra cosa más con su propio peso en una
            columna donde ya sobraban. */}
        <div className="lineas-una">
          <span className="lineas-quien">
            <span className="lineas-rol" title={ROLES[l.role].label}>
              <RoleIcon role={l.role} />
            </span>
            <b>{ROLES[l.role].label}</b>
          </span>
          <span className="dato">
            <b>{l.games}</b>
            <i>partidas</i>
          </span>
          <span className="dato">
            <b className={poca ? "poca" : tonoDeWinrate(l.wins, l.games)}>{winrateTexto(l.wins, l.games)}</b>
            <i>winrate</i>
          </span>
          <span className="dato">
            <b>{l.kda === null ? "—" : l.kda.toFixed(2)}</b>
            <i>KDA</i>
          </span>
        </div>
        <p className="lineas-sola">Ninguna otra línea llega a {FILA_MINIMA} partidas.</p>
        {h.loSacanDeSuLinea && <Aviso h={h} />}
      </div>
    );
  }

  return (
    <div className="lineas">
      <div className="lineas-cab">
        <span>Línea</span>
        <span className="lineas-num">PJ</span>
        <span className="lineas-num">WR</span>
        <span className="lineas-num">KDA</span>
        <span />
      </div>
      {jugadas.map((l) => {
        const poca = l.games < MUESTRA_MINIMA;
        return (
          <div className="lineas-fila" key={l.role}>
            <span className="lineas-quien">
              <span className="lineas-rol" title={ROLES[l.role].label}>
                <RoleIcon role={l.role} />
              </span>
              <span className="lineas-nombre">{ROLES[l.role].label}</span>
              {l.role === h.principal && <i className="lineas-principal">principal</i>}
            </span>
            <span className="lineas-num lineas-pj">{l.games}</span>
            {/* El winrate se apaga cuando la muestra no lo sostiene: un 100%
                de dos partidas en verde fuerte es la barra vieja otra vez, con
                otra forma. */}
            <span className={`lineas-num lineas-wr ${poca ? "poca" : tonoDeWinrate(l.wins, l.games)}`}>
              {winrateTexto(l.wins, l.games)}
            </span>
            <span className="lineas-num lineas-kda">{l.kda === null ? "—" : l.kda.toFixed(2)}</span>
            <span className="lineas-nota">{poca ? "pocas" : `${l.wins}V-${l.games - l.wins}D`}</span>
          </div>
        );
      })}

      {h.loSacanDeSuLinea && <Aviso h={h} />}
    </div>
  );
}

/**
 * Lo único que la tabla NO dice: que lo están sacando de su línea. El "de mid
 * gana el 62,5%; fuera de ahí el 57,1%" se fue — eso ya se lee en las dos
 * primeras filas.
 */
function Aviso({ h }: { h: HistorialLineas }) {
  return (
    <p className="lineas-aviso">
      Lo están sacando seguido de su línea: {h.recientesFuera} de las últimas {h.recientes} fueron en otra.
      <InfoTip text="Riot no dice qué línea pediste en la cola, así que esto no es el autofill de verdad: es que la mayoría de su historial es una línea y últimamente está jugando bastante en otras. Puede ser autofill o puede ser que haya cambiado de main." />
    </p>
  );
}
