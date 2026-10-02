import type { Match } from "@/lib/types";
import { formatRelativeDate } from "@/lib/ladder";
import { itemIconUrl } from "@/lib/ddragon";
import { InfoTip } from "./InfoTip";
import { METRIC_INFO } from "@/lib/metric-info";
import { ClockIcon, EyeIcon, ReviewIcon, ShieldIcon, TrendUpIcon, ZapIcon } from "./StatIcons";
import { TuLinea, LaPartida } from "./MatchTimeline";
import type { CompraItem } from "@/lib/builds";

/** Only pentakills get the celebratory banner — doubles/triples/quadras are common enough to skip. */
function multikillLabel(m: Match): string | null {
  return m.pentaKills > 0 ? "¡PENTAKILL!" : null;
}

/**
 * Una CUOTA: qué porción del equipo te tocó a vos.
 *
 * "% daño del equipo: 14%" en una fila de formulario es trivia — 14% puede ser
 * excelente de support y un desastre de mid, y el número solo no lo dice. Como
 * barra contra la marca del **quinto** (20%, lo que toca si los cinco aportan
 * igual) se lee sin pensarlo: estás arriba o estás abajo de tu parte.
 *
 * La referencia es opcional porque no todas las cuotas tienen una: la
 * participación en kills no es "una quinta parte de algo", es en cuántas de las
 * kills del equipo estuviste, y ahí inventarle un 20% sería mentir. Esa va como
 * barra pelada de 0 a 100, que ya significa algo sola.
 */
function Cuota({
  label,
  pct,
  tooltip,
  referencia,
}: {
  label: string;
  pct: number;
  tooltip?: string;
  referencia?: { valor: number; texto: string };
}) {
  const ancho = Math.max(0, Math.min(100, pct));
  const arriba = referencia ? pct >= referencia.valor : false;
  return (
    <div className="cuota">
      <span className="cuota-k">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
      <span className="cuota-pista">
        <span className={`cuota-relleno${arriba ? " arriba" : ""}`} style={{ width: `${ancho}%` }} />
        {referencia && <span className="cuota-ref" style={{ left: `${referencia.valor}%` }} title={referencia.texto} />}
      </span>
      <span className={`cuota-v${arriba ? " arriba" : ""}`}>{pct}%</span>
    </div>
  );
}

/**
 * Una FICHA: el número grande arriba y qué es, abajo y chico.
 *
 * Es para las magnitudes —daño, visión— que no son cuota de nada y no tienen
 * contra qué compararse. Al revés que en la fila de formulario, acá el número
 * manda y la etiqueta acompaña, que es el orden en que se los mira.
 */
function Ficha({
  valor,
  label,
  sub,
  tooltip,
  tono,
}: {
  valor: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
  tooltip?: string;
  /** Verde la curación, azul el escudo. Son dos cosas distintas y el color las separa sin meter otro ícono. */
  tono?: "cura" | "escudo";
}) {
  return (
    <div className={`ficha${tono ? ` ${tono}` : ""}`}>
      <span className="ficha-v">{valor}</span>
      <span className="ficha-k">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </span>
      {sub && <span className="ficha-sub">{sub}</span>}
    </div>
  );
}

/** Real Riot monsterSubType (Match-V5 timeline) → the icon set uploaded for the 4 classic elemental drakes. Hextech/Chemtech/Elder have no matching art, so those kills just don't get an icon. */
const DRAGON_ICON_BY_SUBTYPE: Record<string, string> = {
  FIRE_DRAGON: "/icons/dragons/infernal-48.png",
  WATER_DRAGON: "/icons/dragons/ocean-48.png",
  EARTH_DRAGON: "/icons/dragons/mountain-48.png",
  AIR_DRAGON: "/icons/dragons/cloud-48.png",
};

