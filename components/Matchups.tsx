import type { Matchup } from "@/lib/matchups";
import { MATCHUP_MIN_GAMES } from "@/lib/matchups";
import { ChampIcon } from "./ChampIcon";

/**
 * "Enfrentamientos de línea" — con qué campeón contra cuál te va bien y con
 * cuál mal, sobre tus propias partidas (ver lib/matchups.ts).
 *
 * Dos decisiones de lectura:
 *
 * 1. La cantidad de partidas va al lado del winrate, no escondida en un
 *    tooltip. Con 3 o 4 partidas el porcentaje no significa casi nada, y
 *    mostrarlo grande y solo sería vender una certeza que no tenemos.
 * 2. El oro a los 15 aparece cuando está, porque distingue dos derrotas
 *    distintas: perder la partida ganando la línea no es el mismo problema
 *    que perder la línea.
 */
export function Matchups({ matchups, ddragonVersion }: { matchups: Matchup[]; ddragonVersion: string | null }) {
  if (matchups.length === 0) {
    return (
      <div className="empty-state">
        <strong>Todavía no hay enfrentamientos con partidas suficientes</strong>
        Hacen falta al menos {MATCHUP_MIN_GAMES} partidas con el mismo campeón contra el mismo rival de línea. El
        campeón rival se empezó a guardar hace poco, así que esto se va a llenar solo a medida que jueguen.
      </div>
    );
  }

  return (
    <div className="matchup-list">
      {matchups.map((m) => (
        <div className="matchup-row" key={`${m.champ}|${m.opponent}`}>
          <span className="matchup-pair">
            <ChampIcon champ={m.champ} version={ddragonVersion} className="matchup-champ" />
            <span className="matchup-vs">vs</span>
            <ChampIcon champ={m.opponent} version={ddragonVersion} className="matchup-champ" />
          </span>
          <span className="matchup-names">
            <span className="matchup-name">{m.champ}</span>
            <span className="matchup-opp">contra {m.opponent}</span>
          </span>
          {/* Misma barra V/D del ladder (.wr-bar), no una nueva: es el mismo
              dato con el mismo significado. A lo ancho también resuelve el
              hueco que dejaba la fila entre el nombre y el récord. */}
          <span className="matchup-bar wr-bar">
            <span className="wr-seg win" style={{ flex: m.wins }} />
            <span className="wr-seg loss" style={{ flex: m.losses }} />
          </span>
          {m.avgGoldDiff15 !== null && (
            <span className={`matchup-gd ${m.avgGoldDiff15 >= 0 ? "gd-pos" : "gd-neg"}`}>
              {m.avgGoldDiff15 > 0 ? "+" : ""}
              {m.avgGoldDiff15.toLocaleString("es-AR")} oro @15&apos;
            </span>
          )}
          <span className="matchup-record">
            <span className={`matchup-wr ${m.winrate >= 50 ? "good" : "bad"}`}>{m.winrate}%</span>
            <span className="matchup-games">
              {m.wins}V-{m.losses}D
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
