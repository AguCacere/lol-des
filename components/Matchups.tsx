"use client";

import { useState } from "react";
import type { ChampionMatchups, Matchup } from "@/lib/matchups";
import { MATCHUP_MIN_GAMES } from "@/lib/matchups";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";

/** Una fila de rival dentro de un campeón desplegado. */
function OpponentRow({ m, ddragonVersion }: { m: Matchup; ddragonVersion: string | null }) {
  return (
    <div className="matchup-row">
      {/* Sin el ícono propio: acá ya está implícito en la cabecera del grupo,
          repetirlo en cada fila era la mitad del ruido de la lista plana. */}
      <ChampIcon champ={m.opponent} version={ddragonVersion} className="matchup-champ" />
      <span className="matchup-names">
        <span className="matchup-name">{championLabel(m.opponent)}</span>
      </span>
      {/* Misma barra V/D del ladder (.wr-bar), no una nueva: es el mismo dato
          con el mismo significado. */}
      <span className="matchup-bar wr-bar">
        <span className="wr-seg win" style={{ flex: m.wins }} />
        <span className="wr-seg loss" style={{ flex: m.losses }} />
      </span>
      {m.avgGoldDiff15 !== null && (
        <span className={`matchup-gd ${m.avgGoldDiff15 >= 0 ? "gd-pos" : "gd-neg"}`}>
          {m.avgGoldDiff15 > 0 ? "+" : ""}
          {m.avgGoldDiff15.toLocaleString("es-AR")} oro @15&apos;
        </span>
      )}
      <span className="matchup-record">
        <span className={`matchup-wr ${m.winrate >= 50 ? "good" : "bad"}`}>{m.winrate}%</span>
        <span className="matchup-games">
          {m.wins}V-{m.losses}D
        </span>
      </span>
    </div>
  );
}

/** Un campeón propio: cabecera con su total, y los rivales al desplegar. */
function ChampionGroup({
  group,
  ddragonVersion,
  defaultOpen,
}: {
  group: ChampionMatchups;
  ddragonVersion: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`matchup-group${open ? " is-open" : ""}`}>
      <button type="button" className="matchup-group-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChampIcon champ={group.champ} version={ddragonVersion} className="matchup-champ lg" />
        <span className="matchup-names">
          <span className="matchup-name">{championLabel(group.champ)}</span>
          <span className="matchup-opp">
            {group.opponents.length} {group.opponents.length === 1 ? "rival" : "rivales"} · {group.games} partidas
          </span>
        </span>
        <span className="matchup-bar wr-bar">
          <span className="wr-seg win" style={{ flex: group.wins }} />
          <span className="wr-seg loss" style={{ flex: group.losses }} />
        </span>
        <span className="matchup-record">
          <span className={`matchup-wr ${group.winrate >= 50 ? "good" : "bad"}`}>{group.winrate}%</span>
          <span className="matchup-games">
            {group.wins}V-{group.losses}D
          </span>
        </span>
        <svg
          className="matchup-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="matchup-opponents">
          {group.opponents.map((m) => (
            <OpponentRow key={m.opponent} m={m} ddragonVersion={ddragonVersion} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Enfrentamientos de línea" — con qué campeón contra cuál te va bien y con
 * cuál mal, sobre tus propias partidas (ver lib/matchups.ts).
 *
 * Tres decisiones de lectura:
 *
 * 1. Agrupado por TU campeón, desplegable. Plana, la lista crecía con cada
 *    rival y se comía la pantalla; así son unas pocas filas y el total del
 *    campeón queda a la vista sin tener que sumarlo a ojo.
 * 2. La cantidad de partidas va al lado del winrate, no escondida en un
 *    tooltip. Con 2 o 3 partidas el porcentaje no significa casi nada, y
 *    mostrarlo grande y solo sería vender una certeza que no tenemos.
 * 3. El oro a los 15 aparece cuando está, porque distingue dos derrotas
 *    distintas: perder la partida ganando la línea no es el mismo problema
 *    que perder la línea.
 */
export function Matchups({
  matchups,
  ddragonVersion,
}: {
  matchups: ChampionMatchups[];
  ddragonVersion: string | null;
}) {
  if (matchups.length === 0) {
    return (
      <div className="empty-state">
        <strong>Todavía no hay enfrentamientos repetidos</strong>
        Hacen falta al menos {MATCHUP_MIN_GAMES} partidas con el mismo campeón contra el mismo rival de línea. Si rotás
        mucho de campeón, tarda en llenarse: se necesita que el cruce se repita, no solo jugar seguido.
      </div>
    );
  }

  return (
    <div className="matchup-list">
      {matchups.map((g, i) => (
        // El primero abierto: es el campeón del que más sabemos, y con todo
        // cerrado la sección se ve como una lista de campeones sin datos.
        <ChampionGroup key={g.champ} group={g} ddragonVersion={ddragonVersion} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
