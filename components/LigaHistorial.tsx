"use client";

import { useMemo } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";
import { type EnPalmares, palmares, titulosDe, type Edicion } from "@/lib/palmares";
import type { RecordLiga } from "@/lib/liga-ahora";

/** El puntaje sin signo: "1,5". Para frases donde el signo no significa nada. */
const sinSigno = (n: number) => puntajeTexto(Math.abs(n)).replace("+", "");

/** "por 1 punto" / "por 0,25" / "empatado arriba". */
function margenTexto(margen: number): string {
  if (margen === 0) return "terminó empatado arriba";
  return `ganó por ${sinSigno(margen)} ${Math.abs(margen) === 1 ? "punto" : "puntos"}`;
}

/** La copita con el número. Null con un solo título: contar hasta uno no es una estadística. */
function Titulos({ n }: { n: number }) {
  if (n < 2) return null;
  return (
    <span className="hist-titulos" aria-label={`${n} títulos`}>
      <span aria-hidden>🏆</span>
      {n}
    </span>
  );
}

/**
 * El historial de la liga: la crónica de la última edición y el archivo.
 *
 * Antes la entrada al historial era una tarjeta de estadística cualquiera —
 * rótulo, nombre, número, enlace— y al tocarla se abría un archivo que contaba
 * una historia entera: quién ganó, por cuánto, cómo se movió la carrera y
 * quién quedó cerca. Parecían dos features distintas, y la que se veía primero
 * era la que no decía nada.
 *
 * Ahora la tarjeta es una MINI CRÓNICA y anticipa exactamente lo que hay
 * adentro:
 *
 *   1. Cuándo fue y que ya terminó.
 *   2. Quién ganó, con cuánto y con qué récord.
 *   3. Una línea de CÓMO se ganó — la única cosa que el marcador no puede
 *      decir. Sale de `relatoDeLaEdicion` (lib/momentos.ts), o sea de restas
 *      sobre la misma curva que dibuja el archivo.
 *   4. El 2º y el 3º, que es lo que dice si la semana estuvo cerrada.
 *
 * El dorado dejó de estar en todos lados. Tenía borde completo, copa, puntaje
 * y enlace, los cuatro peleando: ahora es una franja de acento a la izquierda
 * —el mismo recurso que usa una fila de partida para decir victoria o derrota—
 * más la copa y el puntaje final. Nada más.
 *
 * Abajo, el archivo: los campeones anteriores en una TIRA horizontal, no en
 * una lista. Una lista de fechas y nombres vuelve al formato tabla; una tira
 * se lee como la línea de tiempo de una competencia, que es lo que es.
 *
 * Todo sale de `liga_semanas` y su `resumen`. Si una semana vieja no guardó su
 * foto, esa entrada muestra lo que tiene y no inventa un margen.
 */