/** Compact "12 puestas · 3 sacadas" style breakdown — replaces a run-on sentence with scannable chips. */
/** "1 dragones" no existe. Cada ítem del desglose trae su singular y su plural. */
function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function MiniBreakdown({
  items,
  tip,
}: {
  items: { value: number; label: string; icons?: string[] }[];
  /**
   * La aclaración de la fila, si la tiene. Va ADENTRO del flex de las píldoras
   * y no al lado: como hermano del contenedor se llevaba un renglón entero
   * para sí solo —arriba o abajo de las píldoras, según dónde se lo pusiera—
   * porque el contenedor es ancho y lo empujaba. Adentro fluye y envuelve con
   * ellas, que es lo que uno espera de un signo de pregunta.
   */
  tip?: string;
}) {
  return (
    <span className="v mini-breakdown">
      {tip && <InfoTip text={tip} />}
      {items.map((it) => (
        <span className={`mini-breakdown-item${it.value === 0 ? " en-cero" : ""}`} key={it.label}>
          {it.icons?.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fixed tiny inline glyphs, not a page asset
            <img className="mini-breakdown-icon" src={src} alt="" key={i} />
          ))}
          <strong>{it.value}</strong>
          {it.label}
        </span>
      ))}
    </span>
  );
}

/**
 * El recorrido de la build: solo los ítems completos, en el orden real en que
 * los terminó (ver recorridoCore en lib/builds.ts). Es la lectura que sirve
 * para entender la partida — "arrancó con esto y después fue para acá" — y
 * que quedaba enterrada en la fila de veinte íconos donde una poción pesaba
 * lo mismo que un legendario.
 */
