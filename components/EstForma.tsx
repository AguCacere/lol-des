"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import type { FilaWinrate } from "@/lib/radiografia";
import { ROLES, formatRelativeTime, tierFor } from "@/lib/ladder";
import { tonoDeWinrate, winrateExacto, winrateTexto } from "@/lib/winrate";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";

/**
 * El estado de forma: UNA clasificación donde antes había dos tablas.
 *
 * "Quién está on fire" y "Mayor winrate" eran dos bloques enormes, uno abajo
 * del otro, contando cosas parecidas de la misma gente: las últimas diez y
 * el winrate del período. Separados obligaban a cruzarlos de memoria —
 * "¿este que viene ganando, cuántas jugó?"— y juntos son una sola lectura.
 *
 * Dos decisiones de composición sostienen el bloque:
 *
 * 1. **La línea del 50% atraviesa la lista entera.** Cada fila dibuja su
 *    segmento de eje de borde a borde de su alto, así que las filas pegadas
 *    forman una sola vertical continua. Eso convierte una columna de barras
 *    sueltas en un gráfico: se ve de un vistazo quién está de qué lado.
 * 2. **No hay una card por fila.** La estructura la hacen la línea fina de
 *    separación, la alineación y el eje. Una fila solo gana superficie
 *    cuando está abierta, que es cuando de verdad es "un elemento
 *    seleccionado" y no "una fila más".
 *
 * Ningún número cambió de cálculo: son los mismos que antes salían en dos
 * listas, pegados por persona en lib/radiografia.ts.
 */

/**
 * Piso de la escala, en puntos porcentuales. Un grupo entre 48% y 53% no
 * puede dibujarse con el mejor a fondo de escala: exageraría cinco puntos
 * hasta que parezcan un abismo.
 */
const ESCALA_MINIMA = 6;

