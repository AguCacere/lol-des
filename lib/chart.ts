/**
 * Catmull-Rom → cubic Bezier smoothing. Naive Catmull-Rom control points can
 * overshoot past a segment's own two endpoints when neighboring points swing
 * the tangent — with few real snapshots that turns a real 1 LP wobble into a
 * dramatic hill that never happened. Clamping each control point's Y to the
 * segment's own [min, max] keeps the curve smooth without ever drawing past
 * what the two real points it connects actually support.
 */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 3) {
    return pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  }
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const segMin = Math.min(p1[1], p2[1]);
    const segMax = Math.max(p1[1], p2[1]);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.min(Math.max(p1[1] + (p2[1] - p0[1]) / 6, segMin), segMax);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.min(Math.max(p2[1] - (p3[1] - p1[1]) / 6, segMin), segMax);
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
 * the SVG tags. `minRange` floors the auto-scaled Y axis (default: 10 LP) so a
 * trivial 1-2 LP fluctuation across a handful of snapshots doesn't get
 * stretched to fill the whole chart height and look like a huge swing. Kept
 * low on purpose: with few real snapshots collected so far, actual LP ranges
 * are often modest (10-20) — a higher floor flattens those real trends too.
 */
export function lineAreaGeometry(values: number[], w: number, h: number, pad = 6, minRange = 10): LineAreaGeometry {
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
