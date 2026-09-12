"use client";

import { useId, useRef, useState } from "react";
import { lineAreaGeometry } from "@/lib/chart";

interface SparkChartProps {
  values: number[];
  width?: number;
  height?: number;
  pad?: number;
  color: string;
  /**
   * "detailed" adds reference gridlines, a glow behind the line, and (with
   * pointLabels) a hover tooltip. "mini" is the quietest of the three — a
   * thinner, crisper line with a much lighter area fill, for the digest card
   * where the chart supports a headline number instead of being the subject.
   */
  variant?: "compact" | "detailed" | "mini";
  /** One React node per value, shown in the hover tooltip — detailed variant only. */
  pointLabels?: React.ReactNode[];
  /**
   * Líneas horizontales de referencia sobre valores que no son puntos del
   * gráfico — los límites de división en el caso del LP. Sin ellas la curva
   * es un garabato: se ve que baja, pero no CONTRA QUÉ baja.
   */
  guides?: { value: number; label: string }[];
  /**
   * Dibuja una línea de referencia en el 0. Es para las series que YA son un
   * neto (la liga: cada punto es cuánto ganó o perdió contra su arranque), y
   * sin ella una curva que baja se ve igual que una que sube poco. A
   * diferencia de `guides`, esta se dibuja en las tres variantes: no lleva
   * etiqueta, así que no tiene el problema del <text> que escala con la caja.
   */
  lineaCero?: boolean;
  /**
   * Techo y piso fijos en vez de los de esta serie. Se usa cuando hay varias
   * curvas juntas que se comparan entre sí —la columna "Evolución" de la
   * liga— porque escalada cada una contra lo suyo, la semana de +8 y la de +1
   * dibujan la misma pendiente. Ver lineAreaGeometry.
   */
  escala?: { min: number; max: number };
  /**
   * Texto corto para el techo y el piso de la ventana, en HTML encima del SVG
   * (el <text> de un SVG escala con la caja y en un celular cae a 4px). Hasta
   * ahora esos dos números solo estaban en el tooltip, y en el celular no hay
   * hover: el gráfico se podía mirar entero sin poder leer un solo valor.
   * Se pasa uno por punto y el componente elige los dos que marca.
   */
  valorDePunto?: (index: number) => string;
}