function BuildPath({ items, version }: { items: { id: number; nombre: string }[] | undefined; version: string | null }) {
  if (!items || items.length === 0) {
    return <span className="build-line-empty">No llegó a completar ningún ítem.</span>;
  }
  return (
    <span className="build-path">
      {items.map((it, i) => (
        <span className="build-path-step" key={`${it.id}-${i}`}>
          {i > 0 && <span className="build-path-arrow">→</span>}
          <span className="build-path-item" title={it.nombre}>
            {version && (
              // eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo, no vale la config de next/image
              <img src={itemIconUrl(version, it.id)} alt={it.nombre} />
            )}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * La compra completa, agrupada por ítem y plegada.
 *
 * Sin plegar son treinta íconos donde la mitad es la misma poción: en el
 * celular ocupaba media pantalla para decir algo que casi nunca se mira. Ya
 * agrupada (ver agruparCompra en lib/builds.ts) entra en dos líneas, y el
 * contador dice algo que la fila larga escondía — cuántas pociones se tomó.
 *
 * Sigue estando entera y sin reconciliar contra ventas: si compró un ítem y
 * lo vendió, aparece, porque lo compró.
 */
function CompraCompleta({ compra, version }: { compra: CompraItem[] | undefined; version: string | null }) {
  // Igual que en el cara a cara: un JSON viejo del CDN no trae este campo.
  if (!compra || compra.length === 0) {
    return <span className="build-line-empty">Sin datos de compra guardados para esta partida.</span>;
  }
  const total = compra.reduce((n, c) => n + c.veces, 0);
  return (
    <details className="compra">
      <summary className="compra-summary">
        Compra completa
        <span className="compra-count">
          {compra.length} ítems · {total} compras
        </span>
      </summary>
      <div className="compra-row">
        {compra.map((c) => (
          <span className={`compra-item${c.consumible ? " consumible" : ""}`} key={c.id} title={c.nombre}>
            {version && (
              // eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo
              <img src={itemIconUrl(version, c.id)} alt={c.nombre} />
            )}
            {c.veces > 1 && <span className="compra-veces">{c.veces}</span>}
          </span>
        ))}
      </div>
    </details>
  );
}

function Group({
  label,
  icon,
  ancho,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  /** Bloque a todo el ancho ANTES de la grilla — para un gráfico, que en una celda de la grilla quedaría del ancho de una columna. */
  ancho?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="match-detail-group">
      <h4 className="match-detail-group-label">
        <span className="match-detail-group-icon">{icon}</span>
        {label}
      </h4>
      {ancho}
      {children && <div className="match-detail-cuerpo">{children}</div>}
    </div>
  );
}

/**
 * Expanded view for one match, shown inline below its row in PlayerProfile.
 * Only renders real data we actually have. LP ganado/perdido por partida no
 * está acá a propósito: no es un "todavía no lo hicimos", es un gap real de
 * arquitectura (LP se trackea por snapshot periódico, no por partida) que
 * necesita un trigger o mecanismo nuevo — se vuelve a agregar cuando exista.
 */
export function MatchDetail({ match, ddragonVersion }: { match: Match; ddragonVersion: string | null }) {
  const m = match;
  const multikill = multikillLabel(m);
  // El rol REAL de esa partida, no el main del jugador: alguien que suele ir
  // mid pero esa vez fue de support tiene que ver sus curaciones igual.
  const esSupport = m.role === "support";
  const curacion = m.healTeammates;
  const escudo = m.shieldTeammates;
  const hasTimeline =
    m.goldDiff10 != null ||
    m.goldDiff15 != null ||
    m.goldDiff20 != null ||
    m.firstBloodTimeS != null ||
    m.firstTowerTimeS != null ||
    m.firstDragonTimeS != null ||
    m.firstBaronTimeS != null;
  return (
    <div className="match-detail">
      {multikill && <div className="match-multikill">{multikill}</div>}
      {/* "Para repasar" con UNA razón y los dos valores reales. Antes decía
          "KDA 569% por encima de tu promedio": el cálculo estaba bien, pero
          con un baseline chico el porcentaje explota y la chapa parecía un
          informe financiero. `principal` puede faltar si el JSON viene de
          antes del deploy (caché del CDN); ahí se cae al texto viejo. */}
      {m.flag && (
        <div className="match-review-banner">
          <ReviewIcon />
          {m.flag.principal ? (
            <span>
              <strong>Para repasar</strong>
              <span className="match-review-razon">
                {m.flag.principal.metrica} <b>{m.flag.principal.valor.toLocaleString("es-AR")}</b>
                <span className="match-review-base">
                  habitual {m.flag.principal.base.toLocaleString("es-AR")}
                </span>
              </span>
            </span>
          ) : (
            <span>
              <strong>Para repasar</strong> — <span className="match-review-reasons">{m.flag.reasons.join(" · ")}</span>
            </span>
          )}
        </div>
      )}

      {/* Duración, CS, oro, nivel y fecha eran cinco celdas con su título
          arriba: quince líneas de alto para cinco números que se leen mejor
          seguidos, como el encabezado de una ficha y no como un formulario. */}
      <div className="match-meta">
        <span>
          <ClockIcon />
          {m.dur} min
        </span>
        <span>
          <strong>{m.cs}</strong> CS
          <span className="unit">({m.csmin}/min)</span>
          <InfoTip text={METRIC_INFO.csPerMin} />
        </span>
        <span>
          <strong>{m.goldTotal.toLocaleString("es-AR")}</strong> oro
          <span className="unit">({m.gold}/min)</span>
          <InfoTip text={METRIC_INFO.goldPerMin} />
        </span>
        {m.champLevel > 0 && (
          <span>
            nivel <strong>{m.champLevel}</strong>
          </span>
        )}
        <span className="match-meta-fecha">{formatRelativeDate(m.playedAt)}</span>
      </div>

      {/* La narración y la build, lado a lado. Antes la build estaba al FONDO,
          abajo de todos los números, y no tiene sentido: con qué jugaste es
          parte de cómo se dio la partida, no una nota al pie. Y la tarjeta
          entera era una sola columna de seis bloques apilados — media pantalla
          de scroll para una partida. En dos columnas el relato y la build se
          leen juntos, que es como se piensan. En el teléfono se apilan. */}
      <div className="match-dos">
      {/* Primero de todo: es lo que cuenta la partida. Los números de abajo
          la describen, esto la narra. */}
        {/* Dos bloques y no uno: tu línea y la partida son dimensiones
            distintas, y juntas invitaban a leer una causa donde solo hay dos
            hechos. Cada uno se dibuja solo si tiene con qué — sin diferencia
            de oro no hay "Tu línea", sin hitos no hay "La partida". */}
        {hasTimeline && (
          <Group
            // "Cómo se dio" y no "Cómo se dio la partida": adentro hay una
            // sección que se llama "La partida" y el título repetido a dos
            // centímetros se lee como un error.
            label="Cómo se dio"
            icon={<TrendUpIcon />}
            ancho={
              <>
                <TuLinea match={m} ddragonVersion={ddragonVersion} />
                <LaPartida match={m} />
              </>
            }
          />
        )}
        <Group
          label="Build"
          icon={<ShieldIcon />}
          ancho={
            // Runas, hechizos y recorrido eran tres filas apiladas con su
            // etiqueta cada una: media pantalla de celular para tres datos que
            // se leen de un vistazo si están juntos. Acá van en una tira, con
            // la compra completa plegada al final.
            <div className="build-strip">
              <div className="build-strip-top">
                <span
                  className="build-chip"
                  title={m.primaryStyle && m.secondaryStyle ? `${m.primaryStyle} / ${m.secondaryStyle}` : undefined}
                >
                  {m.primaryRuneIconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo
                    <img className="build-icon" src={m.primaryRuneIconUrl} alt="" />
                  )}
                  {m.primaryRune ?? "—"}
                </span>
                {/* Con íconos van los dos pegados; sin íconos hace falta el
                    separador o se lee "FlashTeleport". */}
                <span className="build-chip">
                  {m.summoner1IconUrl && m.summoner2IconUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo */}
                      <img className="build-icon" src={m.summoner1IconUrl} alt={m.summoner1 ?? ""} title={m.summoner1 ?? undefined} />
                      {/* eslint-disable-next-line @next/next/no-img-element -- ícono chico de tamaño fijo */}
                      <img className="build-icon" src={m.summoner2IconUrl} alt={m.summoner2 ?? ""} title={m.summoner2 ?? undefined} />
                    </>
                  ) : (
                    `${m.summoner1 ?? "—"} / ${m.summoner2 ?? "—"}`
                  )}
                </span>
              </div>
              <BuildPath items={m.coreBuild} version={ddragonVersion} />
              <CompraCompleta compra={m.compra} version={ddragonVersion} />
            </div>
          }
        />
      </div>

      {/* Las tres cuotas JUNTAS, que es la idea nueva de todo esto. Antes había
          dos en "Combate" y una en "Visión", y son el mismo tipo de número: qué
          porción del equipo te tocó. Separadas no se podían comparar entre
          ellas; juntas, sobre la misma escala y contra la misma marca del
          quinto, se lee de un vistazo en qué pesaste y en qué no — que es la
          lectura que de verdad describe una partida. */}
      <Group label="Tu peso en el equipo" icon={<ZapIcon />}>
        <div className="cuotas">
          <Cuota
            label="Del daño a campeones"
            pct={m.dmgShare}
            tooltip={METRIC_INFO.dmgShare}
            referencia={{ valor: 20, texto: "El 20% es tu quinta parte: lo que te toca si los cinco pegan igual." }}
          />
          <Cuota label="De las kills" pct={m.killParticipation} tooltip={METRIC_INFO.killParticipation} />
          <Cuota
            label="De los objetivos"
            pct={m.objShare}
            tooltip={METRIC_INFO.objShare}
            referencia={{ valor: 20, texto: "El 20% es tu quinta parte: lo que te toca si los cinco participan igual." }}
          />
        </div>
      </Group>

      {/* Y los dos bloques de números, también lado a lado. */}
      <div className="match-dos">
        <Group label="Combate" icon={<ZapIcon />}>
          {/* Primero las cuotas: son las dos que dicen si la partida estuvo bien
              o mal jugada, y son las únicas que tienen contra qué compararse. */}

          {/* Después las magnitudes, con el número adelante. */}
          <div className="fichas">
            <Ficha valor={m.damageToChamps.toLocaleString("es-AR")} label="Daño a campeones" />
            {m.damagePerMin != null && (
              <Ficha valor={Math.round(m.damagePerMin).toLocaleString("es-AR")} label="Daño por minuto" />
            )}
            <Ficha
              valor={m.damageTaken.toLocaleString("es-AR")}
              label="Daño recibido"
              sub={`${m.damageMitigated.toLocaleString("es-AR")} mitigado`}
            />
            {/* Curación y escudo: solo de support, y solo si Riot mandó los datos.
                En cualquier otra línea son ruido —un bruiser "cura" con robo de
                vida y no ayudó a nadie— y acá la cifra es sobre COMPAÑEROS, que es
                la única que dice lo que un enchanter hizo por el equipo. */}
            {esSupport && curacion !== null && (
              <Ficha
                tono="cura"
                valor={curacion.toLocaleString("es-AR")}
                label="Curados"
                tooltip="Vida curada sobre tus COMPAÑEROS, no sobre vos: la curación propia del robo de vida no entra. Solo se muestra de support porque en las otras líneas el número no dice nada."
              />
            )}
            {esSupport && escudo !== null && (
              <Ficha tono="escudo" valor={escudo.toLocaleString("es-AR")} label="De escudo" />
            )}
          </div>

          {/* Y al final los HECHOS: cosas que pasaron o no pasaron. Antes cada una
              se comía una fila entera del formulario con el mismo peso que el daño
              del equipo — "Primera sangre: No" ocupaba lo mismo que la cuota que
              define la partida. Como chips ocupan un renglón entre todas, y las
              que no pasaron se apagan en vez de desaparecer: un 0 en solo kills
              es información para el que esperaba tener alguno. */}
          <div className="hechos">
            {m.skillshotsHit != null && (
              <span className={`hecho${m.skillshotsHit === 0 ? " en-cero" : ""}`}>
                <strong>{m.skillshotsHit}</strong> skillshots
              </span>
            )}
            {m.soloKills != null && (
              <span className={`hecho${m.soloKills === 0 ? " en-cero" : ""}`}>
                <strong>{m.soloKills}</strong> solo {plural(m.soloKills, "kill", "kills")}
              </span>
            )}
            {m.firstBlood && <span className="hecho destacado">🩸 Primera sangre</span>}
            {m.pentaKills > 0 && (
              <span className="hecho destacado">
                <strong>{m.pentaKills}</strong> {plural(m.pentaKills, "pentakill", "pentakills")}
              </span>
            )}
          </div>
        </Group>
        <Group label="Visión y objetivos" icon={<EyeIcon />}>

          {/* El puntaje de visión con sus wards pegados abajo: el puntaje SALE de
              los wards, así que separarlos en dos filas de formulario obligaba a
              atar dos datos que son uno solo. */}
          <div className="fichas">
            <Ficha
              valor={m.visionScore}
              label="Puntaje de visión"
              tooltip={METRIC_INFO.visionScore}
              sub={
                <MiniBreakdown
                  items={[
                    { value: m.wardsPlaced, label: plural(m.wardsPlaced, "puesto", "puestos") },
                    { value: m.wardsKilled, label: plural(m.wardsKilled, "limpiado", "limpiados") },
                    { value: m.controlWards, label: "de control" },
                  ]}
                />
              }
            />
          </div>

          {/* Sin rótulo, igual que la fila de hechos de Combate. "Torres",
              "dragones" y "barones" ya dicen que son objetivos: la palabra
              OBJETIVOS adelante era redundante y se comía noventa píxeles de
              la primera fila, que a media columna es lo que decide si las
              cinco píldoras entran en un renglón o en dos. La aclaración de
              cómo se cuentan queda en el signo de pregunta del final. */}
          <div className="hechos objetivos">
            <MiniBreakdown
              tip="Torres, dragones, barones y heraldo cuentan participación (kill o asistencia), no solo si vos diste el golpe final. Inhibidores es la excepción: Riot no expone participación para eso, solo cuenta si lo rompiste vos. Vacas del Vacío no están porque Riot tampoco las separa del resto."
              items={[
                { value: m.turretTakedowns, label: plural(m.turretTakedowns, "torre", "torres") },
                {
                  value: m.dragonTakedowns,
                  label: plural(m.dragonTakedowns, "dragón", "dragones"),
                  // Un ícono real por dragón que efectivamente mató este jugador
                  // (Match-V5 timeline, monsterSubType) — Hextech/Chemtech/Elder
                  // no tienen arte propio así que esos kills quedan sin ícono,
                  // pero siguen contando en el número. Si solo asistió (no mató)
                  // o la partida es vieja sin timeline guardado, cae al infernal
                  // genérico, mejor que nada.
                  icons:
                    m.dragonTypes.length > 0
                      ? m.dragonTypes.map((t) => DRAGON_ICON_BY_SUBTYPE[t]).filter((src): src is string => !!src)
                      : m.dragonTakedowns > 0
                        ? ["/icons/dragons/infernal-48.png"]
                        : [],
                },
                { value: m.baronTakedowns, label: plural(m.baronTakedowns, "barón", "barones") },
                { value: m.heraldTakedowns, label: plural(m.heraldTakedowns, "heraldo", "heraldos") },
                { value: m.inhibitorKills, label: plural(m.inhibitorKills, "inhibidor", "inhibidores") },
              ]}
            />
          </div>
        </Group>
      </div>
    </div>
  );
}
