"use client";

import { useState } from "react";
import { smoothLinePath } from "@/lib/chart";
import { tierFor } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import type { Progresion, PuntoProgresion } from "@/lib/progresion";

/**
 * La progresión de LP, una partida por punto.
 *
 * El gráfico anterior dibujaba las últimas veinte FOTOS de LP y ocupaba
 * doscientos sesenta píxeles para contestar una sola cosa: "subió 92 LP". La
 * curva zigzagueaba, tenía brillo y tres etiquetas, y no se podía saber QUÉ
 * produjo ninguno de esos cambios — las fotos las saca el cron cada quince
 * minutos, así que un valle podía ser dos derrotas o podía ser que nadie
 * jugara en toda la tarde.
 *
 * Acá cada punto es UNA PARTIDA, y por eso el gráfico puede contestar la
 * pregunta que un gráfico de LP tiene que contestar: cómo llegué de acá hasta
 * acá. El punto es verde o rojo según el resultado, los cambios de división
 * son hitos verticales, y al pasar por encima aparece la partida entera:
 * campeón, KDA, duración y el tramo de LP que movió.
 *
 * Mide la mitad de alto que el anterior y dice diez veces más.
 *
 * El LP de cada partida NO se estima: sale de la atribución por tramos de
 * lib/progresion.ts, que es la misma que usa la liga. Y lo que no se puede
 * atribuir no se dibuja ni se interpola — se cuenta al pie.
 */

const W = 620;
const H = 96;
const PAD_X = 10;
const PAD_Y = 14;

/** Desde cuántos puntos vale dibujar una curva. Con dos es una recta y con una, nada. */
const MINIMO_PUNTOS = 3;

const rangoTxt = (t: { tier: PuntoProgresion["tier"]; division: number; lp: number }) =>
  `${tierFor(t.tier).name} ${t.division} · ${t.lp} LP`;

const lpTxt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/**
 * `p` puede llegar undefined y no es un descuido del tipo: durante la
 * ventana de caché del CDN (s-maxage=240) hay pestañas con el bundle nuevo
 * recibiendo el JSON viejo, que todavía no trae `progresion`. Sin esto, el
 * perfil entero se cae con "cannot read puntos of undefined".
 */
