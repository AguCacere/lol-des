import type { MasteryEntry } from "@/lib/types";
import { champTag } from "@/lib/mock-data";

/**
 * Riot's mastery system has no level cap anymore (used to top out at M7) —
 * veteran players routinely sit at M15-M30+ on their mains. Bucket by
 * threshold instead of an exact match so those don't fall through to the
 * default gray meant for low levels.
 */
function masteryTier(level: number): "low" | "mid" | "high" {
  if (level >= 7) return "high";
  if (level >= 5) return "mid";
  return "low";
}

/**
 * "Maestría de campeón" — top 5 de Champion Mastery V4, el career-wide de
 * Riot (incluye normales/ARAM/todo lo que jugó alguna vez, no solo ranked
 * solo/duo). Deliberadamente separado de "Campeones más jugados" (que sí es
 * ranked solo/duo, de nuestras propias partidas guardadas) — mezclar los dos
 * hubiera implicado una relación entre maestría y winrate que Riot no da.
 */
export function MasteryPool({ pool }: { pool: MasteryEntry[] }) {
  if (pool.length === 0) {
    return (
      <div className="champ-pool-empty">
        Sin datos de maestría todavía — se completa en el próximo refresh.
      </div>
    );
  }
  return (
    <div className="champ-pool">
      {pool.map((m) => (
        <div className="champ-pool-row" key={m.champ}>
          <div className="champ-pool-avatar">{champTag(m.champ)}</div>
          <div className="champ-pool-mid">
            <span className="champ-pool-name">{m.champ}</span>
            <span className="champ-pool-games">{m.points.toLocaleString("es-AR")} pts</span>
          </div>
          <span className={`mastery-badge ${masteryTier(m.level)}`}>M{m.level}</span>
        </div>
      ))}
    </div>
  );
}
