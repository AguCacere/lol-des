/**
 * El enlace compartible de un perfil, con hash.
 *
 * La app es UNA sola ruta (`/`) con las pestañas en estado de React, y eso no
 * se toca: `/api/ladder` se pide una vez y de ahí salen Ranking, Estadísticas
 * y Cara a cara sin pedir nada más. Partirla en rutas de verdad haría que
 * cambiar de sección vuelva a montar todo y cada una se traiga el ladder por
 * su cuenta — cinco veces el mismo JSON pesado, que es exactamente lo que
 * tiró la base en septiembre. Está anotado en DECISIONES.
 *
 * Lo que esa decisión dejaba pendiente era poder compartir un enlace, y ahí
 * mismo dice cuál es la forma barata: el hash. Es literalmente eso. El hash
 * no viaja al servidor, no fuerza una navegación de Next y `pushState` lo
 * mueve sin recargar nada, así que se gana el enlace y el botón Atrás del
 * navegador sin pagar ninguna de las dos cosas que la decisión evitaba.
 *
 *   /              → el ladder
 *   /#inv/VORE-CHESS → el perfil de VORE#CHESS
 *
 * El separador es un guion y NO un `#`, que sería el segundo `#` de la misma
 * dirección y algunos clientes de chat cortan el enlace ahí. Un nombre de
 * Riot puede tener espacios ("compren bitcoin") y también guiones, así que
 * el ida y vuelta no es reversible por sí solo: se compara CONTRA LA LISTA
 * de invocadores que ya tenemos, y si ninguno coincide no se abre nada.
 */

/** La clave interna de un jugador es "Nombre#TAG". */
export function claveDesdeHash(hash: string, claves: string[]): string | null {
  const cruda = hash.replace(/^#/, "");
  if (!cruda.startsWith("inv/")) return null;
  const pedido = normalizar(decodeURIComponent(cruda.slice(4)));
  if (!pedido) return null;
  // Contra la lista real y no parseando el texto: "compren bitcoin#GOD" y
  // "Toni Zitnic#6330" pasan a "compren-bitcoin-GOD" y "Toni-Zitnic-6330", y
  // desde el slug solo no hay forma de saber dónde termina el nombre.
  return claves.find((k) => normalizar(hashDeClave(k)) === pedido) ?? null;
}

/** "VORE#CHESS" → "inv/VORE-CHESS". */
export function hashDeClave(clave: string): string {
  return `inv/${clave.replace("#", "-").replace(/\s+/g, "-")}`;
}

function normalizar(s: string): string {
  return s.replace(/^inv\//, "").toLowerCase();
}
