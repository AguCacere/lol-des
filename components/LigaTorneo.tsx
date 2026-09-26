"use client";

import { useCallback, useEffect, useState } from "react";
import { LigaCarrera } from "./LigaCarrera";
import { PlayerAvatar } from "./PlayerAvatar";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";
import { dueloDeLaEdicion } from "@/lib/palmares";
import { hitosDeMomentos, momentosDeLaSemana } from "@/lib/momentos";

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
  // Lo que pasó ADENTRO de la semana. El marcador final ya lo cuenta la
  // clasificación; esto es lo otro. Ver lib/momentos.ts.
  const momentos = datos ? momentosDeLaSemana(datos.tabla, datos.dias) : null;
  const hitos = hitosDeMomentos(momentos);
  // El podio y el resto. Es la misma tabla ordenada, partida en dos: los tres
  // de arriba con jerarquía y los demás como lista compacta.
  const podio = datos ? datos.tabla.slice(0, 3) : [];
  const resto = datos ? datos.tabla.slice(3) : [];

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
          {/* Las flechas dicen A DÓNDE llevan. Antes decían "2 de 2", que es
              paginación de modal: para saber si la de al lado era la semana
              pasada o la siguiente había que apretarla. Con la fecha puesta,
              la navegación del archivo se lee como un calendario. */}
          <div className="torneo-nav">
            <button
              type="button"
              className="torneo-nav-ir"
              onClick={() => irA(1)}
              disabled={i + 1 >= semanas.length}
              aria-label={semanas[i + 1] ? `Ir a la semana del ${rangoDeSemana(semanas[i + 1])}` : "No hay edición anterior"}
            >
              <span aria-hidden>‹</span>
              <b>{semanas[i + 1] ? rangoDeSemana(semanas[i + 1]) : "—"}</b>
            </button>
            <button
              type="button"
              className="torneo-nav-ir"
              onClick={() => irA(-1)}
              disabled={i <= 0}
              aria-label={semanas[i - 1] ? `Ir a la semana del ${rangoDeSemana(semanas[i - 1])}` : "No hay edición siguiente"}
            >
              <b>{semanas[i - 1] ? rangoDeSemana(semanas[i - 1]) : "—"}</b>
              <span aria-hidden>›</span>
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
            {/* ── El resultado ──
                Una sola vez. Antes el desenlace se contaba TRES veces
                seguidas: el hero decía "marlboro +15,25", la tira de abajo
                decía "0,75 sobre compren bitcoin", y el bloque "Cómo se
                definió" lo volvía a contar en prosa con los mismos números —y
                todavía faltaba el titular de la carrera, que decía lo mismo
                una cuarta vez—. Ahora es el hero y UN renglón, y lo que se
                ganó de lugar se lo lleva el gráfico, que es lo que la gente
                viene a ver. */}
            <div className="torneo-campeon">
              {campeon ? (
                <>
                  <span className="torneo-copa" aria-hidden>🏆</span>
                  <PlayerAvatar name={campeon.name} iconUrl={null} className="torneo-campeon-avatar" />
                  <span className="torneo-campeon-quien">
                    <strong className="torneo-campeon-nombre">{campeon.name}</strong>
                    <span className="torneo-campeon-meta">
                      <b>Campeón</b>
                      <i>·</i>
                      <span className="wc-v">{campeon.victorias}V</span>
                      <span className="wc-d">{campeon.derrotas}D</span>
                      <i>·</i>
                      entre {datos.jugadores}
                    </span>
                  </span>
                  <span className="torneo-campeon-pts">{puntajeTexto(campeon.puntos)}</span>
                </>
              ) : (
                <>
                  <span className="torneo-copa" aria-hidden>🫥</span>
                  <span className="torneo-campeon-quien">
                    <strong className="torneo-campeon-nombre">No cobró nadie</strong>
                    <span className="torneo-campeon-meta">
                      <b>Sin campeón</b>
                      <i>·</i>
                      entre {datos.jugadores}
                    </span>
                  </span>
                </>
              )}
            </div>

            {/* El margen, en un renglón. Y cuando el que terminó arriba no es
                el que cobró, esa es LA historia de la edición y va acá mismo
                en vez de abajo como nota. */}
            {duelo && (
              <p className="torneo-remate">
                {duelo.margen === 0
                  ? `Terminó empatado con ${duelo.segundo}.`
                  : `Ganó por ${puntajeTexto(Math.abs(duelo.margen)).replace("+", "")} ${Math.abs(duelo.margen) === 1 ? "punto" : "puntos"} sobre ${duelo.segundo}.`}
              </p>
            )}
            {puntero && campeon && puntero.puuid !== campeon.puuid && (
              <p className="torneo-remate">Arriba terminó {puntero.name}, pero no llegó a los mínimos.</p>
            )}
            {!campeon && puntero && <p className="torneo-remate">Arriba terminó {puntero.name}.</p>}

            {/* ── La carrera ──
                Con los mismos colores que la de hoy: el color sale del PUUID,
                así que el que es azul esta semana es azul en todas. */}
            {/* Sin rótulo propio: LigaCarrera ya trae el suyo. Y acá va SIN
                titular, porque el encabezado de arriba ya dijo por cuánto
                ganó y el titular lo repetía palabra por palabra. */}
            <div className="torneo-bloque">
              <LigaCarrera
                corredores={datos.tabla.map((f) => ({ puuid: f.puuid, name: f.name, porDia: f.porDia, puntos: f.puntos }))}
                dias={datos.dias}
                cerrada
                // Sin titular: el encabezado de arriba ya dijo por cuánto ganó.
                sinTitular
                // El campeón a fondo y el segundo a media presencia, sin que
                // haya que tocar nada: son los dos que se pelearon la edición.
                destacados={[campeon?.puuid ?? datos.tabla[0]?.puuid, datos.tabla.find((f) => f.puuid !== (campeon?.puuid ?? datos.tabla[0]?.puuid))?.puuid].filter((x): x is string => !!x)}
                hitos={hitos}
              />
            </div>

            {/* ── Los momentos ──
                Una franja, no cuatro tarjetas. Lo que pasó adentro de la
                semana: quién se escapó, quién se hundió, qué día estuvo más
                peleada la punta y si el que ganó venía ganando. Cada pieza se
                dibuja solo si el dato existe (ver lib/momentos.ts) — y nada de
                esto se infiere, son restas sobre la misma curva de arriba. */}
            {momentos && (momentos.mayorSubida || momentos.mayorCaida || momentos.masCerrado || momentos.vuelta) && (
              <div className="torneo-momentos">
                <span className="torneo-seccion">Momentos de la semana</span>
                <div className="torneo-momentos-tira">
                  {momentos.mayorSubida && (
                    <div className="torneo-momento">
                      <span className="torneo-momento-et">
                        <i className="bueno" aria-hidden>↑</i> Mayor subida
                      </span>
                      <span className="torneo-momento-quien">{momentos.mayorSubida.nombre}</span>
                      <span className="torneo-momento-dato">
                        <b className="gd-pos">{puntajeTexto(momentos.mayorSubida.delta)}</b> el {momentos.mayorSubida.dia}
                      </span>
                    </div>
                  )}
                  {momentos.mayorCaida && (
                    <div className="torneo-momento">
                      <span className="torneo-momento-et">
                        <i className="malo" aria-hidden>↓</i> Mayor caída
                      </span>
                      <span className="torneo-momento-quien">{momentos.mayorCaida.nombre}</span>
                      <span className="torneo-momento-dato">
                        <b className="gd-neg">{puntajeTexto(momentos.mayorCaida.delta)}</b> el {momentos.mayorCaida.dia}
                      </span>
                    </div>
                  )}
                  {momentos.masCerrado && (
                    <div className="torneo-momento">
                      <span className="torneo-momento-et">
                        <i aria-hidden>⚔</i> Más peleado
                      </span>
                      <span className="torneo-momento-quien">el {momentos.masCerrado.dia}</span>
                      <span className="torneo-momento-dato">
                        <b>{puntajeTexto(momentos.masCerrado.diferencia).replace("+", "")}</b> entre 1º y 2º
                      </span>
                    </div>
                  )}
                  {momentos.vuelta ? (
                    <div className="torneo-momento">
                      <span className="torneo-momento-et">
                        <i aria-hidden>⟲</i> La dio vuelta
                      </span>
                      <span className="torneo-momento-quien">{momentos.vuelta.nombre}</span>
                      <span className="torneo-momento-dato">
                        <b>{momentos.vuelta.desde}º → 1º</b> el {momentos.vuelta.dia}
                      </span>
                    </div>
                  ) : (
                    momentos.cambiosDeLider > 0 && (
                      <div className="torneo-momento">
                        <span className="torneo-momento-et">
                          <i aria-hidden>⇄</i> La punta
                        </span>
                        <span className="torneo-momento-quien">
                          cambió {momentos.cambiosDeLider} {momentos.cambiosDeLider === 1 ? "vez" : "veces"}
                        </span>
                        <span className="torneo-momento-dato">en toda la semana</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* ── La clasificación final ──
                Los tres de arriba con jerarquía y el resto como lista
                compacta. Era una tabla de cinco columnas parejas donde el
                campeón se leía igual que el séptimo: en una competencia el
                podio no es "las primeras tres filas", es otra cosa. Ninguna
                columna se perdió —récord, mínimos y puntaje siguen estando—,
                cambió dónde caen. */}
            <div className="torneo-bloque">
              <span className="torneo-seccion">Clasificación final</span>
              <div className="torneo-podio">
                {podio.map((f, idx) => (
                  <div
                    key={f.puuid}
                    className={`torneo-podio-puesto p${idx + 1}${f.puuid === datos.ganadorPuuid ? " campeon" : ""}`}
                  >
                    <span className="torneo-podio-medalla" aria-hidden>{MEDALLAS[idx]}</span>
                    <span className="torneo-podio-nombre">{f.name}</span>
                    <span className={`torneo-podio-pts ${f.puntos > 0 ? "gd-pos" : f.puntos < 0 ? "gd-neg" : ""}`}>
                      {puntajeTexto(f.puntos)}
                    </span>
                    <span className="torneo-podio-meta">
                      {f.victorias}V-{f.derrotas}D
                      {!f.habilitado && <b className="torneo-sin-minimos">sin mínimos</b>}
                    </span>
                    {/* La distancia al campeón, en el 2º y el 3º: es el número
                        que dice si la semana estuvo cerrada, y restarlo de
                        memoria entre dos tarjetas no lo hace nadie. */}
                    {idx > 0 && podio[0] && (
                      <span className="torneo-podio-brecha">
                        a {puntajeTexto(Math.round((podio[0].puntos - f.puntos) * 100) / 100).replace("+", "")} del 1º
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {resto.length > 0 && (
                <div className="torneo-tabla">
                  {resto.map((f, idx) => (
                    <div
                      key={f.puuid}
                      className={`torneo-fila${f.puuid === datos.ganadorPuuid ? " campeon" : ""}`}
                    >
                      <span className="torneo-puesto">{idx + 4}</span>
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
