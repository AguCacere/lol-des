"use client";

import { useEffect, useRef, useState } from "react";
import { Cerradura } from "./Cerradura";
import { formatRelativeTime, liveGameTimeLabel } from "@/lib/ladder";
import { cuantosEnVivo, type GrupoEnVivo, nombresDelGrupo } from "@/lib/live-grupos";
import { ChampIcon } from "./ChampIcon";
import { UsersIcon } from "./StatIcons";
import { championLabel } from "@/lib/champion-names";

export type AddStatus = { kind: "idle" } | { kind: "adding" } | { kind: "error"; message: string };

interface TopBarProps {
  /** Cuántos invocadores hay cargados — el subtítulo dice algo real en vez de una frase fija. */
  invocadores: number;
  /**
   * Las partidas en curso, agrupadas (ver lib/live-grupos.ts). La barra
   * muestra el total de JUGADORES y el popover las PARTIDAS: los que están
   * juntos son una fila sola, no dos.
   */
  enVivo: GrupoEnVivo[];
  /** Para los íconos de campeón del popover. */
  ddragonVersion: string | null;
  /** Abrir el perfil de alguien — la misma función que usa el ladder. */
  onPlayer: (key: string) => void;
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

export function TopBar({ invocadores, enVivo, ddragonVersion, onPlayer, lastUpdated, desactualizados, filterText, onFilterChange, onSubmit, canAdd, addStatus }: TopBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const vivoRef = useRef<HTMLDivElement>(null);
  const jugando = cuantosEnVivo(enVivo);

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

  // Cerrar el popover al tocar afuera o con Escape. Sin lo segundo queda
  // atrapado para quien navega con teclado.
  useEffect(() => {
    if (!abierto) return;
    function afuera(e: MouseEvent) {
      if (!vivoRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  // Si el último se sale de la partida con el popover abierto, no puede
  // quedar abierto para la próxima: el botón desaparece con él, y cuando
  // alguien vuelva a entrar en partida el panel se abriría solo.
  //
  // Ajuste de estado DURANTE el render y no en un efecto — es el patrón que
  // documenta React para estado derivado y el mismo que usa PlayerProfile
  // acá al lado. En un efecto dispara un render en cascada.
  const [vivosVistos, setVivosVistos] = useState(jugando);
  if (jugando !== vivosVistos) {
    setVivosVistos(jugando);
    if (jugando === 0) setAbierto(false);
  }

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
            {jugando > 0 && (
              <>
                <span className="brand-sep">·</span>
                {/* De rótulo a botón. El número ya estaba; lo que faltaba era
                    poder preguntarle QUIÉNES. El popover muestra partidas y no
                    jugadores: los que están en la misma van en una fila. */}
                <span className="brand-live-wrap" ref={vivoRef}>
                  <button
                    type="button"
                    className={`brand-live${abierto ? " is-abierto" : ""}`}
                    onClick={() => setAbierto((v) => !v)}
                    aria-expanded={abierto}
                    aria-haspopup="dialog"
                    title="Ver quiénes están en partida"
                  >
                    <span className="live-dot" />
                    {jugando} en partida
                  </button>
                  {abierto && (
                    <div className="live-pop" role="dialog" aria-label="En vivo ahora">
                      <div className="live-pop-head">
                        <span className="live-dot" />
                        En vivo ahora · {jugando}
                      </div>
                      <div className="live-pop-list">
                        {enVivo.map((g) => (
                          <FilaEnVivo
                            key={g.key}
                            g={g}
                            ddragonVersion={ddragonVersion}
                            onPlayer={(k) => {
                              setAbierto(false);
                              onPlayer(k);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
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

/**
 * Una partida del popover. Misma anatomía que la bandeja flotante —caritas
 * con el campeón encima, nombres, cola y reloj— pero más apretada: acá hay
 * que poder barrer cuatro de un vistazo, no quedarse leyendo una.
 *
 * Abrir el perfil de cualquiera del grupo muestra exactamente la misma
 * partida, así que el grupo entero lleva al primero.
 */
function FilaEnVivo({
  g,
  ddragonVersion,
  onPlayer,
}: {
  g: GrupoEnVivo;
  ddragonVersion: string | null;
  onPlayer: (key: string) => void;
}) {
  const uno = g.jugadores[0];
  return (
    <button
      type="button"
      className="live-pop-row"
      onClick={() => onPlayer(`${uno.name}#${uno.tag}`)}
      title="Ver la partida y los rivales"
    >
      <span className="live-pop-champs">
        {g.jugadores.map((p) => (
          <ChampIcon
            key={`${p.name}#${p.tag}`}
            champ={p.liveGame!.champion}
            version={ddragonVersion}
            className="live-pop-champ"
          />
        ))}
      </span>
      <span className="live-pop-mid">
        <span className="live-pop-nombres">{nombresDelGrupo(g)}</span>
        <span className="live-pop-meta">
          {g.juntos ? (
            <>
              <span className="live-pop-juntos">
                <UsersIcon />
                Jugando juntos
              </span>
              <span className="live-pop-sep">·</span>
            </>
          ) : (
            <>
              {championLabel(uno.liveGame!.champion)}
              <span className="live-pop-sep">·</span>
            </>
          )}
          {g.partida.queueLabel}
          <span className="live-pop-sep">·</span>
          {liveGameTimeLabel(g.partida.startedMinutesAgo)}
        </span>
      </span>
    </button>
  );
}
