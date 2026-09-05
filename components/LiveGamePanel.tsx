"use client";

import { useState } from "react";
import type { LiveDetail, LiveParticipant } from "@/lib/types";
import { tierFor, ROLES } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import { RoleIcon } from "./RoleIcon";
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
 * Los dos equipos vienen ordenados por línea (top → jungla → mid → adc →
 * support), así que cada fila enfrenta a los dos de esa línea. La línea es
 * estimada: Spectator no la dice y hay que deducirla (ver lib/live-roles.ts),
 * por eso la aclaración está a la vista y no escondida.
 *
 * Se carga a pedido y no solo: son diez llamadas a Riot (rango y maestría de
 * los cinco rivales) y no tiene sentido pagarlas en cada refresco del ladder
 * por si alguien las mira.
 */

function Maestria({ m }: { m: LiveParticipant["maestria"] }) {
  if (!m) return <span className="lg-maestria nueva">lo estrena</span>;
  return (
    <span className="lg-maestria" title={`${m.points.toLocaleString("es-AR")} puntos de maestría con este campeón`}>
      maestría {m.level}
    </span>
  );
}

/**
 * La línea, estimada. El title dice que lo es y CON QUÉ se estimó: si sale
 * mal, eso señala cuál de las tres fuentes falló, que es lo único que hace
 * el error arreglable en vez de misterioso.
 */
function Linea({ p }: { p: LiveParticipant }) {
  if (!p.rol) return <span className="lg-linea vacia" />;
  return (
    <span className="lg-linea" title={`${ROLES[p.rol].label} — estimado${p.rolMotivo ? `, ${p.rolMotivo}` : ""}`}>
      <RoleIcon role={p.rol} />
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
      <Linea p={p} />
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
          <span className="lg-cruce-wr">{wr}% ganadas</span>
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
          {/* Dos encabezados en la misma línea, cada uno arriba de su columna:
              antes la del récord no tenía ninguno y había que adivinar de
              quién era ese 100% — de ahí el InfoTip, que ahora explica una
              columna con nombre en vez de una columna anónima. */}
          <div className="lg-col-cabecera">
            <h5 className="lg-col-label">Rivales</h5>
            <h5 className="lg-col-label lg-col-label-cruce">
              Cómo te fue contra ese campeón
              <InfoTip text="Tus partidas guardadas de SoloQ en las que ese campeón te tocó de rival en tu misma línea. Si dice «nunca te lo cruzaste» es que no hay ninguna: puede que lo hayas visto del otro lado del mapa, pero eso no es un duelo tuyo y no cuenta acá." />
            </h5>
          </div>
          {detalle.rivales.map((p, i) => (
            <Rival p={p} version={ddragonVersion} key={`${p.champion}-${i}`} />
          ))}
        </div>

        <div className="lg-col">
          <div className="lg-col-cabecera">
            <h5 className="lg-col-label">Su equipo</h5>
          </div>
          {detalle.aliados.map((p, i) => (
            <div className={`lg-fila aliado${p.esDelGrupo ? " del-grupo" : ""}`} key={`${p.champion}-${i}`}>
              <Linea p={p} />
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

      {/* La línea es lo único del panel que no sale de Riot. Decirlo una vez
          al pie es más honesto que ponerle un asterisco a cada ícono. */}
      <p className="lg-pie">
        Las líneas están estimadas: Riot no las publica hasta que la partida termina, así que se deducen del Castigo y de
        en qué línea vimos jugar a cada campeón en las partidas que ya tenemos guardadas. Pasá el mouse por el ícono para
        ver con qué se estimó cada una.
      </p>
    </div>
  );
}
