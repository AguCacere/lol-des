/**
 * Catmull-Rom → cubic Bezier smoothing. With few points the spline overshoots
 * between them — a real 1 LP wobble across 3-4 snapshots would render as a
 * dramatic hill that never happened. Below 6 points, connect them with plain
 * straight segments instead: still reads as a trend, doesn't fabricate curve
 * shape the data doesn't support.
 */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 6) {
    return pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  }
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export interface LineAreaGeometry {
  line: string;
  area: string;
  last: [number, number];
}

/**
 * Same math as the mockup's lineAreaSVG(), split from the markup so React owns
 * the SVG tags. `minRange` floors the auto-scaled Y axis (default: 20 LP) so a
 * tiny real fluctuation (1-2 LP across a handful of snapshots) doesn't get
 * stretched to fill the whole chart height and look like a huge swing.
 */
export function lineAreaGeometry(values: number[], w: number, h: number, pad = 6, minRange = 20): LineAreaGeometry {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, minRange);
  const stepX = (w - pad * 2) / (values.length - 1);
  const pts: [number, number][] = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  return { line, area, last: pts[pts.length - 1] };
}
