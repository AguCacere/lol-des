"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import {
  formatearMetrica,
  metrica as metricaDe,
  type Baseline,
  type ClaveMetrica,
  type Comparador,
  type Diagnostico,
  type EvaluacionObjetivo,
  type MatchupMejora,
  type Objetivo,
  type Patron,
  type Progreso,
} from "@/lib/mejora";
import { formatRelativeTime } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { SparkChart } from "./SparkChart";

/**
 * "Mejora": la pestaña que convierte lo que pasó en algo sobre lo que
 * trabajar.
 *
 * El recorrido es el del plan y está en este orden a propósito:
 *
 *   la última partida  →  qué mirar  →  cómo viene  →  qué se repite  →  cruces
 *
 * Empieza por la partida que acabás de jugar porque es el motivo por el que
 * alguien abre esto, y recién después generaliza. Al revés —patrones
 * primero— sería un informe, y un informe no se abre dos veces.
 *
 * NADA de acá calcula: todo sale armado de lib/mejora.ts, que es cálculo
 * puro y está probado con fixture. Este archivo elige a quién mira y dibuja.
 *
 * Sobre la IA: no hay. El plan es explícito en que el motor determinístico va
 * primero y en que la pestaña tiene que servir sin modelo. Cuando llegue, va
 * a recibir ESTOS números —no a reemplazarlos.
 */

interface Datos {
  partidas: number;
  minimoBaseline: number;
  ultima: { matchId: string; champion: string; win: boolean; playedAt: string } | null;
  diagnostico: Diagnostico | null;
  patrones: Patron[];
  progreso: Progreso | null;
  matchups: MatchupMejora[];
  bases: (Baseline & { sugerido: number })[];
  objetivo: EvaluacionObjetivo | null;
  historialObjetivos: Objetivo[];
  faltaMigracion: boolean;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

// ── La última partida: las tres capas ─────────────────────────────────────

function Diagnostico({ d, ultima }: { d: Diagnostico; ultima: Datos["ultima"] }) {
  const capas = [
    { clave: "marco", et: "Lo que marcó la partida", c: d.marco },
    { clave: "bien", et: "Lo que hiciste bien", c: d.bien },
    { clave: "proxima", et: "Para la próxima", c: d.proxima },
  ].filter((x) => x.c !== null);

  if (capas.length === 0) {
    return (
      <p className="mj-vacio">
        Con {d.muestra} {d.muestra === 1 ? "partida guardada" : "partidas guardadas"} todavía no hay contra qué
        comparar esta. Hacen falta unas diez para que la lectura signifique algo.
      </p>
    );
  }

  return (
    <div className="mj-capas">
      {ultima ? (
        <div className="mj-ultima">
          <span className={`mj-resultado ${ultima.win ? "good" : "bad"}`}>{ultima.win ? "Victoria" : "Derrota"}</span>
          <span className="mj-ultima-pie">
            {ultima.champion} · {formatRelativeTime(ultima.playedAt)}
          </span>
        </div>
      ) : null}
      {capas.map(({ clave, et, c }) => (
        <div className={`mj-capa mj-capa-${clave}`} key={clave}>
          <span className="mj-capa-et">{et}</span>
          <p className="mj-capa-texto">{c!.texto}</p>
          {c!.dato ? <span className="mj-capa-dato">{c!.dato}</span> : null}
        </div>
      ))}
      {/* La muestra, siempre. Una lectura contra ocho partidas y una contra
          doscientas no valen lo mismo y la pantalla no puede callárselo. */}
      <p className="mj-muestra">Comparado contra tus {d.muestra} partidas anteriores</p>
    </div>
  );
}

// ── El foco: el objetivo activo ───────────────────────────────────────────

function Foco({
  ev,
  bases,
  puuid,
  onCambio,
  faltaMigracion,
}: {
  ev: EvaluacionObjetivo | null;
  bases: Datos["bases"];
  puuid: string;
  onCambio: () => void;
  faltaMigracion: boolean;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [clave, setClave] = useState<ClaveMetrica | "">("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = bases.find((b) => b.metrica === clave);
  const m = clave ? metricaDe(clave) : null;
  // El comparador sale de la métrica, no de una elección: "muertes o más" no
  // es un objetivo que alguien quiera.
  const comparador: Comparador = m ? (m.masEsMejor ? "gte" : "lte") : "gte";

  async function guardar() {
    if (!base || !m) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/mejora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puuid, metrica: m.clave, comparador, umbral: base.sugerido, ventana: 5 }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar.");
      setEligiendo(false);
      setClave("");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function cerrar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/mejora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puuid, cerrar: true }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo cerrar.");
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar.");
    } finally {
      setGuardando(false);
    }
  }

