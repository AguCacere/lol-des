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
  const { line, area, last, points } = lineAreaGeometry(values, width, height, pad);
  const gid = "spark-" + useId().replace(/[:]/g, "");
  const detailed = variant === "detailed";
  const dotRadius = detailed ? 4.5 : 3;
  const innerH = height - pad * 2;
  // Compact still gets a glow, just a tighter/cheaper one than the big profile chart —
  // a bare 2px line in a 150x28 cell read as flat/lifeless next to the detailed variant.
  const blurRadius = detailed ? 3.2 : 1.4;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(width);
  const canHover = detailed && !!pointLabels;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!canHover || !svgRef.current || stepX === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round((relX - pad) / stepX);
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
          <g stroke="rgba(255,255,255,0.07)" strokeWidth={1}>
            <line x1={pad} y1={pad + innerH / 3} x2={width - pad} y2={pad + innerH / 3} />
            <line x1={pad} y1={pad + (innerH * 2) / 3} x2={width - pad} y2={pad + (innerH * 2) / 3} />
          </g>
        )}
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={detailed ? 2.5 : 2.25}
          strokeLinecap="round"
          strokeLinejoin="miter"
          filter={`url(#${gid}-glow)`}
        />
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
        <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={dotRadius + 3} fill={color} fillOpacity="0.2" />
        <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={dotRadius} fill={color} />
        {hover !== null && hover !== points.length - 1 && (
          <circle cx={points[hover][0]} cy={points[hover][1]} r={dotRadius} fill={color} stroke="var(--bg)" strokeWidth={2} />
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
