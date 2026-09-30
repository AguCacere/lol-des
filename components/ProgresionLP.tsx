"use client";

import { useCallback, useState } from "react";
import { linePath } from "@/lib/chart";
import { divisionCorta, rangoTexto, tierFor } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";
import type { Progresion, PuntoProgresion } from "@/lib/progresion";
import type { Aegis } from "@/lib/types";
import { ShieldIcon } from "./StatIcons";

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
 * son eventos con nombre —"Ascenso · Diamante 1"—, y al pasar por encima
 * aparece la partida entera: cuándo, con qué campeón, con qué KDA y el tramo
 * de LP que movió.
 *
 * Mide la mitad de alto que el anterior y dice diez veces más.
 *
 * El LP de cada partida NO se estima: sale de la atribución por tramos de
 * lib/progresion.ts, que es la misma que usa la liga. Y lo que no se puede
 * atribuir no se dibuja ni se interpola — se dice en el encabezado.
 */

const W = 620;
const H = 96;
const PAD_X = 10;
const PAD_Y = 14;

/** Desde cuántos puntos vale dibujar una línea. Con dos es una recta y con una, nada. */
const MINIMO_PUNTOS = 3;

/**
 * Lo que mide cada tipo de rótulo en píxeles. Medidos en el navegador y no
 * estimados: "▼ Descenso · Diamante 2" da 137 y "▲ E3" da 26, con un poco de
 * aire para el nombre de tier más largo y para que dos vecinos no queden
 * pegados. Es lo que decide cuántos entran sin pisarse.
 */
const ANCHO_TIER = 152;
const ANCHO_DIV = 40;

const rangoTxt = (t: { tier: PuntoProgresion["tier"]; division: number; lp: number }) =>
  `${rangoTexto(t.tier, t.division)} · ${t.lp} LP`;

const lpTxt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/** "19 sep", en hora argentina: sin el huso, una partida de las 22 de un 30 sale "1 oct". */
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });

/** "19 sep · 23:14". La hora importa: con cinco partidas del mismo día, la fecha sola no ubica ninguna. */
const cuando = (iso: string) =>
  `${fechaCorta(iso)} · ${new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  })}`;

/**
 * `p` puede llegar undefined y no es un descuido del tipo: durante la
 * ventana de caché del CDN (s-maxage=240) hay pestañas con el bundle nuevo
 * recibiendo el JSON viejo, que todavía no trae `progresion`. Sin esto, el
 * perfil entero se cae con "cannot read puntos of undefined".
 */