  if (ev) {
    const mm = metricaDe(ev.objetivo.metrica);
    return (
      <div className="mj-foco">
        <div className="mj-foco-cab">
          <span className="mj-foco-enunciado">{ev.enunciado}</span>
          <button type="button" className="mj-foco-cerrar" onClick={cerrar} disabled={guardando}>
            Cerrar objetivo
          </button>
        </div>
        <span className="mj-foco-cuenta">
          {ev.cumplidas}/{ev.evaluadas || ev.objetivo.ventana}
          <span className="mj-foco-cuenta-et">
            {ev.evaluadas === 0 ? "sin partidas todavía" : ev.evaluadas === 1 ? "partida" : "partidas"}
          </span>
        </span>
        {ev.partidas.length > 0 ? (
          <ul className="mj-foco-lista">
            {ev.partidas.map((p) => (
              <li className={`mj-foco-p ${p.cumplida ? "ok" : "no"}`} key={p.matchId}>
                <span className="mj-foco-marca" aria-hidden>
                  {p.cumplida ? "✓" : "·"}
                </span>
                <span className="mj-foco-valor">{formatearMetrica(mm, p.valor)}</span>
                <span className="mj-foco-fecha">{fecha(p.playedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mj-vacio">Se empieza a contar con la próxima partida.</p>
        )}
        {error ? <p className="mj-error">{error}</p> : null}
      </div>
    );
  }

  if (faltaMigracion) {
    return (
      <p className="mj-vacio">
        Para guardar un foco falta correr una migración en la base (la tabla <code>objetivos</code>, que está en{" "}
        <code>supabase/schema.sql</code>). Todo lo demás de esta pestaña funciona igual.
      </p>
    );
  }

  if (!eligiendo) {
    return (
      <div className="mj-foco-vacio">
        <p className="mj-vacio">
          Un foco es una métrica con un número: se evalúa sola con cada partida nueva y te dice cuántas lo
          cumpliste.
        </p>
        <button type="button" className="mj-boton" onClick={() => setEligiendo(true)} disabled={bases.length === 0}>
          {bases.length === 0 ? "Hacen falta más partidas" : "Elegir un foco"}
        </button>
      </div>
    );
  }

  return (
    <div className="mj-elegir">
      <div className="mj-opciones" role="group" aria-label="Métrica del foco">
        {bases.map((b) => {
          const mb = metricaDe(b.metrica);
          return (
            <button
              key={b.metrica}
              type="button"
              className={`mj-opcion${clave === b.metrica ? " activo" : ""}`}
              aria-pressed={clave === b.metrica}
              onClick={() => setClave(b.metrica)}
            >
              <span className="mj-opcion-et">{mb.etiqueta}</span>
              <span className="mj-opcion-val">
                {mb.masEsMejor ? "≥" : "≤"} {formatearMetrica(mb, b.sugerido)}
              </span>
            </button>
          );
        })}
      </div>
      {base && m ? (
        // El umbral propuesto ES la mediana del jugador, y decirlo importa:
        // un objetivo que sale de tu propio historial es "hacé lo tuyo todas
        // las veces", no una vara puesta desde afuera.
        <p className="mj-explica">
          {m.etiqueta} de {formatearMetrica(m, base.sugerido)} {m.masEsMejor ? "o más" : "o menos"}, sobre las
          próximas 5 partidas. Ese número es tu propia mediana de {base.muestra} partidas: la idea no es superarte,
          es sostenerlo.
        </p>
      ) : null}
      <div className="mj-elegir-pie">
        <button type="button" className="mj-boton" onClick={guardar} disabled={!base || guardando}>
          {guardando ? "Guardando…" : "Guardar foco"}
        </button>
        <button type="button" className="mj-boton-flojo" onClick={() => setEligiendo(false)} disabled={guardando}>
          Cancelar
        </button>
      </div>
      {error ? <p className="mj-error">{error}</p> : null}
    </div>
  );
}

// ── Progreso ──────────────────────────────────────────────────────────────

function ProgresoBloque({ pr }: { pr: Progreso }) {
  const m = metricaDe(pr.metrica);
  const valores = pr.puntos.map((p) => p.valor);
  // Contra la mediana de la primera mitad: la línea de referencia es de dónde
  // venía, que es lo único contra lo que tiene sentido leer una curva propia.
  const guias = [{ value: pr.antes, label: "antes" }];
  return (
    <div className="mj-progreso">
      <div className="mj-progreso-cab">
        <span className="mj-progreso-et">
          {m.etiqueta}
          <InfoTip text={m.explica} />
        </span>
        <span className="mj-progreso-salto">
          {formatearMetrica(m, pr.antes)}
          <span className="mj-flecha" aria-hidden>
            →
          </span>
          <span className={pr.mejoro ? "good" : "bad"}>{formatearMetrica(m, pr.ahora)}</span>
        </span>
      </div>
      <SparkChart
        values={valores}
        width={640}
        height={92}
        variant="detailed"
        color={pr.mejoro ? "var(--good)" : "var(--critical)"}
        guides={guias}
        valorDePunto={(i) => formatearMetrica(m, valores[i])}
        pointLabels={pr.puntos.map((p, i) => (
          <span key={i}>
            {formatearMetrica(m, p.valor)} · {p.win ? "victoria" : "derrota"} · {fecha(p.playedAt)}
          </span>
        ))}
      />
      <p className="mj-muestra">
        Las últimas {pr.muestra} partidas, de la más vieja a la más nueva. La mitad vieja contra la mitad nueva,
        por mediana — un desastre suelto corre un promedio, no una mediana.
      </p>
    </div>
  );
}

// ── La pestaña ────────────────────────────────────────────────────────────

export function Mejora({ players, ddragonVersion }: { players: Player[]; ddragonVersion: string | null }) {
  const [elegido, setElegido] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Se incrementa para volver a pedir sin cambiar de persona (después de
  // guardar o cerrar un foco). Es un disparador, no un dato.
  const [recarga, setRecarga] = useState(0);

  // El primero de la lista es "vos" si está marcado, y si no el primero del
  // ladder: entrar a esta pestaña y tener que elegir a alguien antes de ver
  // nada es una pantalla vacía de más.
  const inicial = players.find((p) => p.you)?.puuid ?? null;
  const actual = elegido ?? inicial ?? players[0]?.puuid ?? null;

  useEffect(() => {
    if (!actual) return;
    // `vivo` no es prolijidad: tocando el roster rápido se disparan dos
    // pedidos y el primero puede volver ÚLTIMO, dejando en pantalla los
    // datos de una persona con el nombre de otra seleccionado. El guardia
    // descarta lo que llega tarde.
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/mejora?puuid=${encodeURIComponent(actual)}`);
        const j = (await r.json()) as Datos & { error?: string };
        if (!vivo) return;
        if (!r.ok) throw new Error(j.error ?? "No se pudo cargar.");
        setDatos(j);
        setError(null);
      } catch (e) {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar.");
        setDatos(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [actual, recarga]);

  const jugador = players.find((p) => p.puuid === actual) ?? null;
  // Derivado y no un estado propio: mientras no haya datos ni error para la
  // persona elegida, se está cargando. Un `setCargando(true)` adentro del
  // efecto sería una cascada de renders para decir lo mismo.
  const cargando = datos === null && error === null && actual !== null;

  return (
    <div className="mj">
      <div className="roster" role="group" aria-label="Invocadores">
        {players.map((p) => {
          const k = p.puuid;
          return (
            <button
              type="button"
              className={`roster-btn${actual === k ? " activo" : ""}`}
              onClick={() => {
                if (k === actual) return;
                setElegido(k);
                // Se limpia acá, en el evento, y no en un efecto: si no, la
                // pantalla muestra los números del anterior con el nombre
                // del nuevo ya resaltado.
                setDatos(null);
                setError(null);
              }}
              aria-pressed={actual === k}
              key={k}
            >
              <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="roster-cara" />
              <span className="roster-nombre">{p.name}</span>
            </button>
          );
        })}
      </div>

      {error ? <p className="mj-error">{error}</p> : null}
      {cargando ? <p className="mj-vacio">Leyendo las partidas de {jugador?.name ?? "…"}…</p> : null}

      {datos ? (
        <>
          {datos.partidas < datos.minimoBaseline ? (
            <p className="mj-vacio">
              {jugador?.name} tiene {datos.partidas}{" "}
              {datos.partidas === 1 ? "partida guardada" : "partidas guardadas"}. Esta pestaña compara a cada uno
              contra su propio historial, así que necesita al menos {datos.minimoBaseline} para decir algo que no
              sea ruido.
            </p>
          ) : (
            <>
              <section>
                <div className="section-head">
                  <h2>La última partida</h2>
                  <span className="meta">
                    Lo que dicen los datos
                    <InfoTip
                      align="end"
                      text="Las tres lecturas salen de números guardados y se comparan contra el propio historial de esta persona, no contra una tabla general. Describen lo que pasó en TU carril: no dicen por qué se ganó o se perdió la partida, porque eso los datos no lo saben."
                    />
                  </span>
                </div>
                {datos.diagnostico ? <Diagnostico d={datos.diagnostico} ultima={datos.ultima} /> : null}
              </section>

              <section>
                <div className="section-head">
                  <h2>Tu foco</h2>
                  <span className="meta">Un objetivo por vez</span>
                </div>
                {actual ? (
                  <Foco
                    ev={datos.objetivo}
                    bases={datos.bases}
                    puuid={actual}
                    faltaMigracion={datos.faltaMigracion}
                    onCambio={() => setRecarga((n) => n + 1)}
                  />
                ) : null}
              </section>

              {datos.progreso ? (
                <section>
                  <div className="section-head">
                    <h2>Cómo viene</h2>
                    <span className="meta">Contra vos mismo</span>
                  </div>
                  <ProgresoBloque pr={datos.progreso} />
                </section>
              ) : null}

              {datos.patrones.length > 0 ? (
                <section>
                  <div className="section-head">
                    <h2>Lo que se repite</h2>
                    <span className="meta">
                      Sobre tus últimas 10
                      <InfoTip
                        align="end"
                        text="Una observación entra acá solo si se repite en la mayoría de la ventana. Una partida suelta nunca es un patrón, y la frase siempre dice sobre cuántas se calculó."
                      />
                    </span>
                  </div>
                  <ul className="mj-patrones">
                    {datos.patrones.map((p) => (
                      <li className={`mj-patron ${p.tono}`} key={p.metrica}>
                        <span className="mj-patron-frec">
                          {p.cuantas}<span className="mj-patron-de">/{p.de}</span>
                        </span>
                        <span className="mj-patron-texto">{p.texto}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {datos.matchups.length > 0 ? (
                <section>
                  <div className="section-head">
                    <h2>Tus cruces</h2>
                    <span className="meta">
                      Contra tu propia mediana
                      <InfoTip
                        align="end"
                        text="No existe un 'este cruce es malo' absoluto. Lo que se compara es cómo salís del minuto 10 contra ESE rival, contra cómo salís normalmente. Hacen falta al menos cuatro cruces para que aparezca."
                      />
                    </span>
                  </div>
                  <ul className="mj-matchups">
                    {datos.matchups.map((mu) => {
                      const m10 = metricaDe("goldDiff10");
                      const dif =
                        mu.goldDiff10 !== null && mu.goldDiff10General !== null
                          ? mu.goldDiff10 - mu.goldDiff10General
                          : null;
                      return (
                        <li className="mj-matchup" key={mu.rival}>
                          <span className="mj-mu-caras">
                            <ChampIcon champ={mu.propio} version={ddragonVersion} className="mj-mu-icono" />
                            <span className="mj-mu-vs">vs</span>
                            <ChampIcon champ={mu.rival} version={ddragonVersion} className="mj-mu-icono" />
                          </span>
                          <span className="mj-mu-id">
                            <span className="mj-mu-nombre">{mu.rival}</span>
                            <span className="mj-mu-pie">
                              {/* Con qué lo jugaste. Cuando fue con varios se
                                  dice, porque "con Jinx" a secas sobre un
                                  cruce que jugaste con tres campeones es una
                                  media verdad. */}
                              {mu.propios > 1 ? `sobre todo con ${mu.propio}` : `con ${mu.propio}`} · {mu.victorias}V ·{" "}
                              {mu.partidas - mu.victorias}D
                            </span>
                          </span>
                          {mu.goldDiff10 !== null ? (
                            <span className="mj-mu-oro">{formatearMetrica(m10, mu.goldDiff10)}</span>
                          ) : (
                            <span className="mj-mu-oro">—</span>
                          )}
                          {dif !== null ? (
                            <span className={`mj-mu-dif ${dif > 0 ? "good" : dif < 0 ? "bad" : "neutral"}`}>
                              {dif > 0 ? "+" : ""}
                              {Math.round(dif)} vs. lo tuyo
                            </span>
                          ) : (
                            <span className="mj-mu-dif neutral" />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {datos.historialObjetivos.length > 0 ? (
                <section>
                  <div className="section-head">
                    <h2>Focos anteriores</h2>
                  </div>
                  <ul className="mj-historial">
                    {datos.historialObjetivos.map((o) => {
                      const mo = metricaDe(o.metrica);
                      return (
                        <li className="mj-hist" key={o.id}>
                          <span className="mj-hist-que">
                            {mo.etiqueta} {o.comparador === "gte" ? "≥" : "≤"} {formatearMetrica(mo, o.umbral)}
                          </span>
                          <span className="mj-hist-cuando">
                            {fecha(o.creadoAt)} — {o.cerradoAt ? fecha(o.cerradoAt) : "abierto"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
