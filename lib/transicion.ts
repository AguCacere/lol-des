/**
 * **Cambiar de vista con una transición, cuando el navegador la sepa hacer.**
 *
 * `document.startViewTransition` saca una foto del antes, aplica el cambio de
 * estado y cruza las dos — o sea que un cambio de pestaña deja de ser un
 * parpadeo. Está en Chrome 111+, Safari 18+ y Firefox 144+ para transiciones
 * adentro de la misma página, que es lo único que usamos acá: esto es una
 * sola página con pestañas en estado de React, no rutas (ver DECISIONES).
 *
 * Tres cosas que hace falta que haga esta función y no cada llamada:
 *
 * 1. **Degradar sola.** Si el navegador no la tiene, se llama al cambio de
 *    estado y listo: la app funciona igual, sin transición.
 * 2. **Respetar `prefers-reduced-motion`.** El interruptor global de
 *    globals.css apaga `animation` y `transition`, pero NO las transiciones
 *    de vista, que son otra cosa. Se pregunta acá.
 * 3. **`flushSync`.** React agrupa los `setState` y los aplica después; la
 *    foto del después se saca adentro del callback, así que sin esto se
 *    capturaría el DOM viejo y la transición cruzaría dos imágenes iguales.
 */
import { flushSync } from "react-dom";

type ConVT = Document & { startViewTransition?: (cb: () => void) => unknown };

export function conTransicion(cambio: () => void): void {
  const doc = document as ConVT;
  const quiereQuieto =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (typeof doc.startViewTransition !== "function" || quiereQuieto) {
    cambio();
    return;
  }
  doc.startViewTransition(() => flushSync(cambio));
}