export function ProgresionLP({ p, ddragonVersion }: { p: Progresion | undefined; ddragonVersion: string | null }) {
  const [hover, setHover] = useState<number | null>(null);

  if (!p || p.puntos.length < MINIMO_PUNTOS) {
    return (
      <p className="prog-vacio">
        Todavía no hay suficientes partidas con su LP atribuido para dibujar la progresión. Se llena solo: cada
        refresco guarda una foto del LP, y una partida entre dos fotos ya tiene su número.
      </p>
    );
  }

  const scores = p.puntos.map((q) => q.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  // Un piso de recorrido para que una tarde plana no se dibuje como una
  // cordillera: veinte puntos de LP es lo mínimo que se escala a fondo.
  const recorrido = Math.max(20, max - min);
  const centro = (min + max) / 2;
  const lo = centro - recorrido / 2;
  const xDe = (i: number) => PAD_X + (i / Math.max(1, p.puntos.length - 1)) * (W - PAD_X * 2);
  const yDe = (v: number) => H - PAD_Y - ((v - lo) / recorrido) * (H - PAD_Y * 2);
  const pts: [number, number][] = p.puntos.map((q, i) => [xDe(i), yDe(q.score)]);
  const linea = smoothLinePath(pts);
  const hitos = p.puntos.map((q, i) => ({ q, i })).filter((x) => x.q.hito !== null);
  const activo = hover !== null ? p.puntos[hover] : null;

  return (
    <div className="prog">
      <div className="prog-head">
        <span className="prog-rotulo">Progresión · últimas {p.puntos.length}</span>
        <span className="prog-neto">
          <b className={p.neto >= 0 ? "good" : "bad"}>{lpTxt(p.neto)} LP</b>
          <i>
            {p.victorias}V-{p.derrotas}D
          </i>
        </span>
      </div>

      <div className="prog-caja">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="prog-svg" role="img" aria-label="LP partida por partida">
          {/* Los hitos primero, abajo de todo: son mobiliario del gráfico, no
              un dato más. Una línea vertical entera y no una marca chiquita —
              un cambio de división parte la progresión en dos y eso se ve
              mejor con un corte que con un puntito. */}
          {hitos.map(({ q, i }) => (
            <line
              key={`h${q.matchId}`}
              x1={xDe(i)}
              y1={0}
              x2={xDe(i)}
              y2={H}
              className={`prog-hito ${q.hito}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={linea} className="prog-linea" vectorEffect="non-scaling-stroke" />
          {/* Un punto por partida, del color de su resultado. Es lo que
              convierte la curva en una historia: se ve la racha de tres
              verdes y el bajón de dos rojas sin tocar nada.

              Y son LÍNEAS DE LARGO CERO con la punta redonda, no <circle>.
              Con preserveAspectRatio="none" el SVG se estira distinto a lo
              ancho que a lo alto —en un teléfono el viewBox de 620 entra en
              330px, o sea la mitad— y un círculo sale ovalado. El grosor de
              una línea con vectorEffect="non-scaling-stroke" se mide en
              píxeles de pantalla, así que la punta redonda es un círculo
              perfecto a cualquier ancho. */}
          {pts.map(([x, y], i) => (
            <line
              key={p.puntos[i].matchId}
              x1={x}
              y1={y}
              x2={x}
              y2={y}
              vectorEffect="non-scaling-stroke"
              className={`prog-punto ${p.puntos[i].win ? "v" : "d"}${hover === i ? " activo" : ""}`}
            />
          ))}
          {/* La zona que escucha, arriba de todo. Por columnas y no por punto:
              apuntarle a un círculo de 3px es imposible, y lo que se quiere
              saber es "¿qué pasó acá?". `pointer` y no `mouse` para que en el
              teléfono el dedo recorra las partidas igual que el mouse. */}
          <rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill="transparent"
            style={{ pointerEvents: "all", touchAction: "pan-y" }}
            onPointerDown={(e) => e.currentTarget.releasePointerCapture?.(e.pointerId)}
            onPointerMove={(e) => {
              const caja = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
              if (!caja || caja.width === 0) return;
              const xSvg = ((e.clientX - caja.left) / caja.width) * W;
              let mejor = 0;
              let dist = Infinity;
              pts.forEach(([px], i) => {
                const dd = Math.abs(px - xSvg);
                if (dd < dist) {
                  dist = dd;
                  mejor = i;
                }
              });
              setHover(mejor);
            }}
            onPointerLeave={() => setHover(null)}
            onPointerCancel={() => setHover(null)}
          />
        </svg>

        {/* El rótulo del hito, en HTML por lo mismo que el panel: adentro del
            SVG estirado un <text> sale deformado. Sin esto la línea punteada
            es un corte sin explicación — hay que pasar el mouse por el punto
            justo para enterarse de que ahí ascendió. En el teléfono no entra
            y se va: la línea se queda y el detalle lo da el panel. */}
        {hitos.map(({ q, i }) => (
          <span
            key={`e${q.matchId}`}
            className={`prog-hito-et ${q.hito}`}
            style={{ left: `${(xDe(i) / W) * 100}%`, color: tierFor(q.tier).fg }}
          >
            {tierFor(q.tier).name} {q.division}
          </span>
        ))}

        {/* El detalle de la partida. En HTML y no adentro del SVG: con
            preserveAspectRatio="none" un <text> se estira a lo ancho. */}
        {activo && hover !== null && (
          <div
            className="prog-panel"
            style={{
              left: `${(xDe(hover) / W) * 100}%`,
              transform: xDe(hover) > W * 0.6 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <span className={`prog-panel-res ${activo.win ? "v" : "d"}`}>
              {activo.win ? "Victoria" : "Derrota"}
              <b className={activo.lp >= 0 ? "good" : "bad"}>{lpTxt(activo.lp)} LP</b>
            </span>
            <span className="prog-panel-champ">
              <ChampIcon champ={activo.champ} version={ddragonVersion} className="prog-panel-art" />
              {championLabel(activo.champ)}
              <i>
                {activo.k}/{activo.d}/{activo.a} · {activo.dur} min
              </i>
            </span>
            <span className="prog-panel-tramo">
              {rangoTxt(activo.antes)} <span aria-hidden>→</span>{" "}
              {rangoTxt({ tier: activo.tier, division: activo.division, lp: activo.lpDespues })}
            </span>
          </div>
        )}
      </div>

      {/* Las dos puntas, abajo y pegadas a su lado del dibujo. */}
      <div className="prog-pie">
        {p.desde && <span className="prog-punta">{rangoTxt(p.desde)}</span>}
        {/* Lo que quedó afuera, dicho y no escondido: son las partidas que
            cayeron antes de la primera foto guardada o en un hueco del cron. */}
        {p.sinAtribuir > 0 && (
          <span className="prog-faltan">
            {p.sinAtribuir} sin LP atribuido
          </span>
        )}
        {p.hasta && <span className="prog-punta a-la-derecha">{rangoTxt(p.hasta)}</span>}
      </div>
    </div>
  );
}
