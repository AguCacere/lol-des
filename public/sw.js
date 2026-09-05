/*
 * Service worker mínimo, a propósito.
 *
 * Está solo para que la app cumpla el requisito de instalabilidad (el
 * navegador pide un service worker con un handler de fetch) y para eso NO
 * hace falta cachear nada. Y no cachear es una decisión, no una omisión: esta
 * app muestra el ladder de hace un rato, no un diario. Un cache de assets mal
 * invalidado sirve una versión vieja después de un deploy, y el síntoma —
 * "me quedó la app rara" — es de los más difíciles de diagnosticar por
 * mensaje. Si algún día hace falta modo avión, se agrega acá con una
 * estrategia explícita y versionada.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pasa de largo: la red resuelve todo como si el worker no existiera.
});
