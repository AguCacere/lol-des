"use client";

import { useMemo } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TierEmblem } from "./TierEmblem";
import { ChampIcon } from "./ChampIcon";
import { StreakIcon } from "./StreakIcon";
import { ArrowDownIcon, ArrowUpIcon, TrendDownIcon, TrendUpIcon, TrophyIcon } from "./StatIcons";
import { useLiga, type Fila } from "./useLiga";
import { championLabel } from "@/lib/champion-names";
import { liveGameTimeLabel, rangoTexto, tierFor } from "@/lib/ladder";
import { cuantosEnVivo, gruposEnVivo, nombresDelGrupo } from "@/lib/live-grupos";
import { puntajeTexto } from "@/lib/liga";
import { movimientosRecientes, resumenDeHoy, tituloDeHoy, type Movimiento } from "@/lib/actividad";
import { esElMismo, historiaDelDia, lpDelGrupoHoy } from "@/lib/historia";
import type { DuoPair, Player } from "@/lib/types";

interface InicioProps {
  players: Player[];
  /** La sinergia de dúo, para la historia del día ("X e Y jugaron 4 juntos"). */
  duos: DuoPair[];
  loading: boolean;
  /**
   * Por qué no se pudo cargar el ladder, si no se pudo.
   *
   * Antes esto no llegaba hasta acá y el resultado fue el peor posible: con
   * `/api/ladder` caído, `players` quedaba en `[]` e Inicio mostraba "Todavía
   * no hay nadie en el grupo". O sea, un problema de conexión se leía como
   * "se borró la base". La pantalla tiene que poder distinguir "no hay datos"
   * de "no pude ir a buscarlos".
   */
  error?: string | null;
  ddragonVersion: string | null;
  /** Abrir el perfil de alguien (cae en Ranking y baja hasta el perfil). */
  onPlayer: (key: string) => void;
  /** Ir al ladder. */
  onRanking: () => void;
  /** Ir a la liga de la semana. */
  onLiga: () => void;
}

const clave = (p: Player) => `${p.name}#${p.tag}`;

/**
 * "domingo 20 de septiembre", en argentino y SIN la coma que mete el
 * formateador después del día de la semana. Acá la fecha ya viene detrás de
 * un punto medio ("Hoy · …") y dos signos de puntuación seguidos en un rótulo
 * de once píxeles se leen como un error de tipeo.
 */
