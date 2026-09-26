"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClashPlayerStats, ClashTournament, DuoPair, LiveGame, Player, RoleKey, TeamDigest as TeamDigestData } from "@/lib/types";
import { TopBar, type AddStatus } from "@/components/TopBar";
import { TabNav, type TabKey } from "@/components/TabNav";
import { HeadToHead } from "@/components/HeadToHead";
import { Inicio } from "@/components/Inicio";
import { CommandPalette, EVENTO_ABRIR } from "@/components/CommandPalette";
import { PwaRegister } from "@/components/PwaRegister";
import { conTransicion } from "@/lib/view-transition";
import { LadderTable, playerKey, type SortKey } from "@/components/LadderTable";
import { PlayerProfile } from "@/components/PlayerProfile";
import type { Radiografia } from "@/lib/radiografia";
import type { Juntos } from "@/lib/juntos";
import { DuoSynergy } from "@/components/DuoSynergy";
import { Estadisticas } from "@/components/Estadisticas";
import { Mejora } from "@/components/Mejora";
import { claveDesdeHash, hashDeClave } from "@/lib/ruta-perfil";
import { ClashHistory } from "@/components/ClashHistory";
import { LiveTray } from "@/components/LiveTray";
import { TeamDigest } from "@/components/TeamDigest";
import { ComoJugamosJuntos } from "@/components/ComoJugamosJuntos";
import { fetchConClave } from "@/components/Cerradura";

function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const i = raw.indexOf("#");
  if (i <= 0 || i === raw.length - 1) return null;
  return { gameName: raw.slice(0, i).trim(), tagLine: raw.slice(i + 1).trim() };
}

/** Dos estados "en vivo" son el mismo si es la misma partida y lleva el mismo tiempo corriendo. */
function sameLiveGame(a: LiveGame | null, b: LiveGame | null): boolean {
  if (a === null || b === null) return a === b;
  return a.gameId === b.gameId && a.champion === b.champion && a.startedMinutesAgo === b.startedMinutesAgo;
}

/**
 * "Cargando…" para las dos pestañas que no tienen esqueleto propio.
 *
 * Existe porque al sacar el pie de página se destapó algo que ese pie venía
 * tapando: mientras carga el ladder, `players` está vacío, y con la lista
 * vacía Estadísticas dice "Todavía nadie llega a 20 partidas" y Cara a cara
 * dice "Hace falta más de un invocador". Las dos son AFIRMACIONES sobre datos
 * que todavía no llegaron, y las dos son falsas. El "Cargando ladder…" del
 * pie era lo único que las desmentía.
 *
 * Ranking no lo necesita (la tabla dibuja filas fantasma) ni Clash ni Equipo
 * (tienen su propio `loading`).
 */
