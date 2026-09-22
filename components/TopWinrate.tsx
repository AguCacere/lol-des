import type { Player } from "@/lib/types";
import type { FilaWinrate } from "@/lib/radiografia";
import { ROLES, tierFor } from "@/lib/ladder";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { tonoDeWinrate, winrateExacto, winrateTexto } from "@/lib/winrate";

/**
 * Piso de la escala de la barra, en puntos porcentuales. Un grupo entre 50% y
 * 53% no puede dibujarse con el mejor a fondo de escala: exageraría tres
 * puntos hasta que parezcan un abismo.
 */
const ESCALA_MINIMA = 6;

/**
 * "Mayor winrate" — el ranking del grupo dentro del período elegido.
 *
 * Antes miraba el récord de season que devuelve Riot (wins+losses de
 * League-V4) con un piso de 100 partidas. Eso tenía dos problemas: no se
 * movía —un buen fin de semana corre el winrate de season medio punto— y
 * medía un universo distinto del resto de la pestaña, así que el mismo
 * jugador podía tener dos winrates en la misma pantalla. Ahora sale de las
 * partidas guardadas, filtradas por la misma ventana que todo lo demás, y
 * las partidas van en su propia columna: un porcentaje sin muestra al lado no
 * se puede leer.
 *
 * La decisión de visualización que ordena todo lo demás sigue igual: el dato
 * acá no es la magnitud del winrate, es la DISTANCIA AL 50%. Todos los
 * porcentajes del grupo caen entre 45 y 58, así que una barra que arranca en
 * cero los dibuja a todos casi iguales — que es exactamente lo que hacía que
 * la sección se viera apagada, con once números verdes idénticos uno abajo
 * del otro. La barra divergente sale del 50% (el punto donde ganás lo mismo
 * que perdés) y crece a la derecha o a la izquierda.
 *
 * Eso además arregla un problema de accesibilidad: verde contra rojo se
 * separan poco en daltonismo (ΔE ~7 en deuteranopía). Acá el color nunca es
 * la única señal — la dirección de la barra respecto de la línea del 50%, el
 * signo del balance y el número dicen lo mismo sin depender del tono.
 *
 * El podio de tres tarjetas que había arriba se fue: con los Destacados
 * justo encima —que ya coronan al mejor winrate del período con nombre y
 * foto— era el mismo dato dos veces, y se comía media pantalla para repetir
 * la primera fila de la tabla.
 */
export function TopWinrate({
  filas,
  players,
  periodo,
  minimo,
}: {
  filas: FilaWinrate[];
  players: Player[];
  periodo: string;
  minimo: number;
}) {
  // El rango y la línea salen del ladder, que es el estado de AHORA: no
  // dependen del período y no tendría sentido recalcularlos por ventana.
  const porClave = new Map(players.map((p) => [`${p.name}#${p.tag}`, p]));

  // La escala se adapta al grupo real en vez de fijarse en 0-100: con todos
  // entre 45 y 58, una escala fija dejaría todas las barras del ancho de un
  // dedo y sin diferencia visible entre el primero y el último.
  const escala = Math.max(ESCALA_MINIMA, ...filas.map((f) => Math.abs(f.winrate - 50)));

  return (
    <section>
      <div className="section-head">
        <h2>Mayor winrate</h2>
        <span className="meta">
          {periodo} · mínimo {minimo} partidas
        </span>
      </div>
      {filas.length === 0 ? (
        <div className="empty-state">
          <strong>Nadie llega a {minimo} partidas en este período</strong>
          Probá con una ventana más larga, o esperá a que el grupo junte algunas más.
        </div>
      ) : (
        <div className="tw-table">
          {/* Encabezado real: sin él, "51%" y "222V 217D" son dos números
              sueltos al final de la fila y hay que deducir cuál es cuál. */}
          <div className="tw-head">
            <span className="tw-c-rank" />
            <span className="tw-c-name">Invocador</span>
            <span className="tw-c-games">Partidas</span>
            <span className="tw-c-bar">
              Distancia al 50%
              <InfoTip text="La barra sale del 50%, que es donde ganás tantas como perdés. A la derecha estás arriba de eso, a la izquierda abajo. La escala se acomoda al grupo: el que más se despega llega al borde." />
            </span>
            <span className="tw-c-wr">WR</span>
            <span className="tw-c-net">
              Balance
              <InfoTip align="end" text="Victorias menos derrotas en el período. Es el winrate pasado a partidas: un 51% en 724 son +14 de verdad, y un 53% en 109 son +3." />
            </span>
          </div>

          {filas.map((f, i) => {
            const p = porClave.get(`${f.persona.name}#${f.persona.tag}`);
            const t = p ? tierFor(p.tierKey) : null;
            const netas = f.victorias - f.derrotas;
            const tono = tonoDeWinrate(f.victorias, f.partidas);
            // El largo sale del winrate sin redondear: con la escala del
            // grupo en seis puntos, medio punto de redondeo son varios
            // píxeles de barra.
            const delta = winrateExacto(f.victorias, f.partidas) - 50;
            const largo = Math.min(50, (Math.abs(delta) / escala) * 50);
            return (
              <div className="tw-row" key={f.persona.puuid}>
                <span className="tw-c-rank">{i + 1}</span>
                <div className="tw-c-name">
                  <PlayerAvatar name={f.persona.name} iconUrl={f.persona.profileIconUrl} className="tw-avatar" />
                  <span className="tw-id">
                    <span className="tw-name">
                      {f.persona.name} <span className="player-tag">#{f.persona.tag}</span>
                    </span>
                    {t && p ? (
                      <span className="tw-sub">
                        <span style={{ color: t.fg }}>
                          {t.name} {p.division}
                        </span>
                        <span className="tw-dot">·</span>
                        {ROLES[p.role].label}
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="tw-c-games">{f.partidas}</span>
                <div
                  className="tw-c-bar"
                  title={`${winrateTexto(f.victorias, f.partidas)} en ${f.partidas} partidas · ${f.victorias}V ${f.derrotas}D · balance ${netas >= 0 ? "+" : ""}${netas}`}
                >
                  <span className="tw-track">
                    <span className={`tw-fill ${tono}`} style={{ width: `${largo}%` }} />
                    <span className="tw-zero" />
                  </span>
                </div>
                <span className={`tw-c-wr ${tono}`}>{winrateTexto(f.victorias, f.partidas)}</span>
                <span className={`tw-c-net ${netas > 0 ? "good" : netas < 0 ? "bad" : "neutral"}`}>
                  {netas >= 0 ? "+" : ""}
                  {netas}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
