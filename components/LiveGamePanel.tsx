"use client";

import { useState } from "react";
import type { LiveDetail, LiveParticipant } from "@/lib/types";
import { tierFor } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";

/**
 * La partida en curso, con los dos equipos — pensado para mirarse DURANTE la
 * selección de campeones y no después.
 *
 * De cada rival muestra tres cosas que en ese momento valen: en qué rango
 * está, cuánta maestría tiene con el campeón que eligió, y —la única que no
 * se puede ver en ningún otro lado— cómo te fue a VOS contra ese campeón en
 * tu línea.
 *
 * Se carga a pedido y no solo: son diez llamadas a Riot (rango y maestría de
 * los cinco rivales) y no tiene sentido pagarlas en cada refresco del ladder
 * por si alguien las mira.
 */

function Maestria({ m }: { m: LiveParticipant["maestria"] }) {
  if (!m) return <span className="lg-maestria nueva">Primera vez</span>;
  return (
    <span className="lg-maestria" title={`${m.points.toLocaleString("es-AR")} puntos de maestría`}>
      M{m.level}
    </span>
  );
}

function Rival({ p, version }: { p: LiveParticipant; version: string | null }) {
  const t = p.rango ? tierFor(p.rango.tier) : null;
  const cruce = p.vsVos;
  const total = cruce ? cruce.wins + cruce.losses : 0;
  const wr = total > 0 ? Math.round((100 * cruce!.wins) / total) : null;
  return (
    // El nombre del rival va en el title y no en la fila: en selección de
    // campeones importa el campeón, y meterle el Riot ID abajo del rango
    // apretaba las tres cosas que sí se miran.
    <div className="lg-fila" title={p.riotId ?? undefined}>
      <ChampIcon champ={p.champion} version={version} className="lg-champ" />
      <span className="lg-id">
        <span className="lg-nombre">{championLabel(p.champion)}</span>
        <span className="lg-sub">
          {t && p.rango ? (
            <span style={{ color: t.fg }}>
              {t.name} {p.rango.division}
            </span>
          ) : (
            <span className="lg-sinrango">Sin ranked</span>
          )}
          <Maestria m={p.maestria} />
        </span>
      </span>
      {total > 0 ? (
        <span className={`lg-cruce ${wr! >= 50 ? "good" : "bad"}`}>
          <strong>
            {cruce!.wins}V-{cruce!.losses}D
          </strong>
          <span className="lg-cruce-wr">{wr}%</span>
        </span>
      ) : (
        <span className="lg-cruce vacio">nunca te lo cruzaste</span>
      )}
    </div>
  );
}

export function LiveGamePanel({
  gameName,
  tagLine,
  ddragonVersion,
}: {
  gameName: string;
  tagLine: string;
  ddragonVersion: string | null;
}) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "listo" | "error" | "termino">("idle");
  const [detalle, setDetalle] = useState<LiveDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setEstado("cargando");
    setError(null);
    try {
      const res = await fetch(`/api/live-detail?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      if (!json.enPartida) {
        setEstado("termino");
        return;
      }
      setDetalle(json as LiveDetail);
      setEstado("listo");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEstado("error");
    }
  }

  if (estado === "idle" || estado === "cargando") {
    return (
      <div className="lg-cta">
        <span className="lg-cta-texto">
          <span className="live-dot" />
          Está jugando ahora
        </span>
        <button type="button" className="coach-btn sm" onClick={cargar} disabled={estado === "cargando"}>
          {estado === "cargando" ? "Buscando la partida…" : "Ver quiénes están del otro lado"}
        </button>
      </div>
    );
  }

  if (estado === "termino") {
    return (
      <div className="lg-cta">
        <span className="lg-cta-texto">La partida ya terminó — va a aparecer en el historial en unos minutos.</span>
      </div>
    );
  }

  if (estado === "error" || !detalle) {
    return (
      <div className="lg-cta">
        <span className="lg-cta-texto">No se pudo leer la partida: {error}</span>
        <button type="button" className="coach-btn sm" onClick={cargar}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="lg-panel">
      <div className="lg-head">
        <span className="lg-head-titulo">
          <span className="live-dot" />
          En vivo · {detalle.queueLabel}
        </span>
        <span className="lg-head-meta">
          {detalle.startedMinutesAgo === 0 ? "recién empezó" : `hace ${detalle.startedMinutesAgo} min`}
        </span>
      </div>

      <div className="lg-cols">
        <div className="lg-col">
          <h5 className="lg-col-label">
            Rivales
            <InfoTip text="El rango y la maestría salen de Riot en el momento. El récord de la derecha es TUYO contra ese campeón cuando te tocó en tu misma línea, sobre tus partidas guardadas — por eso puede estar vacío aunque lo hayas visto del otro lado del mapa." />
          </h5>
          {detalle.rivales.map((p, i) => (
            <Rival p={p} version={ddragonVersion} key={`${p.champion}-${i}`} />
          ))}
        </div>

        <div className="lg-col">
          <h5 className="lg-col-label">Su equipo</h5>
          {detalle.aliados.map((p, i) => (
            <div className={`lg-fila aliado${p.esDelGrupo ? " del-grupo" : ""}`} key={`${p.champion}-${i}`}>
              <ChampIcon champ={p.champion} version={ddragonVersion} className="lg-champ" />
              <span className="lg-id">
                <span className="lg-nombre">{championLabel(p.champion)}</span>
                {p.riotId && <span className="lg-sub">{p.riotId}</span>}
              </span>
              {p.esDelGrupo && <span className="lg-tag-grupo">del grupo</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
