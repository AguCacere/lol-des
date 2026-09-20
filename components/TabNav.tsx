export type TabKey = "inicio" | "ranking" | "stats" | "versus" | "clash" | "team";

interface TabNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "inicio", label: "Inicio" },
  { key: "ranking", label: "Ranking" },
  { key: "stats", label: "Estadísticas" },
  { key: "versus", label: "Cara a cara" },
  { key: "clash", label: "Clash" },
  { key: "team", label: "Equipo" },
];

export function TabNav({ active, onChange }: TabNavProps) {
  return (
    <nav className="tabnav" role="tablist" aria-label="Secciones">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab-btn${active === tab.key ? " is-active" : ""}`}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
