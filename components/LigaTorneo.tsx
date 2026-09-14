"use client";

import { useCallback, useEffect, useState } from "react";
import { LigaCarrera } from "./LigaCarrera";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";

/**
 * Cómo terminó un torneo pasado, encima de lo que estabas mirando.
 *
 * La vitrina de campeones decía QUIÉN ganó cada semana y nada más. Quién quedó
 * segundo, con cuánto, si alguien se escapó el miércoles o si se definió el
 * domingo: eso no estaba en ninguna parte una vez que la semana cerraba.
 *
 * Va en un cartel encima y no en una pantalla propia a propósito. Es una foto
 * que se mira diez segundos y se cierra; mandar a otra página para eso obliga a
 * irse de la liga y volver, y perder dónde estabas por un vistazo es peor que
 * no tener el vistazo. Por la misma razón se cambia de semana DESDE ADENTRO,
 * con las flechas: la comparación entre dos semanas es media gracia del asunto
 * y cerrar y volver a abrir la mata.
 *
 * Los datos salen de `/api/liga/semana`, que los arma con el mismo código que
 * usó el cierre para coronar. No es una optimización: si esta pantalla armara
 * la tabla por su cuenta, una semana vieja podría mostrar un ganador distinto
 * del que anunció el bot.
 */

interface FilaTorneo {
  puuid: string;
  name: string;
  puntos: number;
  victorias: number;
  derrotas: number;
  ultimoDia: number;
  habilitado: boolean;
  champion: string | null;
  porDia: number[];
}

interface Datos {
  semana: string;
  dias: string[];
  ganadorPuuid: string | null;
  jugadores: number;
  /** Cuántos estaban anotados esa semana, jugaran o no. Ver el vacío de abajo. */
  anotados?: number;
  tabla: FilaTorneo[];
}

