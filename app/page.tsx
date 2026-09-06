"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChampionLeaderboardEntry, ClashPlayerStats, ClashTournament, DuoPair, LiveGame, Player, RoleKey, TeamDigest as TeamDigestData } from "@/lib/types";
import { TopBar, type AddStatus } from "@/components/TopBar";
import { TabNav, type TabKey } from "@/components/TabNav";
import { HeadToHead } from "@/components/HeadToHead";
import { CommandPalette, EVENTO_ABRIR } from "@/components/CommandPalette";
import { PwaRegister } from "@/components/PwaRegister";
import { conTransicion } from "@/lib/view-transition";
import { LadderTable, playerKey, type SortKey } from "@/components/LadderTable";
import { PlayerProfile } from "@/components/PlayerProfile";
import { DuoSynergy } from "@/components/DuoSynergy";
import { TopWinrate } from "@/components/TopWinrate";
import { ChampionWinrateLeaderboard } from "@/components/ChampionWinrateLeaderboard";
import { ClashHistory } from "@/components/ClashHistory";
import { LiveTray } from "@/components/LiveTray";
import { TeamDigest } from "@/components/TeamDigest";
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

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [duoSynergy, setDuoSynergy] = useState<DuoPair[]>([]);
  const [championLeaderboard, setChampionLeaderboard] = useState<ChampionLeaderboardEntry[]>([]);
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
  const [tab, setTab] = useState<TabKey>("ranking");
  const [addStatus, setAddStatus] = useState<AddStatus>({ kind: "idle" });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");
  /** Ladder o liga: las dos son la tabla principal, y el título de la sección las intercambia. */
  const [vista, setVista] = useState<"ladder" | "liga">("ladder");
  const [sortKey, setSortKey] = useState<SortKey>("ladder");

  const loadLadder = useCallback(async () => {
    try {
      const res = await fetch("/api/ladder");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el ladder.");
      setPlayers(data.players as Player[]);
      setDuoSynergy((data.duoSynergy as DuoPair[]) ?? []);
      setChampionLeaderboard((data.championLeaderboard as ChampionLeaderboardEntry[]) ?? []);
      setLastUpdated((data.lastUpdated as string | null) ?? null);
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

  /**
   * Abrir el perfil de alguien desde cualquier parte (la paleta ⌘K, la
   * bandeja de "en vivo"). Scrollea hasta el perfil porque se dibuja debajo
   * de la tabla: sin eso, elegir a alguien te deja mirando el ladder sin
   * ninguna señal de que pasó algo.
   */
  const abrirPerfil = useCallback((key: string) => {
    conTransicion(() => {
      setTab("ranking");
      setActiveKey(key);
    });
    requestAnimationFrame(() => {
      document.querySelector(".profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const activePlayer = players.find((p) => playerKey(p) === activeKey) ?? null;

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
      await loadLadder();
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

      {tab === "ranking" ? (
        <div id="view-ranking">
          <LadderTable
            players={players}
            filterText={filterText}
            activeKey={activeKey}
            onSelect={(key) => {
              // Tocar la fila activa la cierra (y ahí NO se scrollea: el perfil
              // se está yendo, llevar la vista hasta donde estaba es marear).
              // Tocar cualquier otra abre ese perfil y baja hasta él.
              if (activeKey === key) setActiveKey(null);
              else abrirPerfil(key);
            }}
            loading={loading}
            error={loadError}
            lastUpdated={lastUpdated}
            roleFilter={roleFilter}
            vista={vista}
            onVistaChange={setVista}
            onRoleFilterChange={setRoleFilter}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            ddragonVersion={ddragonVersion}
          />
          <PlayerProfile player={activePlayer} ddragonVersion={ddragonVersion} />
        </div>
      ) : tab === "stats" ? (
        <div id="view-stats">
          <TopWinrate players={players} />
          <ChampionWinrateLeaderboard entries={championLeaderboard} ddragonVersion={ddragonVersion} />
          <DuoSynergy pairs={duoSynergy} loading={loading} ddragonVersion={ddragonVersion} />
        </div>
      ) : tab === "versus" ? (
        <div id="view-versus">
          {/* No pide nada al servidor: los Player ya vienen completos del
              ladder, con radar, pool y rango. */}
          <HeadToHead players={players} duos={duoSynergy} ddragonVersion={ddragonVersion} />
        </div>
      ) : tab === "clash" ? (
        <div id="view-clash">
          <ClashHistory
            tournaments={clashTournaments}
            players={players}
            playerStats={clashPlayerStats}
            loading={clashLoading}
            ddragonVersion={ddragonVersion}
          />
        </div>
      ) : (
        <div id="view-team">
          <TeamDigest
            digest={teamDigest}
            loading={teamDigestLoading}
            ddragonVersion={ddragonVersion}
            onSemana={loadTeamDigest}
          />
        </div>
      )}

      <p className="footnote">
        {loading
          ? "Cargando ladder…"
          : `${players.length} invocador${players.length === 1 ? "" : "es"} trackeados.`}
      </p>

      <LiveTray players={players} ddragonVersion={ddragonVersion} onPlayer={abrirPerfil} />
    </div>
  );
}
