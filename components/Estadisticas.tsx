"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { PERIODOS, type Periodo, type Radiografia } from "@/lib/radiografia";
import { EstHistoria } from "./EstHistoria";
import { EstForma } from "./EstForma";
import { EstCampeones } from "./EstCampeones";
import { EstRecords } from "./EstRecords";

/**
 * La pestaña Estadísticas.
 *
 * Este archivo es el armazón y nada más: elige la ventana y ordena las
 * cuatro piezas. Lo que había antes era un dashboard —título, rectángulo,
 * filas, separador, título, rectángulo, filas— y el problema no eran los
 * estilos de cada rectángulo sino que todo usaba la misma maqueta, así que
 * ninguna sección se distinguía de la de arriba y la página se escaneaba en
 * vez de leerse.
 *
 * Ahora cada pieza tiene su propia forma y su propia interacción:
 *
 *   EstHistoria   una portada editorial: un protagonista, notas al costado
 *   EstForma      UNA clasificación, con el eje del 50% atravesándola y
 *                 filas que se abren (antes eran DOS tablas seguidas)
 *   EstCampeones  un selector y el arte del campeón como protagonista
 *                 (antes eran dos tablas simultáneas)
 *   EstRecords    una pared con tres jerarquías (antes, siete divs iguales)
 *
 * El selector de período vive acá arriba, sobre el fondo de la página y sin
 * caja, porque manda sobre TODO lo de abajo: es el contexto de la pantalla,
 * no el control de un bloque.
 *
 * Ningún cálculo vive acá. Todo sale armado de lib/radiografia.ts.
 */
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
    <div className="est">
      <div className="est-contexto">
        <div className="est-periodo" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.clave}
              type="button"
              className={`est-periodo-op${p.clave === periodo ? " activo" : ""}`}
              aria-pressed={p.clave === periodo}
              onClick={() => setPeriodo(p.clave)}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <span className="est-muestra">
          {v.partidas === 0
            ? "Ninguna partida en este período"
            : `${v.partidas} partidas de ${v.jugadores} ${v.jugadores === 1 ? "invocador" : "invocadores"}`}
          {periodo === "temporada" && radiografia.desde
            ? ` · desde el ${new Date(radiografia.desde).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" })}`
            : ""}
        </span>
      </div>

      <EstHistoria historia={v.historia} etiqueta={etiqueta} />
      <EstForma
        filas={v.winrate}
        players={players}
        minimo={v.minimoWinrate}
        etiqueta={etiqueta}
        ddragonVersion={ddragonVersion}
      />
      <EstCampeones
        especialistas={v.especialistas}
        masJugados={v.masJugados}
        minimoEspecialista={v.minimoEspecialista}
        etiqueta={etiqueta}
        ddragonVersion={ddragonVersion}
      />
      <EstRecords records={radiografia.records} lpDesde={radiografia.lpDesde} />
    </div>
  );
}
