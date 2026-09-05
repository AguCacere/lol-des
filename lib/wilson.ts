/**
 * Límite inferior del intervalo de Wilson: cuánto winrate se puede sostener
 * con la muestra que hay.
 *
 * El problema que resuelve: ordenar por winrate crudo pone a alguien con 3
 * victorias en 3 partidas arriba de alguien con 7 en 10, y eso no es un
 * ranking, es un ranking de quién jugó menos. Wilson contesta otra cosa —
 * "descontando la incertidumbre de la muestra, ¿qué winrate se banca este
 * récord?" — y una muestra chica se descuenta mucho.
 *
 * Es la fórmula estándar para rankear cosas con pocos votos (la misma idea
 * detrás de "mejor valorado" en sitios de reseñas), y la razón de usarla en
 * vez de un piso de partidas mínimas es que acá no hay volumen para poner un
 * piso: el grupo tiene 38 partidas de Clash en total y un mínimo de 10
 * dejaría la tabla con dos filas.
 */

/**
 * z al 99%. A 95% (z=1,96) un 3-de-3 TODAVÍA queda arriba de un 7-de-10
 * —43,9% contra 39,7%— que es exactamente el caso que hay que ordenar bien.
 * A 99% el 7-de-10 pasa adelante. No es un número mágico: es el nivel de
 * exigencia con el que el orden coincide con lo que cualquiera diría mirando
 * los dos récords.
 */
const Z_99 = 2.576;

export function wilsonLower(wins: number, games: number, z: number = Z_99): number {
  if (games <= 0) return 0;
  const p = wins / games;
  const z2 = z * z;
  const den = 1 + z2 / games;
  const centro = p + z2 / (2 * games);
  const margen = z * Math.sqrt((p * (1 - p)) / games + z2 / (4 * games * games));
  return Math.max(0, (centro - margen) / den);
}