/** Smoothed line + gradient area + endpoint dot — used for the "últimos 20" column and the LP chart. */
export function SparkChart({
  values,
  width = 150,
  height = 28,
  pad = 6,
  color,
  variant = "compact",
  pointLabels,
  guides,
  lineaCero,
  escala,
  valorDePunto,
}: SparkChartProps) {
  // Con menos de dos puntos no hay línea que dibujar, y lineAreaGeometry
  // dividiría por (values.length - 1) = 0 y leería points[0] de un arreglo
  // vacío: eso tira, y como esto se dibuja adentro de cada fila del ladder,
  // el error se lleva puesta la tabla entera.
  //
  // No es hipotético: un invocador recién agregado no tiene ni una foto de LP
  // hasta el primer refresco, así que su lpHistory llega vacío. Agregar a
  // alguien podía dejar la pantalla en blanco para todos hasta que corriera
  // el cron.
  const detailed = variant === "detailed";
  const mini = variant === "mini";
  // Compact ("últimos 20" ladder cells) gets its own horizontal margin, wider
  // than its vertical one — a sparkline reads as more "premium" when it fills
  // most of its row width but keeps a bit more vertical breathing room, rather
  // than using the same pad on both axes like the detailed profile chart does.
  // Mini spans the card's full inner width instead, so it reads as a base rule
  // under the card's content rather than a floating inset graphic.
  // El detallado necesita bastante más aire a los costados que el resto: es un
  // gráfico grande dentro de una tarjeta, y con el mismo pad que una
  // sparkline de 28px la curva arranca y termina pegada a las paredes. Eso es
  // la mitad de la sensación de "todo apretado".
  const padX = detailed ? pad + 14 : mini ? pad : pad + 3;
  // Techo y piso de la ventana: los únicos dos puntos, además del arranque,
  // que vale la pena marcar en un gráfico de veinte.
  const indiceMax = values.indexOf(Math.max(...values));
  const indiceMin = values.indexOf(Math.min(...values));
  // El detallado va en escalera: entre dos fotos el LP no se mueve, así que la
  // diagonal afirmaba un movimiento gradual que nunca pasó (ver stepPath). Los
  // chicos siguen en curva suave — veinte escalones en una caja de 28px se
  // leen como un peine, y ahí el gráfico es el respaldo de un número, no el
  // dato en sí.
  const forma = detailed ? "escalera" : "curva";
  const { line, area, last, points, yOf } = lineAreaGeometry(values, width, height, padX, 10, pad, forma, escala);
  const gid = "spark-" + useId().replace(/[:]/g, "");
  /**
   * Las guías que realmente entran en la caja, ya pasadas a porcentaje: la
   * línea se dibuja adentro del SVG (escala bien) y la etiqueta va en HTML
   * encima (no escala, así que se lee igual en un monitor que en un celular).
   * Una guía pegada al borde de arriba o de abajo se confunde con el marco,
   * así que esa no se dibuja.
   */
  const guiasVisibles = !detailed
    ? []
    : (guides ?? [])
        .map((g) => ({ ...g, y: yOf(g.value) }))
        .filter((g) => g.y >= pad + 6 && g.y <= height - pad - 6)
        .map((g) => ({ label: g.label, pct: (g.y / height) * 100, leftPct: (padX / width) * 100 }));
  /**
   * El techo y el piso de la ventana, escritos sobre el punto. Se saltean si
   * caen en las puntas: el primero ya tiene su elo debajo del gráfico y el
   * último está en el encabezado, así que ahí la etiqueta sería el mismo
   * número dos veces.
   *
   * El left se recorta a los costados (igual que el tooltip): un pico en el
   * segundo punto tiene el centro a menos de media etiqueta del borde y se
   * salía de la tarjeta. Queda apenas corrido del punto, que es mucho menos
   * molesto que cortado.
   */
  const extremos: { key: string; arriba: boolean; texto: string; leftPct: number; topPct: number }[] = [];
  if (detailed && valorDePunto) {
    for (const { i, arriba } of [
      { i: indiceMax, arriba: true },
      { i: indiceMin, arriba: false },
    ]) {
      if (i <= 0 || i >= values.length - 1) continue;
      extremos.push({
        key: arriba ? "techo" : "piso",
        arriba,
        texto: valorDePunto(i),
        leftPct: Math.min(Math.max((points[i][0] / width) * 100, 9), 91),
        topPct: (points[i][1] / height) * 100,
      });
    }
  }
  // Compact's endpoint marker used to feel like a separate button stuck onto
  // the line (big halo ring) — shrunk so it reads as "last value, subtly
  // marked" instead of a UI element competing with the row's own chevron.
  const dotRadius = detailed ? 4 : mini ? 2.2 : 2.6;
  const haloExtra = detailed ? 3 : mini ? 1.6 : 2;
  const haloOpacity = detailed ? 0.35 : mini ? 0.22 : 0.3;
  const haloStrokeWidth = detailed ? 1.5 : 1;
  const strokeWidth = detailed ? 2.5 : mini ? 1.75 : 2;
  // Antes el detallado usaba juntas en punta. Con veinte snapshots en pocos
  // días, cada pico es un ángulo agudo y la línea entera se lee como una
  // sierra. Redondear las juntas no cambia un solo valor y saca el ruido.
  // La escalera va con junta en punta: sus vértices son ángulos rectos y el
  // chiste es justamente que el salto se vea seco. Redondearlos le devolvía un
  // poco de la suavidad que la escalera vino a sacar.
  const lineJoin = detailed ? "miter" : "round";
  // Area fill: mini's is deliberately the faintest of the three. At compact's
  // 0.45 the wash under a wide card-width curve turned into a solid green
  // block that outweighed the "+260 pts" it's supposed to support.
  const areaTopOpacity = detailed ? "0.22" : mini ? "0.18" : "0.45";
  // Compact's line+dot go translucent rather than flat-solid — a softer,
  // more refined feel for the dense "últimos 20" column specifically;
  // detailed (the profile's own big LP chart) keeps full-strength color.
  // Mini keeps its line nearly full-strength: at 1.75px the stroke is already
  // light, and dropping opacity on top of that made it read as washed out
  // rather than delicate.
  const lineOpacity = detailed ? 1 : mini ? 0.92 : 0.82;
  // Restrained glow — enough to keep the line from reading as a flat hairline,
  // without the neon-gaming look a heavier blur gave it. Compact's used to be
  // proportionally bigger than detailed's for the same reason as before: a
  // 28px cell needs more relative blur than a 118px one just to register at
  // all — but too much of it pooled into a visible stain under the line, so
  // it's now the smaller of the two, tight around the stroke.
  const blurRadius = detailed ? 2.2 : 1;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(width);
  const canHover = detailed && !!pointLabels;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!canHover || !svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    // El punto MÁS CERCANO de verdad, en vez de invertir un paso constante.
    // Con espaciado parejo da exactamente el mismo resultado, y deja de
    // depender de que el espaciado SEA parejo — que fue justo lo que se
    // rompió cuando se probó mover la X a tiempo real.
    let idx = 0;
    let mejor = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i][0] - relX);
      if (d < mejor) {
        mejor = d;
        idx = i;
      }
    }
    setHover(idx);
    setContainerWidth(rect.width);
  }

  // Fixed width matching .spark-tooltip's CSS — lets us clamp its pixel
  // position so it never spills past the chart's edges (it used to overflow
  // the card near the first/last points, since a centered tooltip doesn't
  // know how close it is to the boundary).
  const TOOLTIP_WIDTH = 176;
  const pointPx = hover !== null ? (points[hover][0] / width) * containerWidth : 0;
  const tooltipLeft =
    hover !== null ? Math.min(Math.max(pointPx, TOOLTIP_WIDTH / 2), containerWidth - TOOLTIP_WIDTH / 2) : 0;
  // The little arrow needs to keep pointing at the actual hovered point even
  // when the box itself got clamped away from being centered on it.
  const arrowLeft = hover !== null ? Math.min(Math.max(pointPx - (tooltipLeft - TOOLTIP_WIDTH / 2), 14), TOOLTIP_WIDTH - 14) : TOOLTIP_WIDTH / 2;

  // Después de los hooks, nunca antes: React exige que la cantidad de hooks
  // sea la misma en cada render.
  if (values.length < 2) return null;

  return (
    <div style={canHover || guiasVisibles.length > 0 || extremos.length > 0 ? { position: "relative" } : undefined}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Tendencia"
        onMouseMove={canHover ? handleMove : undefined}
        onMouseLeave={canHover ? () => setHover(null) : undefined}
        style={canHover ? { cursor: "crosshair" } : undefined}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={areaTopOpacity} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          {/* Off-center highlight (top-left) on the endpoint dot only — a flat
              fill on a small solid circle read as a plain painted disc, no
              different from a CSS div. A radial gradient with the light
              coming from one side gives it just enough sphere-like depth to
              read as a real marker instead of a flat 2D shape, without the
              heavier gloss/gradient treatment tried (and reverted) elsewhere. */}
          <radialGradient id={`${gid}-dot`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="45%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.9" />
          </radialGradient>
          {/*
            filterUnits="userSpaceOnUse" with absolute coordinates on purpose: the default
            objectBoundingBox sizes this region as a % of the filtered element's own bbox,
            and a perfectly flat line (all values equal — common with few real snapshots)
            has a ZERO-height bbox, so any percentage of it is also zero. That collapsed the
            filter region and hid the whole line, leaving only the endpoint dot visible.
          */}
          <filter
            id={`${gid}-glow`}
            filterUnits="userSpaceOnUse"
            x={-blurRadius * 4}
            y={-blurRadius * 4}
            width={width + blurRadius * 8}
            height={height + blurRadius * 8}
          >
            <feGaussianBlur stdDeviation={blurRadius} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {detailed && (
          // Baseline at the FIRST point's own height, not arbitrary thirds of the
          // box — those two evenly-spaced lines carried no information (they
          // weren't at any real value), while "where you started" is the one
          // reference a trend line actually needs to read as up or down.
          <line
            x1={pad}
            y1={points[0][1]}
            x2={width - pad}
            y2={points[0][1]}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {/* Los límites de división. La línea de "dónde arrancaste" dice si
            subiste o bajaste; estas dicen contra qué — que es lo que convierte
            una curva en una posición real en el ladder. */}
        {/* El cero de una serie que ya es un neto. Va antes que la curva para
            que quede por detrás, y solo si el 0 cae dentro de la caja: pegado
            al borde se confunde con el marco. */}
        {lineaCero &&
          (() => {
            const y = yOf(0);
            if (y < pad || y > height - pad) return null;
            return <line x1={padX} y1={y} x2={width - padX} y2={y} className="spark-cero-line" />;
          })()}
        {detailed &&
          guides?.map((g) => {
            const y = yOf(g.value);
            // Fuera de la caja no se dibuja: una guía pegada al borde superior
            // se confunde con el marco y ensucia en vez de informar.
            if (y < pad + 6 || y > height - pad - 6) return null;
            // La etiqueta NO va acá adentro: el <text> de un SVG escala con
            // la caja, así que en el ancho de un celular "Esmeralda 4" caía a
            // 4px. Se dibuja en HTML encima (ver guiasVisibles), que mide
            // siempre lo mismo mida lo que mida el gráfico.
            return <line key={g.label} x1={padX} y1={y} x2={width - padX} y2={y} className="spark-guide-line" />;
          })}
        {/*
          Now drawn for both variants — it used to be detailed-only because a
          translucent fill under a JAGGED zigzag line read as a colored smudge
          in the compact 28px cells. Now that the compact line itself is a
          smoothed curve (see lineAreaGeometry's `smooth` flag above), the
          fill follows that same curve instead of the zigzag and reads as
          depth rather than noise — the gradient's own stop opacity is
          already tuned lower for compact (0.45 vs 0.35 — inverted-looking on
          purpose, since a short 28px cell needs a stronger top stop than the
          118px detailed chart to register as fill at all once it fades out).
        */}
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        {/*
          Compact skips the blur filter on the line itself entirely — a
          Gaussian blur (even a small one) softens the stroke's own edges,
          which at this small size read as "blurry/low-res" rather than as a
          glow. The little halo ring around the endpoint dot below is a plain
          crisp stroke, no filter, and is enough depth on its own.
        */}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeOpacity={lineOpacity}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin={lineJoin}
          filter={detailed ? `url(#${gid}-glow)` : undefined}
        />
        {/*
          Every real snapshot gets its own dot in the detailed variant — with
          sparse real data (often just 2-6 points) an unmarked line reads as a
          placeholder graphic rather than an actual chart of measurements.
          Compact stays a bare sparkline (the standard convention for a dense
          20-point trend) and only marks its endpoint.
        */}
        {detailed &&
          points.slice(0, -1).map(([x, y], i) => {
            // Un punto en CADA snapshot era veinte círculos sobre una línea de
            // veinte segmentos: la marca perdía sentido de tanto repetirse y
            // el gráfico se llenaba de ruido. Se marcan solo el arranque y los
            // dos extremos —el techo y el piso de la ventana—, que son los que
            // uno busca con el ojo. El resto sigue estando: el hover marca
            // cualquiera de los veinte.
            const esClave = i === 0 || i === indiceMax || i === indiceMin;
            if (!esClave) return null;
            return <circle key={i} cx={x} cy={y} r={2.5} fill="var(--bg)" stroke={color} strokeWidth={1.5} />;
          })}
        {hover !== null && (
          <line
            x1={points[hover][0]}
            y1={pad}
            x2={points[hover][0]}
            y2={height - pad}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
          />
        )}
        <circle
          cx={last[0].toFixed(1)}
          cy={last[1].toFixed(1)}
          r={dotRadius + haloExtra}
          fill="none"
          stroke={color}
          strokeOpacity={haloOpacity}
          strokeWidth={haloStrokeWidth}
        />
        <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={dotRadius} fill={`url(#${gid}-dot)`} fillOpacity={lineOpacity} />
        {hover !== null && hover !== points.length - 1 && (
          <circle cx={points[hover][0]} cy={points[hover][1]} r={dotRadius + 1.5} fill={color} stroke="var(--bg)" strokeWidth={2} />
        )}
      </svg>
      {guiasVisibles.map((g) => (
        <span key={g.label} className="spark-guide-label" style={{ top: `${g.pct}%`, left: `${g.leftPct}%` }}>
          {g.label}
        </span>
      ))}
      {/* Se esconden mientras el hover está activo: el tooltip tapa la zona y
          dos números sobre el mismo punto se pisan. En el celular, que es el
          caso para el que existen, no hay hover y están siempre. */}
      {extremos.map((e) => (
        <span
          key={e.key}
          className={`spark-extremo${e.arriba ? "" : " abajo"}${hover !== null ? " tapado" : ""}`}
          style={{ top: `${e.topPct}%`, left: `${e.leftPct}%` }}
        >
          {e.texto}
        </span>
      ))}
      {canHover && hover !== null && pointLabels && (
        <div
          className="spark-tooltip"
          style={{ left: tooltipLeft, ["--arrow-left" as string]: `${arrowLeft}px` }}
        >
          {pointLabels[hover]}
        </div>
      )}
    </div>
  );
}

