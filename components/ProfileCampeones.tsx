"use client";

import { useState } from "react";
import type { ChampionPoolEntry, MasteryEntry } from "@/lib/types";
import type { ChampionMatchups } from "@/lib/matchups";
import type { ChampionBuildStats } from "@/lib/builds";
import type { ChampionInsight } from "@/lib/champion-insights";
import { championLabel } from "@/lib/champion-names";
import { itemIconUrl } from "@/lib/ddragon";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";

/**
 * "Campeones", organizado alrededor DEL CAMPEÓN.
 *
 * Lo que había eran cinco secciones —maestría, más jugados, lectura del pool,
 * enfrentamientos de línea y cómo arrancás— cada una con TODOS los campeones
 * adentro. Para entender cómo le va con Seraphine había que recorrer las
 * cinco y juntar los pedazos de cabeza. Los datos estaban; la pregunta que
 * contestaban no era la que alguien se hace.
 *
 * Ahora se elige un campeón y abajo está todo lo suyo: su récord, su
 * maestría, contra quién le va bien y mal, y con qué arranca. Ninguna cuenta
 * cambió — es el mismo `championPool`, el mismo `masteryPool`, los mismos
 * `matchups` y `buildStats`, cruzados por nombre de campeón.
 *
 * Es un SELECTOR y no una lista apilada a propósito. Cinco campeones con sus
 * matchups y sus arranques uno abajo del otro son unos 1.500px de scroll para
 * leer, casi siempre, el primero. El resto está a un toque.
 */

