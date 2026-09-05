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
}: SparkChartProps) {
  const detailed = variant === "detailed";
  const mini = variant === "mini";
  // Compact ("últimos 20" ladder cells) gets its own horizontal margin, wider
  // than its vertical one — a sparkline reads as more "premium" when it fills
  // most of its row width but keeps a bit more vertical breathing room, rather
  // than using the same pad on both axes like the detailed profile chart does.
  // Mini spans the card's full inner width instead, so it reads as a base rule
  // under the card's content rather than a floating inset graphic.
  const padX = detailed || mini ? pad : pad + 3;
  const { line, area, last, points, yOf } = lineAreaGeometry(values, width, height, padX, 10, pad, !detailed);
  const gid = "spark-" + useId().replace(/[:]/g, "");
  // Compact's endpoint marker used to feel like a separate button stuck onto
  // the line (big halo ring) — shrunk so it reads as "last value, subtly
  // marked" instead of a UI element competing with the row's own chevron.
  const dotRadius = detailed ? 4 : mini ? 2.2 : 2.6;
  const haloExtra = detailed ? 3 : mini ? 1.6 : 2;
  const haloOpacity = detailed ? 0.35 : mini ? 0.22 : 0.3;
  const haloStrokeWidth = detailed ? 1.5 : 1;
  const strokeWidth = detailed ? 2.5 : mini ? 1.75 : 2;
  const lineJoin = detailed ? "miter" : "round";
  // Area fill: mini's is deliberately the faintest of the three. At compact's
  // 0.45 the wash under a wide card-width curve turned into a solid green
  // block that outweighed the "+260 pts" it's supposed to support.
  const areaTopOpacity = detailed ? "0.35" : mini ? "0.18" : "0.45";
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
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!canHover || !svgRef.current || stepX === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round((relX - padX) / stepX);
    setHover(Math.min(Math.max(idx, 0), points.length - 1));
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

  return (
    <div style={canHover ? { position: "relative" } : undefined}>
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
        {detailed &&
          guides?.map((g) => {
            const y = yOf(g.value);
            // Fuera de la caja no se dibuja: una guía pegada al borde superior
            // se confunde con el marco y ensucia en vez de informar.
            if (y < pad + 6 || y > height - pad - 6) return null;
            return (
              <g key={g.label}>
                <line x1={pad} y1={y} x2={width - pad} y2={y} className="spark-guide-line" />
                <text x={width - pad - 2} y={y - 4} className="spark-guide-label" textAnchor="end">
                  {g.label}
                </text>
              </g>
            );
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
          points.slice(0, -1).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} fill="var(--bg)" stroke={color} strokeWidth={1.5} />
          ))}
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
