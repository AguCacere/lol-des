import type { Match } from "@/lib/types";
import { formatRelativeDate } from "@/lib/mock-data";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";

/** Only pentakills get the celebratory banner — doubles/triples/quadras are common enough to skip. */
function multikillLabel(m: Match): string | null {
  return m.pentaKills > 0 ? "¡PENTAKILL!" : null;
}

function GoldDiff({ diff }: { diff: number }) {
  return <span className={diff >= 0 ? "gd-pos" : "gd-neg"}>{diff >= 0 ? "+" : ""}{diff.toLocaleString("es-AR")}</span>;
}

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Stat({
  label,
  tooltip,
  wide,
  children,
}: {
  label: string;
  tooltip?: string;
  /** Spans the full grid row — for a MiniBreakdown with enough items that it wraps raggedly in a normal single-column cell. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`match-detail-stat${wide ? " wide" : ""}`}>
      <span className="k">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
      <span className="v">{children}</span>
    </div>
  );
}

/** Real Riot monsterSubType (Match-V5 timeline) → the icon set uploaded for the 4 classic elemental drakes. Hextech/Chemtech/Elder have no matching art, so those kills just don't get an icon. */
const DRAGON_ICON_BY_SUBTYPE: Record<string, string> = {
  FIRE_DRAGON: "/icons/dragons/infernal-48.png",
  WATER_DRAGON: "/icons/dragons/ocean-48.png",
  EARTH_DRAGON: "/icons/dragons/mountain-48.png",
  AIR_DRAGON: "/icons/dragons/cloud-48.png",
};

/** Compact "12 puestas · 3 sacadas" style breakdown — replaces a run-on sentence with scannable chips. */
function MiniBreakdown({ items }: { items: { value: number; label: string; icons?: string[] }[] }) {
  return (
    <span className="v mini-breakdown">
      {items.map((it) => (
        <span className="mini-breakdown-item" key={it.label}>
          {it.icons?.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fixed tiny inline glyphs, not a page asset
            <img className="mini-breakdown-icon" src={src} alt="" key={i} />
          ))}
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
  const hasTimeline =
    m.goldDiff10 != null || m.goldDiff15 != null || m.goldDiff20 != null || m.firstBloodTimeS != null || m.firstTowerTimeS != null;
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
              { value: m.wardsKilled, label: "limpiados" },
              { value: m.controlWards, label: "control" },
            ]}
          />
        </Stat>
        <Stat label="Objetivos personales" wide>
          <MiniBreakdown
            items={[
              { value: m.turretKills, label: "torres" },
              {
                value: m.dragonKills,
                label: "dragones",
                // Un ícono real por dragón que efectivamente mató este jugador
                // (Match-V5 timeline, monsterSubType) — Hextech/Chemtech/Elder
                // no tienen arte propio así que esos kills quedan sin ícono,
                // pero siguen contando en el número. Partidas viejas (sin
                // timeline guardado) caen al infernal genérico, mejor que nada.
                icons:
                  m.dragonTypes.length > 0
                    ? m.dragonTypes.map((t) => DRAGON_ICON_BY_SUBTYPE[t]).filter((src): src is string => !!src)
                    : m.dragonKills > 0
                      ? ["/icons/dragons/infernal-48.png"]
                      : [],
              },
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

      {hasTimeline && (
        <Group label="Timeline">
          {m.goldDiff10 != null && (
            <Stat label="Gold diff @10'" tooltip={METRIC_INFO.goldDiffLane}>
              <GoldDiff diff={m.goldDiff10} />
            </Stat>
          )}
          {m.goldDiff15 != null && (
            <Stat label="Gold diff @15'" tooltip={METRIC_INFO.goldDiffLane}>
              <GoldDiff diff={m.goldDiff15} />
            </Stat>
          )}
          {m.goldDiff20 != null && (
            <Stat label="Gold diff @20'" tooltip={METRIC_INFO.goldDiffLane}>
              <GoldDiff diff={m.goldDiff20} />
            </Stat>
          )}
          {m.firstBloodTimeS != null && <Stat label="Primera sangre (partida)">{formatMmSs(m.firstBloodTimeS)}</Stat>}
          {m.firstTowerTimeS != null && <Stat label="Primera torre (partida)">{formatMmSs(m.firstTowerTimeS)}</Stat>}
        </Group>
      )}

      <div className="match-detail-missing">
        <p>
          <strong>Build (orden de ítems):</strong> <span className="pending-inline">Próximamente</span> — está en el
          mismo timeline que ya pedimos, todavía no lo parseamos.
        </p>
      </div>
    </div>
  );
}
