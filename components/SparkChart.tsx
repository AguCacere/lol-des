"use client";

import { useId } from "react";
import { lineAreaGeometry } from "@/lib/chart";

interface SparkChartProps {
  values: number[];
  width?: number;
  height?: number;
  pad?: number;
  color: string;
  /** "detailed" adds reference gridlines + a glow behind the line — used for the big profile chart. */
  variant?: "compact" | "detailed";
}

/** Smoothed line + gradient area + endpoint dot — used for the "últimos 20" column and the LP chart. */
export function SparkChart({
  values,
  width = 150,
  height = 28,
  pad = 6,
  color,
  variant = "compact",
}: SparkChartProps) {
  const { line, area, last } = lineAreaGeometry(values, width, height, pad);
  const gid = "spark-" + useId().replace(/[:]/g, "");
  const detailed = variant === "detailed";
  const dotRadius = detailed ? 4.5 : 3;
  const innerH = height - pad * 2;
  // Compact still gets a glow, just a tighter/cheaper one than the big profile chart —
  // a bare 2px line in a 150x28 cell read as flat/lifeless next to the detailed variant.
  const blurRadius = detailed ? 3.2 : 1.4;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Tendencia">
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
        strokeLinejoin="round"
        filter={`url(#${gid}-glow)`}
      />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={dotRadius + 3} fill={color} fillOpacity="0.2" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={dotRadius} fill={color} />
    </svg>
  );
}
