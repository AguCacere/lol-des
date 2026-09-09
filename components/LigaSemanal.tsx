"use client";

import { useCallback, useEffect, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { fetchConClave } from "./Cerradura";
import { TierEmblem } from "./TierEmblem";
import { SparkChart } from "./SparkChart";
import { StreakIcon } from "./StreakIcon";
import { ChampIcon } from "./ChampIcon";
import { RoleIcon } from "./RoleIcon";
import { championLabel } from "@/lib/champion-names";
import { ROLES, tierFor, trendColor } from "@/lib/ladder";
import type { RoleKey, TierKey } from "@/lib/types";

interface Fila {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  /** Partidas netas: lo que puntúa. Opcional por la ventana de caché del CDN. */
  netas?: number;
  lpNeto: number;
  /** Cuánto le recortó el tope por victoria. Opcional: una respuesta anterior al deploy no lo trae. */
  lpRecortado?: number;
  victorias: number;
  derrotas: number;
  sinJugar: boolean;
  rango: { tier: TierKey; division: number; lp: number } | null;
  serie: number[];
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
  historial: { semana: string; ganador_label: string | null; lp_neto: number | null; jugadores: number }[];
  /** Para el arte de campeón. Opcional por la misma razón. */
  ddragonVersion?: string | null;
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

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/liga");
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
      if (res.ok) await cargar();
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
  // Para escalar las barras de partidas: el que más jugó ocupa todo el ancho.
  const maxPartidas = Math.max(1, ...d.tabla.map((f) => f.victorias + f.derrotas));

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
      {conEncabezado ? (
        <div className="section-head">
          <h2>Liga de la semana</h2>
          {rango}
        </div>
      ) : (
        <div className="liga-rango-solo">{rango}</div>
      )}

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
              // Con guarda: si alguna vez llega una respuesta sin `serie`
              // —una pestaña vieja contra una API nueva, o al revés— la fila
              // se dibuja sin curva en vez de tirar y llevarse la tabla.
              const serie = f.serie ?? [];
              // Con guarda: durante la ventana de caché del CDN llega el JSON
              // anterior al deploy, que no trae `netas`.
              const puntaje = f.netas ?? f.victorias - f.derrotas;
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
                  <span className={`liga-puesto p${puesto <= 3 ? puesto : 0}`}>
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
                    {f.entroTarde && (
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

                  {/* Victorias y derrotas apiladas, el mismo idioma de barra
                      que el resto de la app: el largo dice cuánto jugó
                      comparado con el que más jugó, el color cómo le fue. */}
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
                          {f.victorias}V-{f.derrotas}D
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
                        </span>
                      </>
                    ) : (
                      <span className="liga-sinjugar">todavía no jugó</span>
                    )}
                  </span>

                  {/* Cómo la fue haciendo en la semana. No es la curva de LP
                      de siempre: acá solo entran las fotos de ESTA semana, así
                      que se ve si el neto lo hizo de una o remontando. */}
                  <span className="liga-curva">
                    <SparkChart values={serie} width={230} height={34} pad={5} color={trendColor(serie)} lineaCero />
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
                    <span className="liga-puntaje">
                      {puntaje > 0 ? "+" : puntaje < 0 ? "−" : ""}
                      {Math.abs(puntaje)}
                      <span className="liga-puntaje-unidad">netas</span>
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
                      Sus últimas {f.ultimas!.length} de la semana
                      <span className="liga-detalle-nota">El LP no puntúa — una victoria vale 1 para todos.</span>
                    </p>
                    {f.ultimas!.map((m) => (
                      <div className={`liga-partida ${m.win ? "gano" : "perdio"}`} key={m.matchId}>
                        <span className={`liga-partida-res ${m.win ? "gano" : "perdio"}`}>{m.win ? "V" : "D"}</span>
                        <ChampIcon champ={m.champion ?? ""} version={d.ddragonVersion ?? null} className="liga-partida-champ" />
                        <span className="liga-partida-champ-nombre">{m.champion ? championLabel(m.champion) : "—"}</span>
                        <span className="liga-partida-netas">{m.win ? "+1" : "−1"}</span>
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

      {d.arrancada && d.historial.length > 0 && (
        <div className="liga-historial">
          <span className="liga-historial-label">Campeones anteriores</span>
          {d.historial.map((h) => (
            <div className="liga-historial-fila" key={h.semana}>
              <span className="liga-historial-semana">{h.semana}</span>
              <span className="liga-historial-ganador">{h.ganador_label ?? "nadie jugó"}</span>
              {h.lp_neto !== null && (
                <span className={`liga-historial-lp ${h.lp_neto >= 0 ? "gd-pos" : "gd-neg"}`}>
                  {h.lp_neto >= 0 ? "+" : ""}
                  {h.lp_neto}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <button type="button" className="liga-admin-toggle" onClick={() => setAdmin((v) => !v)}>
        {admin ? "Listo" : `Quién compite (${anotados} de ${d.plantel.length})`}
      </button>

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
