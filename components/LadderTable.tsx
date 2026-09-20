import type { Player, RoleKey } from "@/lib/types";
import { champTag, currentStreak, liveGameTimeLabel, rankScore, ROLES, tierFor, trendColor } from "@/lib/ladder";
import { RoleIcon } from "./RoleIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { Select, type OpcionSelect } from "./Select";
import { StreakIcon } from "./StreakIcon";
import { SparkChart } from "./SparkChart";
import { ChampIcon } from "./ChampIcon";
import { TierEmblem } from "./TierEmblem";
import { championLabel } from "@/lib/champion-names";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
import { LigaSemanal } from "./LigaSemanal";

export type SortKey = "ladder" | "winrate" | "wins" | "streak" | "recent";

const ROLE_FILTERS: (RoleKey | "all")[] = ["all", "top", "jungle", "mid", "adc", "support"];

interface LadderTableProps {
  players: Player[];
  filterText: string;
  activeKey: string | null;
  onSelect: (key: string) => void;
  loading?: boolean;
  error?: string | null;
  roleFilter: RoleKey | "all";
  /** Cuál de las dos tablas se está mirando. El título de arriba es el interruptor. */
  vista: "ladder" | "liga";
  onVistaChange: (v: "ladder" | "liga") => void;
  onRoleFilterChange: (role: RoleKey | "all") => void;
  sortKey: SortKey;
  onSortKeyChange: (key: SortKey) => void;
  ddragonVersion: string | null;
}

/** Los criterios de orden del ladder, con el detalle que explica cada uno. */
const ORDENES: OpcionSelect[] = [
  { value: "ladder", label: "Por LP (ranking)", detalle: "El orden del ladder" },
  { value: "winrate", label: "Por winrate", detalle: "% de la season" },
  { value: "wins", label: "Por victorias", detalle: "Total ganadas" },
  { value: "streak", label: "Por racha", detalle: "La actual, ganando o perdiendo" },
  { value: "recent", label: "Por progreso reciente", detalle: "Movimiento de LP" },
];

export function playerKey(p: Player): string {
  return `${p.name}#${p.tag}`;
}

/**
 * Rank score (tier+división+LP combinado) per stored snapshot, not raw LP —
 * raw LP alone resets to a low number on every division promotion, which
 * would make the "últimos 20" sparkline show a climb as a plunge right at the
 * moment it should have looked best. This is the same series the profile's
 * big LP chart already charts on, so a promoted player's trend line and
 * color agree everywhere in the app instead of contradicting each other.
 */
function trendSeries(p: Player): number[] {
  return p.lpHistory.map((h) => rankScore(h.tier, h.division, h.lp));
}

function recentDelta(p: Player): number {
  const series = trendSeries(p);
  return series.length >= 2 ? series[series.length - 1] - series[0] : 0;
}

/**
 * Cómo se llama ese delta: "LP" o "LP netos".
 *
 * Decía "pts" y hay que sacarlo: desde que existe la liga, "puntos" es SU
 * unidad —victoria 1, derrota −0,75— y un "▲ 72 pts" al lado de un "+7,25" de
 * la liga son dos cosas completamente distintas con el mismo nombre.
 *
 * Y "pts" tampoco era necesario. Nació de un problema real: el delta es de
 * rankScore, no de LP crudo, así que etiquetarlo "LP" a secas mostraba cosas
 * como "Platino 3 · 64 LP → Platino 2 · 36 LP ▲72 LP", un supuesto avance de
 * 72 al lado de un número que visiblemente bajó. Pero rankScore sube de a 100
 * por división y 400 por tier: es la MISMA escala que el LP. La diferencia son
 * LP netos y punto. El perfil ya lo decía así; esto quedó atrás.
 */
function unidadDelta(p: Player): string {
  const primero = p.lpHistory[0];
  const ultimo = p.lpHistory[p.lpHistory.length - 1];
  const cruzo = primero && ultimo && (primero.tier !== ultimo.tier || primero.division !== ultimo.division);
  return cruzo ? "LP netos" : "LP";
}

