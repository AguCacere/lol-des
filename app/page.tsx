"use client";

import { useMemo, useState } from "react";
import { getLadder } from "@/lib/mock-data";
import { TopBar } from "@/components/TopBar";
import { TabNav, type TabKey } from "@/components/TabNav";
import { LadderTable, playerKey } from "@/components/LadderTable";
import { PlayerProfile } from "@/components/PlayerProfile";

export default function Home() {
  // TODO(db): swap getLadder() for a fetch("/api/ladder") once Supabase is wired.
  const players = useMemo(() => getLadder(), []);

  const [filterText, setFilterText] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("ranking");

  const activePlayer = players.find((p) => playerKey(p) === activeKey) ?? null;

  return (
    <div className="app">
      <TopBar filterText={filterText} onFilterChange={setFilterText} />
      <TabNav active={tab} onChange={setTab} />

      {tab === "ranking" ? (
        <div id="view-ranking">
          <LadderTable
            players={players}
            filterText={filterText}
            activeKey={activeKey}
            onSelect={(key) => setActiveKey((cur) => (cur === key ? null : key))}
          />
          <PlayerProfile player={activePlayer} />
        </div>
      ) : (
        <div id="view-stats">
          <div className="placeholder-card">
            <h3>Estadísticas del grupo — próximamente</h3>
            <p>
              Acá van a vivir los números agregados: campeón más jugado, KDA promedio del grupo, duración típica de
              partida. Se arma en cuanto tengamos historial guardado en la base.
            </p>
          </div>
        </div>
      )}

      <p className="footnote">
        Datos de ejemplo — todavía no está conectado a la <code>Riot Games API</code>. Ver <code>lib/riot.ts</code>{" "}
        y <code>supabase/schema.sql</code> para el próximo paso.
      </p>
    </div>
  );
}