export function LigaHistorial({
  ediciones,
  palmaresCompleto,
  record,
  onAbrir,
}: {
  ediciones: Edicion[];
  /**
   * El palmarés contado sobre TODAS las semanas cerradas, no sobre las ocho
   * que llegan en `ediciones`. Opcional porque el campo es nuevo y el JSON
   * viejo del CDN no lo trae: durante la ventana de caché se sigue contando
   * acá, que da el mismo número mientras no haya más de ocho ediciones.
   */
  palmaresCompleto?: EnPalmares[];
  /**
   * La mejor semana de la historia, calculada en el server sobre TODAS las
   * ediciones (ver recordDeLaLiga). Opcional por la ventana de caché del CDN
   * y null cuando ninguna semana tiene un puntaje que mirar: sin dato no se
   * dibuja la línea, nunca se estima.
   */
  record?: RecordLiga | null;
  /** Abrir el archivo de esa edición. */
  onAbrir: (semana: string) => void;
}) {
  const [ultima, ...viejas] = ediciones;
  const titulos = useMemo(() => titulosDe(ediciones), [ediciones]);
  const local = useMemo(() => palmares(ediciones), [ediciones]);
  const tabla = palmaresCompleto ?? local;
  // Desde la SEGUNDA edición. Antes el umbral era "alguien ganó dos veces", y
  // con eso la sección no aparecía nunca en una liga joven: hoy hay dos
  // campeones con un título cada uno y el palmarés estaba escrito, andando y
  // escondido. Con una sola edición sí se calla — ahí la tabla es la crónica
  // de arriba escrita de nuevo, y eso no es un palmarés.
  const hayPalmares = ediciones.length >= 2 && tabla.length > 0;
  const clave = (e: Edicion) => e.puuid ?? `nombre:${e.nombre}`;

  if (!ultima) return null;

  // Los del podio que NO son el campeón. Van con su puesto real y no
  // renumerados: cuando el de arriba no llegó a los mínimos, el que cobró y el
  // primero de la tabla son dos personas distintas, y renumerar lo taparía.
  const escoltas = (ultima.podio ?? [])
    .map((p, i) => ({ ...p, puesto: i + 1 }))
    .filter((p) => !p.campeon)
    .slice(0, 2);

  return (
    <section className="hist">
      <div className="hist-head">
        <h3 className="hist-titulo">Historial de la liga</h3>
        <button type="button" className="hist-ver" onClick={() => onAbrir(ultima.semana)}>
          Ver historial <span aria-hidden>→</span>
        </button>
      </div>

      <div className={`hist-cuerpo${hayPalmares ? " con-palmares" : ""}`}>
        <div className="hist-principal">
          {/* ── La última edición, como crónica ── */}
          <button type="button" className="hist-ultima" onClick={() => onAbrir(ultima.semana)}>
            {/* La fecha es el título y "finalizada" el estado. Antes decía
                "CAMPEÓN ANTERIOR" y la fecha al lado en gris: el rótulo
                repetía lo que la copa de abajo ya dice, y la fecha —que es lo
                que identifica una edición— quedaba de nota al pie. */}
            <span className="hist-ultima-rotulo">
              {rangoDeSemana(ultima.semana)}
              <i>·</i>
              <em>finalizada</em>
            </span>

            <span className="hist-campeon">
              <span className="hist-copa" aria-hidden>🏆</span>
              <PlayerAvatar name={ultima.nombre ?? "?"} iconUrl={ultima.iconUrl} className="hist-avatar" />
              <span className="hist-campeon-quien">
                <strong>{ultima.nombre ?? "No ganó nadie"}</strong>
                <span className="hist-campeon-meta">
                  <b>Campeón</b>
                  {ultima.record && (
                    <>
                      <i>·</i>
                      <span className="wc-v">{ultima.record.victorias}V</span>
                      <span className="wc-d">{ultima.record.derrotas}D</span>
                    </>
                  )}
                  {ultima.jugadores > 0 && (
                    <>
                      <i>·</i>
                      entre {ultima.jugadores}
                    </>
                  )}
                </span>
              </span>
              {ultima.puntos != null && <span className="hist-campeon-pts">{puntajeTexto(ultima.puntos)}</span>}
            </span>

            {/* Cómo se ganó, en un renglón. Es lo único de la tarjeta que no
                se puede deducir mirando la tabla final. */}
            {(ultima.relato || ultima.duelo) && (
              <span className="hist-relato">
                {ultima.relato ?? (ultima.duelo ? `${margenTexto(ultima.duelo.margen)} sobre ${ultima.duelo.segundo}.` : "")}
              </span>
            )}

            {/* El podio chico. Sin él no se sabe si la semana se definió por
                0,75 o estaba resuelta el jueves. */}
            {escoltas.length > 0 && (
              <span className="hist-podio">
                {escoltas.map((p) => (
                  <span className="hist-podio-fila" key={p.puuid}>
                    <span className="hist-podio-puesto">{p.puesto}</span>
                    <span className="hist-podio-nombre">{p.nombre}</span>
                    <span className="hist-podio-pts">{puntajeTexto(p.puntos)}</span>
                  </span>
                ))}
              </span>
            )}

            {/* "Revivir" y no "ver": del otro lado no hay una tabla vieja, hay
                la carrera día por día de esa semana. */}
            <span className="hist-cta">Revivir semana <span aria-hidden>→</span></span>
          </button>

          {/* ── El archivo, en tira ── */}
          {viejas.length > 0 && (
            <div className="hist-viejas">
              <span className="hist-viejas-rotulo">Últimos campeones</span>
              {/* Con scroll horizontal en el teléfono: la tira crece con cada
                  semana y una lista vertical de veinte ediciones es otra
                  tabla. El que se corta contra el borde dice "esto sigue". */}
              <div className="hist-tira">
                {viejas.map((e) => (
                  <button type="button" className="hist-hito" key={e.semana} onClick={() => onAbrir(e.semana)}>
                    <span className="hist-hito-semana">{rangoDeSemana(e.semana)}</span>
                    <span className="hist-hito-quien">
                      <PlayerAvatar name={e.nombre ?? "?"} iconUrl={e.iconUrl} className="hist-avatar chico" />
                      <span className="hist-hito-nombre">{e.nombre ?? "nadie"}</span>
                      <Titulos n={e.nombre ? (titulos.get(clave(e)) ?? 0) : 0} />
                    </span>
                    {e.puntos != null && (
                      <span className={`hist-hito-pts ${e.puntos >= 0 ? "pos" : "neg"}`}>{puntajeTexto(e.puntos)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── El palmarés: las copas de cada uno ── */}
        {hayPalmares && (
          <div className="hist-palmares">
            <span className="hist-viejas-rotulo">Palmarés</span>
            {tabla.map((p) => (
              <div className="hist-palmares-fila" key={p.puuid ?? p.nombre}>
                <PlayerAvatar name={p.nombre} iconUrl={p.iconUrl} className="hist-avatar chico" />
                <span className="hist-fila-quien">{p.nombre}</span>
                {/* UNA copa y el número, no una copa por título. La fila de
                    copitas se contaba de un vistazo hasta tres y después no:
                    "🏆🏆🏆" y "🏆🏆🏆🏆" se parecen demasiado de reojo, y
                    con cuatro campeones la columna quedaba en diente de
                    sierra. El número ordena y la copa dice de qué. */}
                <span className="hist-copas">
                  <span aria-hidden>🏆</span>
                  <b>{p.titulos}</b>
                  <span className="sr-only">{p.titulos === 1 ? "título" : "títulos"}</span>
                </span>
              </div>
            ))}
            {/* El récord de puntos. Texto, no otra card: es un dato de
                contexto del palmarés, no una competencia aparte. Solo
                aparece si existe de verdad — se calcula sobre las semanas
                cerradas que tienen puntaje guardado y, si no hay ninguna, no
                se dibuja nada. */}
            {record && (
              <div className="hist-record">
                <span className="hist-record-rotulo">Récord de puntos</span>
                <span className="hist-record-dato">
                  <b>{puntajeTexto(record.puntos)}</b> {record.nombre}
                  <i>{rangoDeSemana(record.semana)}</i>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