function Fila({
  f,
  puesto,
  escala,
  player,
  abierta,
  onAbrir,
  version,
}: {
  f: FilaWinrate;
  puesto: number | null;
  escala: number;
  player: Player | undefined;
  abierta: boolean;
  onAbrir: () => void;
  version: string | null;
}) {
  const tono = tonoDeWinrate(f.victorias, f.partidas);
  const netas = f.victorias - f.derrotas;
  const delta = winrateExacto(f.victorias, f.partidas) - 50;
  const largo = Math.min(50, (Math.abs(delta) / escala) * 50);
  const t = player ? tierFor(player.tierKey) : null;

  return (
    <>
      <button
        type="button"
        className={`ef-fila${abierta ? " abierta" : ""}${f.alcanzaMinimo ? "" : " flojo"}`}
        onClick={onAbrir}
        aria-expanded={abierta}
      >
        <span className="ef-puesto">{puesto ?? "—"}</span>
        <PlayerAvatar name={f.persona.name} iconUrl={f.persona.profileIconUrl} className="ef-cara" />
        <span className="ef-id">
          <span className="ef-nombre">{f.persona.name}</span>
          <span className="ef-sub">
            {t && player ? (
              <>
                <span style={{ color: t.fg }}>
                  {t.name} {player.division}
                </span>
                <span className="ef-punto">·</span>
                {ROLES[player.role].label}
              </>
            ) : null}
          </span>
        </span>

        {/* Las últimas diez. El color nunca viaja solo: al lado van el V/D y
            el porcentaje, así que en daltonismo no se pierde nada. */}
        {f.forma ? (
          <span className="ef-tira" title={`Últimas 10: ${f.forma.victorias}V ${f.forma.derrotas}D`}>
            {f.forma.ultimas.map((win, i) => (
              <span key={i} className={`ef-pip ${win ? "good" : "bad"}`} />
            ))}
          </span>
        ) : (
          <span className="ef-tira" />
        )}

        <span className="ef-partidas">{f.partidas}</span>

        <span className="ef-eje">
          {/* Sin barra abajo del mínimo, y no es prolijidad: la escala sale de
              los ranqueados, así que un 75% sobre 8 partidas se pasa de
              escala y dibuja la barra MÁS LARGA de la clasificación justo
              abajo del renglón que dice que no entra. La fila se queda con
              su winrate y su tira, que es lo que se puede leer sin mentir. */}
          {f.alcanzaMinimo ? <span className={`ef-barra ${tono}`} style={{ width: `${largo}%` }} /> : null}
          {/* El segmento de eje de esta fila. Pegado al de arriba y al de
              abajo, forman la vertical del 50% de toda la lista. */}
          <span className="ef-cero" />
        </span>

        <span className={`ef-wr ${tono}`}>{winrateTexto(f.victorias, f.partidas)}</span>
        <span className={`ef-balance ${netas > 0 ? "good" : netas < 0 ? "bad" : "neutral"}`}>
          {netas >= 0 ? "+" : ""}
          {netas}
        </span>
      </button>

      {abierta ? (
        <div className="ef-detalle">
          <div className="ef-dato">
            <span className="ef-dato-et">Mejor racha</span>
            <span className="ef-dato-val">{f.mejorRacha >= 2 ? `${f.mejorRacha} al hilo` : "—"}</span>
          </div>
          <div className="ef-dato">
            <span className="ef-dato-et">Días jugados</span>
            <span className="ef-dato-val">{f.dias}</span>
          </div>
          <div className="ef-dato">
            <span className="ef-dato-et">Puntos de liga</span>
            <span className={`ef-dato-val ${f.lpDelta && f.lpDelta > 0 ? "good" : f.lpDelta && f.lpDelta < 0 ? "bad" : ""}`}>
              {f.lpDelta === null ? "—" : `${f.lpDelta > 0 ? "+" : ""}${f.lpDelta}`}
            </span>
          </div>
          {f.campeon ? (
            <div className="ef-dato ef-dato-campeon">
              <span className="ef-dato-et">Más jugado</span>
              <span className="ef-dato-val ef-dato-champ">
                <ChampIcon champ={f.campeon.champion} version={version} className="ef-champ-icono" />
                {f.campeon.champion}
                <span className="ef-dato-fino">
                  {f.campeon.victorias}V · {f.campeon.partidas - f.campeon.victorias}D
                </span>
              </span>
            </div>
          ) : null}
          {f.forma ? (
            <div className="ef-dato">
              <span className="ef-dato-et">Últimas 10</span>
              <span className="ef-dato-val">
                {f.forma.victorias}V · {f.forma.derrotas}D{" "}
                <span className={`ef-dato-fino ${f.forma.contraSuPromedio > 0 ? "good" : f.forma.contraSuPromedio < 0 ? "bad" : ""}`}>
                  {f.forma.contraSuPromedio > 0 ? "+" : ""}
                  {f.forma.contraSuPromedio.toFixed(1).replace(".", ",")} pp vs. lo suyo
                </span>
              </span>
            </div>
          ) : null}
          {f.forma ? (
            <div className="ef-dato">
              <span className="ef-dato-et">Última partida</span>
              <span className="ef-dato-val">{formatRelativeTime(f.forma.ultimaEl)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function EstForma({
  filas,
  players,
  minimo,
  etiqueta,
  ddragonVersion,
}: {
  filas: FilaWinrate[];
  players: Player[];
  minimo: number;
  etiqueta: string;
  ddragonVersion: string | null;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const porClave = new Map(players.map((p) => [`${p.name}#${p.tag}`, p]));

  if (filas.length === 0) {
    return (
      <section className="ef">
        <div className="section-head">
          <h2>Estado de forma</h2>
        </div>
        <p className="ef-nadie">Nadie jugó una ranked en este período.</p>
      </section>
    );
  }

  const ranqueados = filas.filter((f) => f.alcanzaMinimo);
  const cortos = filas.filter((f) => !f.alcanzaMinimo);
  // La escala sale SOLO de los ranqueados: uno con tres partidas y 100% la
  // estiraría hasta dejar a todos los demás pegados a la línea.
  const escala = Math.max(ESCALA_MINIMA, ...ranqueados.map((f) => Math.abs(f.winrate - 50)));

  const fila = (f: FilaWinrate, puesto: number | null) => (
    <Fila
      key={f.persona.puuid}
      f={f}
      puesto={puesto}
      escala={escala}
      player={porClave.get(`${f.persona.name}#${f.persona.tag}`)}
      abierta={abierta === f.persona.puuid}
      onAbrir={() => setAbierta((cur) => (cur === f.persona.puuid ? null : f.persona.puuid))}
      version={ddragonVersion}
    />
  );

  return (
    <section className="ef">
      <div className="section-head">
        <h2>Estado de forma</h2>
        <span className="meta">
          {etiqueta} · las últimas 10 y el winrate del período
          <InfoTip
            align="end"
            text={`La vertical es el 50%: donde ganás tantas como perdés. A la derecha estás arriba, a la izquierda abajo, y la escala se acomoda al grupo. Los cuadraditos son las últimas 10 partidas de cada uno, de la más nueva a la más vieja — esas son de siempre, no del período. Tocá una fila para abrirla.`}
          />
        </span>
      </div>

      {/* Los rótulos de columna, sin banda ni fondo: son una línea de texto
          chiquito apoyada en la misma grilla que las filas. */}
      <div className="ef-rotulos">
        <span />
        <span />
        <span />
        <span className="ef-rot-tira">Últimas 10</span>
        <span className="ef-rot-partidas">Partidas</span>
        <span className="ef-rot-eje">
          <span className="ef-rot-menos">debajo del 50%</span>
          <span className="ef-rot-mas">encima</span>
        </span>
        <span className="ef-rot-wr">WR</span>
        <span className="ef-rot-bal">Bal.</span>
      </div>

      <div className="ef-lista">{ranqueados.map((f, i) => fila(f, i + 1))}</div>

      {cortos.length > 0 ? (
        <>
          {/* No se esconden: se separan. Están abajo del mínimo del período,
              así que no compiten en el ranking, pero desaparecer sin decir
              por qué era peor que mostrarlos apagados. */}
          <p className="ef-corte">
            Abajo de {minimo} partidas en el período — se ven, pero no entran al ranking
          </p>
          <div className="ef-lista ef-lista-flojos">{cortos.map((f) => fila(f, null))}</div>
        </>
      ) : null}
    </section>
  );
}
