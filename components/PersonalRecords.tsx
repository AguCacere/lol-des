import type { PersonalRecords as PersonalRecordsData } from "@/lib/types";
import { ClockIcon, CoinIcon, TargetIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

/**
 * "Récords personales" — el mejor/más extremo número de UNA partida puntual,
 * de TODO el historial guardado (no solo las últimas 5 que se muestran en la
 * lista) — ver Player.personalRecords, calculado server-side en
 * app/api/ladder/route.ts. Mismo tratamiento visual que el stat-grid de
 * "Progresión y mapa" (6 tiles, mismos iconos reutilizados donde el
 * significado es consistente) para que se sienta parte de la misma familia
 * de datos, no una tarjeta nueva con su propio lenguaje visual.
 */
export function PersonalRecords({ records }: { records: PersonalRecordsData | null }) {
  if (!records) return null;
  return (
    <div className="stat-grid">
      <div className="stat-tile">
        <TrendUpIcon />
        <div className="v">{records.longestWinStreak}</div>
        <div className="k">Racha más larga</div>
      </div>
      <div className="stat-tile">
        <TrophyIcon />
        <div className="v">{records.bestKda.toFixed(2)}</div>
        <div className="k">Mejor KDA · {championLabel(records.bestKdaChamp)}</div>
      </div>
      <div className="stat-tile">
        <ClockIcon />
        <div className="v">{records.longestGameMin} min</div>
        <div className="k">Partida más larga</div>
      </div>
      <div className="stat-tile">
        <TargetIcon />
        <div className="v">{records.mostKillsSingleGame}</div>
        <div className="k">Más kills en una partida</div>
      </div>
      <div className="stat-tile">
        <ZapIcon />
        <div className="v">{records.mostDamageSingleGame.toLocaleString("es-AR")}</div>
        <div className="k">Más daño en una partida</div>
      </div>
      <div className="stat-tile">
        <CoinIcon />
        <div className="v">{records.mostCsSingleGame}</div>
        <div className="k">Más CS en una partida</div>
      </div>
    </div>
  );
}
