"use client";

import { useState } from "react";
import type { FilaCampeon } from "@/lib/radiografia";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";

/**
 * El pool de campeones del grupo.
 *
 * Antes eran dos tablas una al lado de la otra —Especialistas | Más
 * jugados— y eso tenía dos problemas: volvía al patrón de "rectángulo con
 * filas", y mostraba simultáneamente dos listas que nadie necesita comparar
 * fila por fila. Son dos preguntas distintas y se hacen de a una.
 *
 * Ahora hay un solo selector y el espacio se reutiliza. El campeón pasa de
 * ser texto con un iconito de 28px a ser el objeto visual: el primero va
 * grande, con su arte, y el resto lo siguen en una tira. Lo que ordena no
 * cambió —Wilson para especialistas, partidas para los más jugados— solo
 * cambió qué manda en la pantalla.
 */
type Vista = "especialistas" | "jugados";

function Campeon({
  f,
  version,
  metrica,
}: {
  f: FilaCampeon;
  version: string | null;
  /** Qué número manda: el winrate o el volumen. Es lo único que cambia entre las dos vistas. */
  metrica: Vista;
}) {
  return (
    <li className="ec-item">
      <ChampIcon champ={f.champion} version={version} className="ec-arte" />
      <span className={`ec-dato ${metrica === "especialistas" ? tonoDeWinrate(f.victorias, f.partidas) : ""}`}>
        {metrica === "especialistas" ? winrateTexto(f.victorias, f.partidas) : f.partidas}
      </span>
      <span className="ec-dato-et">
        {metrica === "especialistas" ? `${f.victorias}V · ${f.derrotas}D` : "partidas"}
      </span>
      <span className="ec-champ">{f.champion}</span>
      <span className="ec-quien">{f.persona.name}</span>
      {metrica === "jugados" ? (
        <span className={`ec-secundario ${tonoDeWinrate(f.victorias, f.partidas)}`}>
          {winrateTexto(f.victorias, f.partidas)}
        </span>
      ) : null}
    </li>
  );
}

export function EstCampeones({
  especialistas,
  masJugados,
  minimoEspecialista,
  etiqueta,
  ddragonVersion,
}: {
  especialistas: FilaCampeon[];
  masJugados: FilaCampeon[];
  minimoEspecialista: number;
  etiqueta: string;
  ddragonVersion: string | null;
}) {
  const [vista, setVista] = useState<Vista>("especialistas");
  const filas = vista === "especialistas" ? especialistas : masJugados;
  const [primero, ...resto] = filas;

  return (
    <section className="ec">
      <div className="section-head">
        <h2>Campeones</h2>
        <span className="meta">
          {etiqueta}
          <InfoTip
            align="end"
            text={
              vista === "especialistas"
                ? `Los mejores registros con un campeón, con al menos ${minimoEspecialista} partidas en el período y récord ganador. Se ordenan descontando la incertidumbre de la muestra, así que un 5 de 5 no le pasa por arriba a un 14 de 20.`
                : "Los campeones con más partidas del período, sin mínimo. Acá el winrate va al costado: lo que ordena es cuánto se los juega."
            }
          />
        </span>
      </div>

      {/* Un solo selector. No hacen falta las dos listas a la vez. */}
      <div className="ec-tabs" role="group" aria-label="Qué mirar de los campeones">
        <button
          type="button"
          className={`ec-tab${vista === "especialistas" ? " activo" : ""}`}
          aria-pressed={vista === "especialistas"}
          onClick={() => setVista("especialistas")}
        >
          Especialistas
        </button>
        <button
          type="button"
          className={`ec-tab${vista === "jugados" ? " activo" : ""}`}
          aria-pressed={vista === "jugados"}
          onClick={() => setVista("jugados")}
        >
          Los más jugados
        </button>
      </div>

      {filas.length === 0 ? (
        <p className="ec-vacio">
          {vista === "especialistas"
            ? `Todavía nadie ganó con un mismo campeón al menos ${minimoEspecialista} veces en este período.`
            : "Sin partidas en este período."}
        </p>
      ) : (
        <div className="ec-cuerpo">
          {/* El primero grande. No es una card con más padding: es el mismo
              elemento con el arte a otra escala. */}
          <div className="ec-primero">
            <ChampIcon champ={primero.champion} version={ddragonVersion} className="ec-arte-grande" />
            <div className="ec-primero-texto">
              <span className="ec-primero-champ">{primero.champion}</span>
              <span className="ec-primero-quien">{primero.persona.name}</span>
              <span className={`ec-primero-dato ${tonoDeWinrate(primero.victorias, primero.partidas)}`}>
                {vista === "especialistas" ? winrateTexto(primero.victorias, primero.partidas) : `${primero.partidas} partidas`}
              </span>
              <span className="ec-primero-pie">
                {vista === "especialistas"
                  ? `${primero.victorias}V · ${primero.derrotas}D`
                  : `${winrateTexto(primero.victorias, primero.partidas)} · ${primero.victorias}V · ${primero.derrotas}D`}
              </span>
            </div>
          </div>

          {/* Los demás, en tira. Se desplaza de costado en pantallas chicas
              en vez de apilarse: quince centímetros de columna vertical es
              exactamente el scroll infinito que se quería sacar. */}
          {resto.length > 0 ? (
            <ul className="ec-tira">
              {resto.map((f) => (
                <Campeon key={`${f.persona.puuid}|${f.champion}`} f={f} version={ddragonVersion} metrica={vista} />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
