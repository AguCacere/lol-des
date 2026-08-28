"use client";

import { useCallback, useEffect, useState } from "react";
import type { DuoPair, LiveGame, Player, RoleKey } from "@/lib/types";
import { TopBar, type AddStatus } from "@/components/TopBar";
import { TabNav, type TabKey } from "@/components/TabNav";
import { LadderTable, playerKey, type SortKey } from "@/components/LadderTable";
import { PlayerProfile } from "@/components/PlayerProfile";
import { DuoSynergy } from "@/components/DuoSynergy";

function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const i = raw.indexOf("#");
  if (i <= 0 || i === raw.length - 1) return null;
  return { gameName: raw.slice(0, i).trim(), tagLine: raw.slice(i + 1).trim() };
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [duoSynergy, setDuoSynergy] = useState<DuoPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null);

  const [filterText, setFilterText] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("ranking");
  const [addStatus, setAddStatus] = useState<AddStatus>({ kind: "idle" });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("ladder");

  const loadLadder = useCallback(async () => {
    try {
      const res = await fetch("/api/ladder");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el ladder.");
      setPlayers(data.players as Player[]);
      setDuoSynergy((data.duoSynergy as DuoPair[]) ?? []);
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
      setPlayers((prev) => prev.map((p) => ({ ...p, liveGame: live[playerKey(p)] ?? null })));
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
    const FULL_REFRESH_MS = 5 * 60 * 1000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadLadder();
    }, FULL_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadLadder]);

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
      const res = await fetch("/api/summoners", {
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
      />
      <TabNav active={tab} onChange={setTab} />

      {tab === "ranking" ? (
        <div id="view-ranking">
          <LadderTable
            players={players}
            filterText={filterText}
            activeKey={activeKey}
            onSelect={(key) => setActiveKey((cur) => (cur === key ? null : key))}
            loading={loading}
            error={loadError}
            lastUpdated={lastUpdated}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            ddragonVersion={ddragonVersion}
          />
          <PlayerProfile player={activePlayer} allPlayers={players} ddragonVersion={ddragonVersion} />
        </div>
      ) : (
        <div id="view-stats">
          <DuoSynergy pairs={duoSynergy} loading={loading} ddragonVersion={ddragonVersion} />
          <p className="stats-more-note">Más analíticas de grupo (campeón más jugado, KDA promedio) van a sumarse acá.</p>
        </div>
      )}

      <p className="footnote">
        {loading
          ? "Cargando ladder…"
          : `${players.length} invocador${players.length === 1 ? "" : "es"} trackeados.`}
      </p>
    </div>
  );
}
