import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grieta Central",
  description: "Ranked tracker privado para el grupo — estilo SoloQ Challenge, enfocado en amigos.",
};

// Matches --bg in globals.css — sin esto, el navegador pinta la barra de
// estado/dirección (Android Chrome, iOS Safari) de blanco por defecto,
// contrastando fuerte contra una interfaz que es casi negra en todos lados.
export const viewport: Viewport = {
  themeColor: "#0A0A09",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
