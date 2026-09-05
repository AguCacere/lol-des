import type { MetadataRoute } from "next";

/**
 * El manifest que hace instalable la app (Android/desktop la agregan a la
 * pantalla de inicio; iOS usa además el apple-icon).
 *
 * `display: standalone` es lo que le saca la barra del navegador: abierta
 * desde el ícono se ve como una app y no como una pestaña, que es la mitad
 * de la diferencia entre "una web que anda" y algo que se usa todos los días.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grieta Central",
    short_name: "Grieta",
    description: "El ranked del grupo: ladder, perfiles, enfrentamientos y el bot que carga al que la pasó mal.",
    lang: "es-AR",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A09",
    theme_color: "#0A0A09",
    icons: [
      { src: "/icons/app/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app/pwa-512.png", sizes: "512x512", type: "image/png" },
      // La maskable se recorta en círculo en Android: va con más margen y el
      // fondo a sangre, o el ícono queda mordido.
      { src: "/icons/app/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
