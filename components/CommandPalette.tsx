"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/types";
import type { TabKey } from "./TabNav";
import { ROLES, tierFor } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";

/**
 * Paleta de comandos (⌘K / Ctrl+K): saltar a cualquier invocador o a
 * cualquier pestaña sin sacar las manos del teclado.
 *
 * Existe porque el buscador de arriba filtra la tabla pero no te lleva a
 * ningún lado: para ver el perfil de alguien hay que escribir, encontrarlo y
 * clickear la fila. Con diez o quince invocadores eso es un montón de
 * navegación para una app que se abre veinte veces por día.
 *
 * Busca por nombre, tag, rol y campeón principal — no solo por nombre: la
 * mitad de las veces uno se acuerda de "el que juega Yasuo" antes que del
 * Riot ID exacto.
 */

interface Opcion {
  id: string;
  titulo: string;
  detalle: React.ReactNode;
  /** Lo que se escribe para encontrarla, todo junto y en minúsculas. */
  busqueda: string;
  accion: () => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "ranking", label: "Ranking" },
  { key: "stats", label: "Estadísticas" },
  { key: "versus", label: "Cara a cara" },
  { key: "clash", label: "Clash" },
  { key: "team", label: "Equipo" },
];

export function CommandPalette({
  players,
  onPlayer,
  onTab,
}: {
  players: Player[];
  onPlayer: (key: string) => void;
  onTab: (tab: TabKey) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const opciones = useMemo<Opcion[]>(() => {
    const deJugadores: Opcion[] = players.map((p) => {
      const t = tierFor(p.tierKey);
      const clave = `${p.name}#${p.tag}`;
      return {
        id: `p:${clave}`,
        titulo: clave,
        // El color va en el rango y no en el nombre: el nombre es texto, y
        // pintarlo del color del tier hace que la lista parezca un semáforo
        // donde lo que cambia de color no es lo que el color significa.
        detalle: (
          <>
            <span style={{ color: t.fg }}>
              {t.name} {p.division}
            </span>{" "}
            · {ROLES[p.role].label} · {championLabel(p.mainChamp)}
          </>
        ),
        busqueda: `${clave} ${ROLES[p.role].label} ${championLabel(p.mainChamp)}`.toLowerCase(),
        accion: () => onPlayer(clave),
      };
    });
    const deTabs: Opcion[] = TABS.map((t) => ({
      id: `t:${t.key}`,
      titulo: t.label,
      detalle: "Ir a la sección",
      busqueda: `${t.label} seccion pestaña ir`.toLowerCase(),
      accion: () => onTab(t.key),
    }));
    return [...deJugadores, ...deTabs];
  }, [players, onPlayer, onTab]);

  const filtradas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return opciones;
    return opciones.filter((o) => o.busqueda.includes(texto));
  }, [opciones, q]);

  // ⌘K abre y cierra desde cualquier parte de la app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((v) => !v);
        setQ("");
        setCursor(0);
      }
      if (e.key === "Escape") setAbierta(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (abierta) inputRef.current?.focus();
  }, [abierta]);

  // El cursor puede quedar apuntando fuera de la lista después de filtrar.
  const indice = Math.min(cursor, Math.max(0, filtradas.length - 1));

  function elegir(o: Opcion | undefined) {
    if (!o) return;
    o.accion();
    setAbierta(false);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(Math.min(indice + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(Math.max(indice - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      elegir(filtradas[indice]);
    }
  }

  // La opción marcada tiene que seguir a la vista con las flechas, o navegar
  // con el teclado deja de servir apenas la lista pasa de diez.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('[data-marcada="true"]')?.scrollIntoView({ block: "nearest" });
  }, [indice, q]);

  if (!abierta) return null;

  return (
    <div className="cmdk-backdrop" onClick={() => setAbierta(false)} role="presentation">
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar invocador o sección"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmdk-input-row">
          <input
            ref={inputRef}
            className="cmdk-input"
            value={q}
            placeholder="Buscar invocador, rol, campeón o sección…"
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onInputKey}
            aria-label="Buscar"
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>

        <div className="cmdk-list" ref={listaRef}>
          {filtradas.length === 0 ? (
            <p className="cmdk-vacio">Nada que coincida con “{q}”.</p>
          ) : (
            filtradas.map((o, i) => (
              <button
                key={o.id}
                type="button"
                className={`cmdk-item${i === indice ? " marcada" : ""}`}
                data-marcada={i === indice}
                onMouseEnter={() => setCursor(i)}
                onClick={() => elegir(o)}
              >
                <span className="cmdk-item-titulo">{o.titulo}</span>
                <span className="cmdk-item-detalle">{o.detalle}</span>
              </button>
            ))
          )}
        </div>

        <div className="cmdk-pie">
          <span>
            <kbd className="cmdk-kbd">↑</kbd>
            <kbd className="cmdk-kbd">↓</kbd> moverse
          </span>
          <span>
            <kbd className="cmdk-kbd">enter</kbd> abrir
          </span>
          <span className="cmdk-pie-atajo">
            <kbd className="cmdk-kbd">⌘</kbd>
            <kbd className="cmdk-kbd">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
