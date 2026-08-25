"use client";

import { useId } from "react";
import { lineAreaGeometry } from "@/lib/chart";

interface SparkChartProps {
  values: number[];
  width?: number;
  height?: number;
  pad?: number;
  color: string;
}

/** Smoothed line + gradient area + endpoint dot — used for the "últimos 20" column and the LP chart. */
export function SparkChart({ values, width = 150, height = 28, pad = 6, color }: SparkChartProps) {
  const { line, area, last } = lineAreaGeometry(values, width, height, pad);
  const gid = "spark-" + useId().replace(/[:]/g, "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Tendencia">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={3} fill={color} />
    </svg>
  );
}