function Cargando() {
  return (
    <div className="empty-state">
      <strong>Cargando…</strong>
    </div>
  );
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [duoSynergy, setDuoSynergy] = useState<DuoPair[]>([]);
  const [juntos, setJuntos] = useState<Juntos | null>(null);
  const [radiografia, setRadiografia] = useState<Radiografia | null>(null);
  const [clashTournaments, setClashTournaments] = useState<ClashTournament[]>([]);
  const [clashPlayerStats, setClashPlayerStats] = useState<ClashPlayerStats[]>([]);
  const [clashLoading, setClashLoading] = useState(false);
  const [clashLoaded, setClashLoaded] = useState(false);
  const [teamDigest, setTeamDigest] = useState<TeamDigestData | null>(null);
  const [teamDigestLoading, setTeamDigestLoading] = useState(false);
  const [teamDigestLoaded, setTeamDigestLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null);

  const [filterText, setFilterText] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /**
   * Arranca en Inicio y no en el ladder. La app abría directo en la tabla:
   * para saber si estaba pasando algo había que leer siete filas de números.
   * Inicio contesta eso de un vistazo y deja el ladder a un toque.
   */
  const [tab, setTab] = useState<TabKey>("inicio");
  const [addStatus, setAddStatus] = useState<AddStatus>({ kind: "idle" });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  /** Invocadores que el cron no pudo refrescar en los últimos 35 min. Casi siempre 0. */
  const [desactualizados, setDesactualizados] = useState(0);
  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");
  /** Ladder o liga: las dos son la tabla principal, y el título de la sección las intercambia. */
  const [vista, setVista] = useState<"ladder" | "liga">("ladder");
  const [sortKey, setSortKey] = useState<SortKey>("ladder");

  /**
   * `forzar` saltea la caché del CDN con un parámetro que cambia. Hace falta
   * cuando el usuario acaba de HACER algo —agregar un invocador— y espera ver
   * el resultado: sin esto le vuelve la respuesta cacheada de antes del cambio
   * y parece que no pasó nada. El refresco periódico no lo usa: ahí lo que se
   * quiere es justamente aprovechar la caché.
   */
  const loadLadder = useCallback(async (forzar = false) => {
    try {
      const res = await fetch(forzar ? `/api/ladder?t=${Date.now()}` : "/api/ladder");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el ladder.");
      setPlayers(data.players as Player[]);
      setDuoSynergy((data.duoSynergy as DuoPair[]) ?? []);
      // Con guarda, igual que la radiografía: durante la ventana de caché del
      // CDN llega el JSON de antes del deploy, que no trae el campo.
      setJuntos((data.juntos as Juntos | undefined) ?? null);
      // Puede venir null durante la ventana de caché del CDN: hay pestañas
      // con el bundle nuevo recibiendo el JSON viejo, que todavía no lo trae.
      // La pestaña sabe mostrar el estado vacío en vez de romperse.
      setRadiografia((data.radiografia as Radiografia | undefined) ?? null);
      setLastUpdated((data.lastUpdated as string | null) ?? null);
      // Con guarda: durante la ventana de caché del CDN llega el JSON viejo,
      // que no trae el campo.
      setDesactualizados((data.desactualizados as number | undefined) ?? 0);
      setDdragonVersion((data.ddragonVersion as string | null) ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar el ladder.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount for a client component; loadLadder sets state once
    // the request resolves, not synchronously during this render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLadder();
  }, [loadLadder]);

  const refreshLiveStatus = useCallback(async () => {
    // The "en vivo ahora" banner comes from Spectator V5 — without polling it,
    // a friend who starts a game 2 minutes into someone's browsing session
    // never shows as live until the page is reloaded. This used to just call
    // loadLadder() again every 60s, which re-fetched and re-aggregated the
    // ENTIRE ladder (matches, LP history, mastery, duo synergy) purely to
    // catch this one small thing changing. /api/live is a lighter sibling
    // that returns nothing but live-game status, merged into the existing
    // players in place.
    try {
      const res = await fetch("/api/live");
      const data = await res.json();
      if (!res.ok) return;
      const live = (data.live as Record<string, LiveGame>) ?? {};
      // Se conserva el objeto anterior cuando el estado en vivo no cambió.
      // Antes se reconstruía la lista entera cada 60s aunque nadie hubiera
      // empezado ni terminado una partida, y esa identidad nueva hacía
      // re-renderizar media app por nada. Un jugador realmente en partida sí
      // cambia cada minuto (avanza `startedMinutesAgo`), y ahí corresponde.
      setPlayers((prev) => {
        let cambio = false;
        const next = prev.map((p) => {
          const nuevo = live[playerKey(p)] ?? null;
          if (sameLiveGame(p.liveGame, nuevo)) return p;
          cambio = true;
          return { ...p, liveGame: nuevo };
        });
        return cambio ? next : prev;
      });
    } catch {
      // best-effort — a failed poll just means the banner stays as it was until the next tick
    }
  }, []);

  useEffect(() => {
    // Paused while the tab is hidden so a forgotten background tab doesn't
    // quietly poll Spectator V5 for everyone once a minute forever.
    const POLL_MS = 60_000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refreshLiveStatus();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshLiveStatus]);

  useEffect(() => {
    // Everything /api/live doesn't cover — new matches, LP movement, Sinergia
    // de dúo — used to only refresh on page load (loadLadder never re-runs on
    // its own otherwise). Left open for a while, the ladder and duo stats
    // just froze even though the cron kept saving real matches behind the
    // scenes. Slower than the live-status poll on purpose: this one re-reads
    // and re-aggregates the full ladder, so it doesn't need 60s granularity
    // to feel current.
    //
    // Y NO corre con un perfil abierto. Este refresh reemplaza la lista
    // entera de jugadores por objetos nuevos, y eso reconstruye el perfil que
    // estás leyendo debajo: la pestaña activa ahora sobrevive (ver
    // PlayerProfile), pero cualquier estado local del subárbol se pierde
    // igual. Refrescar por atrás datos que alguien está mirando es molesto y
    // no urgente — el ladder se pone al día apenas cerrás el perfil, y el
    // estado "en vivo", que sí es urgente, lo sigue trayendo el otro poll.
    const FULL_REFRESH_MS = 5 * 60 * 1000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && activeKey === null) loadLadder();
    }, FULL_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadLadder, activeKey]);

  const loadClash = useCallback(async () => {
    setClashLoading(true);
    try {
      const res = await fetch("/api/clash");
      const data = await res.json();
      if (res.ok) {
        setClashTournaments((data.tournaments as ClashTournament[]) ?? []);
        setClashPlayerStats((data.playerStats as ClashPlayerStats[]) ?? []);
      }
    } catch {
      // best-effort — the tab just stays empty/stale until the user reopens it
    } finally {
      setClashLoading(false);
      setClashLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Fetched lazily on first visit to the tab, not alongside loadLadder —
    // Clash history changes maybe a few times a year, no reason to pay for
    // it on every ladder poll.
    if (tab === "clash" && !clashLoaded && !clashLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loadClash sets state once the fetch resolves, not synchronously here
      loadClash();
    }
  }, [tab, clashLoaded, clashLoading, loadClash]);

  const loadTeamDigest = useCallback(async (semana = 0) => {
    setTeamDigestLoading(true);
    try {
      const res = await fetch(`/api/team-digest?semana=${semana}`);
      const data = await res.json();
      if (res.ok) setTeamDigest(data as TeamDigestData);
    } catch {
      // best-effort — the tab just stays empty/stale until the user reopens it
    } finally {
      setTeamDigestLoading(false);
      setTeamDigestLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Same lazy-on-first-visit convention as Clash — it's a read of stuff
    // already saved, no reason to pay for it on every ladder poll either.
    if (tab === "team" && !teamDigestLoaded && !teamDigestLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loadTeamDigest sets state once the fetch resolves, not synchronously here
      loadTeamDigest();
    }
  }, [tab, teamDigestLoaded, teamDigestLoading, loadTeamDigest]);

  // Dónde estaba el ladder cuando se abrió un perfil, para devolver la vista
  // ahí al volver. Un ref y no estado: no lo dibuja nadie.
  const scrollDelLadder = useRef(0);
  // Si se entró DIRECTO por un enlace con hash, no hay historial al que
  // volver y "← Volver al ladder" tiene que limpiar la dirección en vez de
  // sacarte de la app.
  const entroPorEnlace = useRef(false);

  /**
   * Abrir el perfil de alguien desde cualquier parte (la paleta ⌘K, la
   * bandeja de "en vivo"). Scrollea hasta el perfil porque se dibuja debajo
   * de la tabla: sin eso, elegir a alguien te deja mirando el ladder sin
   * ninguna señal de que pasó algo.
   */
  const abrirPerfil = useCallback((key: string) => {
    // Antes esto scrolleaba: el perfil vivía DEBAJO del ladder y elegir a
    // alguien te bajaba dos mil píxeles. El perfil ya tiene contenido de
    // sobra para ser una vista y no un anexo del ranking, así que ahora
    // REEMPLAZA al ladder en vez de aparecer abajo. Se guarda el scroll para
    // devolverte exactamente donde estabas al volver.
    scrollDelLadder.current = window.scrollY;
    conTransicion(() => {
      setTab("ranking");
      setVista("ladder");
      setActiveKey(key);
    });
    // El hash hace el enlace compartible y le da trabajo al botón Atrás del
    // navegador, sin recargar nada. Ver lib/ruta-perfil.ts.
    history.pushState(null, "", `#${hashDeClave(key)}`);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }, []);

  /**
   * Volver al ladder: cierra el perfil y devuelve la vista a donde estaba.
   *
   * `history.back()` cuando el perfil se abrió desde acá —así el botón Atrás
   * del navegador y este botón hacen lo mismo y no se pisan—, y un
   * `replaceState` cuando se entró directo por un enlace, donde no hay
   * adónde volver.
   */
  const volverAlLadder = useCallback(() => {
    if (entroPorEnlace.current) {
      entroPorEnlace.current = false;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      conTransicion(() => setActiveKey(null));
      return;
    }
    history.back();
  }, []);

  const activePlayer = players.find((p) => playerKey(p) === activeKey) ?? null;
  // El perfil solo reemplaza al ladder, nunca a la liga: las filas de la liga
  // no se pueden tocar, así que ahí no hay a quién abrir.
  const enPerfil = vista === "ladder" && activePlayer !== null;

  /**
   * El hash manda sobre `activeKey`, en los dos sentidos.
   *
   * Corre cuando llegan los jugadores (un enlace compartido abre la app sin
   * datos todavía, así que el hash no se puede resolver hasta tenerlos) y en
   * cada `popstate`, que es el botón Atrás. Así "← Volver al ladder", Atrás y
   * Adelante hacen todos lo mismo en vez de tres cosas parecidas.
   */
  useEffect(() => {
    if (players.length === 0) return;
    const claves = players.map(playerKey);
    const aplicar = () => {
      const delHash = claveDesdeHash(window.location.hash, claves);
      setActiveKey(delHash);
      if (delHash) {
        setTab("ranking");
        setVista("ladder");
      }
    };
    // Al montar con un hash puesto, se entró por un enlace: no hay historial
    // propio atrás.
    if (claveDesdeHash(window.location.hash, claves) !== null) {
      entroPorEnlace.current = true;
      aplicar();
    }
    window.addEventListener("popstate", aplicar);
    return () => window.removeEventListener("popstate", aplicar);
  }, [players]);

  // Al cerrar el perfil, la vista vuelve a donde estaba el ladder. En el
  // mismo frame en que se dibuja, no después: con un timeout se ve el salto.
  useEffect(() => {
    if (activeKey !== null) return;
    const y = scrollDelLadder.current;
    if (y <= 0) return;
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [activeKey]);

  const q = filterText.trim().toLowerCase();
  const hasMatch = q === "" || players.some((p) => playerKey(p).toLowerCase().includes(q));
  const canAdd = !loading && !hasMatch && parseRiotId(filterText.trim()) !== null;

  const handleAdd = useCallback(async () => {
    const parsed = parseRiotId(filterText.trim());
    if (!parsed) {
      setAddStatus({ kind: "error", message: 'Formato inválido — usá "Nombre#TAG".' });
      return;
    }
    setAddStatus({ kind: "adding" });
    try {
      const res = await fetchConClave("/api/summoners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo agregar el invocador.");
      setAddStatus({ kind: "idle" });
      setFilterText("");
      await loadLadder(true);
      setActiveKey(`${data.account.gameName}#${data.account.tagLine}`);
    } catch (err) {
      setAddStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "No se pudo agregar el invocador.",
      });
    }
  }, [filterText, loadLadder]);

  return (
    <div className="app">
      <TopBar
        filterText={filterText}
        onFilterChange={(value) => {
          setFilterText(value);
          setAddStatus({ kind: "idle" });
        }}
        onSubmit={handleAdd}
        canAdd={canAdd}
        addStatus={addStatus}
        invocadores={players.length}
        enVivo={players.filter((p) => p.liveGame).length}
        lastUpdated={lastUpdated}
        desactualizados={desactualizados}
      />
      {/* El cambio de pestaña pasa por una view transition: sin ella el
          contenido se reemplaza de golpe y en una app de una sola página eso
          se lee como un salto, no como una navegación. */}
      <PwaRegister />
      <CommandPalette
        players={players}
        onTab={(t) => conTransicion(() => setTab(t))}
        onPlayer={(key) => {
          conTransicion(() => {
            setTab("ranking");
            setActiveKey(key);
          });
          // Después del cambio: el perfil se dibuja debajo de la tabla, así
          // que sin esto elegir a alguien desde la paleta te deja mirando el
          // ladder sin ninguna señal de que pasó algo.
          requestAnimationFrame(() => {
            document.querySelector(".profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      />
      {/* La barra de secciones queda pegada arriba al scrollear: las pestañas
          de estadísticas son largas y volver arriba para cambiar de sección era
          la fricción más repetida de la app. */}
      <div className="navbar">
        <TabNav active={tab} onChange={(t) => conTransicion(() => setTab(t))} />
        <button
          type="button"
          className="navbar-atajo"
          onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}
          title="Buscar invocador o sección"
        >
          <kbd>⌘</kbd>
          <kbd>K</kbd>
        </button>
      </div>

      {tab === "inicio" ? (
        <div id="view-inicio">
          <Inicio
            players={players}
            duos={duoSynergy}
            loading={loading}
            ddragonVersion={ddragonVersion}
            onPlayer={abrirPerfil}
            onRanking={() => conTransicion(() => { setTab("ranking"); setVista("ladder"); })}
            onLiga={() => conTransicion(() => { setTab("ranking"); setVista("liga"); })}
          />
        </div>
      ) : tab === "ranking" ? (
        <div id="view-ranking">
          {/* Ladder Y perfil son dos ESTADOS, no dos bloques apilados. Antes
              el perfil se dibujaba debajo del ladder y elegir a alguien
              scrolleaba hasta él: la pantalla se comportaba como un documento
              largo y no como una aplicación, y el perfil —que tiene contenido
              de sobra para ser una vista— se leía como un anexo del ranking. */}
          {enPerfil ? (
            <>
              <button type="button" className="volver" onClick={volverAlLadder}>
                <span aria-hidden>←</span> Volver al ladder
              </button>
              <PlayerProfile player={activePlayer} ddragonVersion={ddragonVersion} />
            </>
          ) : (
          <LadderTable
            players={players}
            filterText={filterText}
            activeKey={activeKey}
            // Tocar una fila ENTRA al perfil. Ya no hay "tocar de nuevo para
            // cerrar": el perfil no está abajo esperando, es otra vista, y se
            // sale con "← Volver al ladder" o con el botón Atrás.
            onSelect={abrirPerfil}
            loading={loading}
            error={loadError}
            roleFilter={roleFilter}
            vista={vista}
            onVistaChange={setVista}
            onRoleFilterChange={setRoleFilter}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            ddragonVersion={ddragonVersion}
          />
          )}
        </div>
      ) : tab === "stats" ? (
        <div id="view-stats">
          {loading ? (
            <Cargando />
          ) : (
            <>
              <Estadisticas radiografia={radiografia} players={players} ddragonVersion={ddragonVersion} />
              <DuoSynergy pairs={duoSynergy} loading={loading} ddragonVersion={ddragonVersion} />
            </>
          )}
        </div>
      ) : tab === "mejora" ? (
        <div id="view-mejora">
          {/* Pide su propia ruta, y solo cuando se abre la pestaña: lee TODO
              el historial de una persona con columnas que el ladder no trae
              en su agregado. Ver app/api/mejora/route.ts. */}
          {loading ? <Cargando /> : <Mejora players={players} ddragonVersion={ddragonVersion} />}
        </div>
      ) : tab === "versus" ? (
        <div id="view-versus">
          {/* No pide nada al servidor: los Player ya vienen completos del
              ladder, con radar, pool y rango. */}
          {loading ? <Cargando /> : <HeadToHead players={players} duos={duoSynergy} ddragonVersion={ddragonVersion} />}
        </div>
      ) : tab === "clash" ? (
        <div id="view-clash" className="clash-cuerpo">
          <ClashHistory
            tournaments={clashTournaments}
            players={players}
            playerStats={clashPlayerStats}
            loading={clashLoading}
            ddragonVersion={ddragonVersion}
          />
        </div>
      ) : (
        <div id="view-team" className="equipo-cuerpo">
          {/* Primero la pregunta propia de la pestaña —cuánto juegan juntos y
              cómo les va— y después el resumen de la semana, que es el que se
              copia al Discord. Ver components/ComoJugamosJuntos.tsx. */}
          <ComoJugamosJuntos juntos={juntos} />
          <TeamDigest
            digest={teamDigest}
            loading={teamDigestLoading}
            ddragonVersion={ddragonVersion}
            onSemana={loadTeamDigest}
          />
        </div>
      )}



      <LiveTray players={players} ddragonVersion={ddragonVersion} onPlayer={abrirPerfil} />
    </div>
  );
}
