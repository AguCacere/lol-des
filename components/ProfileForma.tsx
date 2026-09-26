import type { Match, RecentForm } from "@/lib/types";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { InfoTip } from "./InfoTip";

/**
 * "Cómo viene": la banda de forma del Resumen.
 *
 * Reemplaza a seis fichas de estadística que estaban acá y tenían un
 * problema peor que el de ocupar lugar. Cuatro de ellas —participación en
 * objetivos, kill participation, visión por minuto y duración promedio— se
 * calculaban sobre `p.matches`, que son **las últimas CINCO partidas**, y se
 * mostraban como si fueran los números generales del jugador, sin decir la
 * muestra en ningún lado. Un "Participación objetivos: 4%" sacado de cinco
 * partidas al lado de un "Winrate season: 43,4%" sacado de seiscientas son
 * dos cosas incomparables con la misma pinta.
 *
 * Las tres primeras ya están bien contadas en la otra pestaña, contra el
 * promedio del rol y sobre TODO el historial (el radar y la forma reciente).
 * La cuarta, la duración promedio, no contesta "cómo viene" y se fue.
 *
 * Lo que queda son tres lecturas, cada una con su muestra escrita al lado:
 *
 *   las últimas cinco   ●●●●●   reales y en orden
 *   las últimas veinte  contra su propio historial anterior
 *   la season entera    el ancla de largo plazo
 */
export function ProfileForma({
  matches,
  recentForm,
  wins,
  losses,
}: {
  /** Las últimas partidas guardadas, de la más nueva a la más vieja. */
  matches: Match[];
  /** Las últimas 20 contra todo lo anterior de él mismo. Null hasta tener historial. */
  recentForm: RecentForm | null;
  /** El récord de season que devuelve Riot. */
  wins: number;
  losses: number;
}) {
  const ultimas = matches.slice(0, 5);
  const v = ultimas.filter((m) => m.win).length;
  const wr = recentForm?.winrate ?? null;
  // En puntos porcentuales y no en "% de %": los dos lados ya son porcentajes.
  const pp = wr ? Math.round(wr.recent - wr.baseline) : null;

  if (ultimas.length === 0 && !wr) return null;

  return (
    <div className="forma-band">
      {ultimas.length > 0 && (
        <div className="fb-bloque">
          <span className="fb-et">Las últimas {ultimas.length}</span>
          <span className="fb-puntos" aria-hidden>
            {/* De la más NUEVA a la más vieja, como se leen las rachas en toda
                la app. Salen de las partidas guardadas, así que el orden es
                real — no reconstruido de las fotos de LP, donde dos partidas
                entre dos fotos no dicen cuál fue primero. */}
            {ultimas.map((m, i) => (
              <span key={i} className={`fb-punto ${m.win ? "good" : "bad"}`} />
            ))}
          </span>
          <span className="fb-dato">
            {v}V · {ultimas.length - v}D
          </span>
        </div>
      )}

      {wr && (
        <div className="fb-bloque">
          <span className="fb-et">
            Las últimas {recentForm!.recentGames}
            <InfoTip text={`Su winrate en las últimas ${recentForm!.recentGames} partidas guardadas, comparado con las ${recentForm!.baselineGames} anteriores de él mismo. No contra el grupo ni contra el rol: contra su propia versión de antes.`} />
          </span>
          <span className={`fb-cifra ${wr.recent >= 50 ? "good" : "bad"}`}>{Math.round(wr.recent)}%</span>
          {pp !== null && (
            <span className={`fb-dato ${pp > 1 ? "good" : pp < -1 ? "bad" : ""}`}>
              {pp > 0 ? "+" : ""}
              {pp} pp vs. sus {recentForm!.baselineGames} anteriores
            </span>
          )}
        </div>
      )}

      {wins + losses > 0 && (
        <div className="fb-bloque">
          <span className="fb-et">La season</span>
          <span className={`fb-cifra ${tonoDeWinrate(wins, wins + losses)}`}>{winrateTexto(wins, wins + losses)}</span>
          <span className="fb-dato">
            {wins}V · {losses}D
          </span>
        </div>
      )}
    </div>
  );
}
