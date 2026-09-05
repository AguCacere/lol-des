"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Desplegable propio, en lugar del <select> nativo.
 *
 * El nativo se ve como el sistema operativo y no como la app: en una interfaz
 * casi negra, la lista se abre blanca con la fila seleccionada en azul
 * Windows. Eso no se puede arreglar con CSS — el navegador dibuja esa lista
 * fuera de la página y los estilos sobre <option> se ignoran en casi todos
 * lados.
 *
 * Entonces es un botón + una lista propia, con lo que el nativo daba gratis y
 * hay que reponer a mano: rol de listbox para lectores de pantalla, flechas
 * para moverse, Enter y Escape, Home/End, click afuera para cerrar, y el foco
 * que vuelve al botón al cerrar.
 *
 * Es el desplegable de TODA la app: cualquier menú nuevo va por acá.
 */

export interface OpcionSelect {
  value: string;
  label: string;
  /** Segunda línea opcional, para cuando la etiqueta sola no alcanza (un rango, un rol). */
  detalle?: string;
}

export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: OpcionSelect[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const indiceActual = Math.max(0, options.findIndex((o) => o.value === value));
  const elegida = options[indiceActual];

  // Click afuera. Se escucha en la fase de captura para que un click sobre
  // otro control lo cierre igual, aunque ese control frene la propagación.
  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [abierto]);

  /**
   * El cursor arranca en la opción elegida y no en la primera: con una lista
   * de quince invocadores, abrir arriba de todo esconde la que ya está
   * seleccionada. Se hace acá y no en un efecto para no encadenar dos
   * renders por cada apertura.
   */
  function abrir(v: boolean) {
    setAbierto(v);
    if (v) setCursor(indiceActual);
  }

  function elegir(i: number) {
    const o = options[i];
    if (o) onChange(o.value);
    setAbierto(false);
    botonRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!abierto) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      elegir(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAbierto(false);
      botonRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!abierto) return;
    listaRef.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor, abierto]);

  return (
    <div className={`sel ${className}`} ref={wrapRef}>
      <button
        ref={botonRef}
        type="button"
        className={`sel-btn${abierto ? " is-open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? `${id}-lista` : undefined}
        onClick={() => abrir(!abierto)}
        onKeyDown={onKeyDown}
      >
        <span className="sel-btn-label">{elegida?.label ?? "—"}</span>
        <svg className="sel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {abierto && (
        <div className="sel-lista" id={`${id}-lista`} role="listbox" aria-label={ariaLabel} ref={listaRef} tabIndex={-1}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-marcada={o.value === value}
              data-cursor={i === cursor}
              className={`sel-opcion${i === cursor ? " en-cursor" : ""}${o.value === value ? " elegida" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => elegir(i)}
              onKeyDown={onKeyDown}
            >
              <span className="sel-opcion-label">{o.label}</span>
              {o.detalle && <span className="sel-opcion-detalle">{o.detalle}</span>}
              {o.value === value && (
                <svg className="sel-tilde" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
