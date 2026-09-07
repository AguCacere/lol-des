/**
 * El winrate: cómo se calcula, cómo se muestra y de qué color va. En UN solo
 * lugar, porque estaba copiado en nueve componentes y en cinco de ellos estaba
 * mal de la misma forma.
 *
 * El bug que motivó esto: 302V-307D es 49,59%. Estaba guardado como
 * `Math.round(49.59)` = 50 y se mostraba "50%", que ya es mentira. Pero además
 * el color salía de `winrate >= 50 ? "good" : "bad"` sobre ESE entero, así que
 * un jugador con récord negativo se pintaba de verde. La fila decía "50%" en
 * verde al lado de "302V · 307D", contradiciéndose sola.
 *
 * Dos reglas, y las dos importan:
 *
 * 1. EL PORCENTAJE NO SE REDONDEA. Se muestra el real, con un decimal. Un
 *    entero alcanza para la magnitud pero miente justo en el borde del 50, que
 *    en este contexto no es un número más: es la línea entre ganar y perder.
 *
 * 2. EL COLOR SALE DE LOS CONTADORES, NO DEL PORCENTAJE. `wins > losses` es
 *    exacto por construcción: son enteros, no hay float, no hay redondeo, no
 *    hace falta epsilon. Comparar el porcentaje contra 50 es pedirle a un
 *    float que decida algo que los enteros ya saben.
 *
 * Y de yapa, el empate exacto: 50V-50D no es ni bueno ni malo, y con `>= 50`
 * se pintaba de verde. Tiene su propio tono.
 *
 * Todo se calcula desde (wins, games) y NUNCA desde un porcentaje ya
 * calculado. Además de ser exacto, esquiva la ventana de caché del CDN: los
 * contadores son los mismos en el JSON viejo y en el nuevo (ver DECISIONES.md).
 */

export type TonoWinrate = "good" | "bad" | "neutral";

/**
 * El winrate real, sin redondear. Es lo que decide orden, umbrales y largo de
 * barra — todo lo que no sea texto para leer.
 */
export function winrateExacto(wins: number, games: number): number {
  return games > 0 ? (100 * wins) / games : 0;
}

/**
 * El winrate como se muestra: el real con un decimal.
 *
 * Un decimal y no más porque 49,59% y 49,6% son lo mismo para quien lee, pero
 * 49,6% y 50% no lo son. Todas las clases que muestran esto tienen
 * `font-variant-numeric: tabular-nums`, así que el decimal fijo mantiene la
 * columna alineada en vez de romperla.
 */
export function winrateTexto(wins: number, games: number): string {
  return formatearWinrate(winrateExacto(wins, games));
}

/**
 * El mismo formato para cuando ya tenés el porcentaje exacto y no los
 * contadores — que es la excepción, no la regla. Preferí siempre
 * `winrateTexto` desde (wins, games): un porcentaje que viaja solo puede venir
 * redondeado desde otro lado y acá ya no hay forma de saberlo.
 */
export function formatearWinrate(wr: number): string {
  return `${wr.toFixed(1)}%`;
}

/**
 * Verde ganando, rojo perdiendo, gris en el empate exacto.
 *
 * Sobre los contadores y no sobre el porcentaje: con 302V-307D el porcentaje
 * redondeado daba 50 y el `>= 50` lo pintaba de verde. Acá 302 > 307 es falso
 * y sale rojo, que es lo que pasó de verdad.
 */
export function tonoDeWinrate(wins: number, games: number): TonoWinrate {
  const losses = games - wins;
  if (wins === losses) return "neutral";
  return wins > losses ? "good" : "bad";
}
