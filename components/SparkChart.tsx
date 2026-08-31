"use client";

import { useId, useRef, useState } from "react";
import { lineAreaGeometry } from "@/lib/chart";

interface SparkChartProps {
  values: number[];
  width?: number;
  height?: number;
  pad?: number;
  color: string;
  /** "detailed" adds reference gridlines, a glow behind the line, and (with pointLabels) a hover tooltip. */
  variant?: "compact" | "detailed";
  /** One React node per value, shown in the hover tooltip — detailed variant only. */
  pointLabels?: React.ReactNode[];
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
}: SparkChartProps) {
  const detailed = variant === "detailed";
  // Compact ("últimos 20" ladder cells) gets its own horizontal margin, wider
  // than its vertical one — a sparkline reads as more "premium" when it fills
  // most of its row width but keeps a bit more vertical breathing room, rather
  // than using the same pad on both axes like the detailed profile chart does.
  const padX = detailed ? pad : pad + 3;
  const { line, area, last, points } = lineAreaGeometry(values, width, height, padX, 10, pad);
  const gid = "spark-" + useId().replace(/[:]/g, "");
  // Compact's endpoint marker used to feel like a separate button stuck onto
  // the line (big halo ring) — shrunk so it reads as "last value, subtly
  // marked" instead of a UI element competing with the row's own chevron.
  const dotRadius = detailed ? 4 : 2.6;
  const haloExtra = detailed ? 3 : 2;
  const haloOpacity = detailed ? 0.35 : 0.3;
  const haloStrokeWidth = detailed ? 1.5 : 1;
  const strokeWidth = detailed ? 2.5 : 2;
  const lineJoin = detailed ? "miter" : "round";
  // Compact's line+dot go translucent rather than flat-solid — a softer,
  // more refined feel for the dense "últimos 20" column specifically;
  // detailed (the profile's own big LP chart) keeps full-strength color.
  const lineOpacity = detailed ? 1 : 0.82;
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
            <stop offset="0%" stopColor={color} stopOpacity={detailed ? "0.35" : "0.45"} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
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
        {/*
          The area fill is a detailed-only accent — in the compact 28px cells
          a translucent fill from line-height down to the baseline read as a
          colored smudge under the sparkline rather than "subtle depth" (the
          fill height there is a large fraction of the whole cell, unlike the
          118px detailed chart where the same treatment stays unobtrusive).
        */}
        {detailed && <path d={area} fill={`url(#${gid})`} stroke="none" />}
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
        <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={dotRadius} fill={color} fillOpacity={lineOpacity} />
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
