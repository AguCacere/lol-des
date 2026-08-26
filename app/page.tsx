"use client";

import { useCallback, useEffect, useState } from "react";
import type { Player, RoleKey } from "@/lib/types";
import { TopBar, type AddStatus } from "@/components/TopBar";
import { TabNav, type TabKey } from "@/components/TabNav";
import { LadderTable, playerKey, type SortKey } from "@/components/LadderTable";
import { PlayerProfile } from "@/components/PlayerProfile";

function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const i = raw.indexOf("#");
  if (i <= 0 || i === raw.length - 1) return null;
  return { gameName: raw.slice(0, i).trim(), tagLine: raw.slice(i + 1).trim() };
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterText, setFilterText] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("ranking");
  const [addStatus, setAddStatus] = useState<AddStatus>({ kind: "idle" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("ladder");

  const loadLadder = useCallback(async () => {
    try {
      const res = await fetch("/api/ladder");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar el ladder.");
      setPlayers(data.players as Player[]);
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar.");
      await loadLadder();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setRefreshing(false);
    }
  }, [loadLadder]);

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
            onRefresh={handleRefresh}
            refreshing={refreshing}
            refreshError={refreshError}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
          />
          <PlayerProfile player={activePlayer} allPlayers={players} />
        </div>
      ) : (
        <div id="view-stats">
          <div className="placeholder-card">
            <h3>Estadísticas del grupo — próximamente</h3>
            <p>
              Acá van a vivir los números agregados: campeón más jugado, KDA promedio del grupo, duración típica de
              partida. Se arma en cuanto tengamos más historial guardado en la base.
            </p>
          </div>
        </div>
      )}

      <p className="footnote">
        {loading
          ? "Cargando ladder…"
          : `${players.length} invocador${players.length === 1 ? "" : "es"} trackeados.`}{" "}
        Refresh diario vía <code>app/api/cron/refresh</code>.
      </p>
    </div>
  );
}
