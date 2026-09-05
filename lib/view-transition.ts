/**
 * Cambios de vista con transición, cuando el navegador la soporta.
 *
 * La View Transition API necesita que el DOM cambie DENTRO del callback, y
 * React por defecto agrupa y difiere sus actualizaciones — de ahí el
 * flushSync: sin él el navegador saca la foto del "después" antes de que
 * React haya pintado nada y no se ve ninguna transición.
 *
 * Degrada solo: donde no existe (Firefox al momento de escribir esto, Safari
 * viejo) se ejecuta el cambio tal cual, sin animación y sin errores.
 */
import { flushSync } from "react-dom";

export function conTransicion(cambio: () => void): void {
  // El tipo de lib.dom ya la declara, pero no como opcional: en un navegador
  // que no la tiene, `document.startViewTransition` es undefined igual.
  const doc: Partial<Document> = document;
  // Respetar la preferencia del sistema: para quien pidió menos movimiento,
  // el cambio instantáneo ES la mejor versión, no una degradada.
  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || menosMovimiento) {
    cambio();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(cambio);
  });
}
