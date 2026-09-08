import type { ChampionLeaderboardEntry } from "@/lib/types";
import { ChampIcon } from "./ChampIcon";
import { championLabel } from "@/lib/champion-names";
import { InfoTip } from "./InfoTip";

/** Below this, a record on one specific champion is too short to mean much as a "best on X" claim. */
const MIN_GAMES = 50;

const MEDALS = ["gold", "silver", "bronze"];

/** Piso de la escala de la barra, igual que en "Mayor winrate": tres puntos de diferencia no son un abismo. */
const ESCALA_MINIMA = 6;

/**
 * "Mayor winrate por campeón" — top 7 (jugador, campeón), exigiendo al menos
 * MIN_GAMES partidas CON ESE CAMPEÓN (no partidas totales del jugador). El
 * mismo invocador puede aparecer más de una vez si tiene varios campeones que
 * califican — ver computeChampionLeaderboard() en app/api/ladder/route.ts.
 *
 * Usa la misma tabla que "Mayor winrate" (las clases tw-*) a propósito: son
 * dos rankings hermanos en la misma pestaña, y darles dos formas distintas
 * hacía que se leyeran como dos cosas sin relación.
 *
 * El podio solo aparece con tres o más entradas. Con una sola —que es lo
 * normal cuando el piso es 50 partidas con el MISMO campeón— la grilla de
 * tres columnas dejaba dos tercios de la fila vacíos, que es exactamente el
 * "queda mal" del que hay que salir.
 *
 * El dato que hacía falta: "52% con Shen" no dice nada hasta saber si ese
 * jugador en general anda en 47 o en 55. La columna "vs. su promedio" es esa
 * comparación, y es lo único de la sección que distingue un campeón que le
 * rinde de uno que simplemente juega mucho.
 */