export function LigaTorneo({
  semanas,
  inicial,
  onCerrar,
}: {
  /** Las claves de las semanas cerradas, de la más nueva a la más vieja. */
  semanas: string[];
  inicial: string;
  onCerrar: () => void;
}) {
  const [semana, setSemana] = useState(inicial);
  /**
   * Lo cargado, con la semana que se PIDIÓ pegada al lado. Guardar las dos
   * cosas juntas es lo que deja calcular "está cargando" en vez de tener un
   * `setCargando(true)` arriba del efecto — que es la forma de encadenar
   * renders que el lint del repo no deja pasar, y con razón.
   */
  const [cargado, setCargado] = useState<{ semana: string; datos: Datos | null; error: string | null } | null>(null);
  const cargando = cargado?.semana !== semana;
  const datos = cargado?.datos ?? null;
  const error = cargado?.semana === semana ? cargado.error : null;

  useEffect(() => {
    let vivo = true;
    fetch(`/api/liga/semana?semana=${encodeURIComponent(semana)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.error ?? "No se pudo leer esa semana.")))))
      .then((d: Datos) => {
        if (vivo) setCargado({ semana, datos: d, error: null });
      })
      .catch((e: Error) => {
        if (vivo) setCargado({ semana, datos: null, error: e.message });
      });
    return () => {
      vivo = false;
    };
  }, [semana]);

  // Escape cierra. Es lo primero que prueba cualquiera con un cartel abierto y
  // no tenerlo se siente roto, por más que el fondo también cierre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const i = semanas.indexOf(semana);
  // `semanas` viene de la más nueva a la más vieja, así que "anterior en el
  // tiempo" es el índice de ADELANTE. Las flechas van en orden de calendario
  // —izquierda al pasado— porque es lo que espera cualquiera.
  const irA = useCallback(
    (paso: number) => {
      const siguiente = semanas[i + paso];
      if (siguiente) setSemana(siguiente);
    },
    [semanas, i],
  );

  const campeon = datos?.tabla.find((f) => f.puuid === datos.ganadorPuuid) ?? null;
  const puntero = datos?.tabla[0] ?? null;

  return (
    <div className="torneo-fondo" onClick={onCerrar} role="presentation">
      <div
        className="torneo-caja"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Cómo terminó la semana del ${rangoDeSemana(semana)}`}
      >
        <div className="torneo-head">
          <div className="torneo-titulo">
            <span className="torneo-rotulo">Cómo terminó</span>
            <strong>{rangoDeSemana(semana)}</strong>
          </div>
          <div className="torneo-nav">
            <button type="button" onClick={() => irA(1)} disabled={i + 1 >= semanas.length} aria-label="Semana anterior">
              ‹
            </button>
            <span className="torneo-nav-cuenta">
              {semanas.length - i} de {semanas.length}
            </span>
            <button type="button" onClick={() => irA(-1)} disabled={i <= 0} aria-label="Semana siguiente">
              ›
            </button>
            <button type="button" className="torneo-cerrar" onClick={onCerrar} aria-label="Cerrar">
              ✕
            </button>
          </div>
        </div>

        {error ? (
          <p className="torneo-vacio">{error}</p>
        ) : cargando && !datos ? (
          <p className="torneo-vacio">Buscando esa semana…</p>
        ) : !datos || datos.tabla.length === 0 ? (
          // "No jugó nadie" y "había gente anotada y no aparece ninguna
          // partida" son dos cosas distintas, y la segunda es un bug. Decir la
          // primera en los dos casos es lo que hizo que una consulta fallada se
          // leyera como un dato.
          <p className="torneo-vacio">
            {datos && (datos.anotados ?? 0) > 0
              ? `Esa semana había ${datos.anotados} anotados pero no hay ninguna partida guardada en esa ventana. Si jugaron, es un problema de datos, no de la semana.`
              : "Esta semana cerró antes de que se guardara su foto, y los que compitieron ya no están anotados. Se puede rescatar a mano: POST /api/liga/semana?semana=" +
                (datos?.semana ?? semana) +
                "."}
          </p>
        ) : (
          <div className={cargando ? "torneo-cuerpo cambiando" : "torneo-cuerpo"}>
            {/* El titular. Quedar primero y cobrar son dos cosas distintas y acá
                sí se dicen las dos: la semana ya cerró, no hay nada que se
                pueda dar vuelta en dos horas. */}
            <div className="torneo-campeon">
              {campeon ? (
                <>
                  <span className="torneo-copa" aria-hidden>
                    🏆
                  </span>
                  <strong>{campeon.name}</strong> se llevó la semana con{" "}
                  <span className={campeon.puntos >= 0 ? "gd-pos" : "gd-neg"}>{puntajeTexto(campeon.puntos)}</span>, entre{" "}
                  {datos.jugadores}
                  {puntero && puntero.puuid !== campeon.puuid && (
                    <span className="torneo-nota">
                      {" "}
                      · arriba terminó {puntero.name}, pero no llegó a los mínimos
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="torneo-copa" aria-hidden>
                    🫥
                  </span>
                  Esa semana <strong>no cobró nadie</strong>: nadie llegó a los mínimos
                  {puntero && <span className="torneo-nota"> · arriba terminó {puntero.name}</span>}
                </>
              )}
            </div>

            {/* La carrera de ESA semana, con los mismos colores que la de hoy:
                el color sale del PUUID, así que el que es azul esta semana es
                azul en todas. */}
            <LigaCarrera
              corredores={datos.tabla.map((f) => ({ puuid: f.puuid, name: f.name, porDia: f.porDia, puntos: f.puntos }))}
              dias={datos.dias}
              cerrada
            />

            <div className="torneo-tabla">
              {datos.tabla.map((f, idx) => (
                <div key={f.puuid} className={`torneo-fila${f.puuid === datos.ganadorPuuid ? " campeon" : ""}`}>
                  <span className="torneo-puesto">{idx + 1}</span>
                  <span className="torneo-nombre">{f.name}</span>
                  <span className="torneo-vd">
                    {f.victorias}V-{f.derrotas}D
                  </span>
                  {/* Si cobraba o no. Es la mitad del drama de la liga y sin
                      esto la tabla es un ranking cualquiera. */}
                  <span className={`torneo-minimos${f.habilitado ? " cumple" : ""}`}>
                    {f.habilitado ? "cumplió" : "sin mínimos"}
                  </span>
                  <span className={`torneo-pts ${f.puntos > 0 ? "gd-pos" : f.puntos < 0 ? "gd-neg" : ""}`}>
                    {puntajeTexto(f.puntos)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
