import type { PersonalRecords as PersonalRecordsData } from "@/lib/types";
import { ClockIcon, CoinIcon, TargetIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

/**
 * "Récords personales" — el número más extremo de UNA partida, sobre TODO el
 * historial guardado (no solo las cinco que se listan). Se calcula en el
 * servidor, ver Player.personalRecords.
 *
 * Eran SEIS cuadrados en una grilla de 2×3 y ocupaban doscientos píxeles de
 * alto para decir seis números de una línea cada uno. Es el caso más claro
 * del síndrome de meter cada dato en su caja: no hay nada que un rectángulo
 * aporte a "43 min" que no aporten el número y su rótulo al lado.
 *
 * Ahora es una sola tira. Cada récord sigue con su ícono —que es lo que los
 * hace distinguibles de un vistazo— y en el teléfono la tira envuelve sola.
 */
export function PersonalRecords({ records }: { records: PersonalRecordsData | null }) {
  if (!records) return null;
  const items = [
    { icono: <TrendUpIcon />, v: String(records.longestWinStreak), k: "racha" },
    { icono: <TrophyIcon />, v: records.bestKda.toFixed(2), k: `KDA · ${championLabel(records.bestKdaChamp)}` },
    { icono: <ClockIcon />, v: `${records.longestGameMin} min`, k: "más larga" },
    { icono: <TargetIcon />, v: String(records.mostKillsSingleGame), k: "kills" },
    { icono: <ZapIcon />, v: records.mostDamageSingleGame.toLocaleString("es-AR"), k: "daño" },
    { icono: <CoinIcon />, v: String(records.mostCsSingleGame), k: "CS" },
  ];
  return (
    <ul className="recs">
      {items.map((it) => (
        <li className="recs-item" key={it.k}>
          <span className="recs-icono" aria-hidden>{it.icono}</span>
          <b className="recs-v">{it.v}</b>
          <span className="recs-k">{it.k}</span>
        </li>
      ))}
    </ul>
  );
}
