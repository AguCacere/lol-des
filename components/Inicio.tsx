"use client";

import { useMemo } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TierEmblem } from "./TierEmblem";
import { ChampIcon } from "./ChampIcon";
import { useLiga } from "./useLiga";
import { championLabel } from "@/lib/champion-names";
import { liveGameTimeLabel, tierFor } from "@/lib/ladder";
import { puntajeTexto } from "@/lib/liga";
import { movimientosRecientes, resumenDeHoy } from "@/lib/actividad";
import { winrateTexto } from "@/lib/winrate";
import type { Player } from "@/lib/types";

interface InicioProps {
  players: Player[];
  loading: boolean;
  ddragonVersion: string | null;
  /** Abrir el perfil de alguien (cae en Ranking y baja hasta el perfil). */
  onPlayer: (key: string) => void;
  /** Ir al ladder. */
  onRanking: () => void;
  /** Ir a la liga de la semana. */
  onLiga: () => void;
}

const clave = (p: Player) => `${p.name}#${p.tag}`;

/** "faltan 2 días" / "faltan 6 horas" / "cierra en menos de dos horas". */
function loQueFalta(hasta: string): string | null {
  const ms = Date.parse(hasta) - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "cerrada";
  const horas = Math.floor(ms / 3600000);
  if (horas >= 48) return `faltan ${Math.floor(horas / 24)} días`;
  if (horas >= 2) return `faltan ${horas} horas`;
  return "cierra en menos de dos horas";
}

/**
 * Inicio — el hub del grupo.
 *
 * Contesta cuatro preguntas en el orden en que se hacen al entrar: qué pasó
 * hoy, cómo viene la competencia, quién manda en el ladder y qué se movió. No
 * es un tablero de KPIs ni una copia recortada de las otras pestañas: cada
 * bloque muestra lo mínimo para decidir si vale la pena entrar a la pantalla
 * completa, y termina en el enlace que lleva ahí.
 *
 * Tres cosas que NO hace, a propósito:
 *
 * - No repite el hero de "Grieta Central". El nombre ya está arriba en cada
 *   pantalla; ponerlo otra vez en grande es media pantalla de scroll para
 *   leer algo que el usuario ya leyó.
 * - No dibuja una tarjeta por dato. Los bloques se separan por jerarquía
 *   tipográfica y aire; superficie propia tienen solo los dos que se pueden
 *   tocar entero (la liga y el ladder), que es cuando una caja significa algo.
 * - No muestra secciones vacías. Sin nadie en partida y sin movimientos, esos
 *   dos bloques no existen — un cartel de "no hay nada" ocupa el mismo lugar
 *   que el contenido y no dice nada que el silencio no diga mejor.
 */
