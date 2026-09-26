"use client";

import { useState } from "react";
import { RADAR_AXIS, type RadarMetric, type RadarProfile } from "@/lib/radar";
import { ROLES } from "@/lib/ladder";
import type { Match, RoleKey } from "@/lib/types";
import { InfoTip } from "./InfoTip";
import { ChampIcon } from "./ChampIcon";

/**
 * "Mejorar": una sola lectura de en qué está mejor y en qué peor que su rol.
 *
 * Acá había TRES cosas diciendo lo mismo: el radar, la tabla de ejes que
 * venía abajo del radar, y una tarjeta de "Fortalezas y debilidades". Tres
 * representaciones del mismo par de números (tu valor, el del rol) en la
 * misma pestaña.
 *
 * Y de las tres, la tarjeta estaba MAL CALCULADA. Sus promedios salían de
 * `p.matches`, que son las últimas CINCO partidas, y los comparaba contra el
 * promedio del rol, que sale de cientos. Una partida buena te movía de
 * "debilidad" a "fortaleza". El radar, en cambio, se calcula en el servidor
 * sobre TODAS tus partidas en ese rol contra TODAS las del grupo en ese rol,
 * y además reporta las dos muestras.
 *
 * Así que se quedó el CÁLCULO del radar y se fue su FORMA. Un radar obliga a
 * interpretar geometría para contestar "¿en qué estoy peor?", que es una
 * pregunta de lista ordenada. Lo que queda es una fila por métrica:
 *
 *     métrica | vos | tu rol | diferencia | cómo venís
 *
 * partida en dos grupos por el signo, y ordenada por cuánto se despega.
 *
 * NO lleva una columna de tendencia, y es a propósito. "¿Cómo estoy contra
 * mi rol?" y "¿vengo mejorando?" son dos preguntas distintas con dos
 * referencias distintas (el grupo / vos mismo antes), y meter la segunda
 * como una flecha acá no la contestaría bien: `RecentForm` la contesta con
 * ocho métricas y sus dos ventanas, y sigue debajo. Una representación por
 * PREGUNTA, no una sola representación para todo.
 */

/**
 * Cuánto tiene que despegarse del promedio del rol para pintarse. Es el mismo
 * 8% que ya usaba `lib/insights.ts` para decidir qué era notable: el umbral
 * no cambió de valor, cambió de lugar.
 */
const NOTABLE_PCT = 8;

/** El valor de ese eje en UNA partida, para poder mostrar dónde se nota. */
function valorEnPartida(key: RadarMetric, m: Match): number {
  switch (key) {
    case "kda":
      return (m.k + m.a) / Math.max(1, m.d);
    case "killParticipation":
      return m.killParticipation;
    case "dmgShare":
      return m.dmgShare;
    case "objShare":
      return m.objShare;
    case "goldPerMin":
      return m.gold;
    case "csPerMin":
      return parseFloat(m.csmin);
    case "visionPerMin":
      return m.visionScore / Math.max(1, m.dur);
  }
}

function formatear(key: RadarMetric, v: number): string {
  const a = RADAR_AXIS[key];
  return `${v.toFixed(a.decimals).replace(".", ",")}${a.suffix ?? ""}`;
}

interface Fila {
  key: RadarMetric;
  valor: number;
  rol: number;
  /** Diferencia contra el rol, en %. */
  pct: number;
  /** Desvíos estándar. Es lo que ordena: tiene en cuenta cuánto varía el grupo. */
  z: number;
}

