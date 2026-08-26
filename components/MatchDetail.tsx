import type { Match } from "@/lib/types";
import { formatRelativeDate } from "@/lib/mock-data";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";

/** Only pentakills get the celebratory banner — doubles/triples/quadras are common enough to skip. */
function multikillLabel(m: Match): string | null {
  return m.pentaKills > 0 ? "¡PENTAKILL!" : null;
}

function Stat({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="match-detail-stat">
      <span className="k">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
      <span className="v">{children}</span>
    </div>
  );
}

/** Compact "12 puestas · 3 sacadas" style breakdown — replaces a run-on sentence with scannable chips. */
function MiniBreakdown({ items }: { items: { value: number; label: string }[] }) {
  return (
    <span className="v mini-breakdown">
      {items.map((it) => (
        <span className="mini-breakdown-item" key={it.label}>
          <strong>{it.value}</strong>
          {it.label}
        </span>
      ))}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="match-detail-group">
      <h4 className="match-detail-group-label">{label}</h4>
      <div className="match-detail-grid">{children}</div>
    </div>
  );
}

/**
 * Expanded view for one match, shown inline below its row in PlayerProfile.
 * Only renders real data we actually have. Sections we can't back with real
 * data yet (build, stats al minuto 15) are explicitly marked "Próximamente"
 * rather than guessed. LP ganado/perdido por partida no está acá a propósito:
 * no es un "todavía no lo hicimos", es un gap real de arquitectura (LP se
 * trackea por snapshot periódico, no por partida) que necesita un trigger o
 * mecanismo nuevo — se vuelve a agregar cuando exista.
 */
export function MatchDetail({ match }: { match: Match }) {
  const m = match;
  const multikill = multikillLabel(m);
  return (
    <div className="match-detail">
      {multikill && <div className="match-multikill">{multikill}</div>}

      <Group label="Partida">
        <Stat label="Duración">{m.dur} min</Stat>
        <Stat label="CS" tooltip={METRIC_INFO.csPerMin}>
          {m.cs} <span className="unit">({m.csmin}/min)</span>
        </Stat>
        <Stat label="Oro total" tooltip={METRIC_INFO.goldPerMin}>
          {m.goldTotal.toLocaleString("es-AR")} <span className="unit">({m.gold}/min)</span>
        </Stat>
        <Stat label="Nivel final">{m.champLevel || "—"}</Stat>
        <Stat label="Jugada">{formatRelativeDate(m.playedAt)}</Stat>
      </Group>

      <Group label="Combate">
        <Stat label="% daño del equipo" tooltip={METRIC_INFO.dmgShare}>
          {m.dmgShare}%
        </Stat>
        <Stat label="Kill participation" tooltip={METRIC_INFO.killParticipation}>
          {m.killParticipation}%
        </Stat>
        <Stat label="Daño recibido">
          {m.damageTaken.toLocaleString("es-AR")}{" "}
          <span className="unit">({m.damageMitigated.toLocaleString("es-AR")} mitigado)</span>
        </Stat>
        {m.damagePerMin != null && <Stat label="Daño / min">{Math.round(m.damagePerMin).toLocaleString("es-AR")}</Stat>}
        {m.soloKills != null && <Stat label="Solo kills">{m.soloKills}</Stat>}
        {m.skillshotsHit != null && <Stat label="Skillshots acertados">{m.skillshotsHit}</Stat>}
        <Stat label="Primera sangre">{m.firstBlood ? "Sí 🩸" : "No"}</Stat>
        {m.pentaKills > 0 && <Stat label="Pentakills">{m.pentaKills}</Stat>}
      </Group>

      <Group label="Visión y objetivos">
        <Stat label="Visión" tooltip={METRIC_INFO.visionScore}>
          {m.visionScore}
        </Stat>
        <Stat label="Participación objetivos" tooltip={METRIC_INFO.objShare}>
          {m.objShare}%
        </Stat>
        <Stat label="Wards">
          <MiniBreakdown
            items={[
              { value: m.wardsPlaced, label: "puestas" },
              { value: m.wardsKilled, label: "sacadas" },
              { value: m.controlWards, label: "control" },
            ]}
          />
        </Stat>
        <Stat label="Objetivos personales">
          <MiniBreakdown
            items={[
              { value: m.turretKills, label: "torres" },
              { value: m.dragonKills, label: "dragones" },
              { value: m.baronKills, label: "barones" },
              { value: m.inhibitorKills, label: "inhib." },
            ]}
          />
        </Stat>
      </Group>

      <Group label="Build">
        <Stat label="Runas">
          {m.primaryRune ?? "—"}
          {m.primaryStyle && m.secondaryStyle && (
            <span className="unit">
              {" "}
              ({m.primaryStyle}/{m.secondaryStyle})
            </span>
          )}
        </Stat>
        <Stat label="Hechizos">
          {m.summoner1 ?? "—"} / {m.summoner2 ?? "—"}
        </Stat>
      </Group>

      <div className="match-detail-missing">
        <p>
          <strong>Build y estadísticas al minuto 15:</strong> <span className="pending-inline">Próximamente</span> —
          Riot los expone, todavía no los pedimos ni guardamos.
        </p>
      </div>
    </div>
  );
}