export function ChampionWinrateLeaderboard({
  entries,
  ddragonVersion,
}: {
  entries: ChampionLeaderboardEntry[];
  ddragonVersion: string | null;
}) {
  const hayPodio = entries.length >= 3;
  const podium = hayPodio ? entries.slice(0, 3) : [];
  const rest = hayPodio ? entries.slice(3) : entries;

  const escala = Math.max(ESCALA_MINIMA, ...entries.map((e) => Math.abs(wrExacto(e) - 50)));

  return (
    <section>
      <div className="section-head">
        <h2>
          Mayor winrate por campeón
        </h2>
        <span className="meta">Top 7, mínimo {MIN_GAMES} partidas con ese campeón</span>
      </div>
      {entries.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía nadie llega a {MIN_GAMES} partidas con un mismo campeón</strong>
          Se arma solo a medida que se acumulen refrescos — depende del historial de partidas guardado localmente, no del récord de season de Riot.
        </div>
      ) : (
        <>
          {hayPodio && (
            <div className="podium">
              {podium.map((e, i) => (
                <div className={`podium-card rank-${i + 1}`} key={`${e.playerName}#${e.playerTag}|${e.champion}`}>
                  <span className={`podium-medal ${MEDALS[i]}`}>{i + 1}</span>
                  <ChampIcon champ={e.champion} version={ddragonVersion} className="podium-avatar" />
                  <div className="podium-mid">
                    <span className="podium-name">{championLabel(e.champion)}</span>
                    <span className="podium-meta">
                      {e.playerName}
                      <span className="seg">· {e.games} partidas</span>
                    </span>
                  </div>
                  <span className={`podium-wr ${tonoDe(e)}`}>{formatWr(e)}</span>
                  <span className="podium-record">
                    {/* El récord crudo al lado del porcentaje, igual que en el
                        podio de invocadores: un 52% en 71 partidas y uno en 51
                        no son lo mismo y el porcentaje solo no lo dice. */}
                    <span className="podium-vd">
                      {e.wins}V-{e.losses}D · KDA {e.avgKda}
                    </span>
                    {/* En la tarjeta no hay encabezado que explique la
                        columna, así que el "=" del caso sin diferencia sería
                        un signo suelto sin contexto: ahí directamente no se
                        muestra nada. */}
                    {Math.abs(deltaDe(e)) >= 1 && <Delta e={e} />}
                  </span>
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="tw-table">
              <div className="tw-head">
                <span className="tw-c-rank" />
                <span className="tw-c-name">Campeón</span>
                <span className="tw-c-games">Partidas</span>
                <span className="tw-c-bar">
                  Distancia al 50%
                  <InfoTip text="La barra sale del 50%, que es donde ese campeón le da tantas victorias como derrotas. La escala se acomoda al conjunto: el que más se despega llega al borde." />
                </span>
                <span className="tw-c-wr">WR</span>
                <span className="tw-c-net">
                  vs. media
                  <InfoTip
                    align="end"
                    text="Cuánto mejor (o peor) le va con ESE campeón que en general, sobre sus partidas guardadas. Es lo que separa un campeón que le rinde de uno que simplemente juega mucho: un 52% dice poco si en general anda en 55."
                  />
                </span>
              </div>

              {rest.map((e, i) => {
                const tono = tonoDe(e);
                const largo = Math.min(50, (Math.abs(wrExacto(e) - 50) / escala) * 50);
                return (
                  <div className="tw-row" key={`${e.playerName}#${e.playerTag}|${e.champion}`}>
                    <span className="tw-c-rank">{i + (hayPodio ? 4 : 1)}</span>
                    <div className="tw-c-name">
                      <ChampIcon champ={e.champion} version={ddragonVersion} className="tw-avatar" />
                      <span className="tw-id">
                        <span className="tw-name">{championLabel(e.champion)}</span>
                        <span className="tw-sub">
                          {e.playerName}
                          <span className="tw-dot">·</span>
                          KDA {e.avgKda}
                        </span>
                      </span>
                    </div>
                    <span className="tw-c-games">{e.games}</span>
                    <div
                      className="tw-c-bar"
                      title={`${formatWr(e)} con ${championLabel(e.champion)} · ${e.wins}V ${e.losses}D · su promedio general es ${e.playerWinrate}%`}
                    >
                      <span className="tw-track">
                        <span className={`tw-fill ${tono}`} style={{ width: `${largo}%` }} />
                        <span className="tw-zero" />
                      </span>
                    </div>
                    <span className={`tw-c-wr ${tono}`}>{formatWr(e)}</span>
                    <span className="tw-c-net">
                      <Delta e={e} />
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

/** El winrate sin redondear: decide color, orden y largo de barra. */
function wrExacto(e: ChampionLeaderboardEntry): number {
  return (100 * e.wins) / Math.max(1, e.games);
}

/**
 * Se muestra el decimal cuando el redondeo escondería de qué lado del 50
 * está: 49,6% mostrado como "50%" en verde es un número que miente.
 */
function formatWr(e: ChampionLeaderboardEntry): string {
  const wr = wrExacto(e);
  const entero = Math.round(wr);
  if (entero === 50 && Math.abs(wr - 50) >= 0.05) return `${wr.toFixed(1)}%`;
  return `${entero}%`;
}

function tonoDe(e: ChampionLeaderboardEntry): "good" | "bad" | "neutral" {
  if (e.wins === e.losses) return "neutral";
  return e.wins > e.losses ? "good" : "bad";
}

/** Cuánto mejor (o peor) le va con este campeón que en general, en puntos. */
function deltaDe(e: ChampionLeaderboardEntry): number {
  return wrExacto(e) - e.playerWinrate;
}

function Delta({ e }: { e: ChampionLeaderboardEntry }) {
  // Sin promedio propio (JSON viejo del CDN) no hay diferencia que mostrar:
  // mejor un guión que un "NaN".
  if (!Number.isFinite(e.playerWinrate)) return <span className="tw-delta neutral">—</span>;
  const d = deltaDe(e);
  // Menos de un punto es ruido: con 50 partidas, una sola victoria mueve dos
  // puntos. Mostrarlo como "+0,4" invita a leer una diferencia que no existe.
  const tono = Math.abs(d) < 1 ? "neutral" : d > 0 ? "good" : "bad";
  return (
    <span className={`tw-delta ${tono}`} title={`Su promedio general: ${e.playerWinrate}%`}>
      {Math.abs(d) < 1 ? "=" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`}
    </span>
  );
}
