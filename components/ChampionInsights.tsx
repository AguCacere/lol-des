import type { ChampionInsight } from "@/lib/champion-insights";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";

/**
 * Qué significa cada tipo, en texto. Vive acá y no en el type que viaja por
 * la red: el server manda el hallazgo con sus números, la redacción es cosa
 * del cliente — el mismo criterio que en RecentForm y Matchups.
 */
function describe(i: ChampionInsight): { tone: string; titulo: string; detalle: string } {
  const champ = championLabel(i.champ);
  switch (i.kind) {
    case "abandonado":
      return {
        tone: "neutral",
        titulo: `${champ} no aparece en tus ranked`,
        // "En el historial guardado" y no "no lo jugás más": la maestría es de
        // toda la carrera y nuestro historial arranca donde arranca. Decir lo
        // segundo sería afirmar algo que estos datos no pueden sostener.
        detalle: `Está entre tus cinco de más maestría (nivel ${i.masteryLevel}), pero no jugaste ninguna partida con él en el historial guardado.`,
      };
    case "sin_rendir":
      return {
        tone: "bad",
        titulo: `${champ} no te está saliendo`,
        detalle: `Maestría ${i.masteryLevel} y ${i.winrate}% en ${i.games} partidas — es donde más invertiste con peor retorno.`,
      };
    case "destacado":
      return {
        tone: "good",
        titulo: `${champ} te está rindiendo`,
        detalle: `${i.winrate}% en ${i.games} partidas, y ni siquiera está entre tus cinco de más maestría.`,
      };
  }
}

/**
 * El cruce entre maestría e historial real (ver lib/champion-insights.ts).
 *
 * Existe porque las dos listas de arriba, una al lado de la otra, no pueden
 * decir esto: una sabe cuánto invertiste en cada campeón y la otra cómo te
 * va, pero ninguna las compara. "Maestría 20 y 20% de winrate" es una
 * conclusión que hay que sacar mirando las dos y contando a ojo.
 *
 * Se dibuja solo si hay algo que decir: sin hallazgos no hay card vacía
 * ocupando lugar.
 */
export function ChampionInsights({
  insights,
  ddragonVersion,
}: {
  insights: ChampionInsight[];
  ddragonVersion: string | null;
}) {
  if (insights.length === 0) return null;
  return (
    <div className="champ-insights">
      {insights.map((i) => {
        const d = describe(i);
        return (
          <div className={`champ-insight ${d.tone}`} key={i.kind}>
            <ChampIcon champ={i.champ} version={ddragonVersion} className="champ-insight-icon" />
            <div className="champ-insight-text">
              <span className="champ-insight-title">{d.titulo}</span>
              <span className="champ-insight-detail">{d.detalle}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
