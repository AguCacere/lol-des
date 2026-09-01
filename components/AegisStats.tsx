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
        <InfoTip text="Riot no expone este dato en su API — no aparece en ningún campo, lo chequeamos a fondo. Esto es una inferencia estadística: comparamos el LP real de cada partida que se puede aislar contra el promedio propio de este jugador, y marcamos como posible cuando se aleja bastante de lo normal. No es una confirmación oficial de Riot." />
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
