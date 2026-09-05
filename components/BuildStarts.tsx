import type { ChampionBuildStats } from "@/lib/builds";
import { itemIconUrl } from "@/lib/ddragon";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";

/**
 * "Cómo arrancás" — con qué primer ítem completo salió cada campeón del pool
 * y cómo le fue con cada uno (ver lib/builds.ts).
 *
 * Lo que hace distinta a esta sección de cualquier guía: el universo es SU
 * historial. No dice cuál es el mejor primer ítem del parche, dice cuál le
 * funcionó a él. Por eso al lado del porcentaje va siempre el crudo (7V-3D):
 * un 70% en diez partidas y un 70% en cien no significan lo mismo, y el
 * porcentaje solo esconde exactamente esa diferencia.
 */
export function BuildStarts({
  stats,
  ddragonVersion,
}: {
  stats: ChampionBuildStats[] | undefined;
  ddragonVersion: string | null;
}) {
  if (!stats || stats.length === 0) {
    return (
      <div className="empty-state">
        <strong>Todavía no hay arranques que comparar</strong>
        Hace falta repetir un campeón varias veces y haber arrancado con al menos dos ítems distintos.
      </div>
    );
  }

  return (
    <div className="build-starts">
      <h4 className="subsection-label">
        Cómo arrancás
        <InfoTip text="El primer ítem COMPLETO de cada partida (no el primer componente ni la poción) cruzado con el resultado, sobre tus partidas guardadas. Solo aparecen los campeones que jugaste bastante y con al menos dos arranques distintos: con uno solo no hay nada que comparar." />
      </h4>

      {stats.map((c) => (
        <div className="build-champ" key={c.champ}>
          <div className="build-champ-head">
            <ChampIcon champ={c.champ} version={ddragonVersion} className="build-champ-icon" />
            <span className="build-champ-name">{championLabel(c.champ)}</span>
            <span className="build-champ-games">{c.games} partidas</span>
          </div>
          <div className="build-champ-rows">
            {c.arranques.map((a) => (
              <div className="build-start" key={a.itemId}>
                <span className="build-start-item" title={a.nombre}>
                  {ddragonVersion && (
                    // eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo
                    <img src={itemIconUrl(ddragonVersion, a.itemId)} alt={a.nombre} />
                  )}
                </span>
                <span className="build-start-name">{a.nombre}</span>
                <span className="build-start-bar">
                  <span
                    className={`build-start-fill ${a.winrate >= 50 ? "good" : "bad"}`}
                    style={{ width: `${Math.max(3, a.winrate)}%` }}
                  />
                </span>
                <span className={`build-start-wr ${a.winrate >= 50 ? "good" : "bad"}`}>{a.winrate}%</span>
                <span className="build-start-rec">
                  {a.wins}V-{a.games - a.wins}D
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
