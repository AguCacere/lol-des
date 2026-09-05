"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (ver public/sw.js) para que la app se pueda
 * instalar. No renderiza nada.
 *
 * Solo en producción: en desarrollo un worker activo se mete en el medio del
 * hot reload y hace perder más tiempo del que ahorra. Y si el registro falla
 * no pasa nada — la app funciona igual, solo no ofrece instalarse.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("No se pudo registrar el service worker:", err);
    });
  }, []);
  return null;
}
