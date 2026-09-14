"use client";

import { useCallback, useEffect, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { LigaCarrera } from "./LigaCarrera";
import { LigaEstado } from "./LigaEstado";
import { InfoTip } from "./InfoTip";
import { fetchConClave } from "./Cerradura";
import { TierEmblem } from "./TierEmblem";
import { StreakIcon } from "./StreakIcon";
import { ChampIcon } from "./ChampIcon";
import { RoleIcon } from "./RoleIcon";
import { championLabel } from "@/lib/champion-names";
import { ROLES, tierFor } from "@/lib/ladder";
import { puntajeTexto } from "@/lib/liga";
import type { RoleKey, TierKey } from "@/lib/types";

interface Fila {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  /** El puntaje de la semana: lo que decide. Opcional por la ventana de caché del CDN. */
  puntos?: number;
  /** Victorias menos derrotas. Ya no puntúa; queda como cuenta rápida. */
  netas?: number;
  lpNeto: number;
  /** Cuánto le recortó el tope por victoria. Opcional: una respuesta anterior al deploy no lo trae. */
  lpRecortado?: number;
  victorias: number;
  derrotas: number;
  sinJugar: boolean;
  /** Partidas del último día y si cumple los dos mínimos. Opcionales por la ventana de caché del CDN. */
  ultimoDia?: number;
  habilitado?: boolean;
  rango: { tier: TierKey; division: number; lp: number } | null;
  /** El acumulado al cierre de cada día, para la carrera. Opcional por la ventana de caché del CDN. */
  porDia?: number[];
  entroTarde: string | null;
  /** Con qué racha viene DENTRO de la semana. Opcional: una respuesta anterior al deploy no lo trae. */
  racha?: { resultado: "W" | "L"; cantidad: number } | null;
  /** Con qué campeón y en qué línea jugó la semana. Opcionales: una respuesta anterior al deploy no los trae. */
  champion?: string | null;
  linea?: RoleKey | null;
  /** Las últimas partidas con el LP de cada una. Opcional por la ventana de caché del CDN. */
  ultimas?: PartidaLiga[];
}
interface PartidaLiga {
  matchId: string;
  champion: string | null;
  win: boolean;
  playedAt: string;
  lp: number | null;
  sinLp: "varias" | "sin-foto" | null;
  /** Opcionales por la ventana de caché del CDN: una pestaña vieja no los trae. */
  lpTramo?: number | null;
  juntas?: number;
  /** Cuánto sumó o restó esta partida: 1, 1,25 o −0,75. */
  puntos?: number;
}
interface DelPlantel {
  puuid: string;
  name: string;
  tag: string;
  participa: boolean;
}
interface Datos {
  /** Si la semana en curso ya es de la liga. Antes del arranque no hay tabla, no marcadores viejos. */
  arrancada: boolean;
  /**
   * Si el pistoletazo ya sonó. No es lo mismo que `arrancada`: a esa le
   * alcanza con que la semana TERMINE después del arranque, así que el lunes
   * antes de las 23:30 daba true y la tabla se dibujaba como una liga en curso
   * llena de ceros. Opcional por si llega una respuesta anterior al deploy.
   */
  arrancoYa?: boolean;
  arrancaEl: string;
  semana: string;
  desde: string;
  hasta: string;
  tabla: Fila[];
  plantel: DelPlantel[];
  /** La vitrina de campeones, de la semana más nueva a la más vieja. */
  historial: {
    semana: string;
    puuid: string | null;
    nombre: string | null;
    iconUrl: string | null;
    /** El puntaje con el que ganó: lo que decide la liga. Null en las semanas anteriores a que se guardara. */
    puntos: number | null;
    /** El LP neto. Ya no decide nada; se muestra rotulado para las semanas viejas. */
    lpNeto: number | null;
    jugadores: number;
  }[];
  /** Para el arte de campeón. Opcional por la misma razón. */
  ddragonVersion?: string | null;
  /** Los dos mínimos para cobrar y si el último día ya arrancó. Opcionales por la caché del CDN. */
  minimoSemanal?: number;
  minimoUltimoDia?: number;
  ultimoDia?: boolean;
  /** Los siete días de la semana ("lun", "mar"…) y cuántos van corridos. Opcionales por la misma razón. */
  dias?: string[];
  diasCorridos?: number;
  /** La tabla de puntos, para escribir la regla con los mismos números que la calculan. */
  puntaje?: { victoria: number; derrota: number; rachaDesde: number; enRacha: number };
}

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** La hora de un instante, en argentino: "23:30". */
const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

/**
 * "+18 LP" / "−24 LP" / "0 LP", con el menos de verdad (−).
 *
 * El guion del toString de un número es más corto que el signo más y en una
 * columna alineada a la derecha se notaba: los negativos quedaban corridos.
 */
function lpTexto(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} LP`;
}

/**
 * "7 – 13 sept" a partir del lunes guardado ("2026-09-07").
 *
 * Se formatea en UTC y NO en hora argentina, al revés que todo lo demás de este
 * archivo: la clave de la semana es una fecha de calendario, no un instante, y
 * `new Date("2026-09-07")` ya es medianoche UTC — pasarla por
 * America/Argentina/Buenos_Aires la corre tres horas atrás y la vitrina diría
 * que la semana arrancó un domingo.
 */
function rangoDeSemana(clave: string): string {
  const lunes = new Date(`${clave}T00:00:00Z`);
  if (Number.isNaN(lunes.getTime())) return clave;
  const domingo = new Date(lunes.getTime() + 6 * 86400000);
  const mes = (d: Date) => d.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" }).replace(".", "");
  return mes(lunes) === mes(domingo)
    ? `${lunes.getUTCDate()} – ${domingo.getUTCDate()} ${mes(domingo)}`
    : `${lunes.getUTCDate()} ${mes(lunes)} – ${domingo.getUTCDate()} ${mes(domingo)}`;
}

/** "1,25" y no "1.25": la regla se lee en castellano. */
function coma(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/** "cuarta", "quinta"… para escribir la regla de la racha sin un número suelto. */
function ordinal(n: number): string {
  return ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima"][n] ?? `${n}ª`;
}

/** La clase de color por signo, que es la misma en todos lados. */
function tono(n: number): string {
  return n > 0 ? "gd-pos" : n < 0 ? "gd-neg" : "";
}

/** Cuánto falta para que cierre, en criollo. */
function loQueFalta(hasta: string): string {
  const ms = Date.parse(hasta) - Date.now();
  if (ms <= 0) return "cerrada";
  const horas = Math.floor(ms / 3600000);
  if (horas >= 48) return `faltan ${Math.floor(horas / 24)} días`;
  if (horas >= 2) return `faltan ${horas} horas`;
  return "cierra en menos de dos horas";
}

/**
 * "Liga de la semana" — la competencia interna por LP neto, de lunes 00:00 a
 * domingo 23:59 hora argentina.
 *
 * Es lo que el ladder no puede medir: el ladder dice dónde llegaste, y cuando
 * el elo de cada uno ya está más o menos definido deja de haber pelea. Esto
 * mide cuánto te MOVISTE en la semana, así que el que sube 200 desde Plata le
 * gana al que sube 50 desde Diamante.
 *
 * Compite solo el que se anota. Anotarlos pide la contraseña del grupo.
 */
export function LigaSemanal({ conEncabezado = true }: { conEncabezado?: boolean } = {}) {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  /** Qué fila está abierta mostrando sus últimas partidas. */
  const [abierta, setAbierta] = useState<string | null>(null);

  /**
   * `forzar` saltea la caché del CDN con un parámetro que cambia. Hace falta
   * después de anotar o desanotar a alguien: sin esto vuelve la respuesta
   * cacheada de antes del cambio y parece que el botón no hizo nada.
   */
  const cargar = useCallback(async (forzar = false) => {
    try {
      const res = await fetch(forzar ? `/api/liga?t=${Date.now()}` : "/api/liga");
      if (!res.ok) return;
      setD((await res.json()) as Datos);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function anotar(puuid: string, participa: boolean) {
    setGuardando(puuid);
    try {
      const res = await fetchConClave("/api/liga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puuid, participa }),
      });
      if (res.ok) await cargar(true);
    } finally {
      setGuardando(null);
    }
  }

  if (cargando) {
    return (
      <div className="empty-state">
        <strong>Cargando la liga…</strong>
      </div>
    );
  }
  if (!d) return null;

  // Con guarda: una pestaña vieja contra la API nueva (o al revés) no tiene el
  // campo, y ahí lo correcto es asumir que arrancó — que es como se comportaba
  // antes de existir el aviso.
  const yaArranco = d.arrancoYa ?? true;
  const anotados = d.plantel.filter((p) => p.participa).length;
  const sinJugar = d.tabla.filter((f) => f.sinJugar).length;
  // Los mínimos vienen de la API para que cambiarlos en lib/liga.ts alcance.
  // Con guarda: una pestaña vieja contra la API nueva no los trae, y ahí lo
  // correcto es no mostrar la regla en vez de inventar un número que no es el
  // que aplica el cierre.
  const minSemana = d.minimoSemanal ?? null;
  const minDia = d.minimoUltimoDia ?? null;
  const esUltimoDia = d.ultimoDia ?? false;
  const tp = d.puntaje ?? null;
  // Para escalar las barras de partidas: el que más jugó ocupa todo el ancho.
  const maxPartidas = Math.max(1, ...d.tabla.map((f) => f.victorias + f.derrotas));

  /**
   * Cuánto sumó o restó HOY, sacado de la curva por día: el último cierre
   * menos el anterior.
   *
   * Es el dato vivo que a la tabla le faltaba. Todo lo demás —el puntaje, el
   * récord, el rango— es el acumulado de la semana y no se mueve de un rato
   * para otro; en una competencia que cierra el domingo, "hoy va +2,25" es lo
   * que hace que valga la pena volver a mirar.
   */
  function loDeHoy(f: Fila): number {
    const p = f.porDia;
    if (!p || p.length < 2) return 0;
    return Math.round((p[p.length - 1] - p[p.length - 2]) * 100) / 100;
  }

  /**
   * "se anotó el martes" existe para explicar por qué alguien tiene menos
   * partidas que el resto. Si lo dice TODA la tabla no explica nada: son seis
   * renglones grises idénticos que le agregan una línea a cada fila y hacen la
   * tabla más alta sin decir nada. Pasa en la primera semana de la liga, que
   * es cuando se anotaron todos juntos.
   */
  const entraronTodosTarde = d.tabla.length > 0 && d.tabla.every((f) => f.entroTarde);

  /**
   * El estado de cobro de una fila: "cobra" si cumple los dos mínimos, o lo que
   * le falta. Devuelve null cuando la API todavía no manda los mínimos, así una
   * pestaña vieja no muestra un requisito inventado.
   */
  function cupo(f: Fila) {
    if (minSemana == null || minDia == null) return null;
    const total = f.victorias + f.derrotas;
    if (f.habilitado) {
      return (
        <span className="liga-cupo ok" title={`Jugó ${total} en la semana y ${f.ultimoDia ?? 0} el último día: cobra.`}>
          cobra
        </span>
      );
    }
    if (total < minSemana) {
      return (
        <span className="liga-cupo" title={`Le faltan ${minSemana - total} partidas en la semana para poder cobrar.`}>
          <b>
            {total} / {minSemana}
          </b>{" "}
          partidas
        </span>
      );
    }
    // Ya cumplió la semana: lo que falta es el último día. Pero antes de que el
    // último día ARRANQUE, esta condición dice lo mismo en todas las filas
    // —"0 / 3 último día"— porque nadie pudo jugarla todavía: seis chips
    // idénticos que no distinguen a nadie y no se pueden accionar. La regla ya
    // está escrita arriba, en la tira de reglas. Desde que el último día
    // empieza sí importa, y ahí es lo único que le falta.
    if (!esUltimoDia) return null;
    return (
      <span className="liga-cupo chico urge" title={`Le faltan ${minDia - (f.ultimoDia ?? 0)} partidas de hoy para poder cobrar.`}>
        <b>
          {f.ultimoDia ?? 0} / {minDia}
        </b>{" "}
        hoy
      </span>
    );
  }

  const rango = (
    <span className="meta liga-rango">
      {dia(d.desde)} – {dia(new Date(Date.parse(d.hasta) - 1).toISOString())}
      <span className={`liga-falta${yaArranco ? "" : " por-arrancar"}`}>
        {yaArranco ? loQueFalta(d.hasta) : `arranca ${horaDe(d.desde)}`}
      </span>
    </span>
  );

  return (
    <section className="liga">
      {/* Cuando la liga vive adentro del ladder, el título ya lo puso el
          interruptor de arriba: acá solo queda el rango de fechas. */}
      {conEncabezado && (
        <div className="section-head">
          <h2>Liga de la semana</h2>
          {rango}
        </div>
      )}

      {/* Un solo bloque de contexto arriba de la tabla: a la izquierda cómo se
          puntúa, a la derecha de qué semana estamos hablando. Antes las fechas
          tenían una banda propia pegadas a la derecha, con la regla en otra
          abajo: dos renglones sueltos y un hueco en el medio entre el título y
          la tabla. Son dos datos del mismo tipo —el marco de la competencia— y
          van juntos. */}
      <div className="liga-contexto">
        {d.arrancada !== false && (
          <div className="liga-reglas">
            {/* De párrafo a tablero. El mismo contenido en prosa eran cuatro
                renglones que había que LEER; acá cada regla es una ficha y se
                escanea en un vistazo. El bonus de racha va aparte y en dorado
                porque no es una regla más: es la mecánica que hace que
                convenga seguir jugando cuando venís ganando. */}
            {tp ? (
              <>
                <span className="liga-reglas-label">Cómo se puntúa</span>
                <span className="liga-ficha v">
                  Victoria <b>+{coma(tp.victoria)}</b>
                </span>
                <span className="liga-ficha d">
                  Derrota <b>−{coma(Math.abs(tp.derrota))}</b>
                </span>
                <span className="liga-ficha bonus" title={`Desde la ${ordinal(tp.rachaDesde)} victoria al hilo, cada una vale ${coma(tp.enRacha)} en vez de ${coma(tp.victoria)}.`}>
                  <StreakIcon result="W" />
                  {tp.rachaDesde}.ª al hilo <b>+{coma(tp.enRacha)}</b>
                </span>
              </>
            ) : (
              <span className="liga-reglas-label">Gana el que más puntos hace</span>
            )}
            <span className="liga-reglas-nota">
              El LP no puntúa: va solo de referencia.
              {minSemana != null && minDia != null && (
                <>
                  {" "}Para cobrar hay que jugar <b>{minSemana}</b> partidas en la semana y <b>{minDia}</b> el último
                  día{esUltimoDia ? ", que es hoy" : ""}.
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* En qué punto de la semana estamos y quién se lleva el premio. Va
          ARRIBA de la carrera y de la tabla porque es el marco: primero cuánto
          falta y qué está en juego, después cómo se dio y por último el
          marcador. Con guarda por la ventana de caché del CDN: una respuesta
          anterior al deploy no trae los días. */}
      {d.arrancada !== false && d.dias && d.dias.length === 7 && (
        <LigaEstado
          dias={d.dias}
          corridos={d.diasCorridos ?? 1}
          esUltimoDia={esUltimoDia}
          falta={loQueFalta(d.hasta)}
          arrancaA={yaArranco ? null : horaDe(d.desde)}
          minimoSemanal={minSemana}
          minimoUltimoDia={minDia}
          tabla={d.tabla}
        />
      )}
      {!conEncabezado && d.arrancada !== false && <span className="liga-contexto-fecha">{rango}</span>}

      {d.arrancada === false ? (
        <div className="empty-state">
          <strong>La liga arranca el lunes</strong>
          Todos empiezan en 0. El LP que ya está guardado es de antes y no cuenta — sería empezar el campeonato con
          marcadores puestos.
        </div>
      ) : d.tabla.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía no hay nadie anotado</strong>
          La liga la corren los que se anotan, no todos los trackeados. Con la contraseña del grupo se anota desde acá
          abajo.
        </div>
      ) : (
        <div className="liga-tabla">
          {/* La carrera, arriba de todo. Va antes de la tabla porque cuenta la
              semana y la tabla cuenta el marcador de hoy: primero cómo se dio,
              después quién va ganando.

              Reemplaza a la columna de curvitas que estaba acá abajo, una por
              fila. Siete miniaturas separadas dicen la forma de cada semana
              por su cuenta pero nunca la carrera, y encima se comían 190px de
              una tabla que ya venía apretada. */}
          {d.dias && d.dias.length >= 2 && (
            <LigaCarrera
              dias={d.dias}
              corredores={d.tabla
                .filter((f) => !f.sinJugar && f.porDia && f.porDia.length >= 2)
                .map((f) => ({
                  puuid: f.puuid,
                  name: f.name,
                  porDia: f.porDia ?? [0],
                  puntos: f.puntos ?? f.netas ?? f.victorias - f.derrotas,
                }))}
            />
          )}
          {/* Encabezados de columna, como en las otras tablas de la app. Sin
              ellos había seis columnas de datos sin una sola palabra que
              dijera qué era cada una: el arte de campeón, el emblema de rango,
              una curva y dos números había que adivinarlos. La fila usa la
              MISMA grilla que las de abajo, así que las etiquetas caen justo
              arriba de su columna. En el teléfono se esconde: ahí la fila se
              parte en dos renglones y las columnas ya no coinciden. */}
          <div className="liga-head" aria-hidden>
            <span className="col-puesto" />
            <span className="col-avatar" />
            <span className="col-nombre">Invocador</span>
            {/* Sin etiqueta: la columna es el arte de campeón, 38px. "Campeón"
                entero no entra y "CAM…" cortado se lee peor que nada — el
                mismo criterio que el encabezado de las otras tablas, que deja
                la celda del puesto en blanco. */}
            <span className="col-champ" />
            <span className="col-rango">Rango</span>
            <span className="col-record">Récord</span>
            <span className="col-puntos">Puntos</span>
          </div>
          {/* Sin esto, la primera noche la tabla mostraba puestos y ceros como
              si la liga estuviera en curso y nadie sumara: parecía rota. */}
          {!yaArranco && (
            <p className="liga-aviso">
              Todavía no arrancó. Lo que se juegue antes de las {horaDe(d.desde)} no cuenta — desde ahí, todos en 0.
            </p>
          )}
          {d.tabla.map((f, i) => {
            const puesto = i + 1;
              const t = f.rango ? tierFor(f.rango.tier) : null;
              const total = f.victorias + f.derrotas;
              // Con guarda: durante la ventana de caché del CDN llega el JSON
              // anterior al deploy. Se cae a las netas y, si tampoco están, a
              // la resta a mano.
              const puntaje = f.puntos ?? f.netas ?? f.victorias - f.derrotas;
              const anterior = i > 0 ? d.tabla[i - 1] : null;
              const puntajeAnterior = anterior
                ? anterior.puntos ?? anterior.netas ?? anterior.victorias - anterior.derrotas
                : null;
              const empatado = !f.sinJugar && puntajeAnterior != null && puntajeAnterior === puntaje;
              return (
                <div key={f.puuid} className="liga-grupo">
                <div
                  className={`liga-fila${puesto === 1 && !f.sinJugar ? " lider" : ""}${f.sinJugar ? " en-pausa" : ""}${
                    abierta === f.puuid ? " abierta" : ""
                  }${(f.ultimas?.length ?? 0) > 0 ? " tocable" : ""}`}
                  role={(f.ultimas?.length ?? 0) > 0 ? "button" : undefined}
                  tabIndex={(f.ultimas?.length ?? 0) > 0 ? 0 : undefined}
                  onClick={() => (f.ultimas?.length ?? 0) > 0 && setAbierta(abierta === f.puuid ? null : f.puuid)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && (f.ultimas?.length ?? 0) > 0) {
                      e.preventDefault();
                      setAbierta(abierta === f.puuid ? null : f.puuid);
                    }
                  }}
                  // El escalonado de la entrada. Va como variable y no como
                  // clase porque el índice es un número: 40ms entre fila y
                  // fila alcanza para que la tabla se ARME en vez de aparecer.
                  style={{ ["--fila" as string]: i }}
                >
                  <span
                    className={`liga-puesto p${puesto <= 3 ? puesto : 0}${empatado ? " empatado" : ""}`}
                    title={
                      empatado
                        ? "Empatado en puntos con el de arriba. Adelante va el que lo hizo en menos partidas."
                        : undefined
                    }
                  >
                    {/* El empate marcado. Con dos en +3 la tabla los ponía uno
                        arriba del otro sin decir por qué, y en una liga con
                        premio eso se lee como que el orden es arbitrario. */}
                    {empatado && (
                      <span className="liga-empate" aria-label="Empatado en puntos">
                        =
                      </span>
                    )}
                    {puesto === 1 && !f.sinJugar ? (
                      // La corona en vez del "1": el que va ganando la semana
                      // se tiene que ver de un vistazo, no leerse.
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-label="Va ganando" role="img">
                        <path d="M3 8l4.5 3.5L12 4l4.5 7.5L21 8l-1.8 10.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L3 8z" />
                      </svg>
                    ) : (
                      puesto
                    )}
                  </span>
                  <PlayerAvatar name={f.name} iconUrl={f.profileIconUrl} className="duo-avatar liga-avatar" />
                  <span className="liga-nombre">
                    {f.name} <span className="player-tag">#{f.tag}</span>
                    {/* Que se vea por qué tiene menos partidas que el resto:
                        sin esto, el que entró el miércoles parece que no jugó. */}
                    {f.entroTarde && !entraronTodosTarde && (
                      <span className="liga-entro" title="Solo le cuenta lo que hizo desde que se anotó">
                        se anotó el{" "}
                        {new Date(f.entroTarde).toLocaleDateString("es-AR", {
                          weekday: "long",
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                      </span>
                    )}
                  </span>

                  {/* Con qué jugó ESTA semana: el campeón que más eligió y
                      la línea donde más apareció. Es lo que le pone cara a la
                      fila —hasta acá la única imagen era el ícono de perfil—
                      y de paso explica el número: no es lo mismo un +31 de
                      jungla que uno de support. */}
                  <span className="liga-jugo">
                    {f.champion ? (
                      <>
                        <ChampIcon champ={f.champion} version={d.ddragonVersion ?? null} className="liga-champ" />
                        {/* La línea va ENCIMA del arte, no al lado: como dos
                            cajas separadas competían entre ellas y la de la
                            línea parecía un segundo campeón. Pegada abajo a la
                            derecha se lee como lo que es, una etiqueta del
                            campeón — y de paso la columna ocupa la mitad. */}
                        {f.linea && (
                          <span className="liga-linea" title={ROLES[f.linea].label}>
                            <RoleIcon role={f.linea} />
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="liga-champ vacio" aria-hidden />
                    )}
                  </span>

                  {/* Dónde está parado hoy. Es el contexto que le falta al
                      neto: subir 200 desde Plata no es lo mismo que subir 200
                      desde Diamante, aunque en esta liga valgan igual. */}
                  <span className="liga-rango-celda">
                    {f.rango && t ? (
                      <>
                        <TierEmblem tierKey={f.rango.tier} division={f.rango.division} />
                        <span className="liga-rango-texto">
                          <span style={{ color: t.fg }}>
                            {t.name} {f.rango.division}
                          </span>
                          <span className="liga-rango-lp">{f.rango.lp} LP</span>
                        </span>
                      </>
                    ) : (
                      <span className="liga-sinjugar">sin rango</span>
                    )}
                  </span>

                  {/* El récord, pegado a las netas: es de dónde SALEN. La barra
                      dice cuánto jugó comparado con el que más jugó, y abajo
                      las victorias en verde y las derrotas en rojo, para que
                      la resta se lea sin hacer la cuenta. */}
                  <span className="liga-vd">
                    {total > 0 ? (
                      <>
                        <span className="liga-barra" aria-hidden>
                          <span className="liga-barra-total" style={{ width: `${(100 * total) / maxPartidas}%` }}>
                            <span className="liga-barra-v" style={{ width: `${(100 * f.victorias) / total}%` }} />
                            <span className="liga-barra-d" />
                          </span>
                        </span>
                        <span className="liga-record">
                          <span className="rec-v">{f.victorias}V</span>
                          <span className="rec-sep" aria-hidden>
                            ·
                          </span>
                          <span className="rec-d">{f.derrotas}D</span>
                          {/* La racha DE LA SEMANA, no la de la season: en una
                              competencia de siete días, "ganó las últimas
                              cuatro" es lo que está pasando ahora. Desde 2,
                              porque una sola partida no es una racha. */}
                          {f.racha && f.racha.cantidad >= 2 && (
                            <span className={`liga-racha ${f.racha.resultado === "W" ? "w" : "l"}`}>
                              <StreakIcon result={f.racha.resultado} />
                              {f.racha.cantidad}
                            </span>
                          )}
                          {/* Lo de HOY, cuando hizo algo hoy. Va acá y no en
                              la columna del puntaje porque habla de actividad,
                              como la racha, y porque apilar un tercer número
                              abajo del marcador lo hacía competir consigo
                              mismo. */}
                          {loDeHoy(f) !== 0 && (
                            <span
                              className={`liga-hoy ${loDeHoy(f) > 0 ? "sube" : "baja"}`}
                              title="Lo que sumó o restó en el día de hoy"
                            >
                              {puntajeTexto(loDeHoy(f))} hoy
                            </span>
                          )}
                          {/* Si cobra o qué le falta para cobrar. Va pegado al
                              récord porque habla de partidas jugadas, y es lo
                              único que le avisa al que va primero que quedarse
                              quieto no le alcanza. */}
                          {cupo(f)}
                        </span>
                      </>
                    ) : (
                      <span className="liga-sinjugar">todavía no jugó</span>
                    )}
                  </span>

                  {/* El número grande es el PUNTAJE del modo activo. Con
                      "netas" son victorias menos derrotas: una victoria vale
                      lo mismo para todos, sin importar cuánto LP le dé Riot a
                      cada cuenta. El LP real queda abajo, chiquito, porque
                      sigue siendo lo que cada uno mira para entender su
                      semana — pero ya no decide nada. */}
                  <span className={`liga-lp ${tono(puntaje)}`}>
                    {/* En placa y no suelto: la columna tiene tres tamaños de
                        letra al lado (récord, racha, LP) y el número que decide
                        el premio se perdía entre ellos. La placa además le da
                        piso al 0, que sin fondo parecía un hueco. */}
                    {/* El número arriba y la palabra abajo, no uno al lado del
                        otro: apilados, el número se lee como un marcador y la
                        palabra como su unidad. Al lado competían por el mismo
                        renglón y el puntaje perdía contra una palabra. */}
                    <span className="liga-puntaje">
                      <span className="liga-puntaje-n">{puntajeTexto(puntaje)}</span>
                      {/* "1 punto", no "1 puntos". Es una palabra y nadie la va
                          a aplaudir, pero un plural mal puesto en el dato más
                          grande de la pantalla se nota. */}
                      <span className="liga-puntaje-unidad">{Math.abs(puntaje) === 1 ? "punto" : "puntos"}</span>
                    </span>
                    {!f.sinJugar && (
                      <span
                        className={`liga-lp-ref ${tono(f.lpNeto)}`}
                        title="El LP real de la semana. No puntúa: está solo como referencia."
                      >
                        {lpTexto(f.lpNeto)}
                      </span>
                    )}
                  </span>
                </div>

                {/* El detalle: partida por partida, con lo que movió cada una.
                    Existe porque el grupo desconfía del cálculo —y tenía
                    razón, el LP por victoria no era igual para todos— y la
                    forma de terminar la discusión es que cualquiera pueda
                    abrir la fila y verlo. */}
                {abierta === f.puuid && (f.ultimas?.length ?? 0) > 0 && (
                  <div className="liga-detalle">
                    <p className="liga-detalle-titulo">
                      Últimas {f.ultimas!.length}
                      <span className="liga-detalle-nota">Lo que sumó cada una, y el LP que dio.</span>
                    </p>
                    {f.ultimas!.map((m) => (
                      <div className={`liga-partida ${m.win ? "gano" : "perdio"}`} key={m.matchId}>
                        <span className={`liga-partida-res ${m.win ? "gano" : "perdio"}`}>{m.win ? "V" : "D"}</span>
                        <ChampIcon champ={m.champion ?? ""} version={d.ddragonVersion ?? null} className="liga-partida-champ" />
                        <span className="liga-partida-champ-nombre">{m.champion ? championLabel(m.champion) : "—"}</span>
                        {/* Lo que valió ESA partida. Puede ser 1,25 si fue la
                            cuarta al hilo o más, así que no se puede deducir
                            del resultado: viene calculado. */}
                        <span className="liga-partida-netas">
                          {puntajeTexto(m.puntos ?? (m.win ? 1 : -1))}
                        </span>
                        {m.lp !== null ? (
                          <span className={`liga-partida-lp ${tono(m.lp)}`}>
                            <span className="liga-partida-lp-n">{lpTexto(m.lp)}</span>
                          </span>
                        ) : m.lpTramo != null ? (
                          // Cayó junta con otras entre dos fotos: se muestra lo
                          // que movieron TODAS, aclarando cuántas son. Antes acá
                          // había un guion y la pregunta se quedaba sin
                          // respuesta; repartir el total en partes iguales, en
                          // cambio, le ponía "+9" a una derrota.
                          <span
                            className={`liga-partida-lp junta ${tono(m.lpTramo)}`}
                            title={`Estas ${m.juntas ?? 2} partidas cayeron entre las mismas dos fotos de LP: juntas movieron ${lpTexto(
                              m.lpTramo,
                            )}. Cuánto dio cada una no se puede saber, así que no se inventa.`}
                          >
                            <span className="liga-partida-lp-n">{lpTexto(m.lpTramo)}</span>
                            <span className="liga-partida-junta">entre {m.juntas ?? 2}</span>
                          </span>
                        ) : (
                          <span className="liga-partida-lp sin" title="Todavía no hay una foto de LP posterior a esta partida.">
                            <span className="liga-partida-lp-n">—</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
              );
            })}
        </div>
      )}

      {/* La vitrina. Era una línea de log —la clave ISO de la semana, el Riot ID
          con tag y un "+144" verde— y tenía un problema peor que el aspecto: ese
          número era el LP NETO, y la liga se gana por PUNTOS. Un tipo que ganó
          con +10,25 aparecía con un +144 al lado, contradiciendo a la tabla de
          la que había salido.

          La forma sale del patrón de vitrina que usan las ligas de fantasy: el
          campeón vigente va destacado y con cara, las semanas viejas quedan
          compactas debajo, y cuando alguien gana más de una vez eso se cuenta
          —que en una liga SEMANAL es la estadística que importa rápido—. */}
      {d.arrancada && d.historial.length > 0 && (() => {
        const [vigente, ...viejas] = d.historial;
        const veces = new Map<string, number>();
        for (const h of d.historial) if (h.nombre) veces.set(h.nombre, (veces.get(h.nombre) ?? 0) + 1);
        const repiten = [...veces.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
        /* El marcador de cada semana. Los puntos primero, que son los que
           deciden; el LP solo en las semanas viejas que se cerraron antes de que
           el puntaje se guardara, y ahí va ROTULADO —"+144 LP"— para que no se
           lea como si fuera el puntaje. */
        const marcador = (h: Datos["historial"][number]) =>
          h.puntos != null ? (
            <span className={`vitrina-pts ${tono(h.puntos)}`}>{puntajeTexto(h.puntos)}</span>
          ) : h.lpNeto != null ? (
            <span className={`vitrina-pts es-lp ${tono(h.lpNeto)}`}>{lpTexto(h.lpNeto)}</span>
          ) : null;
        return (
          <div className="vitrina">
            <span className="vitrina-label">Campeones anteriores</span>

            <div className="vitrina-vigente">
              <span className="vitrina-trofeo" aria-hidden>🏆</span>
              <PlayerAvatar name={vigente.nombre ?? "?"} iconUrl={vigente.iconUrl} className="duo-avatar vitrina-avatar" />
              <span className="vitrina-quien">
                <strong className="vitrina-nombre">{vigente.nombre ?? "No ganó nadie"}</strong>
                <span className="vitrina-meta">
                  {rangoDeSemana(vigente.semana)}
                  {vigente.jugadores > 0 && ` · entre ${vigente.jugadores}`}
                </span>
              </span>
              {marcador(vigente)}
            </div>

            {viejas.length > 0 && (
              <div className="vitrina-viejas">
                {viejas.map((h) => (
                  <div className="vitrina-fila" key={h.semana}>
                    <span className="vitrina-fila-semana">{rangoDeSemana(h.semana)}</span>
                    <span className="vitrina-fila-quien">{h.nombre ?? "no ganó nadie"}</span>
                    {marcador(h)}
                  </div>
                ))}
              </div>
            )}

            {repiten.length > 0 && (
              <span className="vitrina-repiten">
                {repiten.map(([n, v]) => `${n} ganó ${v} veces`).join(" · ")}
              </span>
            )}
          </div>
        );
      })()}

      {/* El pie dice quiénes están en carrera. Los que todavía no jugaron se
          cuentan aparte a propósito: es la parte que dice "esto no está
          cerrado", que en una liga de siete días es la mitad de la gracia. */}
      <div className="liga-pie">
        <button type="button" className="liga-admin-toggle" onClick={() => setAdmin((v) => !v)}>
          {admin ? "Listo" : `Quién compite · ${anotados} de ${d.plantel.length}`}
        </button>
        {!admin && sinJugar > 0 && (
          <span className="liga-pie-nota">
            {sinJugar === 1 ? "1 anotado todavía no jugó" : `${sinJugar} anotados todavía no jugaron`}
          </span>
        )}
      </div>

      {admin && (
        <div className="liga-admin">
          <p>
            Se anota el que quiere, no todos los trackeados.
            <InfoTip text="Anotar y desanotar pide la contraseña del grupo. Si no la tenés cargada, al tocar un nombre aparece el cartel para escribirla." />
          </p>
          {d.plantel.map((p) => (
            <label className="liga-admin-fila" key={p.puuid}>
              <input
                type="checkbox"
                checked={p.participa}
                disabled={guardando === p.puuid}
                onChange={(e) => anotar(p.puuid, e.target.checked)}
              />
              <span>
                {p.name} <span className="player-tag">#{p.tag}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
