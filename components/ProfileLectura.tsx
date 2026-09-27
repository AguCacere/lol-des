"use client";

import { RADAR_AXIS } from "@/lib/radar";
import { ROLES } from "@/lib/ladder";
import { QUE_SIGNIFICA, type Lectura } from "@/lib/lectura";
import type { RoleKey } from "@/lib/types";
import { InfoTip } from "./InfoTip";

/**
 * "Dónde estás destacando" y "Tu foco ahora": la interpretación, no la tabla.
 *
 * Esto es lo que quedó de la pestaña Mejorar, que se fue entera. Mejorar no
 * era otra dimensión del perfil — era la INTERPRETACIÓN de los datos del
 * perfil— y tenerla aparte producía dos problemas a la vez: obligaba a un
 * click para llegar a la conclusión, y repetía adentro cosas que ya estaban
 * en Resumen (las líneas, la forma reciente). Una información aparece una
 * sola vez.
 *
 * Lo que cambió del contenido: antes se listaban las SIETE métricas del rol
 * en una tabla y el trabajo de encontrar las importantes quedaba del lado de
 * la persona. Ahora la app hace ese trabajo: entran las que se despegan de
 * verdad —máximo tres— y el foco es UNO solo. Ver lib/lectura.ts para el
 * umbral y por qué un "+6% de CS por minuto" no es una fortaleza.
 *
 * Ningún cálculo cambió: son los mismos ejes del radar, sobre todas las
 * partidas de esa persona en su línea contra todas las del grupo en la misma.
 */
export function ProfileLectura({ l, role }: { l: Lectura | null; role: RoleKey }) {
  if (!l) {
    return (
      <p className="lec-vacio">
        Todavía no hay con qué comparar. Hace falta que esta persona tenga al menos diez partidas en su línea y que
        el resto del grupo tenga veinte en esa misma línea — si no, el promedio contra el que se mide no significa
        nada.
      </p>
    );
  }

  const rol = ROLES[role].label;
  const nada = l.fuerte.length === 0 && l.foco === null;

  return (
    <div className="lec">
      <p className="lec-muestra">
        Contra los demás <strong>{rol}</strong> del grupo · sus {l.ownGames} partidas en esa línea contra {l.peerGames}{" "}
        del resto
        <InfoTip text="Se compara contra los que juegan SU MISMA línea y no contra el grupo entero: el CS por minuto de un support al lado del de un ADC no dice nada de ninguno de los dos. El cálculo sale de todas las partidas guardadas, no de las últimas cinco." />
      </p>

      {nada ? (
        <p className="lec-vacio">
          No se despega del resto de los {rol} en ninguna métrica: las {l.parejas} están dentro del ruido normal
          entre dos poblaciones.
        </p>
      ) : (
        <>
          {l.fuerte.length > 0 && (
            <div className="lec-bloque">
              <span className="lec-titulo">
                <i className="lec-punto good" aria-hidden />
                Dónde está destacando
              </span>
              <ul className="lec-lista">
                {l.fuerte.map((f) => (
                  <li className="lec-fila" key={f.key}>
                    <span className="lec-metrica">
                      <span className="lec-larga">{RADAR_AXIS[f.key].long}</span>
                      <span className="lec-corta">{RADAR_AXIS[f.key].short}</span>
                    </span>
                    <span className="lec-valor">{f.valor}</span>
                    <span className="lec-rol">
                      rol <b>{f.rol}</b>
                    </span>
                    <span className="lec-dif good">+{f.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* El foco. UNO solo, y con la frase de qué mide esa métrica: sin
              eso "participación en objetivos −9%" es un número, no algo que
              alguien pueda ir a corregir esta noche. La frase dice QUÉ mide,
              nunca por qué le pasa — eso no lo midió nadie. */}
          {l.foco && (
            <div className="lec-foco">
              <span className="lec-titulo">
                <i className="lec-punto bad" aria-hidden />
                Su foco ahora
              </span>
              <p className="lec-foco-que">
                <strong>{RADAR_AXIS[l.foco.key].long}</strong>
                <span className="lec-foco-nums">
                  {l.foco.valor} contra {l.foco.rol} del resto de los {rol}
                  {/* El menos tipográfico, no el guión del teclado: es el
                      mismo que usa el resto de la app. */}
                  <b className="bad">−{Math.abs(l.foco.pct)}%</b>
                </span>
              </p>
              <p className="lec-foco-txt">{QUE_SIGNIFICA[l.foco.key]}</p>
            </div>
          )}
        </>
      )}

      {l.parejas > 0 && !nada && (
        <p className="lec-pie">
          {l.parejas === 1 ? "Otra métrica quedó" : `Otras ${l.parejas} quedaron`} dentro del ruido: menos de un 8% de
          diferencia contra su línea.
        </p>
      )}
    </div>
  );
}
