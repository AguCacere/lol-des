"use client";

import { useEffect, useState } from "react";
import { puntajeTexto } from "@/lib/liga";

/**
 * El libro de contabilidad de la semana: qué hizo cada uno, día por día.
 *
 * Existe porque la carrera cuenta la MITAD de esta historia. El gráfico da la
 * forma —quién se escapó, cuándo se cruzaron— pero no tiene los números: no hay
 * manera de leer ahí "el martes hizo +2,25". Y el dato estaba todo el tiempo:
 * `porDia` es el acumulado de cada uno al cierre de cada día, lo mismo que
 * dibuja la curva. Esto no pide nada nuevo al servidor, solo lo escribe.
 *
 * Por eso son dos cosas y no una: la carrera es la silueta y esto es la cuenta.
 * Si esta grilla estuviera siempre abierta serían dos formas del mismo dato
 * compitiendo en la misma pantalla, y por eso va detrás de un botón — la misma
 * decisión que el cartel de "cómo terminó": una foto de diez segundos que se
 * abre encima y se cierra, sin irse de la liga.
 *
 * Dos vistas de la misma grilla, porque son dos preguntas distintas:
 *
 * - **Puntos** — cuánto sumó o restó ESE día. Es el rendimiento diario.
 * - **Puesto** — en qué posición cerró cada día. Es el movimiento, y es lo que
 *   de verdad contesta "cómo se fue haciendo": se ve a alguien subir del quinto
 *   al segundo leyendo una fila de izquierda a derecha.
 *
 * Un toggle y no las dos juntas: en una celda de treinta píxeles, dos números
 * uno arriba del otro no son más información, son ruido.
 */

interface Corredor {
  puuid: string;
  name: string;
  puntos?: number;
  porDia?: number[];
  sinJugar: boolean;
}

interface Props {
  /** Los siete nombres de día, de lunes a domingo. */
  dias: string[];
  /** Cuántos ya arrancaron, contando el de hoy. Entre 1 y la duración del torneo (que no siempre es 7). */
  corridos: number;
  /** El rango de la semana, ya escrito ("14 sept – 20 sept"). */
  rango: string;
  /** La tabla, ya ordenada. */
  tabla: Corredor[];
  /** Si la semana ya cerró, para hablar en pasado. */
  cerrada?: boolean;
  onCerrar: () => void;
}

type Vista = "puntos" | "puesto";

/** "1º", "2º"… */
const puesto = (n: number) => `${n}º`;

export function LigaDiaADia({ dias, corridos, rango, tabla, cerrada = false, onCerrar }: Props) {
  const [vista, setVista] = useState<Vista>("puntos");

  // Escape cierra, igual que el cartel del torneo: es lo primero que prueba
  // cualquiera con algo abierto encima.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Solo los que jugaron. El que no aparece en toda la semana sería una fila de
  // guiones: no cuenta nada y le roba lugar a los que sí.
  const jugaron = tabla.filter((f) => !f.sinJugar && (f.porDia?.length ?? 0) > 1);
  const cuantos = Math.min(corridos, dias.length);
  const columnas = dias.slice(0, cuantos);

  /** El acumulado de esa persona al cierre del día `i`. */
  const alCierre = (f: Corredor, i: number) => f.porDia?.[i + 1] ?? f.porDia?.[f.porDia.length - 1] ?? 0;

  // El puesto de cada uno al cierre de cada día. Se calcula una vez por día y
  // no por celda: con seis jugadores da igual, pero ordenar adentro del render
  // de cada celda es la clase de cosa que después nadie encuentra.
  const puestos: Map<string, number>[] = columnas.map((_, i) => {
    const orden = [...jugaron].sort((a, b) => alCierre(b, i) - alCierre(a, i));
    const m = new Map<string, number>();
    orden.forEach((f, k) => m.set(f.puuid, k + 1));
    return m;
  });

  return (
    <div className="torneo-fondo" onClick={onCerrar} role="presentation">
      <div
        className="torneo-caja"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`La semana día por día, ${rango}`}
      >
        <div className="torneo-head">
          <div className="torneo-titulo">
            <span className="torneo-rotulo">Día por día</span>
            <strong>{rango}</strong>
          </div>
          <div className="dxd-vistas" role="group" aria-label="Qué mostrar">
            <button
              type="button"
              className={`dxd-vista${vista === "puntos" ? " activa" : ""}`}
              onClick={() => setVista("puntos")}
              aria-pressed={vista === "puntos"}
            >
              Puntos
            </button>
            <button
              type="button"
              className={`dxd-vista${vista === "puesto" ? " activa" : ""}`}
              onClick={() => setVista("puesto")}
              aria-pressed={vista === "puesto"}
            >
              Puesto
            </button>
          </div>
          <button type="button" className="torneo-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {jugaron.length === 0 ? (
          <div className="empty-state">
            <strong>{cerrada ? "Esa semana no jugó nadie." : "Todavía no jugó nadie."}</strong>
          </div>
        ) : (
          <>
            {/* La grilla es de verdad una tabla: se comparan las mismas celdas
                entre personas Y entre días, que es exactamente para lo que
                sirve una tabla y para lo que no sirve una lista. El scroll
                horizontal es suyo y no de la página — siete días más el nombre
                no entran en un teléfono— y la columna de nombres queda pegada
                a la izquierda para que al deslizar se siga sabiendo quién es
                cada fila. */}
            <div className="dxd-marco">
              <table className="dxd">
                <thead>
                  <tr>
                    <th scope="col" className="dxd-quien">
                      {vista === "puntos" ? "Lo que hizo cada día" : "En qué puesto cerró"}
                    </th>
                    {columnas.map((d, i) => (
                      <th scope="col" key={`${d}-${i}`} className={i === cuantos - 1 && !cerrada ? "hoy" : undefined}>
                        {d}
                      </th>
                    ))}
                    <th scope="col" className="dxd-total">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jugaron.map((f) => (
                    <tr key={f.puuid}>
                      <th scope="row" className="dxd-quien">
                        {f.name}
                      </th>
                      {columnas.map((_, i) => {
                        if (vista === "puesto") {
                          const p = puestos[i].get(f.puuid);
                          return (
                            <td key={i} className={`dxd-celda${p === 1 ? " lider" : ""}`}>
                              {p ? puesto(p) : "—"}
                            </td>
                          );
                        }
                        // Lo del día: el cierre de hoy menos el de ayer. El
                        // primer día se compara contra el 0 del arranque.
                        const hoy = alCierre(f, i);
                        const ayer = i === 0 ? 0 : alCierre(f, i - 1);
                        const delta = hoy - ayer;
                        return (
                          <td
                            key={i}
                            className={`dxd-celda${delta > 0 ? " gd-pos" : delta < 0 ? " gd-neg" : " quieto"}`}
                            // El día sin jugar y el día que quedó en cero se ven
                            // igual —un guion— porque en los dos casos el
                            // marcador no se movió, que es lo que esta grilla
                            // mide. Quién jugó y no sumó lo cuenta la tabla.
                            title={delta === 0 ? "No movió el marcador" : undefined}
                          >
                            {delta === 0 ? "—" : puntajeTexto(delta)}
                          </td>
                        );
                      })}
                      <td className="dxd-celda dxd-total">{puntajeTexto(f.puntos ?? alCierre(f, cuantos - 1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="dxd-pie">
              {vista === "puntos"
                ? "Cuánto sumó o restó cada uno ese día. Un guion es que no movió el marcador."
                : "En qué puesto cerró cada día. Se lee de izquierda a derecha: ahí se ve quién subió y quién se cayó."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
