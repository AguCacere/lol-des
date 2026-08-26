import type { Player } from "@/lib/types";
import { tierFor, champTag, ROLES } from "@/lib/mock-data";
import { SparkChart } from "./SparkChart";

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v3a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H5a2 2 0 0 0 2 3" />
      <path d="M17 5h2a2 2 0 0 1-2 3" />
      <path d="M12 12v3" />
      <path d="M9 19h6" />
      <path d="M10.5 15h3l.4 4h-3.8z" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function CmpBar({ label, value, avg, max, suffix = "" }: { label: string; value: number; avg: number; max: number; suffix?: string }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  const avgPct = Math.max(0, Math.min(100, (avg / max) * 100));
  return (
    <div className="cmp-row">
      <div className="cmp-row-top">
        <span className="k">{label}</span>
        <span className="v">
          {value}
          {suffix} <span style={{ color: "var(--text-muted)" }}>· prom. rol {avg}{suffix}</span>
        </span>
      </div>
      <div className="cmp-bar-track">
        <div className="cmp-bar-fill" style={{ width: `${pct}%` }} />
        <div className="cmp-bar-avg" style={{ left: `${avgPct}%` }} />
      </div>
    </div>
  );
}

export function PlayerProfile({ player }: { player: Player | null }) {
  if (!player) {
    return (
      <section id="profileSection">
        <div className="section-head">
          <h2>
            <span className="live-dot accent" />
            Perfil de invocador
          </h2>
          <span className="meta">Click en una fila del ladder para inspeccionar</span>
        </div>
        <div className="profile">
          <div className="profile-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21l7-7m0 0l8-8-3-3-8 8m3 3l-3-3m0 0L4 13l3 3" />
            </svg>
            <p>
              <strong>Elegí un invocador del ranking</strong>
              Tocá cualquier fila para ver su progresión de LP, comparación con el promedio del rol y las últimas partidas.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const p = player;
  const t = tierFor(p.tierKey);
  const wins = p.matches.filter((m) => m.win).length;
  const avgKDA = p.matches.reduce((s, m) => s + (m.k + m.a) / Math.max(1, m.d), 0) / p.matches.length;
  const avgCS = p.matches.reduce((s, m) => s + parseFloat(m.csmin), 0) / p.matches.length;
  const avgDmg = p.matches.reduce((s, m) => s + m.dmgShare, 0) / p.matches.length;
  const avgVision = Math.round(18 + (p.role === "support" ? 22 : 6) + (p.seed % 9));
  const objPart = Math.round(38 + (p.seed % 40));
  const killPart = Math.round(45 + (p.seed % 30));
  const avgDur = Math.round(p.matches.reduce((s, m) => s + m.dur, 0) / p.matches.length);
  const lpDelta = p.spark20[p.spark20.length - 1] - p.spark20[0];

  return (
    <section id="profileSection">
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Perfil de invocador
        </h2>
        <span className="meta">Click en una fila del ladder para inspeccionar</span>
      </div>

      <div className="profile">
        <div className="profile-header">
          <div className="profile-id">
            <div className="profile-avatar" style={{ background: t.bg, color: t.fg, borderColor: `${t.fg}44` }}>
              {champTag(p.mainChamp)}
            </div>
            <div>
              <p className="profile-name">
                {p.name}
                <span className="player-tag">#{p.tag}</span>
                {p.you && <span className="you-badge">VOS</span>}
              </p>
              <p className="profile-sub">
                {ROLES[p.role].label} · main {p.mainChamp} · {p.wins + p.losses} partidas esta season
              </p>
            </div>
          </div>
          <div className="profile-tier">
            <div className="tn" style={{ color: t.fg }}>
              {t.name} {p.division}
            </div>
            <div className="tl">{p.lp} LP</div>
          </div>
        </div>

        <div className="stack-cols">
          <div>
            <h3 className="subhead">
              <span className="tag macro">Macro</span>Progresión y mapa
            </h3>
            <div className="lp-chart-card">
              <div className="lp-chart-top">
                <div>
                  <span className="label">LP · últimas 20 partidas</span>
                  <br />
                  <span className="big">{p.lp} LP</span>
                  <span className={`delta ${lpDelta >= 0 ? "up" : "down"}`}>
                    {lpDelta >= 0 ? "▲" : "▼"} {Math.abs(lpDelta)}
                  </span>
                </div>
              </div>
              <div className="lp-svg">
                <SparkChart values={p.spark20} width={520} height={118} pad={8} color={t.fg} variant="detailed" />
              </div>
              {p.spark20.length < 3 && (
                <p className="chart-note">
                  Todavía hay poco historial guardado — la curva real va a aparecer a medida que se acumulen más
                  actualizaciones de LP.
                </p>
              )}
            </div>
            <div className="stat-grid">
              <div className="stat-tile"><TrophyIcon /><div className="v">{p.winrate}%</div><div className="k">Winrate season</div></div>
              <div className="stat-tile"><TargetIcon /><div className="v">{objPart}%</div><div className="k">Participación objetivos</div></div>
              <div className="stat-tile"><ZapIcon /><div className="v">{killPart}%</div><div className="k">Kill participation</div></div>
              <div className="stat-tile"><EyeIcon /><div className="v">{avgVision}</div><div className="k">Visión / min</div></div>
              <div className="stat-tile"><ClockIcon /><div className="v">{avgDur} min</div><div className="k">Duración prom.</div></div>
              <div className="stat-tile"><TrendUpIcon /><div className="v">{wins}/{p.matches.length}</div><div className="k">Forma reciente</div></div>
            </div>
          </div>

          <div>
            <h3 className="subhead">
              <span className="tag micro">Micro</span>Últimas partidas
            </h3>
            <div className="cmp-card">
              <CmpBar label="KDA promedio" value={Number(avgKDA.toFixed(2))} avg={2.6} max={6} />
              <CmpBar label="CS / min" value={Number(avgCS.toFixed(1))} avg={6.8} max={10} />
              <CmpBar label="% daño del equipo" value={Math.round(avgDmg)} avg={24} max={45} suffix="%" />
            </div>
            <div className="matches">
              {p.matches.map((m, i) => (
                <div className="match-row" key={i}>
                  <div className={`match-stripe ${m.win ? "w" : "l"}`} />
                  <div className="match-champ">{champTag(m.champ)}</div>
                  <div className="match-mid">
                    <div className="match-top-line">
                      <span className="match-champ-name">{m.champ}</span>
                      <span className={`match-result ${m.win ? "w" : "l"}`}>{m.win ? "VICTORIA" : "DERROTA"}</span>
                    </div>
                    <div className="match-sub">
                      {m.dur} min · {m.csmin} cs/min · daño {m.dmgShare}%
                    </div>
                  </div>
                  <div className="match-stats">
                    <div className="kda">
                      {m.k}
                      <span className="neu">/</span>
                      {m.d}
                      <span className="neu">/</span>
                      {m.a}
                    </div>
                    <span className="extra">{m.gold} oro/min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
