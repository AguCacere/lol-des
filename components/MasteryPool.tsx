import type { MasteryEntry } from "@/lib/types";
import { champTag } from "@/lib/mock-data";

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
          <span className={`mastery-badge m${m.level}`}>M{m.level}</span>
        </div>
      ))}
    </div>
  );
}
