"use client";

import { useEffect, useRef } from "react";

export type AddStatus = { kind: "idle" } | { kind: "adding" } | { kind: "error"; message: string };

interface TopBarProps {
  filterText: string;
  onFilterChange: (value: string) => void;
  onSubmit: () => void;
  canAdd: boolean;
  addStatus: AddStatus;
}

export function TopBar({ filterText, onFilterChange, onSubmit, canAdd, addStatus }: TopBarProps) {
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
        <div className="brand-text">
          <h1>Grieta Central</h1>
          <p>Ranked tracker del grupo · LAS</p>
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
        <span className="search-hint">{canAdd ? "↵ agregar" : "/"}</span>
        {addStatus.kind === "adding" && <span className="search-status">Buscando en la Riot API…</span>}
        {addStatus.kind === "error" && <span className="search-status is-error">{addStatus.message}</span>}
      </form>
    </header>
  );
}
