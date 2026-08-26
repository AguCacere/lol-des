import type { Match } from "@/lib/types";
import { formatRelativeDate } from "@/lib/mock-data";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";

/** Highest multikill worth calling out — double kills are common enough to skip. */
function multikillLabel(m: Match): string | null {
  if (m.pentaKills > 0) return "¡PENTAKILL!";
  if (m.quadraKills > 0) return "¡QUADRA KILL!";
  if (m.tripleKills > 0) return "¡TRIPLE KILL!";
  return null;
}

/**
 * Expanded view for one match, shown inline below its row in PlayerProfile.
 * Only renders real data we actually have. Sections we can't back with real
 * data yet (build, nivel, stats al minuto 15) are explicitly marked
 * "Próximamente" rather than guessed. LP ganado/perdido por partida no está
 * acá a propósito: no es un "todavía no lo hicimos", es un gap real de
 * arquitectura (LP se trackea por snapshot periódico, no por partida) que
 * necesita un trigger o mecanismo nuevo — se vuelve a agregar cuando exista.
 */
export function MatchDetail({ match }: { match: Match }) {
  const m = match;
  const multikill = multikillLabel(m);
  return (
    <div className="match-detail">
      {multikill && <div className="match-multikill">{multikill}</div>}
      <div className="match-detail-grid">
        <div className="match-detail-stat">
          <span className="k">Duración</span>
          <span className="v">{m.dur} min</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">
            CS <InfoTip text={METRIC_INFO.csPerMin} />
          </span>
          <span className="v">
            {m.cs} <span className="unit">({m.csmin}/min)</span>
          </span>
        </div>
        <div className="match-detail-stat">
          <span className="k">
            Oro total <InfoTip text={METRIC_INFO.goldPerMin} />
          </span>
          <span className="v">
            {m.goldTotal.toLocaleString("es-AR")} <span className="unit">({m.gold}/min)</span>
          </span>
        </div>
        <div className="match-detail-stat">
          <span className="k">
            Visión <InfoTip text={METRIC_INFO.visionScore} />
          </span>
          <span className="v">{m.visionScore}</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">
            % daño del equipo <InfoTip text={METRIC_INFO.dmgShare} />
          </span>
          <span className="v">{m.dmgShare}%</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">
            Kill participation <InfoTip text={METRIC_INFO.killParticipation} />
          </span>
          <span className="v">{m.killParticipation}%</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">
            Participación objetivos <InfoTip text={METRIC_INFO.objShare} />
          </span>
          <span className="v">{m.objShare}%</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Jugada</span>
          <span className="v">{formatRelativeDate(m.playedAt)}</span>
        </div>
        <div className="match-detail-stat">
          <span className="k">Runas</span>
          <span className="v">
            {m.primaryRune ?? "—"}
            {m.primaryStyle && m.secondaryStyle && (
              <span className="unit">
                {" "}
                ({m.primaryStyle}/{m.secondaryStyle})
              </span>
            )}
          </span>
        </div>
        {(m.doubleKills > 0 || m.tripleKills > 0 || m.quadraKills > 0 || m.pentaKills > 0) && (
          <div className="match-detail-stat">
            <span className="k">Multikills</span>
            <span className="v">
              {m.doubleKills > 0 && `${m.doubleKills}x Doble `}
              {m.tripleKills > 0 && `${m.tripleKills}x Triple `}
              {m.quadraKills > 0 && `${m.quadraKills}x Quadra `}
              {m.pentaKills > 0 && `${m.pentaKills}x Penta`}
            </span>
          </div>
        )}
      </div>

      <div className="match-detail-missing">
        <p>
          <strong>Build, nivel y estadísticas al minuto 15:</strong>{" "}
          <span className="pending-inline">Próximamente</span> — Riot los expone, todavía no los pedimos ni
          guardamos.
        </p>
      </div>
    </div>
  );
}