export function Inicio({ players, loading, ddragonVersion, onPlayer, onRanking, onLiga }: InicioProps) {
  const { d: liga } = useLiga();

  const hoy = useMemo(() => resumenDeHoy(players), [players]);
  const movimientos = useMemo(() => movimientosRecientes(players), [players]);
  const enVivo = players.filter((p) => p.liveGame);
  const top3 = players.slice(0, 3);

  /**
   * Los dos punteros de la liga y cuánto los separa. Se ordena acá aunque la
   * API ya mande la tabla ordenada: el adelanto dice "le saca 2,25" y si
   * alguna vez cambia el orden de allá, esta frase pasaría a ser falsa sin que
   * nadie se entere. Ordenar de nuevo cuesta nada y no puede mentir.
   */
  const podio = useMemo(() => {
    if (!liga?.arrancoYa || !liga.tabla) return null;
    const jugaron = liga.tabla.filter((f) => !f.sinJugar);
    if (jugaron.length < 2) return null;
    const orden = [...jugaron].sort((a, b) => (b.puntos ?? 0) - (a.puntos ?? 0));
    const [primero, segundo] = orden;
    return { primero, segundo, ventaja: (primero.puntos ?? 0) - (segundo.puntos ?? 0) };
  }, [liga]);

  if (loading) {
    return (
      <div className="inicio" aria-busy="true" aria-label="Cargando">
        <div className="sk sk-inicio-pulso" />
        <div className="sk sk-inicio-bloque" />
        <div className="sk sk-inicio-bloque" />
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="empty-state">
        <strong>Todavía no hay nadie en el grupo</strong>
        Buscá un Riot ID arriba (Nombre#TAG) y apretá Enter para sumarlo.
      </div>
    );
  }

  return (
    <div className="inicio">
      {/* ───── Hoy en el grupo ─────
          El pulso del día, no el estado de la app. Cuántos invocadores hay,
          en qué región y quién está jugando ya lo dice la barra de arriba en
          cada pantalla: repetirlo acá, más grande, sería la misma línea dos
          veces. Lo que no dice nadie es qué pasó HOY, y esa es la pregunta con
          la que uno entra. */}
      <section className="inicio-pulso">
        <p className="inicio-hoy">
          {hoy.partidas === 0 ? (
            <>
              <strong>Todavía no jugó nadie hoy.</strong>
              <span className="inicio-hoy-det">
                {players.length} invocadores · LAS
                {enVivo.length > 0 && ` · ${enVivo.length} en partida`}
              </span>
            </>
          ) : (
            <>
              <strong>
                {hoy.partidas} partida{hoy.partidas === 1 ? "" : "s"} hoy
              </strong>
              <span className="inicio-hoy-det">
                <span className="wc-v">{hoy.victorias}V</span>
                <span className="wc-sep">·</span>
                <span className="wc-d">{hoy.derrotas}D</span>
                {" · "}
                {hoy.jugaron} de {players.length} jugaron
                {enVivo.length > 0 && ` · ${enVivo.length} en partida`}
              </span>
            </>
          )}
        </p>
      </section>

      {/* ───── Liga de la semana ─────
          El adelanto: quién va ganando, por cuánto y cuánto queda. Nada más.
          El desglose, la carrera y las reglas viven en su pantalla — y el
          bloque entero es el enlace hacia allá. */}
      {liga?.arrancoYa && podio && (
        <button type="button" className="inicio-liga" onClick={onLiga}>
          <span className="inicio-bloque-head">
            <span className="inicio-bloque-titulo">
              <svg className="inicio-copa" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.3A6 6 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A6 6 0 0 1 7.3 12H7a4 4 0 0 1-4-4V5h3V3zm0 4H5v1a2 2 0 0 0 1 1.7V7zm12 0v2.7A2 2 0 0 0 19 8V7h-1z" />
              </svg>
              Liga de la semana
            </span>
            {loQueFalta(liga.hasta) && <span className="inicio-bloque-meta">{loQueFalta(liga.hasta)}</span>}
          </span>
          <span className="inicio-liga-duelo">
            <span className="inicio-liga-quien puntero">
              <PlayerAvatar name={podio.primero.name} iconUrl={podio.primero.profileIconUrl} className="inicio-avatar" />
              <span className="inicio-liga-nombre">{podio.primero.name}</span>
              <span className="inicio-liga-pts">{puntajeTexto(podio.primero.puntos ?? 0)}</span>
            </span>
            {/* La ventaja es el dato, no la decoración: es lo que dice si la
                liga está definida o si todavía se da vuelta el domingo. */}
            <span className="inicio-liga-ventaja">
              {podio.ventaja === 0 ? "empatados" : `le saca ${puntajeTexto(podio.ventaja).replace("+", "")}`}
            </span>
            <span className="inicio-liga-quien">
              <PlayerAvatar name={podio.segundo.name} iconUrl={podio.segundo.profileIconUrl} className="inicio-avatar" />
              <span className="inicio-liga-nombre">{podio.segundo.name}</span>
              <span className="inicio-liga-pts">{puntajeTexto(podio.segundo.puntos ?? 0)}</span>
            </span>
          </span>
          <span className="inicio-cta">Ver la carrera <span aria-hidden>→</span></span>
        </button>
      )}

      {/* ───── Ladder del grupo ─────
          Los tres de arriba con lo justo para reconocerlos: puesto, cara,
          nombre, rango y LP. Sin winrate, sin sparkline, sin historial — todo
          eso es la pantalla de Ranking, y meterlo acá la haría redundante. */}
      <section className="inicio-ladder">
        <div className="inicio-bloque-head">
          <span className="inicio-bloque-titulo">Ladder del grupo</span>
          <button type="button" className="inicio-cta chico" onClick={onRanking}>
            Ver ranking <span aria-hidden>→</span>
          </button>
        </div>
        <div className="inicio-podio">
          {top3.map((p, i) => {
            const t = tierFor(p.tierKey);
            return (
              <button type="button" className="inicio-fila" key={clave(p)} onClick={() => onPlayer(clave(p))}>
                <span className={`inicio-puesto${i === 0 ? " primero" : ""}`}>{i + 1}</span>
                <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="inicio-avatar" />
                <span className="inicio-nombre">
                  {p.name}
                  <span className="player-tag">#{p.tag}</span>
                </span>
                <TierEmblem tierKey={p.tierKey} division={p.division} />
                <span className="inicio-rango">
                  <span className="inicio-rango-nombre" style={{ color: t.fg }}>
                    {t.name} {p.division}
                  </span>
                  <span className="inicio-rango-lp">{p.lp} LP</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ───── En partida ahora ─────
          Solo si hay alguien. Sin nadie jugando no queda una tarjeta vacía
          diciendo "no hay nadie en partida": desaparece. */}
      {enVivo.length > 0 && (
        <section className="inicio-vivo">
          <div className="inicio-bloque-head">
            <span className="inicio-bloque-titulo">
              <span className="live-dot" />
              En partida ahora
            </span>
          </div>
          <div className="inicio-vivo-lista">
            {enVivo.map((p) => (
              <button type="button" className="inicio-vivo-item" key={clave(p)} onClick={() => onPlayer(clave(p))}>
                <ChampIcon champ={p.liveGame!.champion} version={ddragonVersion} className="inicio-vivo-champ" />
                <span className="inicio-vivo-txt">
                  <span className="inicio-nombre">{p.name}</span>
                  <span className="inicio-vivo-meta">
                    {championLabel(p.liveGame!.champion)} · {p.liveGame!.queueLabel} ·{" "}
                    {liveGameTimeLabel(p.liveGame!.startedMinutesAgo)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ───── Qué se movió ─────
          Sale de restar fotos de LP reales (ver lib/actividad.ts). Sin
          movimientos que contar, la sección no existe: un feed vacío con un
          cartel adentro ocupa lo mismo que uno lleno y no dice nada. */}
      {movimientos.length > 0 && (
        <section className="inicio-movidas">
          <div className="inicio-bloque-head">
            <span className="inicio-bloque-titulo">Qué se movió</span>
            <span className="inicio-bloque-meta">últimas 24 horas</span>
          </div>
          <div className="inicio-movidas-lista">
            {movimientos.slice(0, 4).map((m) => (
              <button type="button" className="inicio-movida" key={m.key} onClick={() => onPlayer(m.key)}>
                <PlayerAvatar name={m.name} iconUrl={m.profileIconUrl} className="inicio-avatar chico" />
                <span className="inicio-movida-txt">
                  <span className="inicio-nombre">{m.name}</span>
                  {m.detalle && <span className="inicio-movida-det">{m.detalle}</span>}
                </span>
                <span className={`inicio-movida-que ${m.tono}`}>{m.texto}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* El pie: el winrate del grupo en la season. Un dato y nada más — es el
          cierre de la página, no otro bloque. */}
      {players.length > 0 && (
        <p className="inicio-pie">
          {(() => {
            const v = players.reduce((a, p) => a + p.wins, 0);
            const der = players.reduce((a, p) => a + p.losses, 0);
            return v + der > 0 ? (
              <>
                El grupo va {winrateTexto(v, v + der)} en la season · {v}V · {der}D
              </>
            ) : null;
          })()}
        </p>
      )}
    </div>
  );
}
