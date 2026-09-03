"use client";

import { useEffect, useState } from "react";
import type { CoachReport } from "@/lib/coach";
import { formatRelativeTime } from "@/lib/ladder";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";

interface Respuesta {
  report: CoachReport | null;
  generatedAt?: string;
  cached?: boolean;
  /** El dossier no cambió desde el último informe: se devolvió el guardado sin llamar al modelo. */
  unchanged?: boolean;
}

/**
 * "Análisis del pool" — el informe que devuelve Claude sobre los datos reales
 * del jugador (ver lib/coach.ts y POST /api/coach).
 *
 * Al montar lee el caché en modo `peek`, que nunca llama al modelo: si ya hay
 * un informe guardado aparece solo y sin costo. GENERAR uno nuevo, en cambio,
 * siempre es un gesto explícito del usuario — si se disparara al abrir la
 * pestaña, cada visita a un perfil sería una llamada paga.
 *
 * El `dato` de cada ítem se muestra SIEMPRE y en mono, separado del consejo.
 * Es lo que ancla la recomendación al historial del jugador en vez de a una
 * opinión genérica sobre el parche, y hacerlo visible es lo que permite
 * discutirle al modelo cuando se equivoca.
 */
export function CoachPanel({
  gameName,
  tagLine,
  ddragonVersion,
}: {
  gameName: string;
  tagLine: string;
  ddragonVersion: string | null;
}) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "listo" | "error">("idle");
  const [data, setData] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisoSinCambios, setAvisoSinCambios] = useState(false);

  // Al montar se lee el caché en modo `peek`, que nunca llama al modelo: si ya
  // hay un informe guardado aparece solo y gratis. Solo el botón puede
  // generar uno nuevo.
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameName, tagLine, peek: true }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as Respuesta;
        if (!vigente || !json.report) return;
        setData(json);
        setEstado("listo");
      } catch {
        // Sin caché o sin red: queda el estado inicial con el botón.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [gameName, tagLine]);

  async function pedir(force: boolean) {
    setEstado("cargando");
    setError(null);
    setAvisoSinCambios(false);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, tagLine, force }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setData(json as Respuesta);
      setAvisoSinCambios(Boolean((json as Respuesta).unchanged) && force);
      setEstado("listo");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEstado("error");
    }
  }

  if (estado === "idle") {
    return (
      <div className="coach-cta">
        <p className="coach-cta-text">
          Un análisis de tu pool hecho sobre tus partidas guardadas: qué campeones te conviene jugar más y qué cruces de
          línea te están costando.
        </p>
        <button type="button" className="coach-btn" onClick={() => pedir(false)}>
          Analizar mi pool
        </button>
      </div>
    );
  }

  if (estado === "cargando") {
    return (
      <div className="empty-state">
        <strong>Analizando…</strong>
        Puede tardar unos segundos: está leyendo tu historial completo antes de responder.
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="empty-state">
        <strong>No se pudo generar el análisis</strong>
        {error}
        <button type="button" className="coach-btn" onClick={() => pedir(false)}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data?.report) return null;
  const report = data.report;

  return (
    <div className="coach-report">
      <p className="coach-resumen">{report.resumen}</p>

      {report.recomendados.length > 0 && (
        <div className="coach-block">
          <h5 className="coach-block-label good">Jugá más</h5>
          {report.recomendados.map((r) => (
            <div className="coach-item" key={r.campeon}>
              <ChampIcon champ={r.campeon} version={ddragonVersion} className="coach-item-icon" />
              <div className="coach-item-text">
                <span className="coach-item-head">
                  {r.campeon}
                  <span className="coach-item-dato">{r.dato}</span>
                </span>
                <span className="coach-item-body">{r.porque}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {report.counters.length > 0 && (
        <div className="coach-block">
          <h5 className="coach-block-label bad">Los que te cuestan</h5>
          {report.counters.map((c) => (
            <div className="coach-item" key={`${c.tuCampeon}|${c.rival}`}>
              <ChampIcon champ={c.rival} version={ddragonVersion} className="coach-item-icon" />
              <div className="coach-item-text">
                <span className="coach-item-head">
                  {c.tuCampeon} contra {c.rival}
                  <span className="coach-item-dato">{c.dato}</span>
                </span>
                <span className="coach-item-body">{c.consejo}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {avisoSinCambios && (
        // Se apretó "Regenerar" y no había nada nuevo que analizar. Se dice en
        // vez de devolver el mismo texto en silencio, que se leería como que
        // el botón no funcionó.
        <p className="coach-nota">
          No cambió nada en tu historial desde el último análisis, así que este es el mismo informe — no se volvió a
          generar. Jugá algunas partidas más y va a tener material nuevo.
        </p>
      )}

      <div className="coach-foot">
        <span>
          Generado {data.generatedAt ? formatRelativeTime(data.generatedAt) : "recién"}
          <InfoTip text="Lo escribe un modelo de lenguaje leyendo tus partidas guardadas — el pool con sus winrates, los enfrentamientos de línea y tu maestría. Cada recomendación viene con el número de tu historial en el que se apoya, justamente para que puedas discutirla. No mira estadísticas globales del servidor ni tier lists: esos datos no los tenemos." />
        </span>
        <button type="button" className="coach-btn sm" onClick={() => pedir(true)}>
          Regenerar
        </button>
      </div>
    </div>
  );
}
