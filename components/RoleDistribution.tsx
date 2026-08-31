import type { RoleKey } from "@/lib/types";
import { RoleIcon } from "./RoleIcon";

/**
 * "Reparto de roles" — % de TODAS las partidas guardadas de este jugador en
 * cada rol (team_position real de Match-V5), no el "main" declarado. Para
 * alguien que rota de línea constantemente esto muestra la variación real en
 * vez de esconderla detrás de una sola etiqueta — ver Player.roleDistribution
 * en app/api/ladder/route.ts. El rol actualmente mostrado en el resto del
 * perfil (p.role, todavía el más jugado en general) se destaca entre los 5
 * para dar un punto de referencia, no porque sea "el único que cuenta".
 */
export function RoleDistribution({
  distribution,
  currentRole,
}: {
  distribution: { role: RoleKey; pct: number }[];
  currentRole: RoleKey;
}) {
  if (distribution.length === 0) return null;
  return (
    <div className="role-dist">
      {distribution.map((d) => (
        <div className={`role-dist-item${d.role === currentRole ? " is-current" : ""}`} key={d.role}>
          <span className="role-dist-icon">
            <RoleIcon role={d.role} />
          </span>
          <span className="role-dist-pct">{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}
