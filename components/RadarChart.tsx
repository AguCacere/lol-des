import { RADAR_AXIS, type RadarProfile } from "@/lib/radar";
import type { RoleKey } from "@/lib/types";
import { ROLES } from "@/lib/ladder";
import { InfoTip } from "./InfoTip";


/**
 * viewBox más ancho que alto a propósito: las etiquetas se dibujan por fuera
 * del polígono y las que caen a los costados ("Daño", "Particip.", "Visión")
 * necesitan lugar horizontal que arriba y abajo no hace falta. Con un cuadrado
 * de 260 la etiqueta de la derecha se salía del viewBox y quedaba cortada.
 */
const W = 300;
const H = 250;
const CX = W / 2;
const CY = H / 2;
const R = 86;
/** A qué radio se dibujan las etiquetas — por fuera del anillo exterior, sin tocarlo. */
const LABEL_R = 1.2;
/** El anillo del promedio del grupo. Tiene que coincidir con CENTER de lib/radar.ts. */
const PEER_RING = 0.5;
const GRID_RINGS = [0.25, 0.5, 0.75, 1];

/** Punto sobre el eje `i` a un radio 0..1. Arranca arriba (-90°) y sigue en sentido horario. */
function pt(i: number, total: number, radius: number): [number, number] {
  const angle = (2 * Math.PI * i) / total - Math.PI / 2;
  return [CX + Math.cos(angle) * R * radius, CY + Math.sin(angle) * R * radius];
}

function polygon(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Radar de rendimiento — siete ejes contra el resto del grupo en el mismo rol
 * (ver lib/radar.ts, que es donde está la decisión de fondo: cada eje se mide
 * en desvíos estándar, no en porcentaje de un tope inventado).
 *
 * El anillo del medio es el promedio del rol: todo lo que quede por fuera es
 * estar por encima del grupo y todo lo que quede adentro por debajo. Es la
 * única lectura que hay que entender para leer la figura entera, así que el
 * anillo va marcado distinto que el resto de la grilla y dicho con todas las
 * letras en la leyenda.
 */
export function RadarChart({ radar, role }: { radar: RadarProfile | null; role: RoleKey }) {
  if (!radar) return null;
  const n = radar.axes.length;
  const shape = radar.axes.map((a, i) => pt(i, n, a.radius));

  return (
    <>
      <h4 className="subsection-label">
        Perfil de rendimiento
        <InfoTip
          text={`Cada eje se mide en desvíos estándar respecto del promedio del grupo en tu mismo rol, no en porcentaje: así el farmeo y la visión pesan igual en la figura aunque se muevan en rangos muy distintos. El anillo punteado del medio es ese promedio — lo que queda afuera es por encima del grupo y lo que queda adentro por debajo.`}
        />
        {/* La muestra al lado del título y no en un párrafo abajo: es lo que
            hace creíble a la figura, pero son dos números, no un texto. */}
        <span className="radar-sample">
          tus {radar.ownGames} partidas como {ROLES[role].label} vs. {radar.peerGames} del grupo
        </span>
      </h4>
      <div className="radar-wrap">
      <svg className="radar-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Radar de rendimiento por eje">
        {GRID_RINGS.map((r) => (
          <polygon
            key={r}
            className={r === PEER_RING ? "radar-ring is-peer" : "radar-ring"}
            points={polygon(radar.axes.map((_, i) => pt(i, n, r)))}
          />
        ))}
        {radar.axes.map((a, i) => {
          const [x, y] = pt(i, n, 1);
          return <line key={a.key} className="radar-spoke" x1={CX} y1={CY} x2={x} y2={y} />;
        })}
        <polygon className="radar-shape" points={polygon(shape)} />
        {shape.map(([x, y], i) => (
          <circle key={radar.axes[i].key} className="radar-dot" cx={x} cy={y} r={2.6} />
        ))}
        {radar.axes.map((a, i) => {
          const [x, y] = pt(i, n, LABEL_R);
          return (
            <text
              key={a.key}
              className="radar-label"
              x={x}
              y={y}
              // Sin esto las etiquetas de la izquierda se meten adentro del
              // polígono y las de arriba/abajo quedan cortadas por el borde.
              textAnchor={x < CX - 4 ? "end" : x > CX + 4 ? "start" : "middle"}
              dominantBaseline={y < CY - 40 ? "auto" : y > CY + 40 ? "hanging" : "middle"}
            >
              {RADAR_AXIS[a.key].short}
            </text>
          );
        })}
      </svg>

      <div className="radar-legend">
        <span className="radar-legend-item">
          <span className="radar-swatch you" />
          Vos
        </span>
        <span className="radar-legend-item">
          <span className="radar-swatch peer" />
          Promedio del rol en el grupo
        </span>
      </div>

      <div className="radar-table">
        {radar.axes.map((a) => {
          const spec = RADAR_AXIS[a.key];
          // El signo del z es la lectura, no el tamaño: media décima de
          // desvío es indistinguible de estar en el promedio, y pintarla
          // de color le daría un peso que no tiene.
          const tone = a.z > 0.25 ? "up" : a.z < -0.25 ? "down" : "flat";
          return (
            <div className="radar-row" key={a.key}>
              <span className="radar-row-k">
                {spec.long}
                {spec.tooltip && <InfoTip text={spec.tooltip} />}
              </span>
              <span className="radar-row-v">
                {fmt(a.value, spec.decimals)}
                {spec.suffix}
              </span>
              <span className={`radar-row-peer ${tone}`}>
                rol {fmt(a.peerMean, spec.decimals)}
                {spec.suffix}
              </span>
            </div>
          );
        })}
      </div>

    </div>
    </>
  );
}
