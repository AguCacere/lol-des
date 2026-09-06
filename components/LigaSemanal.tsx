"use client";

import { useCallback, useEffect, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";
import { fetchConClave } from "./Cerradura";

interface Fila {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  lpNeto: number;
  victorias: number;
  derrotas: number;
  sinJugar: boolean;
}
interface DelPlantel {
  puuid: string;
  name: string;
  tag: string;
  participa: boolean;
}
interface Datos {
  semana: string;
  desde: string;
  hasta: string;
  tabla: Fila[];
  plantel: DelPlantel[];
  historial: { semana: string; ganador_label: string | null; lp_neto: number | null; jugadores: number }[];
}

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** Cuánto falta para que cierre, en criollo. */
function loQueFalta(hasta: string): string {
  const ms = Date.parse(hasta) - Date.now();
  if (ms <= 0) return "cerrada";
  const horas = Math.floor(ms / 3600000);
  if (horas >= 48) return `faltan ${Math.floor(horas / 24)} días`;
  if (horas >= 2) return `faltan ${horas} horas`;
  return "cierra en menos de dos horas";
}

/**
 * "Liga de la semana" — la competencia interna por LP neto, de lunes 00:00 a
 * domingo 23:59 hora argentina.
 *
 * Es lo que el ladder no puede medir: el ladder dice dónde llegaste, y cuando
 * el elo de cada uno ya está más o menos definido deja de haber pelea. Esto
 * mide cuánto te MOVISTE en la semana, así que el que sube 200 desde Plata le
 * gana al que sube 50 desde Diamante.
 *
 * Compite solo el que se anota. Anotarlos pide la contraseña del grupo.
 */
export function LigaSemanal() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/liga");
      if (!res.ok) return;
      setD((await res.json()) as Datos);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function anotar(puuid: string, participa: boolean) {
    setGuardando(puuid);
    try {
      const res = await fetchConClave("/api/liga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puuid, participa }),
      });
      if (res.ok) await cargar();
    } finally {
      setGuardando(null);
    }
  }

  if (cargando) {
    return (
      <div className="empty-state">
        <strong>Cargando la liga…</strong>
      </div>
    );
  }
  if (!d) return null;

  const anotados = d.plantel.filter((p) => p.participa).length;

  return (
    <section className="liga">
      <div className="section-head">
        <h2>
          <span className="live-dot accent" />
          Liga de la semana
        </h2>
        <span className="meta liga-rango">
          {dia(d.desde)} – {dia(new Date(Date.parse(d.hasta) - 1).toISOString())}
          <span className="liga-falta">{loQueFalta(d.hasta)}</span>
        </span>
      </div>

      {d.tabla.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía no hay nadie anotado</strong>
          La liga la corren los que se anotan, no todos los trackeados. Con la contraseña del grupo se anota desde acá
          abajo.
        </div>
      ) : (
        <div className="liga-tabla">
          {d.tabla.map((f, i) => {
            const puesto = i + 1;
            return (
              <div className={`liga-fila${puesto === 1 && !f.sinJugar ? " lider" : ""}`} key={f.puuid}>
                <span className={`liga-puesto p${puesto <= 3 ? puesto : 0}`}>{puesto}</span>
                <PlayerAvatar name={f.name} iconUrl={f.profileIconUrl} className="duo-avatar sm" />
                <span className="liga-nombre">
                  {f.name} <span className="player-tag">#{f.tag}</span>
                </span>
                {f.sinJugar ? (
                  <span className="liga-sinjugar">todavía no jugó</span>
                ) : (
                  <span className="liga-record">
                    {f.victorias}V-{f.derrotas}D
                  </span>
                )}
                <span className={`liga-lp ${f.lpNeto > 0 ? "gd-pos" : f.lpNeto < 0 ? "gd-neg" : ""}`}>
                  {f.lpNeto > 0 ? "+" : ""}
                  {f.lpNeto}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {d.historial.length > 0 && (
        <div className="liga-historial">
          <span className="liga-historial-label">Campeones anteriores</span>
          {d.historial.map((h) => (
            <div className="liga-historial-fila" key={h.semana}>
              <span className="liga-historial-semana">{h.semana}</span>
              <span className="liga-historial-ganador">{h.ganador_label ?? "nadie jugó"}</span>
              {h.lp_neto !== null && (
                <span className={`liga-historial-lp ${h.lp_neto >= 0 ? "gd-pos" : "gd-neg"}`}>
                  {h.lp_neto >= 0 ? "+" : ""}
                  {h.lp_neto}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <button type="button" className="liga-admin-toggle" onClick={() => setAdmin((v) => !v)}>
        {admin ? "Listo" : `Quién compite (${anotados} de ${d.plantel.length})`}
      </button>

      {admin && (
        <div className="liga-admin">
          <p>
            Se anota el que quiere, no todos los trackeados.
            <InfoTip text="Anotar y desanotar pide la contraseña del grupo. Si no la tenés cargada, al tocar un nombre aparece el cartel para escribirla." />
          </p>
          {d.plantel.map((p) => (
            <label className="liga-admin-fila" key={p.puuid}>
              <input
                type="checkbox"
                checked={p.participa}
                disabled={guardando === p.puuid}
                onChange={(e) => anotar(p.puuid, e.target.checked)}
              />
              <span>
                {p.name} <span className="player-tag">#{p.tag}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