/** Cuánta maestría es "mucha" — el mismo formato que usaba MasteryPool. */
function puntos(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}k`;
  return String(n);
}

const MOTIVO: Record<ChampionInsight["kind"], string> = {
  abandonado: "Mucha maestría acumulada y todavía ninguna partida de ranked guardada.",
  sin_rendir: "Es de los que más trabajó y en ranked no le está saliendo.",
  destacado: "Le rinde sin ser de los que más maestría tiene.",
};

export function ProfileCampeones({
  pool,
  mastery,
  matchups,
  builds,
  insights,
  ddragonVersion,
}: {
  pool: ChampionPoolEntry[];
  mastery: MasteryEntry[];
  matchups: ChampionMatchups[];
  builds: ChampionBuildStats[];
  insights: ChampionInsight[];
  ddragonVersion: string | null;
}) {
  const [elegido, setElegido] = useState<string | null>(null);

  if (pool.length === 0) {
    return (
      <div className="empty-state">
        <strong>Todavía no hay campeones que mostrar</strong>
        Aparecen solos con las primeras partidas de ranked que guarde la app.
      </div>
    );
  }

  const champ = pool.find((c) => c.champ === elegido) ?? pool[0];
  const suMaestria = mastery.find((m) => m.champ === champ.champ) ?? null;
  const susCruces = matchups.find((m) => m.champ === champ.champ) ?? null;
  const suBuild = builds.find((b) => b.champ === champ.champ) ?? null;
  const suLectura = insights.find((i) => i.champ === champ.champ) ?? null;

  // Lo que NO se puede plegar adentro de un campeón del pool: maestría en
  // campeones que todavía no jugó en ranked. No tienen récord, así que no
  // tienen bloque — pero tampoco se tiran, porque "tenés 400k con este y no
  // lo jugaste nunca" es justamente un dato.
  const nombresDelPool = new Set(pool.map((c) => c.champ));
  const sinJugar = mastery.filter((m) => !nombresDelPool.has(m.champ));

  return (
    <div className="pc">
      {/* El roster de campeones. Mismo idioma que el de invocadores: caras en
          fila, la elegida con anillo. */}
      <div className="pc-tira" role="group" aria-label="Campeones">
        {pool.map((c) => (
          <button
            type="button"
            key={c.champ}
            className={`pc-chip${c.champ === champ.champ ? " activo" : ""}`}
            aria-pressed={c.champ === champ.champ}
            onClick={() => setElegido(c.champ)}
          >
            <ChampIcon champ={c.champ} version={ddragonVersion} className="pc-chip-art" />
            <span className="pc-chip-nombre">{championLabel(c.champ)}</span>
            <span className="pc-chip-partidas">{c.games}</span>
          </button>
        ))}
      </div>

      <div className="pc-detalle">
        <div className="pc-cab">
          <ChampIcon champ={champ.champ} version={ddragonVersion} className="pc-arte" />
          <div className="pc-id">
            <h3 className="pc-nombre">{championLabel(champ.champ)}</h3>
            <p className="pc-cifras">
              <span className={tonoDeWinrate(champ.wins, champ.games)}>{winrateTexto(champ.wins, champ.games)}</span>
              <span className="pc-sep">·</span>
              {champ.wins}V · {champ.losses}D
              <span className="pc-sep">·</span>
              {champ.avgKda} KDA
              <span className="pc-sep">·</span>
              {champ.avgCsPerMin} CS/min
            </p>
            {/* La maestría acá adentro y no en su propia lista: es un dato DE
                este campeón. Solo si Riot tiene algo para este — no todos los
                del pool están en el top de maestría. */}
            {suMaestria && (
              <p className="pc-maestria">
                Maestría {suMaestria.level} · {puntos(suMaestria.points)} puntos
                <InfoTip text="Champion Mastery de Riot: puntos de toda tu carrera y de TODAS las colas (ranked, normales, ARAM). No sale de las partidas que guarda la app — por eso puede no seguir el mismo orden que el récord de al lado." />
              </p>
            )}
            {suLectura && <p className={`pc-lectura ${suLectura.kind}`}>{MOTIVO[suLectura.kind]}</p>}
          </div>
        </div>

        <div className="pc-cols">
          <div className="pc-col">
            <h4 className="subsection-label">
              Contra quién
              <InfoTip text="El rival de TU MISMA línea en cada partida guardada con este campeón, y cómo terminó. El oro a los 15 es el promedio de la diferencia contra ese rival: dice si el cruce se define en línea o después." />
            </h4>
            {susCruces && susCruces.opponents.length > 0 ? (
              <div className="pc-cruces">
                {susCruces.opponents.map((m) => (
                  <div className="matchup-row" key={m.opponent}>
                    <ChampIcon champ={m.opponent} version={ddragonVersion} className="matchup-champ" />
                    <span className="matchup-names">
                      <span className="matchup-name">{championLabel(m.opponent)}</span>
                    </span>
                    <span className="matchup-bar wr-bar">
                      <span className="wr-seg win" style={{ flex: m.wins }} />
                      <span className="wr-seg loss" style={{ flex: m.losses }} />
                    </span>
                    <span className={`matchup-gd ${m.avgGoldDiff15 === null ? "" : m.avgGoldDiff15 >= 0 ? "gd-pos" : "gd-neg"}`}>
                      {m.avgGoldDiff15 !== null && (
                        <>
                          {m.avgGoldDiff15 > 0 ? "+" : ""}
                          {m.avgGoldDiff15.toLocaleString("es-AR")} oro @15&apos;
                        </>
                      )}
                    </span>
                    <span className="matchup-record">
                      <span className={`matchup-wr ${tonoDeWinrate(m.wins, m.games)}`}>
                        {winrateTexto(m.wins, m.games)}
                      </span>
                      <span className="matchup-games">
                        {m.wins}V-{m.losses}D
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pc-vacio">
                Todavía no se repitió ningún cruce lo suficiente con {championLabel(champ.champ)} como para
                decir algo.
              </p>
            )}
          </div>

          <div className="pc-col">
            <h4 className="subsection-label">
              Cómo arranca
              <InfoTip text="El primer ítem COMPLETO de cada partida (no el primer componente ni la poción) cruzado con el resultado. El universo es SU historial: no dice cuál es el mejor arranque del parche, dice cuál le funcionó a él. Por eso al lado del porcentaje va siempre el crudo." />
            </h4>
            {suBuild && suBuild.arranques.length > 0 ? (
              <div className="build-champ-rows">
                {suBuild.arranques.map((a) => {
                  const max = Math.max(...suBuild.arranques.map((x) => x.games));
                  return (
                    <div className="build-start" key={a.itemId}>
                      <span className="build-start-item" title={a.nombre}>
                        {ddragonVersion && (
                          // eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo
                          <img src={itemIconUrl(ddragonVersion, a.itemId)} alt={a.nombre} />
                        )}
                      </span>
                      <span className="build-start-name">{a.nombre}</span>
                      <span className="build-start-bar" aria-hidden>
                        <span className="build-start-total" style={{ width: `${(100 * a.games) / max}%` }}>
                          <span className="build-start-v" style={{ width: `${(100 * a.wins) / a.games}%` }} />
                          <span className="build-start-d" />
                        </span>
                      </span>
                      <span className={`build-start-wr ${tonoDeWinrate(a.wins, a.games)}`}>
                        {winrateTexto(a.wins, a.games)}
                      </span>
                      <span className="build-start-rec">
                        {a.wins}V-{a.games - a.wins}D
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pc-vacio">
                Hacen falta más partidas con {championLabel(champ.champ)} y al menos dos arranques distintos para
                poder compararlos.
              </p>
            )}
          </div>
        </div>
      </div>

      {sinJugar.length > 0 && (
        <div className="pc-sinjugar">
          <h4 className="subsection-label">
            Maestría sin partidas guardadas
            <InfoTip text="Campeones en los que Riot le cuenta maestría de toda su carrera pero que todavía no aparecieron en ninguna ranked guardada por la app. No tienen récord, así que no tienen bloque propio — pero que estén acá también dice algo." />
          </h4>
          <ul className="pc-sinjugar-lista">
            {sinJugar.map((m) => (
              <li className="pc-sinjugar-item" key={m.champ}>
                <ChampIcon champ={m.champ} version={ddragonVersion} className="pc-sinjugar-art" />
                <span className="pc-sinjugar-nombre">{championLabel(m.champ)}</span>
                <span className="pc-sinjugar-pts">
                  M{m.level} · {puntos(m.points)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
