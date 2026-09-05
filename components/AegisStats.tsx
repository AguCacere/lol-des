import type { AegisStats as AegisStatsData } from "@/lib/types";
import { ShieldIcon } from "./StatIcons";
import { InfoTip } from "./InfoTip";

/**
 * "Aegis of Valor (estimado)" — Riot no expone este dato en ningún campo de
 * su API (confirmado 3 veces, ver lib/aegis.ts), así que esto es una
 * INFERENCIA estadística, nunca una confirmación oficial. A propósito con
 * menos peso visual que "Récords personales" (badges con borde, no
 * stat-tiles rellenos) — es un dato blando, no un hecho.
 */
export function AegisStats({ stats }: { stats: AegisStatsData | null }) {
  if (!stats) return null;
  return (
    <div className="aegis-wrap">
      <span className="aegis-label">
        Aegis of Valor (estimado)
        <InfoTip text="Riot no publica este dato en ningún lado de su API, lo buscamos a fondo. Así que es una estimación: miramos el LP que dio cada partida que se puede aislar, lo comparamos con lo que le suele dar a este jugador, y marcamos las que se van bastante de lo normal. No es una confirmación de Riot." />
      </span>
      <div className="aegis-badges">
        <span className="aegis-badge">
          <ShieldIcon />
          {stats.doubleLp} {stats.doubleLp === 1 ? "posible doble LP" : "posibles doble LP"}
        </span>
        <span className="aegis-badge protected">
          <ShieldIcon />
          {stats.protectedLosses} {stats.protectedLosses === 1 ? "vez protegido en derrota" : "veces protegido en derrota"}
        </span>
      </div>
    </div>
  );
}
