import type { Aegis, PersonalRecords as PersonalRecordsData } from "@/lib/types";
import { ClockIcon, CoinIcon, ShieldIcon, TargetIcon, TrendUpIcon, TrophyIcon, ZapIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";
import { InfoTip } from "./InfoTip";

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
 *
 * El contador de Aegis va acá y no en una sección propia, por dos razones. La
 * primera es que encaja: un Aegis ES el LP más extremo de una partida, que es
 * de lo que trata toda esta tira. La segunda es medida — son entre una y
 * cinco por persona sobre meses de historial, y ninguna de las veintisiete que
 * hay hoy en la base cae en las últimas cinco partidas, así que la chapa de la
 * partida sola dejaría la detección invisible.
 *
 * Y va marcado: es lo único de la tira que NO es un hecho, así que lleva su ⓘ
 * diciendo que se infiere y cómo. Los otros seis salen de la base tal cual.
 */
export function PersonalRecords({ records, aegis }: { records: PersonalRecordsData | null; aegis: Aegis | null }) {
  if (!records) return null;
  const detecciones = aegis?.detections ?? [];
  const altas = detecciones.filter((d) => d.confidence === "high").length;
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
      {detecciones.length > 0 && (
        <li className="recs-item recs-aegis">
          <span className="recs-icono" aria-hidden>
            <ShieldIcon />
          </span>
          <b className="recs-v">{detecciones.length}</b>
          <span className="recs-k">
            {altas === detecciones.length ? "Aegis" : "posibles Aegis"}
            <InfoTip
              text={`Riot no publica este dato en ningún lado de su API, así que es una inferencia: son victorias que dieron cerca del doble de LP que una victoria normal suya (la mediana de las suyas está en ~${aegis?.baselineLp} LP, sobre ${aegis?.sampleSize} con LP propio atribuido). Aparecen marcadas en el gráfico de arriba y en la partida, cuando cae dentro de lo que se muestra.`}
            />
          </span>
        </li>
      )}
    </ul>
  );
}
