"use client";

import { useMemo } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";
import { palmares, titulosDe, type Edicion } from "@/lib/palmares";

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
  onAbrir,
}: {
  ediciones: Edicion[];
  /** Abrir el archivo de esa edición. */
  onAbrir: (semana: string) => void;
}) {
  const [ultima, ...viejas] = ediciones;
  const titulos = useMemo(() => titulosDe(ediciones), [ediciones]);
  const tabla = useMemo(() => palmares(ediciones), [ediciones]);
  // El palmarés recién existe cuando alguien ganó dos veces. Hasta entonces la
  // sección es UNA columna: con la grilla puesta igual, la crónica quedaba en
  // el 58% del ancho y el 42% de la derecha era un hueco esperando una tabla
  // que todavía no hay.
  const hayPalmares = tabla.some((p) => p.titulos > 1);
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

        {/* ── El palmarés ──
            Solo desde que alguien ganó más de una vez. Con una copa cada uno no
            es un palmarés, es la misma lista de arriba ordenada distinto. */}
        {hayPalmares && (
          <div className="hist-palmares">
            <span className="hist-viejas-rotulo">Palmarés</span>
            {tabla.map((p) => (
              <div className="hist-palmares-fila" key={p.puuid ?? p.nombre}>
                <PlayerAvatar name={p.nombre} iconUrl={p.iconUrl} className="hist-avatar chico" />
                <span className="hist-fila-quien">{p.nombre}</span>
                <span className="hist-copas" aria-label={`${p.titulos} ${p.titulos === 1 ? "título" : "títulos"}`}>
                  {/* Una copa por título hasta cinco; de ahí en adelante el
                      número, porque una fila de nueve copitas deja de contarse
                      de un vistazo y es lo único que una copa tiene que hacer. */}
                  {p.titulos <= 5 ? <span aria-hidden>{"🏆".repeat(p.titulos)}</span> : <span aria-hidden>🏆 ×{p.titulos}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