function streakMagnitude(p: Player): number {
  const s = currentStreak(p.matches);
  if (!s) return 0;
  return s.result === "W" ? s.count : -s.count;
}

function sortValue(p: Player, key: SortKey): number {
  switch (key) {
    case "winrate":
      return p.winrate;
    case "wins":
      return p.wins;
    case "streak":
      return streakMagnitude(p);
    case "recent":
      return recentDelta(p);
    case "ladder":
    default:
      return 0;
  }
}

export function LadderTable({
  players,
  filterText,
  activeKey,
  onSelect,
  loading,
  error,
  roleFilter,
  vista,
  onVistaChange,
  onRoleFilterChange,
  sortKey,
  onSortKeyChange,
  ddragonVersion,
}: LadderTableProps) {
  const q = filterText.trim().toLowerCase();
  const filtered = players
    .filter((p) => roleFilter === "all" || p.role === roleFilter)
    .filter((p) => !q || playerKey(p).toLowerCase().includes(q));
  const rows =
    sortKey === "ladder" ? filtered : [...filtered].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));

  const enLiga = vista === "liga";

  return (
    <section>
      {/* La otra tabla queda A LA VISTA a propósito, y no adentro de un
          desplegable: son dos opciones —esconder una detrás de un clic no
          descomprime, agrega un paso— y la que se escondería es la liga, que
          es justo la que tiene algo en juego y de la que nadie se acuerda si
          no la ve.

          Los filtros viven ACÁ, en el mismo renglón que el título, y el
          interruptor se corre a la izquierda pegado al nombre de la tabla.

          Antes eran TRES bandas apiladas —pestañas, título, filtros— y dos de
          ellas iban de borde a borde con algo a la izquierda y algo a la
          derecha. Medido: el ojo hacía izquierda-derecha tres veces seguidas
          en 159px de alto. No sobraba espacio vertical (48/24/8 estaba bien
          jerarquizado): sobraba una banda.

          Ahora son dos, y cada lado significa algo: a la izquierda QUÉ tabla
          estás mirando y cómo ir a la otra, a la derecha CÓMO la querés ver. */}
      <div className="section-head">
        <div className="vista-titulo">
          <h2>{enLiga ? "Liga de la semana" : "Ladder del grupo"}</h2>
          <button type="button" className="vista-ir" onClick={() => onVistaChange(enLiga ? "ladder" : "liga")}>
            {enLiga ? (
              <>
                <span aria-hidden>←</span> Ladder del grupo
              </>
            ) : (
              <>
                {/* La copa: es una competencia con premio, no un enlace más.
                    Sin ella el botón era una pastilla con texto y podía ser
                    cualquier cosa. */}
                <svg className="vista-ir-copa" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.3A6 6 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A6 6 0 0 1 7.3 12H7a4 4 0 0 1-4-4V5h3V3zm0 4H5v1a2 2 0 0 0 1 1.7V7zm12 0v2.7A2 2 0 0 0 19 8V7h-1z" />
                </svg>
                Liga de la semana <span aria-hidden>→</span>
              </>
            )}
          </button>
        </div>
        {!enLiga && (
          <div className="ladder-controls">
            {/* La línea pasó de seis chips a un desplegable. Ocupaba un renglón
                entero para algo que casi no se toca. */}
            {/* Dos controles, no cuatro elementos. Antes cada desplegable
                llevaba su rótulo al lado ("Línea [Todas]", "Ordenar por [LP
                (ranking)]") y la tira de filtros tenía más texto fijo que
                opciones. Ahora el rótulo está ADENTRO del valor —"Todas las
                líneas", "Por winrate"— así que cada control se explica solo y
                la fila se lee de un saque. El nombre completo sigue estando
                para los lectores de pantalla, en aria-label. */}
            <Select
              className="sort-select"
              value={roleFilter}
              onChange={(v) => onRoleFilterChange(v as RoleKey | "all")}
              ariaLabel="Filtrar el ladder por línea"
              options={ROLE_FILTERS.map((r) => ({
                value: r,
                label: r === "all" ? "Todas las líneas" : `Solo ${ROLES[r].label}`,
              }))}
            />
            <Select
              className="sort-select a-la-derecha"
              value={sortKey}
              onChange={(v) => onSortKeyChange(v as SortKey)}
              ariaLabel="Ordenar el ladder por"
              options={ORDENES}
            />
          </div>
        )}
      </div>

      {enLiga ? (
        <LigaSemanal conEncabezado={false} />
      ) : (
        <>
      {/* Sin banda de encabezado de columnas. Era lo que hacía que el ladder se
          leyera como una PLANILLA y no como una lista de personas: seis
          rótulos en mayúsculas de 10px arriba de todo, rotulando cosas que se
          reconocen solas —una cara con un nombre, un emblema de rango, un
          porcentaje, una curva—. En el celular ya estaba escondida desde
          siempre (`display:none`), o sea que la pantalla donde más se usa la
          app venía funcionando sin ella hace meses. La lista de la liga hizo
          el mismo camino y quedó mejor.

          Lo único que el rótulo aportaba era el "Últimos 20" de la curva, y
          eso lo dice ahora la propia columna con su "▲ 72 LP" debajo. */}
      <div className="ladder">
        <div>
          {loading ? (
            // Esqueletos con la forma de las filas reales y no un "Cargando…":
            // el cartel de texto ocupa un alto distinto al de la tabla, así
            // que cuando llegan los datos la página entera pega un salto y lo
            // que estabas por tocar se te corre de abajo del dedo.
            <div aria-busy="true" aria-label="Cargando el ladder">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="ladder-row is-skeleton" key={i} aria-hidden="true">
                  <span className="col-rank">
                    <span className="sk sk-rank" />
                  </span>
                  <span className="col-player">
                    <span className="sk sk-avatar" />
                    <span className="sk sk-nombre" />
                  </span>
                  <span className="col-tier">
                    <span className="sk sk-tier" />
                  </span>
                  <span className="col-winrate">
                    <span className="sk sk-wr" />
                  </span>
                  <span className="col-spark">
                    <span className="sk sk-spark" />
                  </span>
                  <span className="col-chevron" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>No se pudo cargar el ladder</strong>
              {error}
            </div>
          ) : rows.length === 0 && players.length === 0 ? (
            <div className="empty-state">
              <strong>Todavía no hay nadie en el grupo</strong>
              Buscá un Riot ID arriba (Nombre#TAG) y apretá Enter para sumarlo.
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <strong>Sin resultados</strong>
              {q ? (
                <>
                  No hay ningún Riot ID en el grupo que matchee &ldquo;{q}&rdquo;. Apretá Enter para buscarlo en la
                  Riot API y sumarlo.
                </>
              ) : (
                "Ningún invocador del grupo juega ese rol."
              )}
            </div>
          ) : (
            rows.map((p, i) => {
              // Ladder order keeps each player's real LP-ladder position even
              // under a role filter (dropping other roles shouldn't renumber
              // who's actually #1 overall) — but any OTHER sort re-orders the
              // rows entirely, and showing the stale LP rank next to a list
              // now sorted by winrate/wins/streak/progreso read as random
              // numbers with no relation to what's on screen (e.g. the top
              // winrate row showing "#5"). Once re-sorted, the rank column
              // has to describe THIS order, not the ladder's.
              const rank = sortKey === "ladder" ? players.indexOf(p) + 1 : i + 1;
              const t = tierFor(p.tierKey);
              const key = playerKey(p);
              const isActive = key === activeKey;
              const streak = currentStreak(p.matches);
              const spark = trendSeries(p);
              // Contra su propio punto de partida, para que el 0 signifique
              // algo. Restar una constante no cambia la forma del dibujo.
              const sparkRelativa = spark.length > 0 ? spark.map((v) => v - spark[0]) : spark;
              return (
                <button
                  key={key}
                  type="button"
                  className={`ladder-row${isActive ? " is-active" : ""}${p.you ? " is-you" : ""}`}
                  onClick={() => onSelect(key)}
                  // El mismo escalonado de entrada que la liga: la tabla se
                  // arma en vez de aparecer de golpe.
                  style={{ ["--fila" as string]: i }}
                >
                  <span className={`col-rank${rank === 1 && sortKey === "ladder" ? " campeon" : ""}`}>
                    {/* La corona SOLO con el orden del ladder. Con cualquier
                        otro, `rank` es la posición en ESA lista y no el puesto
                        real (ver el comentario de arriba): coronar al de mejor
                        winrate diría que va ganando el ladder, y no. */}
                    {rank === 1 && sortKey === "ladder" ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Primero del ladder">
                        <path d="M3 8l4.5 3.5L12 4l4.5 7.5L21 8l-1.8 10.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L3 8z" />
                      </svg>
                    ) : (
                      rank
                    )}
                  </span>
                  <span className="col-player">
                    {/* La cara del invocador, no solo el ícono de su rol. Un
                        ladder sin caras se lee como una planilla: el avatar es
                        lo que hace que cada fila sea una PERSONA y no un
                        renglón. El rol pasa a badge sobre el avatar en vez de
                        ocupar su propia casilla — misma información, un
                        elemento menos por fila. */}
                    <span className="ladder-avatar-wrap">
                      <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="ladder-avatar" />
                      <span className="ladder-role-badge" title={ROLES[p.role].label}>
                        <RoleIcon role={p.role} />
                      </span>
                    </span>
                    <span className="player-id">
                      <span className="player-name">
                        {p.name}
                        <span className="player-tag">#{p.tag}</span>
                        {p.you && <span className="you-badge">VOS</span>}
                        {p.liveGame && (
                          <span
                            className="live-badge"
                            aria-label={`En vivo: ${championLabel(p.liveGame.champion)}, ${p.liveGame.queueLabel}, ${liveGameTimeLabel(p.liveGame.startedMinutesAgo)}`}
                          >
                            <span className="live-dot" />
                            En vivo · {championLabel(p.liveGame.champion)}
                          </span>
                        )}
                      </span>
                      {/* Con la cara del campeón y no solo el nombre. Era la única fila
                          de la app donde el campeón era texto pelado, y "Main:
                          Yasuo" al lado de una tabla con arte en todos lados se
                          notaba. */}
                      <span className="player-champ" title="Su campeón más jugado">
                        <ChampIcon champ={p.mainChamp} version={ddragonVersion} className="player-champ-art" />
                        {championLabel(p.mainChamp)}
                      </span>
                      {/*
                        Rendered as a sibling of player-name (not nested inside
                        the live-badge) on purpose: player-name has its own
                        overflow:hidden for the name-ellipsis truncation, which
                        would silently clip an absolutely-positioned popup
                        living inside it. player-id has no overflow set, so the
                        popup escapes cleanly; :has() ties its visibility back
                        to hovering the badge specifically.
                      */}
                      {p.liveGame && (
                        <span className="live-popup" role="tooltip">
                          <span className="live-popup-head">
                            <span className="live-popup-avatar">
                              {p.profileIconUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- one small fixed-size avatar, not worth next/image's config for an external CDN
                                <img src={p.profileIconUrl} alt="" />
                              ) : (
                                champTag(p.mainChamp)
                              )}
                            </span>
                            <span className="live-popup-name">
                              {p.name} <span className="player-tag">#{p.tag}</span>
                            </span>
                          </span>
                          <span className="live-popup-champ">
                            <ChampIcon champ={p.liveGame.champion} version={ddragonVersion} className="live-popup-champ-avatar" />
                            {championLabel(p.liveGame.champion)}
                          </span>
                          <span className="live-popup-meta">
                            {p.liveGame.queueLabel} · {liveGameTimeLabel(p.liveGame.startedMinutesAgo)}
                          </span>
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="col-tier">
                    <TierEmblem tierKey={p.tierKey} division={p.division} />
                    {/* El LP arriba y grande, el nombre del rango abajo y
                        chico. Es al revés de como estaba, y el que manda es el
                        LP por una razón concreta: el EMBLEMA que está al lado
                        ya dice el tier —es su único trabajo— así que escribir
                        "Esmeralda 4" en el tamaño más grande de la celda es
                        decir dos veces lo mismo. Lo que el emblema no puede
                        decir es en qué parte de esa división está, y eso es
                        justo lo que se mira para saber quién va ganando. */}
                    <span className="tier-text">
                      <span className="tier-lp">
                        {p.lp} <i>LP</i>
                      </span>
                      <span className="tier-name" style={{ color: t.fg }}>
                        {t.name} {p.division}
                      </span>
                    </span>
                  </span>
                  <span className="col-winrate">
                    <span className="wr-top">
                      {/* Desde los contadores y no desde p.winrate: el
                          porcentaje redondeado decía "50%" con 302V-307D, que
                          es 49,6%. El número tiene que coincidir con el récord
                          que está justo al lado. */}
                      <span className={`wr-pct ${tonoDeWinrate(p.wins, p.wins + p.losses)}`}>
                        {winrateTexto(p.wins, p.wins + p.losses)}
                      </span>
                      <span className="wr-count">
                        <span className="wc-v">{p.wins}V</span>
                        <span className="wc-sep">·</span>
                        <span className="wc-d">{p.losses}D</span>
                      </span>
                    </span>
                    <span className="wr-bottom">
                      <span className="wr-bar">
                        <span className="wr-seg win" style={{ flex: p.wins }} />
                        <span className="wr-seg loss" style={{ flex: p.losses }} />
                      </span>
                      {streak && (
                        <span className={`wr-streak ${streak.result === "W" ? "w" : "l"}`}>
                          <StreakIcon result={streak.result} /> {streak.count}
                          {streak.capped ? "+" : ""} {streak.result === "W" ? "V" : "D"}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="col-spark">
                    {/* Exactamente las mismas medidas que el de la liga
                        (230x34, pad 5): son los dos el mismo gráfico y no hay
                        motivo para que uno sea más grande. Antes era un
                        viewBox de 150 en una columna de 305px y, como el SVG
                        usa preserveAspectRatio="none", salía estirado al DOBLE
                        de ancho (medido: 2,03x) — eso ensancha el trazo solo
                        en horizontal, aplana la curva y convierte el punto
                        final en un óvalo.

                        Y la serie va RELATIVA a su arranque, como en la liga:
                        la forma de la curva es idéntica (la geometría
                        normaliza min-max igual), pero así el 0 existe y la
                        línea punteada marca de dónde salió — que es
                        exactamente lo que dice el "▲ N LP" de abajo. */}
                    <SparkChart
                      values={sparkRelativa}
                      width={230}
                      height={34}
                      pad={5}
                      color={trendColor(spark)}
                      lineaCero
                    />
                    {/* La curva sola dice la forma pero no la magnitud: dos
                        jugadores con la misma silueta pueden haber movido 5
                        puntos o 90. recentDelta ya se calculaba para ordenar
                        por "progreso reciente", solo que nunca se mostraba. */}
                    {spark.length >= 2 && (
                      <span className={`spark-delta ${recentDelta(p) >= 0 ? "up" : "down"}`}>
                        {recentDelta(p) >= 0 ? "▲" : "▼"} {Math.abs(recentDelta(p))} {unidadDelta(p)}
                      </span>
                    )}
                  </span>
                  <span className="col-chevron">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
        </>
      )}
    </section>
  );
}
