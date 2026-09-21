"use client";

import { useCallback, useEffect, useState } from "react";
import { LigaCarrera } from "./LigaCarrera";
import { PlayerAvatar } from "./PlayerAvatar";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";
import { comoSeDefinio, dueloDeLaEdicion } from "@/lib/palmares";

/**
 * Cómo terminó un torneo pasado, encima de lo que estabas mirando.
 *
 * La vitrina de campeones decía QUIÉN ganó cada semana y nada más. Quién quedó
 * segundo, con cuánto, si alguien se escapó el miércoles o si se definió el
 * domingo: eso no estaba en ninguna parte una vez que la semana cerraba.
 *
 * Va en un cartel encima y no en una pantalla propia a propósito. La app es una
 * sola página con pestañas en estado de React —no hay rutas por sección, ver
 * DECISIONES— así que "una pantalla propia" no daría enlace compartible ni
 * botón de atrás: daría exactamente esto con más pasos. Y es una foto que se
 * mira y se cierra; mandar a otra página obliga a irse de la liga y volver.
 * Por la misma razón se cambia de edición DESDE ADENTRO, con las flechas: la
 * comparación entre dos ediciones es media gracia del asunto y cerrar y volver
 * a abrir la mata.
 *
 * Los datos salen de `/api/liga/semana`, que los arma con el mismo código que
 * usó el cierre para coronar. No es una optimización: si esta pantalla armara
 * la tabla por su cuenta, una semana vieja podría mostrar un ganador distinto
 * del que anunció el bot.
 */

/** El podio se marca con medalla; del cuarto para abajo, número. */
const MEDALLAS = ["🥇", "🥈", "🥉"];

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
  const duelo = datos ? dueloDeLaEdicion(datos.tabla, datos.ganadorPuuid) : null;
  const relato = datos ? comoSeDefinio(datos.tabla, datos.dias, datos.ganadorPuuid) : null;

  return (
    <div className="torneo-fondo" onClick={onCerrar} role="presentation">
      <div
        className="torneo-caja"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Cómo terminó la semana del ${rangoDeSemana(semana)}`}
      >
        {/* El encabezado del ARCHIVO, no de un cartel. Arriba a qué pertenece
            esta pantalla, abajo qué edición se está mirando y las flechas para
            moverse. Antes decía "Cómo terminó" y la fecha con el mismo peso:
            dos rótulos discutiendo cuál era el título. */}
        <div className="torneo-head">
          <div className="torneo-titulo">
            <span className="torneo-rotulo">Historial de la liga</span>
            <strong>{rangoDeSemana(semana)}</strong>
          </div>
          <div className="torneo-nav">
            <button type="button" onClick={() => irA(1)} disabled={i + 1 >= semanas.length} aria-label="Edición anterior">
              ‹
            </button>
            <span className="torneo-nav-cuenta">
              {semanas.length - i} de {semanas.length}
            </span>
            <button type="button" onClick={() => irA(-1)} disabled={i <= 0} aria-label="Edición siguiente">
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
          <p className="torneo-vacio">Buscando esa edición…</p>
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
            {/* ── El campeón ──
                Un hero compacto, no una línea de texto y no un banner. Antes
                era una frase corrida —"X se llevó la semana con +10,75, entre
                6"— y el que ganó una edición entera se leía igual que una nota
                al pie. */}
            <div className="torneo-campeon">
              {campeon ? (
                <>
                  <span className="torneo-copa" aria-hidden>🏆</span>
                  <PlayerAvatar name={campeon.name} iconUrl={null} className="torneo-campeon-avatar" />
                  <span className="torneo-campeon-quien">
                    <span className="torneo-campeon-rotulo">Campeón</span>
                    <strong className="torneo-campeon-nombre">{campeon.name}</strong>
                  </span>
                  <span className="torneo-campeon-pts">{puntajeTexto(campeon.puntos)}</span>
                </>
              ) : (
                <>
                  <span className="torneo-copa" aria-hidden>🫥</span>
                  <span className="torneo-campeon-quien">
                    <span className="torneo-campeon-rotulo">Sin campeón</span>
                    <strong className="torneo-campeon-nombre">No cobró nadie</strong>
                  </span>
                </>
              )}
            </div>

            {/* Los tres datos de la edición, en una tira. Cada uno se dibuja
                solo si existe: el margen no está cuando el campeón no terminó
                primero, y ahí lo cuenta la nota de abajo. */}
            <div className="torneo-datos">
              {campeon && (
                <span>
                  <b className="wc-v">{campeon.victorias}V</b> · <b className="wc-d">{campeon.derrotas}D</b>
                </span>
              )}
              <span>
                {datos.jugadores} {datos.jugadores === 1 ? "participante" : "participantes"}
              </span>
              {duelo && (
                <span>
                  {duelo.margen === 0
                    ? `empatado con ${duelo.segundo}`
                    : `${puntajeTexto(Math.abs(duelo.margen)).replace("+", "")} sobre ${duelo.segundo}`}
                </span>
              )}
            </div>

            {/* Quedar primero y cobrar son dos cosas distintas, y cuando no
                coinciden es LA historia de esa edición. */}
            {puntero && campeon && puntero.puuid !== campeon.puuid && (
              <p className="torneo-nota">Arriba terminó {puntero.name}, pero no llegó a los mínimos.</p>
            )}
            {!campeon && puntero && <p className="torneo-nota">Arriba terminó {puntero.name}.</p>}

            {/* ── Cómo se definió ──
                Armado con restas sobre la curva, no con un modelo: dice
                exactamente lo que muestra el gráfico de abajo. Si no alcanza
                para contar algo que el marcador no diga ya, no se dibuja. */}
            {relato && (
              <div className="torneo-relato">
                <span className="torneo-seccion">Cómo se definió</span>
                <p>{relato}</p>
              </div>
            )}

            {/* ── La carrera ──
                Con los mismos colores que la de hoy: el color sale del PUUID,
                así que el que es azul esta semana es azul en todas. */}
            {/* Sin rótulo propio: LigaCarrera ya trae el suyo —"LA CARRERA" y
                la frase de quién terminó arriba de quién— y puesto uno encima
                el título salía dos veces seguidas. El bloque queda solo por su
                borde y su aire. */}
            <div className="torneo-bloque">
              <LigaCarrera
                corredores={datos.tabla.map((f) => ({ puuid: f.puuid, name: f.name, porDia: f.porDia, puntos: f.puntos }))}
                dias={datos.dias}
                cerrada
              />
            </div>

            {/* ── La clasificación final ──
                El podio se distingue con medalla en vez de número. El resto
                sigue numerado: tres medallas y un 4 dicen dónde termina el
                podio sin escribirlo. */}
            <div className="torneo-bloque">
              <span className="torneo-seccion">Clasificación final</span>
              <div className="torneo-tabla">
                {datos.tabla.map((f, idx) => (
                  <div
                    key={f.puuid}
                    className={`torneo-fila${f.puuid === datos.ganadorPuuid ? " campeon" : ""}${idx < 3 ? " podio" : ""}`}
                  >
                    <span className="torneo-puesto">{MEDALLAS[idx] ?? idx + 1}</span>
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
          </div>
        )}
      </div>
    </div>
  );
}
