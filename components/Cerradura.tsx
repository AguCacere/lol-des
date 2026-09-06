"use client";

import { useCallback, useEffect, useState } from "react";

/** Evento para pedir la contraseña desde cualquier parte (ver pedirClave). */
const EVENTO_PEDIR = "grieta:pedir-clave";
/** Evento que avisa que la sesión cambió, para que el candado se redibuje. */
const EVENTO_CAMBIO = "grieta:sesion";

/**
 * Abre el cartel de la contraseña desde donde sea. Lo usan las acciones que
 * se comieron un 401: en vez de mostrar "error 401" mandan a escribir la
 * clave, que es lo que el error realmente quiere decir.
 */
export function pedirClave() {
  window.dispatchEvent(new CustomEvent(EVENTO_PEDIR));
}

/** Avisar que se entró o se salió. */
function avisarCambio() {
  window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
}

/**
 * Un fetch que, si le responden 401, abre el cartel de la contraseña.
 * Devuelve la respuesta igual para que cada llamador decida qué hacer.
 */
export async function fetchConClave(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) pedirClave();
  return res;
}

/**
 * El candado de la barra de arriba, y el cartel para escribir la contraseña.
 *
 * No es un sistema de usuarios: es una sola contraseña compartida que
 * distingue "los del grupo" de "cualquiera que tenga el link". Alcanza para
 * lo que hay que proteger — agregar invocadores, quemar el rate limit de Riot,
 * mandar cargadas al Discord y, sobre todo, generar informes, que se pagan.
 *
 * Mirar la app sigue sin pedir nada: el ladder, los perfiles y hasta el
 * informe ya generado son de lectura libre.
 */
export function Cerradura() {
  const [adentro, setAdentro] = useState<boolean | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);

  const revisar = useCallback(async () => {
    try {
      const res = await fetch("/api/login");
      const json = (await res.json()) as { adentro?: boolean };
      setAdentro(Boolean(json.adentro));
    } catch {
      setAdentro(false);
    }
  }, []);

  // Los dos manejadores viven FUERA del efecto: adentro, la regla
  // react-hooks/set-state-in-effect ve un setState alcanzable desde el cuerpo
  // del efecto y lo marca, aunque solo corra cuando alguien dispara el evento.
  const alPedir = useCallback(() => {
    setError("Esto es solo para los del grupo. Escribí la contraseña.");
    setAbierto(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- revisar() escribe el estado recién cuando resuelve el fetch, no acá
    revisar();
    window.addEventListener(EVENTO_PEDIR, alPedir);
    window.addEventListener(EVENTO_CAMBIO, revisar);
    return () => {
      window.removeEventListener(EVENTO_PEDIR, alPedir);
      window.removeEventListener(EVENTO_CAMBIO, revisar);
    };
  }, [revisar, alPedir]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setMandando(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: clave }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo entrar.");
      setClave("");
      setAbierto(false);
      setAdentro(true);
      avisarCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMandando(false);
    }
  }

  async function salir() {
    await fetch("/api/login", { method: "DELETE" });
    setAdentro(false);
    avisarCambio();
  }

  return (
    <>
      <button
        type="button"
        className={`cerradura${adentro ? " abierta" : ""}`}
        onClick={() => (adentro ? salir() : setAbierto(true))}
        title={adentro ? "Estás adentro — tocá para salir" : "Entrar con la contraseña del grupo"}
        aria-label={adentro ? "Salir" : "Entrar"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          {/* Abierto el arco se corre a un lado, que es como se lee un candado sin cerrar. */}
          {adentro ? <path d="M7 11V7a5 5 0 0 1 9.9-1" /> : <path d="M7 11V7a5 5 0 0 1 10 0v4" />}
        </svg>
      </button>

      {abierto && (
        <div className="cerradura-fondo" onClick={() => setAbierto(false)} role="presentation">
          <form className="cerradura-caja" onClick={(e) => e.stopPropagation()} onSubmit={entrar}>
            <h3>Contraseña del grupo</h3>
            <p>
              Mirar la app no pide nada. La contraseña es para lo que toca datos o cuesta plata: agregar invocadores,
              refrescar a mano, mandar cargadas al Discord y generar el informe del pool.
            </p>
            <input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="La contraseña"
              autoFocus
              autoComplete="current-password"
            />
            {error && <span className="cerradura-error">{error}</span>}
            <div className="cerradura-botones">
              <button type="button" className="coach-btn sm" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
              <button type="submit" className="coach-btn sm primario" disabled={mandando || clave.length === 0}>
                {mandando ? "Entrando…" : "Entrar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
