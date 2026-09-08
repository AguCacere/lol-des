import type { Player } from "@/lib/types";
import { ROLES, tierFor } from "@/lib/ladder";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { tonoDeWinrate, winrateExacto, winrateTexto } from "@/lib/winrate";

/** Below this, a season record is too short to mean much as a "best winrate" claim. */
const MIN_GAMES = 100;

const MEDALS = ["gold", "silver", "bronze"];

/**
 * Piso de la escala de la barra, en puntos porcentuales. Un grupo entre 50% y
 * 53% no puede dibujarse con el mejor a fondo de escala: exageraría tres
 * puntos hasta que parezcan un abismo.
 */
const ESCALA_MINIMA = 6;


/**
 * "Mayor winrate" — ranking del grupo entero por winrate de season, exigiendo
 * al menos MIN_GAMES partidas jugadas (wins+losses de League-V4, el récord
 * de season completo de Riot — no partidas guardadas localmente, así que
 * esto puede tener candidatos desde el primer refresh de alguien con
 * historial previo, a diferencia del ranking por campeón).
 *
 * La decisión de visualización que ordena todo lo demás: el dato acá no es la
 * magnitud del winrate, es la DISTANCIA AL 50%. Todos los porcentajes del
 * grupo caen entre 50 y 58, así que una barra que arranca en cero los dibuja
 * a todos casi iguales — que es exactamente lo que hacía que la sección se
 * viera apagada, con once números verdes idénticos uno abajo del otro. La
 * barra divergente sale del 50% (el punto donde ganás lo mismo que perdés) y
 * crece a la derecha o a la izquierda.
 *
 * Eso además arregla un problema de accesibilidad: verde contra rojo se
 * separan poco en daltonismo (ΔE ~7 en deuteranopía). Acá el color nunca es
 * la única señal — la dirección de la barra respecto de la línea del 50%, el
 * signo del balance y el número dicen lo mismo sin depender del tono.
 */
export function TopWinrate({ players }: { players: Player[] }) {
  const qualified = [...players]
    .filter((p) => p.wins + p.losses >= MIN_GAMES)
    // Por el winrate exacto y no por el redondeado: 49,6% y 50,1% redondean
    // los dos a 50 y el orden entre ellos quedaba librado al azar del sort.
    .sort((a, b) => winrateExacto(b.wins, b.wins + b.losses) - winrateExacto(a.wins, a.wins + a.losses));
  const podium = qualified.slice(0, 3);
  const rest = qualified.slice(3);

  // La escala se adapta al grupo real en vez de fijarse en 0-100: con todos
  // entre 50 y 58, una escala fija dejaría todas las barras del ancho de un
  // dedo y sin diferencia visible entre el primero y el último.
  const escala = Math.max(ESCALA_MINIMA, ...qualified.map((p) => Math.abs(p.winrate - 50)));

  return (
    <section>
      <div className="section-head">
        <h2>
          Mayor winrate
        </h2>
        <span className="meta">Season completa, mínimo {MIN_GAMES} partidas jugadas</span>
      </div>
      {qualified.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía nadie llega a {MIN_GAMES} partidas</strong>
          Se arma solo cuando algún invocador del grupo acumula {MIN_GAMES}+ partidas jugadas esta season.
        </div>
      ) : (
        <>
          <div className="podium">
            {podium.map((p, i) => {
              const t = tierFor(p.tierKey);
              const netas = p.wins - p.losses;
              return (
                <div className={`podium-card rank-${i + 1}`} key={`${p.name}#${p.tag}`}>
                  <span className={`podium-medal ${MEDALS[i]}`}>{i + 1}</span>
                  <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="podium-avatar" />
                  <div className="podium-mid">
                    <span className="podium-name">
                      {p.name} <span className="player-tag">#{p.tag}</span>
                    </span>
                    {/* Cada segmento se lleva su propio separador y no se
                        parte: con el "·" suelto, al envolver quedaba colgando
                        al final de la línea de arriba. */}
                    <span className="podium-meta">
                      <span style={{ color: t.fg }}>
                        {t.name} {p.division}
                      </span>
                      <span className="seg">· {ROLES[p.role].label}</span>
                      <span className="seg">· {p.wins + p.losses} partidas</span>
                    </span>
                  </div>
                  <span className={`podium-wr ${tonoDeWinrate(p.wins, p.wins + p.losses)}`}>{winrateTexto(p.wins, p.wins + p.losses)}</span>
                  <span className="podium-record">
                    <span className="podium-vd">
                      {p.wins}V {p.losses}D
                    </span>
                    <span className={`tw-netas ${netas > 0 ? "good" : netas < 0 ? "bad" : "neutral"}`}>
                      {netas >= 0 ? "+" : ""}
                      {netas}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
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
                  <InfoTip align="end" text="Victorias menos derrotas en la season. Es el winrate pasado a partidas: un 51% en 724 son +14 de verdad, y un 53% en 109 son +3." />
                </span>
              </div>

              {rest.map((p, i) => {
                const t = tierFor(p.tierKey);
                const netas = p.wins - p.losses;
                const tono = tonoDeWinrate(p.wins, p.wins + p.losses);
                // El largo sale del winrate sin redondear: con la escala del
                // grupo en seis puntos, medio punto de redondeo son varios
                // píxeles de barra.
                const delta = winrateExacto(p.wins, p.wins + p.losses) - 50;
                const largo = Math.min(50, (Math.abs(delta) / escala) * 50);
                return (
                  <div className="tw-row" key={`${p.name}#${p.tag}`}>
                    <span className="tw-c-rank">{i + 4}</span>
                    <div className="tw-c-name">
                      <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="tw-avatar" />
                      <span className="tw-id">
                        <span className="tw-name">
                          {p.name} <span className="player-tag">#{p.tag}</span>
                        </span>
                        <span className="tw-sub">
                          <span style={{ color: t.fg }}>
                            {t.name} {p.division}
                          </span>
                          <span className="tw-dot">·</span>
                          {ROLES[p.role].label}
                        </span>
                      </span>
                    </div>
                    <span className="tw-c-games">{p.wins + p.losses}</span>
                    <div
                      className="tw-c-bar"
                      title={`${winrateTexto(p.wins, p.wins + p.losses)} en ${p.wins + p.losses} partidas · ${p.wins}V ${p.losses}D · balance ${netas >= 0 ? "+" : ""}${netas}`}
                    >
                      <span className="tw-track">
                        <span className={`tw-fill ${tono}`} style={{ width: `${largo}%` }} />
                        <span className="tw-zero" />
                      </span>
                    </div>
                    <span className={`tw-c-wr ${tono}`}>{winrateTexto(p.wins, p.wins + p.losses)}</span>
                    <span className={`tw-c-net ${netas > 0 ? "good" : netas < 0 ? "bad" : "neutral"}`}>
                      {netas >= 0 ? "+" : ""}
                      {netas}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
