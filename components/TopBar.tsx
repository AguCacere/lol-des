"use client";

import { useEffect, useRef } from "react";
import { Cerradura } from "./Cerradura";
import { formatRelativeTime } from "@/lib/ladder";

export type AddStatus = { kind: "idle" } | { kind: "adding" } | { kind: "error"; message: string };

interface TopBarProps {
  /** Cuántos invocadores hay cargados — el subtítulo dice algo real en vez de una frase fija. */
  invocadores: number;
  /** Cuántos están en partida ahora mismo. */
  enVivo: number;
  /** Cuándo se trajeron los datos por última vez. Null mientras carga. */
  lastUpdated: string | null;
  /** Cuántos invocadores viene fallando el refresco. Casi siempre 0. */
  desactualizados: number;
  filterText: string;
  onFilterChange: (value: string) => void;
  onSubmit: () => void;
  canAdd: boolean;
  addStatus: AddStatus;
}

export function TopBar({ invocadores, enVivo, lastUpdated, desactualizados, filterText, onFilterChange, onSubmit, canAdd, addStatus }: TopBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        {/* El monograma GC con la lanza. Sale del PNG que subió el dueño
            (primer_iconov1.png, 1254px y 664KB), recortado al dibujo sólido y
            bajado a 207x256 / 27KB: el original tiene un 20% de margen
            transparente y un glow que a 34px de alto no se ve, solo pesa.
            El recorte deja algo de ese glow para que se desvanezca en vez de
            cortarse con un borde duro.

            Va con <img> y no con next/image por lo mismo que los avatares de
            campeón: es un icono chico de tamaño fijo, ya optimizado, y no
            justifica el wrapper. Y el alto manda sobre el ancho porque la
            marca es vertical (207x256) — encajarla en un cuadrado la haría
            ver más chica de lo que es. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- icono local chico de tamaño fijo, ya optimizado */}
        <img className="brand-mark" src="/icons/app/grieta-central.png" alt="" width={26} height={32} aria-hidden="true" />
        <div className="brand-text">
          <h1>Grieta Central</h1>
          <p className="brand-meta">
            {invocadores > 0 ? `${invocadores} invocadores` : "Ranked del grupo"}
            <span className="brand-sep">·</span>
            LAS
            {enVivo > 0 && (
              <>
                <span className="brand-sep">·</span>
                <span className="brand-live">
                  <span className="live-dot" />
                  {enVivo} en partida
                </span>
              </>
            )}
            {/* Vive acá y no en el encabezado del ladder porque es estado de
                los DATOS, no de esa tabla: vale igual en Estadísticas o en
                Equipo, y esta línea ya es la de estado ambiente. Allá arriba
                además obligaba al título a compartir renglón con dos cosas
                más, y en pantalla angosta las mandaba a un renglón propio. */}
            {lastUpdated && (
              <>
                <span className="brand-sep">·</span>
                actualizado {formatRelativeTime(lastUpdated)}
              </>
            )}
            {/* El aviso va SEPARADO de la fecha y no disfrazado de fecha
                vieja. Antes el cartel mostraba el refresco más viejo del
                grupo, así que un invocador trabado hacía decir "hace 21 min"
                con el cron corriendo cada 15 y todo el resto al día. */}
            {desactualizados > 0 && (
              <>
                <span className="brand-sep">·</span>
                <span className="brand-atrasados" title="No se pudieron refrescar en los últimos 35 minutos. Suele ser un error de la API de Riot para ese invocador.">
                  {desactualizados} sin actualizar
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <form
        className="search-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd && addStatus.kind !== "adding") onSubmit();
        }}
      >
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Buscar o agregar Riot ID, ej: Nombre#LAS"
          autoComplete="off"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
        />
        {/* La pista del atajo. Cambia a "agregar" cuando lo tipeado es un Riot
            ID completo, así que el mismo lugar dice qué va a pasar si apretás
            Enter. Va como <kbd> —no como <span>— porque es literalmente una
            tecla, y así el navegador y un lector de pantalla lo saben. */}
        <kbd className="search-hint">{canAdd ? "↵ agregar" : "/"}</kbd>
        {addStatus.kind === "adding" && <span className="search-status">Buscando en la Riot API…</span>}
        {addStatus.kind === "error" && <span className="search-status is-error">{addStatus.message}</span>}
      </form>

      {/* El candado al final de la barra: chico y al costado, porque mirar la
          app no lo necesita. Solo importa cuando vas a tocar algo. */}
      <Cerradura />
    </header>
  );
}
