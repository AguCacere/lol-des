import type { Match } from "@/lib/types";
import { formatRelativeDate } from "@/lib/ladder";
import { itemIconUrl } from "@/lib/ddragon";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";
import { ClockIcon, EyeIcon, ReviewIcon, ShieldIcon, TrendUpIcon, ZapIcon } from "./StatIcons";
import { MatchTimeline } from "./MatchTimeline";

/** Only pentakills get the celebratory banner — doubles/triples/quadras are common enough to skip. */
function multikillLabel(m: Match): string | null {
  return m.pentaKills > 0 ? "¡PENTAKILL!" : null;
}

function GoldDiff({ diff }: { diff: number }) {
  return <span className={diff >= 0 ? "gd-pos" : "gd-neg"}>{diff >= 0 ? "+" : ""}{diff.toLocaleString("es-AR")}</span>;
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

/**
 * El recorrido de la build: solo los ítems completos, en el orden real en que
 * los terminó (ver recorridoCore en lib/builds.ts). Es la lectura que sirve
 * para entender la partida — "arrancó con esto y después fue para acá" — y
 * que quedaba enterrada en la fila de veinte íconos donde una poción pesaba
 * lo mismo que un legendario.
 */
function BuildPath({ items, version }: { items: { id: number; nombre: string }[]; version: string | null }) {
  if (items.length === 0) {
    return <span className="build-line-empty">No llegó a completar ningún ítem.</span>;
  }
  return (
    <span className="build-path">
      {items.map((it, i) => (
        <span className="build-path-step" key={`${it.id}-${i}`}>
          {i > 0 && <span className="build-path-arrow">→</span>}
          <span className="build-path-item" title={it.nombre}>
            {version && (
              // eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo, no vale la config de next/image
              <img src={itemIconUrl(version, it.id)} alt={it.nombre} />
            )}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Y la compra completa, tal cual salió del timeline: pociones, wards,
 * componentes y lo que se vendió después. Va apagada y en chico porque es el
 * respaldo del recorrido de arriba, no el titular — pero se muestra igual,
 * que es lo que permite ver que alguien compró tres pociones antes del
 * primer componente.
 *
 * No está reconciliada contra ventas ni undos: un ítem comprado y vendido
 * aparece, porque SE compró en ese momento. Vacía en partidas guardadas
 * antes de que existiera este campo, o si el timeline de esa partida falló.
 */
function ItemBuildRow({ items, version }: { items: number[]; version: string | null }) {
  if (items.length === 0) {
    return <span className="build-line-empty">Sin datos de build guardados para esta partida.</span>;
  }
  return (
    <span className="item-build-row">
      {items.map((itemId, i) => (
        <span className="item-build-icon" key={i}>
          {version && (
            // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon, not a page asset
            <img src={itemIconUrl(version, itemId)} alt="" />
          )}
        </span>
      ))}
    </span>
  );
}

function Group({
  label,
  icon,
  ancho,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  /** Bloque a todo el ancho ANTES de la grilla — para un gráfico, que en una celda de la grilla quedaría del ancho de una columna. */
  ancho?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="match-detail-group">
      <h4 className="match-detail-group-label">
        <span className="match-detail-group-icon">{icon}</span>
        {label}
      </h4>
      {ancho}
      <div className="match-detail-grid">{children}</div>
    </div>
  );
}

/**
 * Expanded view for one match, shown inline below its row in PlayerProfile.
 * Only renders real data we actually have. LP ganado/perdido por partida no
 * está acá a propósito: no es un "todavía no lo hicimos", es un gap real de
 * arquitectura (LP se trackea por snapshot periódico, no por partida) que
 * necesita un trigger o mecanismo nuevo — se vuelve a agregar cuando exista.
 */
export function MatchDetail({ match, ddragonVersion }: { match: Match; ddragonVersion: string | null }) {
  const m = match;
  const multikill = multikillLabel(m);
  const hasTimeline =
    m.goldDiff10 != null ||
    m.goldDiff15 != null ||
    m.goldDiff20 != null ||
    m.firstBloodTimeS != null ||
    m.firstTowerTimeS != null ||
    m.firstDragonTimeS != null ||
    m.firstBaronTimeS != null;
  return (
    <div className="match-detail">
      {multikill && <div className="match-multikill">{multikill}</div>}
      {m.flag && (
        <div className="match-review-banner">
          <ReviewIcon />
          <span>
            <strong>Para repasar</strong> — <span className="match-review-reasons">{m.flag.reasons.join(" · ")}</span>
          </span>
        </div>
      )}

      <Group label="Partida" icon={<ClockIcon />}>
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

      <Group label="Combate" icon={<ZapIcon />}>
        <Stat label="% daño del equipo" tooltip={METRIC_INFO.dmgShare}>
          {m.dmgShare}%
        </Stat>
        <Stat label="Daño a campeones">{m.damageToChamps.toLocaleString("es-AR")}</Stat>
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

      <Group label="Visión y objetivos" icon={<EyeIcon />}>
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
        <Stat
          label="Objetivos"
          tooltip="Torres, dragones, barones y heraldo cuentan participación (kill o asistencia), no solo si vos diste el golpe final. Inhibidores es la excepción: Riot no expone participación para eso, solo cuenta si lo rompiste vos. Vacas del Vacío no están porque Riot tampoco las separa del resto."
          wide
        >
          <MiniBreakdown
            items={[
              { value: m.turretTakedowns, label: "torres" },
              {
                value: m.dragonTakedowns,
                label: "dragones",
                // Un ícono real por dragón que efectivamente mató este jugador
                // (Match-V5 timeline, monsterSubType) — Hextech/Chemtech/Elder
                // no tienen arte propio así que esos kills quedan sin ícono,
                // pero siguen contando en el número. Si solo asistió (no mató)
                // o la partida es vieja sin timeline guardado, cae al infernal
                // genérico, mejor que nada.
                icons:
                  m.dragonTypes.length > 0
                    ? m.dragonTypes.map((t) => DRAGON_ICON_BY_SUBTYPE[t]).filter((src): src is string => !!src)
                    : m.dragonTakedowns > 0
                      ? ["/icons/dragons/infernal-48.png"]
                      : [],
              },
              { value: m.baronTakedowns, label: "barones" },
              { value: m.heraldTakedowns, label: "heraldo" },
              { value: m.inhibitorKills, label: "inhib." },
            ]}
          />
        </Stat>
      </Group>

      <Group label="Build" icon={<ShieldIcon />}>
        <Stat label="Runas" wide>
          <span className="build-line">
            {m.primaryRuneIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon, not a page asset
              <img className="build-icon" src={m.primaryRuneIconUrl} alt="" />
            )}
            {m.primaryRune ?? "—"}
            {m.primaryStyle && m.secondaryStyle && (
              <span className="unit">
                ({m.primaryStyle}/{m.secondaryStyle})
              </span>
            )}
          </span>
        </Stat>
        <Stat label="Hechizos" wide>
          <span className="build-line">
            <span className="build-item">
              {m.summoner1IconUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon, not a page asset
                <img className="build-icon" src={m.summoner1IconUrl} alt="" />
              )}
              {m.summoner1 ?? "—"}
            </span>
            <span className="build-sep">/</span>
            <span className="build-item">
              {m.summoner2IconUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size icon, not a page asset
                <img className="build-icon" src={m.summoner2IconUrl} alt="" />
              )}
              {m.summoner2 ?? "—"}
            </span>
          </span>
        </Stat>
        <Stat label="Recorrido" tooltip="Solo los ítems completos, en el orden en que los terminó. La compra entera (pociones, wards, componentes) está abajo." wide>
          <BuildPath items={m.coreBuild} version={ddragonVersion} />
        </Stat>
        <Stat label="Compra completa" wide>
          <ItemBuildRow items={m.itemBuild} version={ddragonVersion} />
        </Stat>
      </Group>

      {hasTimeline && (
        <Group label="Cómo se dio la partida" icon={<TrendUpIcon />} ancho={<MatchTimeline match={m} />}>
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
        </Group>
      )}
    </div>
  );
}
