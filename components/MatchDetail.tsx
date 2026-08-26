import type { Match } from "@/lib/types";
import { formatRelativeDate } from "@/lib/mock-data";

/**
 * Expanded view for one match, shown inline below its row in PlayerProfile.
 * Only renders real data we actually have. Sections we can't back with real
 * data yet (build, runas, nivel, stats al minuto 15) are explicitly marked
 * "Próximamente" rather than guessed — LP ganado/perdido gets its own note
 * since that one isn't a "not built yet", it's a real architecture gap (we
 * track LP via periodic snapshots, not per match) explained inline.
 */
export function MatchDetail({ match }: { match: Match }) {
  const m = match;
  return (
    <div className="match-detail">
      <div className="match-detail-grid">
        <div className="match-detail-stat">
          <span className="k">Duración</span>
          <span className="v">{m.dur} min</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">CS</span>
          <span className="v">
            {m.cs} <span className="unit">({m.csmin}/min)</span>
          </span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Oro total</span>
          <span className="v">
            {m.goldTotal.toLocaleString("es-AR")} <span className="unit">({m.gold}/min)</span>
          </span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Visión</span>
          <span className="v">{m.visionScore}</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">% daño del equipo</span>
          <span className="v">{m.dmgShare}%</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Kill participation</span>
          <span className="v">{m.killParticipation}%</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Participación objetivos</span>
          <span className="v">{m.objShare}%</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Jugada</span>
          <span className="v">{formatRelativeDate(m.playedAt)}</span>
        </div>
      </div>

      <div className="match-detail-missing">
        <p>
          <strong>LP ganado/perdido:</strong> no disponible por partida — trackeamos LP por snapshots periódicos
          (cron/&ldquo;Actualizar ahora&rdquo;), no un registro por partida individual.
        </p>
        <p>
          <strong>Build, runas, nivel y estadísticas al minuto 15:</strong>{" "}
          <span className="pending-inline">Próximamente</span> — Riot los expone, todavía no los pedimos ni
          guardamos.
        </p>
      </div>
    </div>
  );
}
