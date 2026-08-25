export type TabKey = "ranking" | "stats";

interface TabNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "ranking", label: "Ranking" },
  { key: "stats", label: "Estadísticas" },
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
