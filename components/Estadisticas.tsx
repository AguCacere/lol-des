"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import {
  PERIODOS,
  VENTANA_FORMA,
  type FilaCampeon,
  type FilaForma,
  type Periodo,
  type Radiografia,
  type RecordGrupo,
} from "@/lib/radiografia";
import { formatRelativeTime } from "@/lib/ladder";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { TopWinrate } from "./TopWinrate";

/**
 * La pestaña Estadísticas.
 *
 * Lo que tenía antes eran tres rankings de "toda la historia" que no se movían
 * de una semana a la otra, así que la pestaña se abría una vez y nunca más.
 * Lo que hace ahora es contestar cuatro preguntas distintas, en este orden:
 *
 *   ¿qué pasó en el período? → Destacados
 *   ¿quién está bien AHORA?  → La forma
 *   ¿quién es mejor?         → Winrate y especialistas
 *   ¿qué quedó para siempre? → Récords
 *
 * Y toda cifra viaja con su muestra. El único trabajo que hace este archivo
 * es elegir la ventana y dibujar: los números salen enteros de
 * lib/radiografia.ts, que se calcula en el servidor.
 */

/** Cuántas filas de cada lista se muestran antes de plegar el resto. */
const FILAS_VISIBLES = 5;

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
}

/**
 * La tira de diez resultados, de la más nueva a la más vieja.
 *
 * Un cuadradito por partida y no un número: diez resultados en fila dicen de
 * un vistazo si viene ganando de entrada o si remontó sobre el final, y eso
 * no cabe en un "6-4". El color NUNCA está solo — al lado va el 6V·4D y el
 * porcentaje, así que en daltonismo no se pierde nada.
 */
function TiraDeForma({ ultimas }: { ultimas: boolean[] }) {
  return (
    <span className="rd-tira" aria-hidden>
      {ultimas.map((win, i) => (
        <span key={i} className={`rd-pip ${win ? "good" : "bad"}`} />
      ))}
    </span>
  );
}

