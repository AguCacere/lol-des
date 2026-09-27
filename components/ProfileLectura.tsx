"use client";

import { RADAR_AXIS } from "@/lib/radar";
import { ROLES } from "@/lib/ladder";
import { QUE_SIGNIFICA, type FilaLectura, type Lectura } from "@/lib/lectura";
import type { RoleKey } from "@/lib/types";
import { InfoTip } from "./InfoTip";

/**
 * Lo que hace mejor y lo que le conviene corregir, **en dos fichas
 * simétricas**.
 *
 * Es lo que quedó de la pestaña Mejorar, que se fue entera: no era otra
 * dimensión del perfil sino la INTERPRETACIÓN de sus datos. El cálculo no
 * cambió nunca —son los mismos ejes del radar, sobre todas las partidas de
 * esa persona en su línea contra todas las del grupo en la misma— y lo que la
 * app hace encima es decidir qué vale la pena mostrar (ver lib/lectura.ts:
 * entran las que se despegan de verdad, y el foco es UNO solo).
 *
 * Lo que cambió acá es la forma. Antes eran un título verde con una lista
 * debajo y, más abajo, un bloque rojo con una línea al costado: **dos cosas
 * que son el mismo concepto puestas con dos jerarquías distintas**, y por eso
 * el módulo entero se leía como textos sueltos apilados en vez de un bloque
 * pensado. Ahora son dos fichas iguales, una al lado de la otra, con la misma
 * anatomía: qué es, el número grande, la diferencia y contra qué se compara.
 *
 * La frase de qué mide la métrica se fue al globo. Es contexto que se lee una
 * vez, no un dato que se mira cada vez que se abre el perfil.
 */
export function ProfileLectura({ l, role }: { l: Lectura | null; role: RoleKey }) {
  if (!l) {
    return (
      <p className="lec-vacio">
        Todavía no hay con qué comparar. Hace falta que esta persona tenga al menos diez partidas en su línea y que
        el resto del grupo tenga veinte en esa misma línea — si no, el promedio contra el que se mide no significa
        nada.
      </p>
    );
  }

  const rol = ROLES[role].label;
  const nada = l.fuerte.length === 0 && l.foco === null;
  // La protagonista de la ficha verde es la que más se despega; las otras
  // —como mucho dos— entran en un renglón chico adentro de la misma ficha.
  // Sacarlas sería perder datos; darles su propia fila rompería la simetría,
  // que es justamente lo que había que arreglar.
  const [mejor, ...otras] = l.fuerte;

  if (nada) {
    return (
      <p className="lec-vacio">
        No se despega del resto de los {rol} en ninguna métrica: las {l.parejas} están dentro de lo normal entre dos
        poblaciones.
      </p>
    );
  }

  return (
    <div className="lec">
      <div className="lec-fichas">
        {mejor && (
          <Ficha
            tono="good"
            rotulo="Destaca"
            f={mejor}
            rol={rol}
            /* Las dos fichas llevan la MISMA anatomía hasta el pie, si no
               dejan de ser un par: la frase de qué mide la métrica va en las
               dos. Lo que solo tiene la verde es el renglón de las otras
               fortalezas, cuando las hay. */
            pie={
              <>
                <span className="lec-que">{QUE_SIGNIFICA[mejor.key]}</span>
                {otras.length > 0 && (
                  <span className="lec-otras">
                    también{" "}
                    {otras.map((o, i) => (
                      <span key={o.key}>
                        {i > 0 && ", "}
                        {RADAR_AXIS[o.key].short} <b>+{o.pct}%</b>
                      </span>
                    ))}
                  </span>
                )}
              </>
            }
          />
        )}
        {l.foco && (
          <Ficha
            tono="bad"
            rotulo="Su foco"
            f={l.foco}
            rol={rol}
            pie={<span className="lec-que">{QUE_SIGNIFICA[l.foco.key]}</span>}
          />
        )}
      </div>

      {l.parejas > 0 && (
        <p className="lec-pie">
          {l.parejas === 1 ? "Otra métrica más" : `Otras ${l.parejas} métricas`}, sin diferencia real contra su línea
          <InfoTip text={`Se quedaron abajo del 8% de diferencia contra el promedio de los ${rol} del grupo, para arriba o para abajo. A esa distancia el número no dice nada: dos poblaciones distintas nunca dan exactamente lo mismo.`} />
        </p>
      )}
    </div>
  );
}

/** Las dos fichas son la MISMA ficha con otro color. Ahí está medio arreglo. */
function Ficha({
  tono,
  rotulo,
  f,
  rol,
  pie,
}: {
  tono: "good" | "bad";
  rotulo: string;
  f: FilaLectura;
  rol: string;
  pie: React.ReactNode;
}) {
  return (
    <div className={`lec-ficha ${tono}`}>
      <span className="lec-rotulo">
        <i className={`lec-punto ${tono}`} aria-hidden />
        {rotulo}
      </span>
      <span className="lec-metrica">
        <span className="lec-larga">{RADAR_AXIS[f.key].long}</span>
        <span className="lec-corta">{RADAR_AXIS[f.key].short}</span>
      </span>
      <span className="lec-cifra">
        <b>{f.valor}</b>
        <i className={`lec-dif ${tono}`}>
          {f.pct > 0 ? "▲" : "▼"} {f.pct > 0 ? "+" : "−"}
          {Math.abs(f.pct)}%
        </i>
      </span>
      <span className="lec-rol">
        Los demás {rol}: <b>{f.rol}</b>
      </span>
      {pie}
    </div>
  );
}
