import type { AegisStats as AegisStatsData } from "@/lib/types";
import { InfoTip } from "./InfoTip";

/**
 * "Aegis of Valor" — Riot no expone este dato en ningún campo de su API
 * (confirmado tres veces, ver lib/aegis.ts), así que esto es una INFERENCIA,
 * nunca una confirmación.
 *
 * Y la pantalla tiene que dejar esa diferencia clarísima, porque al lado
 * conviven hechos: "+111 LP", "12V-8D", "55,3%" salen de la base; "3 posibles
 * doble LP" sale de mirar los saltos de LP que se pueden aislar y decidir
 * cuáles se van de lo normal para esta persona. Antes eran dos chapas con
 * borde bajo un rótulo igual al del resto — mismo peso visual que un dato
 * real. Ahora lleva la palabra INFERIDO al lado del título y el cuerpo es una
 * frase apagada, sin cajas: el número está, pero nada lo hace parecer un
 * hecho medido.
 */
export function AegisStats({ stats }: { stats: AegisStatsData | null }) {
  if (!stats) return null;
  const doble = `${stats.doubleLp} ${stats.doubleLp === 1 ? "partida" : "partidas"} con posible doble LP`;
  const prot = `${stats.protectedLosses} ${
    stats.protectedLosses === 1 ? "derrota que parece protegida" : "derrotas que parecen protegidas"
  }`;
  return (
    <div className="aegis">
      <span className="aegis-label">
        Aegis of Valor
        <i className="aegis-chapa">inferido</i>
        <InfoTip text="Riot no publica este dato en ningún lado de su API, lo buscamos a fondo. Así que no es un dato: es una estimación. Miramos el LP que dio cada partida que se puede aislar —una sola entre dos fotos del rango—, lo comparamos con lo que le suele dar a esta persona, y marcamos las que se van bastante de lo normal. Puede haber falsos positivos, y Riot no confirma ninguno." />
      </span>
      <p className="aegis-txt">
        De las partidas que se pueden aislar: <b>{doble}</b> y <b>{prot}</b>.
      </p>
    </div>
  );
}