export function ProfileMejorar({
  radar,
  role,
  matches,
  ddragonVersion,
}: {
  radar: RadarProfile | null;
  role: RoleKey;
  matches: Match[];
  ddragonVersion: string | null;
}) {
  const [abierta, setAbierta] = useState<RadarMetric | null>(null);

  if (!radar) {
    return (
      <p className="mej-vacio">
        Todavía no hay con qué comparar. Hace falta que esta persona tenga al menos diez partidas en su línea y
        que el resto del grupo tenga veinte en esa misma línea — si no, el promedio contra el que se mide no
        significa nada.
      </p>
    );
  }

  const filas: Fila[] = radar.axes.map((a) => ({
    key: a.key,
    valor: a.value,
    rol: a.peerMean,
    pct: a.peerMean !== 0 ? ((a.value - a.peerMean) / Math.abs(a.peerMean)) * 100 : 0,
    z: a.z,
  }));

  // Por el signo del z y no del %: el z ya tiene en cuenta cuánto varía el
  // grupo en ese eje, así que ordena mejor lo que de verdad se despega.
  const fuertes = filas.filter((f) => f.z > 0).sort((a, b) => b.z - a.z);
  const flojas = filas.filter((f) => f.z <= 0).sort((a, b) => a.z - b.z);

  const grupo = (titulo: string, ayuda: string, fs: Fila[], tono: "good" | "bad") => {
    if (fs.length === 0) return null;
    return (
      <div className="mej-grupo">
        <h4 className="mej-titulo">
          <span className={`mej-punto ${tono}`} aria-hidden />
          {titulo}
          <InfoTip text={ayuda} />
        </h4>
        <ul className="mej-lista">
          {fs.map((f) => {
            const a = RADAR_AXIS[f.key];
            const notable = Math.abs(f.pct) >= NOTABLE_PCT;
            const esta = abierta === f.key;
            return (
              <li key={f.key}>
                <button
                  type="button"
                  className={`mej-fila${esta ? " abierta" : ""}`}
                  onClick={() => setAbierta((cur) => (cur === f.key ? null : f.key))}
                  aria-expanded={esta}
                >
                  {/* Las dos versiones del nombre, y el CSS elige. En 390 la
                      columna no da para "Participación en objetivos" y con
                      puntos suspensivos se leen todas igual de mal;
                      RADAR_AXIS ya trae la corta de cada una. */}
                  <span className="mej-metrica">
                    <span className="mej-larga">{a.long}</span>
                    <span className="mej-corta">{a.short}</span>
                  </span>
                  <span className="mej-valor">{formatear(f.key, f.valor)}</span>
                  <span className="mej-rol">{formatear(f.key, f.rol)}</span>
                  {/* Sin color cuando la diferencia es chica: dos poblaciones
                      nunca dan el mismo número, y teñir un −3% es ruido
                      disfrazado de señal. */}
                  <span className={`mej-dif ${notable ? tono : "flojo"}`}>
                    {f.pct > 0 ? "+" : ""}
                    {Math.round(f.pct)}%
                  </span>
                </button>

                {esta && (
                  <div className="mej-donde">
                    {/* "¿En qué partidas se nota?" — con las que hay, y
                        diciendo cuántas son. Son las últimas cinco guardadas:
                        no alcanzan para sacar una conclusión y por eso no se
                        saca ninguna, solo se muestran los valores al lado del
                        promedio del rol. */}
                    <span className="mej-donde-et">
                      Sus últimas {matches.length} partidas en esta métrica · el rol promedia{" "}
                      {formatear(f.key, f.rol)}
                    </span>
                    <ul className="mej-partidas">
                      {matches.map((m, i) => {
                        const v = valorEnPartida(f.key, m);
                        const arriba = v >= f.rol;
                        return (
                          <li className="mej-partida" key={i}>
                            <ChampIcon champ={m.champ} version={ddragonVersion} className="mej-partida-champ" />
                            <span className={`mej-partida-valor ${arriba ? "good" : "bad"}`}>
                              {formatear(f.key, v)}
                            </span>
                            <span className={`mej-partida-res ${m.win ? "w" : "l"}`}>{m.win ? "V" : "D"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="mej">
      <div className="mej-cab">
        <h3 className="mej-h3">Comparado con {ROLES[role].label} del grupo</h3>
        <span className="mej-muestra">
          sus {radar.ownGames} partidas en esa línea contra {radar.peerGames} del resto
          <InfoTip text="Cada métrica se mide en desvíos estándar respecto del promedio del grupo en esa misma línea, no en un porcentaje pelado: así una que varía poco entre jugadores (el CS por minuto) y una que varía mucho (la visión) pesan lo mismo. Lo que se ordena es cuánto se despega; el porcentaje está para poder leerlo." />
        </span>
      </div>

      <div className="mej-rotulos" aria-hidden>
        <span />
        <span className="mej-rot-n">Vos</span>
        <span className="mej-rot-n">Su rol</span>
        <span className="mej-rot-n">Dif.</span>
      </div>

      {grupo(
        "Lo que hace mejor que su rol",
        "Ordenado por cuánto se despega del promedio del grupo en esa línea, en desvíos estándar.",
        fuertes,
        "good"
      )}
      {grupo(
        "Dónde está por debajo",
        "Lo mismo, para el otro lado. Tocá una fila para ver sus últimas partidas en esa métrica.",
        flojas,
        "bad"
      )}
    </div>
  );
}