function ListaDeCampeones({
  titulo,
  ayuda,
  filas,
  version,
  vacio,
}: {
  titulo: string;
  ayuda: string;
  filas: FilaCampeon[];
  version: string | null;
  vacio: string;
}) {
  return (
    <div className="rd-col">
      <h3 className="rd-h3">
        {titulo}
        <InfoTip text={ayuda} />
      </h3>
      {filas.length === 0 ? (
        <p className="rd-vacio">{vacio}</p>
      ) : (
        <ul className="rd-lista">
          {filas.map((f) => (
            <li className="rd-camp" key={`${f.persona.puuid}|${f.champion}`}>
              <ChampIcon champ={f.champion} version={version} className="rd-camp-icono" />
              <span className="rd-camp-id">
                <span className="rd-camp-nombre">{f.champion}</span>
                <span className="rd-camp-quien">{f.persona.name}</span>
              </span>
              {/* Las partidas ANTES del porcentaje y no después: es el número
                  que decide si el porcentaje se puede creer, así que se lee
                  primero. */}
              <span className="rd-camp-muestra">
                {f.victorias}V · {f.derrotas}D
              </span>
              <span className={`rd-camp-wr ${tonoDeWinrate(f.victorias, f.partidas)}`}>
                {winrateTexto(f.victorias, f.partidas)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Records({ records, lpDesde }: { records: RecordGrupo[]; lpDesde: string | null }) {
  if (records.length === 0) return null;
  // Los récords de LP no pueden ser más viejos que la primera foto guardada.
  // Decirlo es la diferencia entre un récord y una mentira cómoda: el grupo
  // juega desde abril y las fotos de LP arrancan en agosto.
  const deLp = records.some((r) => r.clave === "subidaDia" || r.clave === "caidaDia" || r.clave === "pico");
  return (
    <section>
      <div className="section-head">
        <h2>Récords de Grieta Central</h2>
        {deLp && lpDesde ? <span className="meta">Los de puntos, desde el {fecha(lpDesde)} — que es cuando se empezaron a guardar</span> : null}
      </div>
      <div className="rd-records">
        {records.map((r) => (
          <div className="rd-record" key={r.clave}>
            <span className="rd-record-titulo">{r.titulo}</span>
            <span className="rd-record-valor">{r.valor}</span>
            <span className="rd-record-quien">
              {r.persona ? <PlayerAvatar name={r.persona.name} iconUrl={r.persona.profileIconUrl} className="rd-record-avatar" /> : null}
              {r.quien}
            </span>
            <span className="rd-record-pie">
              {r.contexto}
              {r.cuando ? ` · ${fecha(r.cuando)}` : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Forma({ filas }: { filas: FilaForma[] }) {
  const [todos, setTodos] = useState(false);
  if (filas.length === 0) return null;
  const visibles = todos ? filas : filas.slice(0, FILAS_VISIBLES);
  return (
    <section>
      <div className="section-head">
        <h2>Quién está on fire</h2>
        <span className="meta">Las últimas {VENTANA_FORMA} de cada uno</span>
      </div>
      <div className="rd-forma">
        {visibles.map((f) => (
          <div className="rd-forma-fila" key={f.persona.puuid}>
            <PlayerAvatar name={f.persona.name} iconUrl={f.persona.profileIconUrl} className="rd-forma-avatar" />
            <span className="rd-forma-id">
              <span className="rd-forma-nombre">{f.persona.name}</span>
              <span className="rd-forma-pie">última {formatRelativeTime(f.ultimaEl)}</span>
            </span>
            <TiraDeForma ultimas={f.ultimas} />
            <span className="rd-forma-vd">
              {f.victorias}V · {f.derrotas}D
            </span>
            <span className={`rd-forma-wr ${tonoDeWinrate(f.victorias, f.victorias + f.derrotas)}`}>
              {winrateTexto(f.victorias, f.victorias + f.derrotas)}
            </span>
            {/* Contra SU promedio, no contra el 50%. Alguien que vive en 57%
                y viene de 6-4 no está on fire: está por debajo de lo suyo. */}
            <span
              className={`rd-forma-delta ${f.contraSuPromedio > 0 ? "good" : f.contraSuPromedio < 0 ? "bad" : "neutral"}`}
              title="Diferencia contra su propio winrate de todo lo guardado"
            >
              {f.contraSuPromedio > 0 ? "+" : ""}
              {f.contraSuPromedio.toFixed(1).replace(".", ",")} pp
            </span>
          </div>
        ))}
      </div>
      {filas.length > FILAS_VISIBLES ? (
        <button type="button" className="rd-mas" onClick={() => setTodos((v) => !v)}>
          {todos ? "Ver menos" : `Ver los ${filas.length}`}
        </button>
      ) : null}
    </section>
  );
}

export function Estadisticas({
  radiografia,
  players,
  ddragonVersion,
}: {
  radiografia: Radiografia | null;
  players: Player[];
  ddragonVersion: string | null;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  if (!radiografia) {
    return (
      <div className="empty-state">
        <strong>Todavía no hay partidas guardadas</strong>
        Esta pestaña se arma sola en cuanto el grupo juegue algunas ranked.
      </div>
    );
  }

  const v = radiografia.ventanas[periodo];
  const etiqueta = PERIODOS.find((p) => p.clave === periodo)?.etiqueta ?? "";

  return (
    <>
      {/* El filtro arriba de todo y no adentro de una sección: manda sobre
          media pantalla, así que tiene que verse antes que lo que cambia. */}
      <div className="rd-barra">
        <div className="rd-filtro" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.clave}
              type="button"
              className={`rd-filtro-op ${p.clave === periodo ? "activo" : ""}`}
              aria-pressed={p.clave === periodo}
              onClick={() => setPeriodo(p.clave)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <span className="rd-muestra">
          {v.partidas === 0
            ? "Ninguna partida en este período"
            : `${v.partidas} partidas de ${v.jugadores} ${v.jugadores === 1 ? "invocador" : "invocadores"}`}
          {periodo === "temporada" && radiografia.desde ? ` · desde el ${fecha(radiografia.desde)}` : ""}
        </span>
      </div>

      {v.destacados.length > 0 ? (
        <section>
          <div className="section-head">
            <h2>Lo que pasó en {etiqueta.toLowerCase() === "temporada" ? "la temporada" : `los últimos ${etiqueta}`}</h2>
          </div>
          <div className="rd-destacados">
            {v.destacados.map((d) => (
              <div className={`rd-destacado ${d.tono}`} key={d.clave}>
                <span className="rd-destacado-titulo">{d.titulo}</span>
                <span className="rd-destacado-valor">{d.valor}</span>
                <span className="rd-destacado-quien">
                  <PlayerAvatar name={d.persona.name} iconUrl={d.persona.profileIconUrl} className="rd-destacado-avatar" />
                  {d.persona.name}
                </span>
                <span className="rd-destacado-pie">{d.contexto}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Forma filas={radiografia.forma} />

      <TopWinrate filas={v.winrate} players={players} periodo={etiqueta} minimo={v.minimoWinrate} />

      <section>
        <div className="section-head">
          <h2>Campeones</h2>
          <span className="meta">{etiqueta}</span>
        </div>
        <div className="rd-campeones">
          <ListaDeCampeones
            titulo="Especialistas"
            ayuda={`Los mejores registros con un campeón, con al menos ${v.minimoEspecialista} partidas en el período. Se ordenan descontando la incertidumbre de la muestra, así que un 5 de 5 no le pasa por arriba a un 14 de 20.`}
            filas={v.especialistas}
            version={ddragonVersion}
            vacio={`Todavía nadie llegó a ${v.minimoEspecialista} partidas con un mismo campeón en este período.`}
          />
          <ListaDeCampeones
            titulo="Los más jugados"
            ayuda="Los campeones con más partidas del período, sin mínimo. Acá el winrate es al pasar: lo que ordena es cuánto se los juega."
            filas={v.masJugados}
            version={ddragonVersion}
            vacio="Sin partidas en este período."
          />
        </div>
      </section>

      <Records records={radiografia.records} lpDesde={radiografia.lpDesde} />
    </>
  );
}
