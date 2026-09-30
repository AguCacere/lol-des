"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import type { FilaWinrate } from "@/lib/radiografia";
import { rangoTexto, ROLES, formatRelativeTime, tierFor } from "@/lib/ladder";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { ChampIcon } from "./ChampIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";

/**
 * El estado de forma: una clasificación deportiva compacta.
 *
 * Acá vivían dos cosas que se fueron, y por la misma razón:
 *
 * 1. **La barra de "distancia al 50%" con su eje.** Gastaba unos 400px de
 *    ancho para decir exactamente lo que ya dice el 58,3% verde al lado. No
 *    todo dato necesita una visualización: un porcentaje es de los números
 *    más fáciles de leer que hay, y ponerle una barra al lado no lo hace más
 *    claro — lo hace más grande. Con la barra, sola esta sección se comía
 *    una pantalla entera.
 * 2. **Los rótulos "DEBAJO DEL 50%" / "ENCIMA".** Tercera vez que se decía
 *    lo mismo en la misma fila.
 *
 * Lo que SÍ se quedó es la tira de las últimas diez, porque cuenta algo que
 * el porcentaje no puede contar: una SECUENCIA. "Viene de perder cuatro" y
 * "perdió cuatro repartidas" dan el mismo winrate y no son lo mismo. Eso sí
 * justifica dibujo — ahora en puntos de 6px en vez de barritas verticales.
 *
 * Y las partidas pasaron a ser el récord: "35V · 25D" dice volumen Y
 * resultado, donde "60" solo decía volumen.
 */

/** Cuántos se ven sin desplegar. El resto está a un clic, no a otra página. */
const VISIBLES = 6;

function Fila({
  f,
  puesto,
  player,
  abierta,
  onAbrir,
  version,
}: {
  f: FilaWinrate;
  puesto: number | null;
  player: Player | undefined;
  abierta: boolean;
  onAbrir: () => void;
  version: string | null;
}) {
  const tono = tonoDeWinrate(f.victorias, f.partidas);
  const netas = f.victorias - f.derrotas;
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
          {t && player ? (
            <span className="ef-sub">
              <span style={{ color: t.fg }}>
                {rangoTexto(player.tierKey, player.division)}
              </span>
              <span className="ef-punto">·</span>
              {ROLES[player.role].label}
            </span>
          ) : null}
        </span>

        {/* Las últimas diez y el récord van juntos: son las dos caras de
            "cómo viene". En teléfono bajan al segundo renglón como una sola
            unidad, sin tener que partirlos. */}
        <span className="ef-forma">
          {f.forma ? (
            <span className="ef-puntos" title={`Últimas 10: ${f.forma.victorias}V ${f.forma.derrotas}D`}>
              {f.forma.ultimas.map((win, i) => (
                <span key={i} className={`ef-punto-r ${win ? "good" : "bad"}`} />
              ))}
            </span>
          ) : (
            <span className="ef-puntos" />
          )}
          <span className="ef-record">
            {f.victorias}V · {f.derrotas}D
          </span>
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
            <span className="ef-dato-et">Partidas</span>
            <span className="ef-dato-val">{f.partidas}</span>
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
  const [todos, setTodos] = useState(false);
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

  // El orden es el que viene de lib/radiografia.ts y no se toca acá: los que
  // llegan al mínimo primero, y adentro por winrate. "Los primeros seis" son
  // los primeros seis de ESE orden — no hay ningún puntaje de forma nuevo.
  //
  // El puesto y el corte se calculan de una pasada sobre la lista ENTERA, no
  // sobre la recortada: así el número de puesto es el mismo esté desplegada
  // o no, y el renglón del mínimo cae donde corresponde aunque el corte
  // quede adentro de los primeros seis.
  let vanRanqueados = 0;
  const conPuesto = filas.map((f, i) => {
    if (f.alcanzaMinimo) vanRanqueados += 1;
    return {
      f,
      puesto: f.alcanzaMinimo ? vanRanqueados : null,
      primerFlojo: !f.alcanzaMinimo && (i === 0 || filas[i - 1].alcanzaMinimo),
    };
  });
  const visibles = todos ? conPuesto : conPuesto.slice(0, VISIBLES);

  return (
    <section className="ef">
      <div className="section-head">
        <h2>Estado de forma</h2>
        <span className="meta">
          Últimas 10 · {etiqueta.toLowerCase()}
          <InfoTip
            align="end"
            text={`Los puntos son las últimas 10 partidas de cada uno, de la más nueva a la más vieja, y son de siempre — no del período. El récord, el winrate y el balance sí son del período. Abajo de ${minimo} partidas no se entra al ranking, pero se muestra igual. Tocá una fila para abrirla.`}
          />
        </span>
      </div>

      {/* Rótulos discretos, no una banda de encabezado: una línea de texto
          chiquito apoyada en la misma grilla que las filas. */}
      <div className="ef-rotulos">
        <span />
        <span />
        <span className="ef-rot-jugador">Jugador</span>
        <span className="ef-rot-forma">
          <span>Forma</span>
          <span className="ef-rot-record">Récord</span>
        </span>
        <span className="ef-rot-wr">WR</span>
        <span className="ef-rot-bal">Bal.</span>
      </div>

      <div className="ef-lista">
        {visibles.map(({ f, puesto, primerFlojo }) => (
          <div key={f.persona.puuid} className="ef-envoltorio">
            {/* No se esconden: se separan. El mínimo del período decide
                quién entra al ranking, no quién existe. */}
            {primerFlojo ? (
              <p className="ef-corte">Abajo de {minimo} partidas en el período — no entran al ranking</p>
            ) : null}
            <Fila
              f={f}
              puesto={puesto}
              player={porClave.get(`${f.persona.name}#${f.persona.tag}`)}
              abierta={abierta === f.persona.puuid}
              onAbrir={() => setAbierta((cur) => (cur === f.persona.puuid ? null : f.persona.puuid))}
              version={ddragonVersion}
            />
          </div>
        ))}
      </div>

      {filas.length > VISIBLES ? (
        <button type="button" className="ef-ver-mas" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
          {todos ? "Mostrar menos" : `Ver los ${filas.length}`}
          <span className="ef-flecha" aria-hidden>
            {todos ? "↑" : "↓"}
          </span>
        </button>
      ) : null}
    </section>
  );
}