function fechaDeHoy(): string {
  return new Date()
    .toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .replace(",", "");
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
/**
 * El ícono de un movimiento. Cada tipo tiene el suyo y ninguno se repite:
 *
 *   nuevo máximo     🏆 el trofeo — pasa una vez por temporada
 *   caída de LP      ↘  tendencia hacia abajo
 *   subida de LP     ↗  tendencia hacia arriba
 *   ascenso          ↑  flecha recta — cruzaste un escalón, no es una tendencia
 *   descenso         ↓  flecha recta
 *   racha            🔥 la llama, ganando o perdiendo; el color dice cuál
 *
 * La llama va para las DOS rachas. StreakIcon con "L" devuelve un triángulo
 * hacia abajo, que es casi el mismo dibujo que TrendDownIcon: en esta columna,
 * una caída de LP y una racha de derrotas quedaban con el mismo ícono para dos
 * cosas distintas. La llama significa "racha"; el rojo, que es mala.
 *
 * **Sin `lucide-react`.** La semántica es la de esa librería, pero el repo ya
 * tiene su propio juego de íconos en StatIcons.tsx —de donde salen tres de los
 * cinco— y agregar una dependencia entera para dos flechas sería cambiar un
 * archivo de veinte líneas por un paquete en el bundle.
 */
function IconoDeMovida({ m }: { m: Movimiento }) {
  if (m.tipo === "record") return <TrophyIcon />;
  if (m.tipo === "racha") return <StreakIcon result="W" />;
  if (m.tipo === "ascenso") return <ArrowUpIcon />;
  if (m.tipo === "descenso") return <ArrowDownIcon />;
  return m.tono === "bueno" ? <TrendUpIcon /> : <TrendDownIcon />;
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
export function Inicio({ players, duos, loading, error, ddragonVersion, onPlayer, onRanking, onLiga }: InicioProps) {
  const { d: liga } = useLiga();

  const hoy = useMemo(() => resumenDeHoy(players), [players]);
  const movimientos = useMemo(() => movimientosRecientes(players), [players]);
  /** Lo que movió TODO el grupo hoy. Null cuando no se puede afirmar (ver lpDelGrupoHoy). */
  const lpGrupo = useMemo(() => lpDelGrupoHoy(players), [players]);
  /**
   * Quién está jugando, agrupado por partida. MISMA función que usan la barra
   * de arriba y la bandeja flotante (lib/live-grupos.ts): los tres decían
   * cosas distintas del mismo hecho porque cada uno lo contaba por su cuenta.
   */
  const enVivo = useMemo(() => {
    const grupos = gruposEnVivo(players);
    return { grupos, jugando: cuantosEnVivo(grupos) };
  }, [players]);
  const top3 = players.slice(0, 3);

  /**
   * Los dos punteros de la liga y cuánto los separa. Se ordena acá aunque la
   * API ya mande la tabla ordenada: el adelanto dice "la punta está a 1,5" y
   * si alguna vez cambia el orden de allá, esta frase pasaría a ser falsa sin
   * que nadie se entere. Ordenar de nuevo cuesta nada y no puede mentir.
   */
  /**
   * La historia del día: UN acontecimiento, el más interesante que pasó (ver
   * lib/historia.ts). Es lo que hace que entrar a Inicio tenga sentido aunque
   * ya sepas quién va primero — el ladder y el feed son los mismos todos los
   * días; esto cambia.
   */
  const historia = useMemo(() => historiaDelDia(players, duos, liga), [players, duos, liga]);
  /** El feed, sin el que ya está contado arriba en grande y capado en tres. */
  const movidas = useMemo(
    () => movimientos.filter((m) => !esElMismo(m, historia)).slice(0, 3),
    [movimientos, historia],
  );

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
        {/* En el MISMO orden que el contenido real, y con el alto de cada
            zona: un esqueleto que no coincide hace saltar la página entera
            cuando llegan los datos. Las clases de zona son las que ponen cada
            uno en su lugar de la grilla; antes iban con `gridArea` inline y
            eso dejó de funcionar al pasar la grilla a colocación explícita. */}
        <div className="inicio-cuerpo">
          <div className="sk sk-inicio-lista zona-ladder" />
          <div className="sk sk-inicio-lista zona-movidas" />
          <div className="sk sk-inicio-historia zona-historia" />
          <div className="sk sk-inicio-liga liga-spot" />
        </div>
      </div>
    );
  }

  // El error ANTES del vacío, que es el orden en el que importan: sin esta
  // rama, cualquier caída de /api/ladder se mostraba como un grupo vacío y
  // mandaba a buscar gente que ya está cargada. Mismo texto y misma clase que
  // LadderTable, que ya lo hacía bien.
  if (error) {
    return (
      <div className="empty-state">
        <strong>No se pudo cargar el ladder</strong>
        {error}
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
      {/* ═══ 1. El pulso de hoy ═══
          Una FRANJA, no un encabezado. El cambio es conceptual y no de
          tamaño: "20 partidas hoy" en 34px era el <h1> de una página que
          parecía llamarse así, cuando en realidad es una MÉTRICA — el
          contexto del día, no el título de nada. Y con la fecha y el jugador
          en vivo tirados contra el borde derecho, la franja se leía como tres
          cosas sueltas en vez de una.

          Ahora son dos renglones y una sola unidad: arriba el rótulo con la
          fecha, abajo la línea de datos con el estado vivo al final. La
          jerarquía la hace el TAMAÑO de cada pedazo dentro de la frase, no un
          titular gigante arriba de una metadata. */}
      <header className="pulso">
        <p className="pulso-rotulo">
          Hoy <span className="pulso-fecha">· {fechaDeHoy()}</span>
        </p>
        <div className="pulso-linea">
          {hoy.partidas === 0 ? (
            <p className="pulso-datos">
              {/* El titular mira las dos cosas. Decía "Todavía no jugó nadie"
                  con dos personas en partida tres centímetros más arriba: las
                  dos frases eran ciertas —nadie TERMINÓ una— pero juntas no se
                  pueden leer. Ver tituloDeHoy. */}
              <span className="pulso-cifra">{tituloDeHoy(0, enVivo.jugando)}</span>
            </p>
          ) : (
            <p className="pulso-datos">
              <span className="pulso-cifra">
                {hoy.partidas} partida{hoy.partidas === 1 ? "" : "s"}
                {enVivo.jugando > 0 && <i className="pulso-encurso"> · {enVivo.jugando} en curso</i>}
              </span>
              {/* El primero lleva clase propia porque en celular se esconde:
                  la cifra se lleva su renglón y este punto quedaría abriendo
                  el de abajo. `:first-of-type` no sirve — el primer <span> de
                  la frase es la cifra, no un separador. */}
              <span className="pulso-sep pulso-sep-corte">·</span>
              <span className="pulso-vd">
                <b className="wc-v">{hoy.victorias}V</b> <i>·</i> <b className="wc-d">{hoy.derrotas}D</b>
              </span>
              <span className="pulso-sep">·</span>
              <span className="pulso-meta">
                {hoy.jugaron} de {players.length} jugaron
              </span>
              {/* Lo que movió TODO el grupo hoy. Es el dato que faltaba para
                  que la línea diga cómo VA el día y no solo cuánto se jugó:
                  tres partidas 2V-1D puede ser +38 o −5 según contra quién.
                  Se dibuja solo cuando se puede afirmar — si a alguno que
                  jugó le falta la foto de referencia, la suma sería un pedazo
                  del día escrito como si fuera el día entero. */}
              {lpGrupo !== null && lpGrupo !== 0 && (
                <>
                  <span className="pulso-sep">·</span>
                  <span className={`pulso-lp ${lpGrupo > 0 ? "good" : "bad"}`}>
                    {lpGrupo > 0 ? "+" : "−"}
                    {Math.abs(lpGrupo)} LP
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      {/* ═══ 2. Ahora mismo ═══
          Era un chip al final de la franja que decía "Fulano y 1 más están
          jugando" — la MISMA información que la barra de arriba y que la
          bandeja flotante, con un tercer texto distinto. Ahora es una franja
          editorial que dice lo que esas dos no pueden: QUÉ partida es, con
          qué campeones y si están juntos.

          No repite el Live Center: muestra el acontecimiento principal —la
          partida más nueva— y, si hay más, cuántas. El detalle completo está
          a un click en la bandeja o en el popover de la barra. */}
      {enVivo.grupos.length > 0 && (
        <section className="ahora">
          <p className="ahora-rotulo">
            <span className="live-dot" />
            Ahora mismo
          </p>
          <div className="ahora-cuerpo">
            <span className="ahora-champs">
              {enVivo.grupos[0].jugadores.map((p) => (
                <ChampIcon key={clave(p)} champ={p.liveGame!.champion} version={ddragonVersion} className="ahora-champ" />
              ))}
            </span>
            <p className="ahora-texto">
              <button type="button" className="ahora-nombres" onClick={() => onPlayer(clave(enVivo.grupos[0].jugadores[0]))}>
                {nombresDelGrupo(enVivo.grupos[0])}
              </button>{" "}
              {enVivo.grupos[0].juntos ? "están jugando juntos" : "está jugando"}
              <span className="ahora-meta">
                {enVivo.grupos[0].juntos
                  ? enVivo.grupos[0].partida.queueLabel
                  : `${championLabel(enVivo.grupos[0].partida.champion)} · ${enVivo.grupos[0].partida.queueLabel}`}{" "}
                · {liveGameTimeLabel(enVivo.grupos[0].partida.startedMinutesAgo)}
                {/* Las otras partidas se cuentan, no se listan: para eso está
                    el Live Center, y listarlas acá sería la cuarta copia. */}
                {enVivo.grupos.length > 1 && (
                  <> · {enVivo.grupos.length - 1} partida{enVivo.grupos.length - 1 === 1 ? "" : "s"} más en curso</>
                )}
              </span>
            </p>
          </div>
        </section>
      )}

      <div className="inicio-cuerpo">
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
                        {rangoTexto(p.tierKey, p.division)}
                      </span>
                      <span className="inicio-rango-lp">{p.lp} LP</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {movidas.length > 0 && (
          <section className="inicio-bloque zona-movidas">
            <div className="inicio-bloque-head">
              <h3 className="inicio-bloque-titulo">Qué se movió</h3>
              <span className="inicio-bloque-meta">últimas 24 h</span>
            </div>
            <ul className="inicio-movidas">
              {movidas.map((m) => (
                <li key={m.key}>
                  {/* El nombre y lo que le pasó, UNA unidad: uno arriba del
                      otro y pegados. Antes el nombre estaba a la izquierda y
                      el cambio contra el filo derecho, y había que cruzar la
                      pantalla para armar una frase que es una sola cosa. La
                      flecha del costado reemplaza al verbo: con "↑" adelante,
                      "Esmeralda 2 → Esmeralda 1" ya no necesita el
                      "Ascendió". */}
                  <button
                    type="button"
                    /* El récord lleva su propia clase: el dorado es la
                       identidad de Grieta Central y acá señala un hito, no un
                       "esto estuvo bien" — para eso está el verde. */
                    className={`inicio-movida ${m.tipo === "record" ? "record" : m.tono}`}
                    onClick={() => onPlayer(m.key)}
                  >
                    <span className="inicio-movida-icono" aria-hidden>
                      <IconoDeMovida m={m} />
                    </span>
                    <span className="inicio-movida-txt">
                      <span className="inicio-movida-nombre">{m.name}</span>
                      <span className="inicio-movida-cambio">{m.cambio}</span>
                      {m.contexto && <span className="inicio-movida-ctx">{m.contexto}</span>}
                    </span>
                    <span className="inicio-movida-ir" aria-hidden>→</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ═══ La historia del día ═══
            La pieza que cambia. Un día es una racha, otro un ascenso, otro
            que dos se pasaron la tarde jugando juntos, otro que la liga está
            a 0,75 puntos. El ladder y el feed son los mismos todos los días;
            esto es lo que da una razón para volver a entrar.

            SIN superficie: dos líneas finas, un ícono y tipografía grande. Es
            un botón —se toca y lleva al perfil o a la liga— pero un
            rectángulo acá, con la card de la liga justo abajo, serían dos
            cajas apiladas discutiendo cuál es la importante. El acento lo
            pone el ícono y el color del tono, no un borde.

            Ver lib/historia.ts: si el grupo no dio para una historia, esto no
            existe. */}
        {historia && (
          <button
            type="button"
            className={`historia ${historia.tono}`}
            onClick={() => (historia.destino === "liga" ? onLiga() : historia.key && onPlayer(historia.key))}
          >
            <span className="historia-icono" aria-hidden>{historia.icono}</span>
            <span className="historia-txt">
              {/* El rótulo cambia con la clase: una historia de alguien que
                  está jugando AHORA no es "la historia del día", y con el
                  mismo rótulo que el resto se leía como una repetición de la
                  franja de arriba en vez de como su continuación. */}
              <span className="historia-rotulo">
                {historia.clase === "vivo" ? "Pasando ahora" : "La historia del día"}
              </span>
              <strong className="historia-titulo">{historia.titulo}</strong>
              {historia.detalle && <span className="historia-detalle">{historia.detalle}</span>}
            </span>
            <span className="historia-ir">
              {historia.destino === "liga" ? "Ver la carrera" : "Ver sus partidas"} <span aria-hidden>→</span>
            </span>
          </button>
        )}

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
      </div>
    </div>
  );
}
