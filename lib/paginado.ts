/**
 * Leer una tabla entera de Supabase sin que te la corten en silencio.
 *
 * **PostgREST devuelve como mucho 1000 filas** cuando la consulta no pide un
 * rango. No es un error: la respuesta llega con `error: null` y mil filas, y
 * el código de arriba sigue como si eso fuera todo lo que hay.
 *
 * Eso ya pasó, y pasó de la peor forma posible. `/api/ladder` leía
 * `lp_snapshots` con `.order("captured_at", { ascending: true })` y sin
 * límite. El día que la tabla cruzó las mil filas, las mil que llegaban eran
 * **las más viejas**: la app dejó de ver cualquier foto posterior al 22 de
 * septiembre. Sin esas fotos no se puede atribuir el LP de las partidas
 * nuevas, así que el gráfico de progresión de varios jugadores se quedó
 * mostrando partidas de hace una semana y "17 sin LP atribuido". Nada falló,
 * nada se logueó, y el número que mostraba la pantalla era sencillamente
 * viejo. La misma consulta sobre `matches` estaba a punto de hacer lo mismo
 * al revés (ordenada descendente, se perdían las más viejas).
 *
 * Por eso esto NO es un `.limit(20000)`: un tope más grande es el mismo bug
 * con otro número y la próxima vez tampoco avisa. Esto pagina hasta que la
 * base deja de dar filas, y si alguna vez se pasa del tope de seguridad lo
 * **grita en el log** en vez de devolver una verdad a medias.
 *
 * El orden tiene que ser TOTAL. Paginar sobre un orden con empates hace que
 * la base pueda devolver la misma fila en dos páginas y saltearse otra, así
 * que quien llame tiene que desempatar por algo único (el `id` en
 * `lp_snapshots`, `match_id` + `puuid` en `matches`).
 */

/** Lo que PostgREST entrega por página cuando no se le pide un rango. */
const PAGINA = 1000;

/**
 * Tope de seguridad. No es un límite de negocio: es el punto en el que algo
 * se fue de las manos —una consulta sin filtrar, una tabla que explotó— y
 * conviene enterarse por el log antes que por la pantalla.
 */
const TOPE = 50_000;

export async function todasLasFilas<T>(
  etiqueta: string,
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tope = TOPE,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const todo: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1);
    // El error se devuelve con lo que se haya juntado, igual que lo haría una
    // consulta sola: quien llama ya sabe qué hacer con un error.
    if (error) return { data: todo, error };
    const lote = data ?? [];
    todo.push(...lote);
    // Una página corta es el final. Es la única señal confiable: pedir el
    // total con `count` costaría otra consulta y puede mentir si entran filas
    // nuevas en el medio.
    if (lote.length < PAGINA) return { data: todo, error: null };
  }
  console.error(
    `${etiqueta}: la lectura pasó el tope de ${tope} filas y se está leyendo RECORTADA. ` +
      `Algo creció más de lo previsto o la consulta perdió un filtro.`,
  );
  return { data: todo, error: null };
}