export function ProgresionLP({
  p,
  aegis,
  ddragonVersion,
}: {
  p: Progresion | undefined;
  /** Las partidas con Aegis detectado, para marcarlas. Null es lo normal. */
  aegis: Aegis | null;
  ddragonVersion: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // El ancho real del dibujo. Hace falta para ubicar los rótulos de los
  // hitos: el SVG se estira, pero un rótulo de HTML mide siempre lo mismo en
  // píxeles, así que cuántos entran sin pisarse depende del ancho de verdad y
  // no de las unidades del viewBox. Ref con limpieza, que React 19 soporta.
  const [ancho, setAncho] = useState(0);
  const medir = useCallback((n: HTMLDivElement | null) => {
    if (!n) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(n);
    return () => ro.disconnect();
  }, []);

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
  // Segmentos rectos y no una curva suave. La curva daba la impresión de que
  // sabemos qué pasó ENTRE dos partidas, y no sabemos nada: lo que hay son
  // estados conocidos, uno por partida. Además los valles redondeados le
  // daban aire de gráfico financiero decorativo.
  const linea = linePath(pts);
  const activo = hover !== null ? p.puntos[hover] : null;
  // Aegis, en el gráfico: un escudito arriba del punto y un renglón más en el
  // panel. Nada más — el protagonista sigue siendo la progresión, y la
  // explicación completa vive en la chapa de la partida, abajo.
  const aegisPorPartida = new Map((aegis?.detections ?? []).map((d) => [d.matchId, d]));
  const conAegis = p.puntos
    .map((q, i) => ({ d: aegisPorPartida.get(q.matchId), x: xDe(i), y: yDe(q.score) }))
    .filter((e): e is { d: NonNullable<typeof e.d>; x: number; y: number } => e.d !== undefined);
  const aegisActivo = activo ? aegisPorPartida.get(activo.matchId) : undefined;

  /**
   * Qué hito lleva cartel y cuál no, en dos pasadas y con dos reglas.
   *
   * 1. **Los cambios de TIER primero.** Pasar de Platino a Esmeralda es la
   *    noticia del gráfico; moverse de Esmeralda 4 a Esmeralda 3 es un
   *    movimiento. Si no entran los dos, gana el tier — y el de división se
   *    escribe chiquito, "▲ E3", en vez de con el nombre entero. Con siete
   *    carteles del mismo peso, las anotaciones le compiten a la curva.
   * 2. **Dentro de cada pasada, del más nuevo al más viejo.** El gráfico
   *    cuenta cómo llegó hasta acá, así que el ascenso de anoche importa
   *    más que uno de hace dos semanas. De izquierda a derecha se perdían
   *    justo los dos últimos.
   *
   * Los ascensos van arriba del dibujo y los descensos abajo, y cada fila
   * lleva su propia lista de lo ocupado. El corte vertical se dibuja
   * SIEMPRE: lo que se saltea es el cartel, y esa partida sigue contando su
   * historia al pasarle por encima.
   */
  // Los anchos, pasados a unidades del viewBox: el rótulo mide siempre lo
  // mismo en píxeles y el viewBox se estira, así que la equivalencia depende
  // del ancho real. Sin medir (primer render, SSR) no se dibuja ninguno:
  // mejor que aparezcan un frame después a que aparezcan encimados y se
  // acomoden.
  const anchoEt = (deTier: boolean) =>
    ancho > 0 ? ((deTier ? ANCHO_TIER : ANCHO_DIV) / ancho) * W : Infinity;
  // Cuánto se estira el SVG a lo ancho. El viewBox mide 620 y la caja mide
  // `ancho`, mientras que a lo alto es 1:1 (96 unidades en 96px), así que
  // cualquier dibujo que tenga que salir con su forma —el escudo de Aegis—
  // se compensa escalando x por la inversa.
  const escalaX = ancho > 0 ? W / ancho : 1;
  // Centrado salvo que centrado no entre. El corte es por el ANCHO REAL del
  // rótulo y no por un porcentaje fijo del gráfico: a 1440 un 15% son 185px
  // y el rótulo de tier mide 137, así que con un porcentaje se apoyaban
  // contra el borde rótulos a los que les sobraba lugar para ir centrados.
  const anclaDe = (x: number, et: number): "izq" | "centro" | "der" =>
    x - et / 2 < 0 ? "izq" : x + et / 2 > W ? "der" : "centro";
  // Y la separación se mide sobre el ESPACIO QUE OCUPA el cartel, no sobre la
  // distancia entre puntos: contra el borde se apoya en su lado en vez de
  // centrarse, y eso corre su caja. Con la distancia sola, los dos últimos
  // ascensos se pisaban 22px (medido a 1440).
  const cajaDe = (x: number, et: number): [number, number] => {
    const a = anclaDe(x, et);
    return a === "izq" ? [x, x + et] : a === "der" ? [x - et, x] : [x - et / 2, x + et / 2];
  };

  const marcas: { q: PuntoProgresion; x: number; fila: "ascenso" | "descenso"; deTier: boolean }[] = [];
  for (let i = 0; i < p.puntos.length; i++) {
    const q = p.puntos[i];
    if (q.hito === null) continue;
    marcas.push({ q, x: xDe(i), fila: q.hito.dir, deTier: q.hito.deTier });
  }

  const ocupado: Record<"ascenso" | "descenso", [number, number][]> = { ascenso: [], descenso: [] };
  const puestos = new Set<string>();
  const anclas = new Map<string, "izq" | "centro" | "der">();
  for (const pasada of [true, false]) {
    for (let k = marcas.length - 1; k >= 0; k--) {
      const m = marcas[k];
      if (m.deTier !== pasada) continue;
      const et = anchoEt(m.deTier);
      const caja = cajaDe(m.x, et);
      if (!ocupado[m.fila].every(([c, d]) => caja[1] <= c || caja[0] >= d)) continue;
      ocupado[m.fila].push(caja);
      puestos.add(m.q.matchId);
      anclas.set(m.q.matchId, anclaDe(m.x, et));
    }
  }
  const hitos = marcas.map((m) => ({
    ...m,
    ancla: anclas.get(m.q.matchId) ?? ("centro" as const),
    rotulo: puestos.has(m.q.matchId),
  }));

  return (
    <div className="prog">
      {/* "Últimas 14 partidas" y no "Progresión · últimas 14": el rótulo
          tiene que decir últimas 14 QUÉ. Y lo que quedó sin atribuir va acá
          arriba, con el resto de lo que define la muestra, en vez de suelto
          al pie del dibujo como una nota al margen. */}
      <div className="prog-head">
        <span className="prog-rotulo">
          Últimas {p.puntos.length} partidas
          {p.sinAtribuir > 0 && (
            <>
              <i className="prog-faltan">
                · {p.sinAtribuir} sin LP atribuido
              </i>
              <InfoTip
                text={`De las últimas ${p.puntos.length + p.sinAtribuir} guardadas, ${p.sinAtribuir} quedaron sin poder saber cuánto LP movieron: se jugaron antes de la primera foto que tenemos, o el refresco se perdió alguna de las dos fotos que las rodean. No se dibujan ni se estiman — el gráfico muestra las que sí se pueden atribuir.`}
              />
            </>
          )}
        </span>
        <span className="prog-neto">
          <b className={p.neto >= 0 ? "good" : "bad"}>{lpTxt(p.neto)} LP</b>
          <i>
            {p.victorias}V · {p.derrotas}D
          </i>
        </span>
      </div>

      <div className="prog-caja" ref={medir}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="prog-svg" role="img" aria-label="LP partida por partida">
          {/* Los cortes primero, abajo de todo: son mobiliario del gráfico, no
              un dato más. Una línea entera y no una marca chiquita — un cambio
              de división parte la progresión en dos y eso se ve mejor con un
              corte que con un puntito. */}
          {hitos.map((h) => (
            <line
              key={`h${h.q.matchId}`}
              x1={h.x}
              y1={0}
              x2={h.x}
              y2={H}
              className={`prog-hito ${h.fila}${h.deTier ? " de-tier" : ""}`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={linea} className="prog-linea" vectorEffect="non-scaling-stroke" />
          {/* Un punto por partida, del color de su resultado. Es lo que
              convierte la línea en una historia: se ve la racha de tres
              verdes y el bajón de dos rojas sin tocar nada.

              Y son LÍNEAS DE LARGO CERO con la punta redonda, no <circle>.
              Con preserveAspectRatio="none" el SVG se estira distinto a lo
              ancho que a lo alto —en un teléfono el viewBox de 620 entra en
              302px, o sea la mitad— y un círculo sale ovalado. El grosor de
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
          {/* El escudo de Aegis, arriba del punto. Un <path> chico y no un
              componente: adentro del SVG estirado hay que dibujarlo en
              unidades del viewBox, y con transform de escala inversa en x
              para que no salga ovalado como saldría un círculo. */}
          {conAegis.map((e) => (
            <path
              key={`ag${e.d.matchId}`}
              d="M0 -3.4 L2.7 -2.2 L2.7 0.4 Q2.7 2.9 0 3.9 Q-2.7 2.9 -2.7 0.4 L-2.7 -2.2 Z"
              className={`prog-aegis ${e.d.confidence}`}
              transform={`translate(${e.x} ${e.y - 12}) scale(${escalaX} 1)`}
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

        {/* Los hitos, con nombre. En HTML y no adentro del SVG por lo mismo
            que el panel: con preserveAspectRatio="none" un <text> se estira.
            "Ascenso · Diamante 1" y no "Diamante 1" a secas — así deja de
            leerse como una etiqueta flotante y dice qué pasó ahí. El número
            de división va en arábigo porque así lo escribe toda la app (el
            pie de este mismo gráfico incluido). */}
        {hitos
          .filter((h) => h.rotulo)
          .map((h) => (
            <span
              key={`e${h.q.matchId}`}
              /* La clase del ancla lleva además la marquita que baja hasta el
                 dibujo: sin ella un rótulo apoyado contra el borde derecho
                 parece estar señalando el punto que tiene debajo, que es otro. */
              className={`prog-hito-et ${h.fila} ${h.ancla}${h.deTier ? " de-tier" : ""}`}
              style={{
                left: `${(h.x / W) * 100}%`,
                // Contra el borde el rótulo centrado se sale de la caja: ahí
                // se apoya en su lado.
                transform:
                  h.ancla === "izq" ? "none" : h.ancla === "der" ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {h.deTier ? (
                <>
                  <b>
                    {h.fila === "ascenso" ? "▲" : "▼"} {h.fila === "ascenso" ? "Ascenso" : "Descenso"}
                  </b>
                  <i style={{ color: tierFor(h.q.tier).fg }}>{rangoTexto(h.q.tier, h.q.division)}</i>
                </>
              ) : (
                /* El movimiento de división, en chiquito: la flecha y el
                   rango en dos letras. El tier no hace falta escribirlo
                   —no cambió— y con el nombre entero eran siete carteles
                   del mismo peso peleándole a la curva. */
                <b title={rangoTexto(h.q.tier, h.q.division)}>
                  {h.fila === "ascenso" ? "▲" : "▼"} {tierFor(h.q.tier).corto}
                  {divisionCorta(h.q.tier, h.q.division)}
                </b>
              )}
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
            {aegisActivo && (
              <span className={`prog-panel-aegis ${aegisActivo.confidence}`}>
                <ShieldIcon />
                {aegisActivo.confidence === "high" ? "Aegis detectado" : "Posible Aegis"}
                <i>
                  {aegisActivo.ratio.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×
                  lo habitual
                </i>
              </span>
            )}
            <span className="prog-panel-tramo">
              <span className="prog-panel-cuando">{cuando(activo.playedAt)}</span>
              {rangoTxt(activo.antes)} <span aria-hidden>→</span>{" "}
              {rangoTxt({ tier: activo.tier, division: activo.division, lp: activo.lpDespues })}
            </span>
          </div>
        )}
      </div>

      {/* Las dos puntas, cada una con su fecha. Es lo que le da eje al
          dibujo sin dibujar un eje, y además es donde se ve por qué el
          gráfico usa rankScore y no el LP crudo: se arranca en "Diamante 2 ·
          40 LP" y se termina en "Diamante 1 · 32 LP", que en LP pelado
          parecen ocho menos y son casi una división más. */}
      <div className="prog-pie">
        {p.desde && (
          <span className="prog-punta">
            {rangoTxt(p.desde)}
            <i>{fechaCorta(p.desde.playedAt)}</i>
          </span>
        )}
        {p.hasta && (
          <span className="prog-punta a-la-derecha">
            {rangoTxt(p.hasta)}
            <i>{fechaCorta(p.hasta.playedAt)}</i>
          </span>
        )}
      </div>
    </div>
  );
}
