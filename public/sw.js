/*
 * Service worker mínimo, a propósito.
 *
 * NO cachea nada, y eso es una decisión y no una omisión: esta app muestra el
 * ladder de hace un rato, no un diario. Un cache de assets mal invalidado
 * sirve una versión vieja después de un deploy, y el síntoma —"me quedó la
 * app rara"— es de los más difíciles de diagnosticar por mensaje. Si algún
 * día hace falta modo avión, se agrega acá con una estrategia explícita y
 * versionada.
 *
 * Tampoco tiene handler de `fetch`. Antes había uno vacío, puesto porque el
 * navegador pedía uno para considerar la app instalable. Chrome ahora avisa
 * en consola de que ese handler es exactamente lo que no hay que hacer:
 *
 *   "Fetch event handler is recognized as no-op. No-op fetch handler may
 *    bring overhead during navigation."
 *
 * Y tiene razón: un handler que no llama a respondWith obliga al navegador a
 * levantar el worker en CADA navegación para que después la red resuelva
 * igual. Es costo puro. Si en algún navegador esto rompiera la instalación,
 * volver atrás es agregar el listener de nuevo — pero entonces con una
 * estrategia de verdad, no con uno vacío.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
