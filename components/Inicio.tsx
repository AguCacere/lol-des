"use client";

import { useMemo } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TierEmblem } from "./TierEmblem";
import { ChampIcon } from "./ChampIcon";
import { useLiga, type Fila } from "./useLiga";
import { championLabel } from "@/lib/champion-names";
import { liveGameTimeLabel, tierFor } from "@/lib/ladder";
import { puntajeTexto } from "@/lib/liga";
import { movimientosRecientes, resumenDeHoy, type Movimiento } from "@/lib/actividad";
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

/** "domingo 20 de septiembre", en argentino. */
function fechaDeHoy(): string {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/**
 * Cuánto falta, partido en número y unidad para poder escribirlo grande.
 * Null cuando la fecha no se puede leer.
 */
function cuantoFalta(hasta: string): { valor: string; unidad: string; cerrada: boolean } | null {
  const ms = Date.parse(hasta) - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { valor: "—", unidad: "cerrada", cerrada: true };
  const horas = Math.floor(ms / 3600000);
  if (horas >= 48) return { valor: String(Math.floor(horas / 24)), unidad: "días", cerrada: false };
  if (horas >= 1) return { valor: String(horas), unidad: horas === 1 ? "hora" : "horas", cerrada: false };
  return { valor: String(Math.max(1, Math.floor(ms / 60000))), unidad: "minutos", cerrada: false };
}

/** El puntaje sin signo: "1,5". Para frases donde el signo no significa nada. */
const sinSigno = (n: number) => puntajeTexto(Math.abs(n)).replace("+", "");

/** La flecha de un movimiento. Es el único lugar donde el tipo se vuelve un glifo. */
function signoDe(m: Movimiento): string {
  if (m.tipo === "ascenso") return "↑";
  if (m.tipo === "descenso") return "↓";
  if (m.tipo === "racha") return "≡";
  return m.tono === "bueno" ? "+" : "−";
}

/**
 * Inicio — el pulso del grupo.
 *
 * La composición es el punto, así que va primero: **no es una pila de
 * secciones**. Son tres zonas con jerarquía propia.
 *
 *   1. La cabecera del día: qué pasó hoy a la izquierda, la fecha y quién está
 *      jugando a la derecha. Una sola línea de contexto, sin superficie.
 *   2. La liga, sola y en superficie propia. Es la ÚNICA card de la pantalla
 *      porque es lo único temporal: tiene cuenta regresiva y premio, y esa
 *      tensión es la razón de volver a entrar.
 *   3. El ladder y los movimientos, en dos columnas asimétricas (≈60/40) y sin
 *      caja. Los separan la tipografía y el aire, no un borde.
 *
 * Lo que la versión anterior hacía mal no era el contenido —era correcto— sino
 * que lo apilaba: título, card, título, lista, título, lista. Eso en un monitor
 * de 1180px es una columna angosta con media pantalla vacía a la derecha, y se
 * lee como un formulario largo. Cuatro bloques del mismo peso, uno abajo del
 * otro, no tienen jerarquía: tienen orden.
 *
 * Y tres cosas que sigue sin hacer, a propósito:
 *
 * - No repite lo que dice la barra de arriba. Los invocadores, la región y el
 *   "actualizado hace X" ya están ahí, en todas las pantallas.
 * - No dibuja una card por dato. Una caja alrededor de algo que no se puede
 *   tocar es decoración.
 * - No muestra secciones vacías. Sin nadie en partida y sin movimientos, esos
 *   dos bloques no existen.
 */
export function Inicio({ players, loading, ddragonVersion, onPlayer, onRanking, onLiga }: InicioProps) {
  const { d: liga } = useLiga();

  const hoy = useMemo(() => resumenDeHoy(players), [players]);
  const movimientos = useMemo(() => movimientosRecientes(players), [players]);
  const enVivo = players.filter((p) => p.liveGame);
  const top3 = players.slice(0, 3);

  /**
   * Los dos punteros de la liga y cuánto los separa. Se ordena acá aunque la
   * API ya mande la tabla ordenada: el adelanto dice "la punta está a 1,5" y
   * si alguna vez cambia el orden de allá, esta frase pasaría a ser falsa sin
   * que nadie se entere. Ordenar de nuevo cuesta nada y no puede mentir.
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
        <div className="sk sk-inicio-intro" />
        <div className="inicio-cuerpo">
          <div className="sk sk-inicio-liga" style={{ gridArea: "liga" }} />
          <div className="sk sk-inicio-lista" style={{ gridArea: "ladder" }} />
          <div className="sk sk-inicio-lista" style={{ gridArea: "movidas" }} />
        </div>
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

  const falta = liga?.hasta ? cuantoFalta(liga.hasta) : null;

  return (
    <div className="inicio">
      {/* ═══ 1. La cabecera del día ═══
          Los números del día a la izquierda, el calendario y quién está
          jugando a la derecha. Sin superficie y sin rótulo: es la primera
          línea de la página y un encabezado arriba sería un rótulo para un
          rótulo. Es también el ÚNICO lugar donde se cuentan las partidas de
          hoy — no se repite más abajo en una card de estado. */}
      <header className="inicio-intro">
        <div className="inicio-intro-dato">
          {hoy.partidas === 0 ? (
            <>
              <h2 className="inicio-titular">Todavía no jugó nadie</h2>
              <p className="inicio-sub">{players.length} invocadores en el grupo</p>
            </>
          ) : (
            <>
              <h2 className="inicio-titular">
                {hoy.partidas} partida{hoy.partidas === 1 ? "" : "s"} hoy
              </h2>
              <p className="inicio-sub">
                <span className="wc-v">{hoy.victorias}V</span>
                <span className="wc-sep">·</span>
                <span className="wc-d">{hoy.derrotas}D</span>
                <span className="inicio-sub-sep">·</span>
                {hoy.jugaron} de {players.length} jugaron
              </p>
            </>
          )}
        </div>
        <div className="inicio-intro-dia">
          <span className="inicio-fecha">{fechaDeHoy()}</span>
          {/* "En partida ahora" vive acá y no en una sección propia más abajo.
              Es una línea de estado, no un módulo: cuando hay alguien jugando
              es lo más urgente de la pantalla y tiene que estar arriba; cuando
              no hay nadie, desaparece sin dejar un hueco en la composición. */}
          {enVivo.length > 0 && (
            <div className="inicio-vivo">
              <span className="live-dot" />
              {enVivo.slice(0, 3).map((p) => (
                <button
                  type="button"
                  className="inicio-vivo-chip"
                  key={clave(p)}
                  onClick={() => onPlayer(clave(p))}
                  title={`${p.name} · ${championLabel(p.liveGame!.champion)} · ${liveGameTimeLabel(p.liveGame!.startedMinutesAgo)}`}
                >
                  <ChampIcon champ={p.liveGame!.champion} version={ddragonVersion} className="inicio-vivo-champ" />
                  <span className="inicio-vivo-nombre">{p.name}</span>
                </button>
              ))}
              {enVivo.length > 3 && <span className="inicio-vivo-mas">+{enVivo.length - 3}</span>}
            </div>
          )}
        </div>
      </header>

      {/* ═══ 2. La liga ═══
          La única superficie de la pantalla. Adentro son dos zonas: la carrera
          (la frase de la tensión y los dos punteros) y el reloj (cuánto falta
          y la salida). Se parten en dos columnas por CONSULTA DE CONTENEDOR y
          no por ancho de ventana: la card es la que sabe cuánto mide, y así la
          misma regla sirve en Inicio y en cualquier lado donde se reutilice. */}
      <div className="inicio-cuerpo">
      {liga?.arrancoYa && podio && (
        <section className="liga-spot">
          {/* El cuerpo va en su propio div y no directo en la <section>: la
              consulta de contenedor la contesta el ELEMENTO CONTENEDOR para
              sus descendientes, nunca para sí mismo. Con carrera y reloj
              colgando directo de .liga-spot, la regla de dos columnas no
              aplicaba nunca — medido: la card medía 1140px y seguía apilada. */}
          <div className="liga-spot-cuerpo">
          <div className="liga-spot-carrera">
            <span className="liga-spot-rotulo">Liga de la semana</span>
            {/* La frase que convierte dos puntajes en una competencia. La
                diferencia entre el primero y el segundo es más interesante que
                los dos números sueltos: dice si esto ya está definido o si el
                domingo se da vuelta. Sale de restar, no está escrita. */}
            <p className="liga-spot-tension">
              {podio.ventaja === 0 ? (
                <>La punta está <strong>empatada</strong></>
              ) : (
                <>
                  La punta está a <strong>{sinSigno(podio.ventaja)}</strong>{" "}
                  {Math.abs(podio.ventaja) === 1 ? "punto" : "puntos"}
                </>
              )}
            </p>
            <ol className="liga-spot-tabla">
              {[podio.primero, podio.segundo].map((f: Fila, i) => (
                <li className={`liga-spot-fila${i === 0 ? " puntero" : ""}`} key={f.puuid}>
                  <span className="liga-spot-puesto">{i + 1}</span>
                  <PlayerAvatar name={f.name} iconUrl={f.profileIconUrl} className="inicio-avatar" />
                  <span className="liga-spot-nombre">{f.name}</span>
                  <span className="liga-spot-pts">{puntajeTexto(f.puntos ?? 0)}</span>
                </li>
              ))}
            </ol>
          </div>
          {/* El reloj. Va como segunda zona de la card y no como una línea
              chiquita arriba a la derecha: en una competencia que cierra, el
              tiempo que queda es co-protagonista de la diferencia de puntos.
              Los dos juntos son la tensión; cualquiera de los dos solo, no. */}
          <div className="liga-spot-reloj">
            {falta && (
              <p className="liga-spot-falta">
                <span className="liga-spot-falta-num">{falta.valor}</span>
                <span className="liga-spot-falta-uni">{falta.cerrada ? falta.unidad : `${falta.unidad} para el cierre`}</span>
              </p>
            )}
            <button type="button" className="inicio-cta" onClick={onLiga}>
              Ver la carrera <span aria-hidden>→</span>
            </button>
          </div>
          </div>
        </section>
      )}

      {/* ═══ 3. Ladder ═══
          Sin caja: lo separan el título y el aire. Va DEBAJO de la liga y en
          la misma columna, así que las dos comparten el borde izquierdo y se
          leen como la columna principal de la página. */}
        <section className="inicio-bloque zona-ladder">
          <div className="inicio-bloque-head">
            <h3 className="inicio-bloque-titulo">Ladder del grupo</h3>
            <button type="button" className="inicio-cta chico" onClick={onRanking}>
              Ver ranking <span aria-hidden>→</span>
            </button>
          </div>
          {/* Sin líneas entre filas: son tres, y tres renglones separados por
              aire ya se distinguen. Las divisorias estaban haciendo el trabajo
              que ya hacía el espacio, y de paso convertían el podio en una
              planilla de tres renglones. */}
          <ol className="inicio-podio">
            {top3.map((p, i) => {
              const t = tierFor(p.tierKey);
              return (
                <li key={clave(p)}>
                  <button type="button" className={`inicio-fila${i === 0 ? " primero" : ""}`} onClick={() => onPlayer(clave(p))}>
                    <span className="inicio-puesto">{i + 1}</span>
                    <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="inicio-avatar" />
                    <span className="inicio-quien">
                      <span className="inicio-nombre">{p.name}</span>
                      <span className="inicio-tag">#{p.tag}</span>
                    </span>
                    <TierEmblem tierKey={p.tierKey} division={p.division} />
                    <span className="inicio-rango">
                      <span className="inicio-rango-nombre" style={{ color: t.fg }}>
                        {t.name} {p.division}
                      </span>
                      <span className="inicio-rango-lp">{p.lp} LP</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {movimientos.length > 0 && (
          <section className="inicio-bloque zona-movidas">
            <div className="inicio-bloque-head">
              <h3 className="inicio-bloque-titulo">Qué se movió</h3>
              <span className="inicio-bloque-meta">últimas 24 h</span>
            </div>
            <ul className="inicio-movidas">
              {movimientos.slice(0, 5).map((m) => (
                <li key={m.key}>
                  {/* El nombre y lo que le pasó, UNA unidad: uno arriba del
                      otro y pegados. Antes el nombre estaba a la izquierda y
                      el cambio contra el filo derecho, y había que cruzar la
                      pantalla para armar una frase que es una sola cosa. La
                      flecha del costado reemplaza al verbo: con "↑" adelante,
                      "Esmeralda 2 → Esmeralda 1" ya no necesita el
                      "Ascendió". */}
                  <button type="button" className={`inicio-movida ${m.tono}`} onClick={() => onPlayer(m.key)}>
                    <span className="inicio-movida-signo" aria-hidden>{signoDe(m)}</span>
                    <span className="inicio-movida-txt">
                      <span className="inicio-nombre">{m.name}</span>
                      <span className="inicio-movida-cambio">
                        {m.cambio}
                        {m.contexto && <i className="inicio-movida-ctx">{m.contexto}</i>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
