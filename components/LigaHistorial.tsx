"use client";

import { useMemo } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";
import { palmares, titulosDe, type Edicion } from "@/lib/palmares";

/** El puntaje sin signo: "1,5". Para frases donde el signo no significa nada. */
const sinSigno = (n: number) => puntajeTexto(Math.abs(n)).replace("+", "");

/** "ganó por 1 punto" / "ganó por 0,25" / "quedó empatado arriba". */
function margenTexto(margen: number): string {
  if (margen === 0) return "terminó empatado arriba";
  return `ganó por ${sinSigno(margen)} ${Math.abs(margen) === 1 ? "punto" : "puntos"}`;
}

/** La copita con el número, para las filas. Null con un solo título: contar hasta uno no es una estadística. */
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
 * El historial de la liga.
 *
 * Antes era "Campeones anteriores": una caja chica al final de todo con el
 * último ganador y una fila por semana vieja. Decía QUIÉN ganó y nada más, que
 * es la mitad de la historia — "ganó por 0,25" y "ganó por 6" son dos
 * ediciones completamente distintas y las dos se veían igual.
 *
 * Ahora cuenta tres cosas, en este orden:
 *
 *   1. **La última edición**, con su margen real y contra quién. Es la que
 *      todavía está fresca y la que engancha con la liga en curso.
 *   2. **Las anteriores**, compactas, con la cuenta de títulos del que ganó.
 *   3. El acceso al archivo completo, que es donde vive el palmarés.
 *
 * Y el palmarés es la parte que hace que esto no se resetee todos los lunes:
 * cuando haya veinte ediciones, "quién tiene más copas" pasa a ser una segunda
 * competencia que corre en paralelo a la de la semana.
 *
 * Todo sale de `liga_semanas` y su `resumen`. Nada se calcula de más: si una
 * semana vieja no guardó su foto final, esa fila muestra lo que tiene y no
 * inventa un margen.
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
  const clave = (e: Edicion) => e.puuid ?? `nombre:${e.nombre}`;

  if (!ultima) return null;

  return (
    <section className="hist">
      <div className="hist-head">
        <h3 className="hist-titulo">Historial de la liga</h3>
        <button type="button" className="hist-ver" onClick={() => onAbrir(ultima.semana)}>
          Ver historial <span aria-hidden>→</span>
        </button>
      </div>

      {/* Dos columnas en pantalla ancha: a la izquierda la última edición y
          las anteriores —la línea de tiempo—, a la derecha el palmarés, que es
          otra pregunta ("quién ganó más veces") y no la continuación de la
          lista. Apilados, cada fila se estiraba a 1140px y dejaba el nombre
          contra un borde y el puntaje contra el otro. */}
      <div className="hist-cuerpo">
      <div className="hist-principal">
      {/* ── La última edición ──
          Con superficie propia y la única de la sección: es la que todavía
          está fresca. Las anteriores son registro. */}
      <button type="button" className="hist-ultima" onClick={() => onAbrir(ultima.semana)}>
        <span className="hist-ultima-rotulo">
          Campeón anterior
          <i>{rangoDeSemana(ultima.semana)}</i>
        </span>
        <span className="hist-campeon">
          <span className="hist-copa" aria-hidden>🏆</span>
          <PlayerAvatar name={ultima.nombre ?? "?"} iconUrl={ultima.iconUrl} className="hist-avatar" />
          <span className="hist-campeon-quien">
            <strong>{ultima.nombre ?? "No ganó nadie"}</strong>
            {/* El contexto de la edición, en una línea: por cuánto ganó, con
                qué récord y entre cuántos. Es lo que convierte "este ganó" en
                "así estuvo la semana". Cada pedazo se dibuja solo si el dato
                existe de verdad. */}
            <span className="hist-campeon-meta">
              {ultima.duelo && <>{margenTexto(ultima.duelo.margen)}</>}
              {ultima.record && (
                <>
                  {ultima.duelo && <i>·</i>}
                  <span className="wc-v">{ultima.record.victorias}V</span>
                  <span className="wc-d">{ultima.record.derrotas}D</span>
                </>
              )}
              {ultima.jugadores > 0 && (
                <>
                  {(ultima.duelo || ultima.record) && <i>·</i>}
                  entre {ultima.jugadores}
                </>
              )}
            </span>
          </span>
          {ultima.puntos != null && <span className="hist-campeon-pts">{puntajeTexto(ultima.puntos)}</span>}
        </span>
        {/* El segundo. El campeón no existe solo: sin esto no se puede saber
            si la edición se definió en la última partida o estaba resuelta el
            jueves. */}
        {ultima.duelo && (
          <span className="hist-segundo">
            <span className="hist-medalla" aria-hidden>🥈</span>
            {ultima.duelo.segundo}
            {ultima.puntos != null && (
              <b>{puntajeTexto(Math.round((ultima.puntos - ultima.duelo.margen) * 100) / 100)}</b>
            )}
          </span>
        )}
        <span className="hist-cta">Ver semana <span aria-hidden>→</span></span>
      </button>

      {/* ── Las anteriores ── */}
      {viejas.length > 0 && (
        <div className="hist-viejas">
          <span className="hist-viejas-rotulo">Últimos campeones</span>
          {viejas.map((e) => (
            <button type="button" className="hist-fila" key={e.semana} onClick={() => onAbrir(e.semana)}>
              <span className="hist-fila-semana">{rangoDeSemana(e.semana)}</span>
              <PlayerAvatar name={e.nombre ?? "?"} iconUrl={e.iconUrl} className="hist-avatar chico" />
              <span className="hist-fila-quien">{e.nombre ?? "no ganó nadie"}</span>
              <Titulos n={e.nombre ? (titulos.get(clave(e)) ?? 0) : 0} />
              {e.puntos != null && <span className={`hist-fila-pts ${e.puntos >= 0 ? "pos" : "neg"}`}>{puntajeTexto(e.puntos)}</span>}
            </button>
          ))}
        </div>
      )}
      </div>

      {/* ── El palmarés ──
          Solo desde que alguien ganó más de una vez. Con una copa cada uno no
          es un palmarés, es la misma lista de arriba ordenada distinto. */}
      {tabla.some((p) => p.titulos > 1) && (
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
