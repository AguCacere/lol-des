"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { RADAR_AXIS, type RadarAxis, type RadarMetric } from "@/lib/radar";
import { ROLES, tierFor } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";
import { ChampIcon } from "./ChampIcon";
import { InfoTip } from "./InfoTip";
import { Select, type OpcionSelect } from "./Select";

/**
 * "Cara a cara" — dos del grupo enfrentados eje por eje.
 *
 * No pide nada al servidor: los Player ya vienen completos del ladder, con su
 * radar, su pool y su rango. Es una vista nueva sobre datos que ya estaban en
 * memoria.
 *
 * La decisión que sostiene todo el componente: la comparación se hace por
 * DESVÍOS CONTRA EL PROPIO ROL (el `z` del radar), no por el número crudo.
 * Comparar el CS/min de un ADC contra el de un support diría que el support
 * es un desastre farmeando, que es como decir que un arquero mete pocos
 * goles. El z pregunta otra cosa: cuánto se despega cada uno de los que
 * juegan lo mismo que él. Y cuando los dos SON del mismo rol comparten pool
 * de comparación, así que ordenar por z da exactamente el mismo resultado que
 * ordenar por el número crudo — una sola regla sirve para los dos casos.
 */

/** Diferencia de z a partir de la cual la barra llega al tope. Dos desvíos es una brecha enorme. */
const BRECHA_MAX = 2;

function claveDe(p: Player): string {
  return `${p.name}#${p.tag}`;
}

function formatear(metric: RadarMetric, valor: number): string {
  const info = RADAR_AXIS[metric];
  return `${valor.toFixed(info.decimals)}${info.suffix ?? ""}`;
}

function Ficha({ p, lado }: { p: Player; lado: "a" | "b" }) {
  const t = tierFor(p.tierKey);
  return (
    <div className={`h2h-ficha ${lado}`}>
      <div className="h2h-ficha-top">
        {p.profileIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- un avatar chico de CDN externo, no vale la config de next/image
          <img src={p.profileIconUrl} alt="" className="h2h-avatar" />
        ) : (
          <span className="h2h-avatar" />
        )}
        <div className="h2h-ficha-id">
          <span className="h2h-nombre">
            {p.name}
            {p.you && <span className="you-badge">VOS</span>}
          </span>
          <span className="h2h-sub">
            {ROLES[p.role].label} · main {championLabel(p.mainChamp)}
          </span>
        </div>
      </div>
      <div className="h2h-ficha-stats">
        <span style={{ color: t.fg }}>
          {t.name} {p.division}
        </span>
        <span className="h2h-sep">·</span>
        <span>{p.lp} LP</span>
        <span className="h2h-sep">·</span>
        <span>
          {p.winrate}% <span className="h2h-mini">en {p.wins + p.losses}</span>
        </span>
      </div>
    </div>
  );
}

export function HeadToHead({ players, ddragonVersion }: { players: Player[]; ddragonVersion: string | null }) {
  // Por defecto: vos contra el primero del ladder que no seas vos. Es la
  // comparación que alguien abre esta pestaña para ver.
  const yo = players.find((p) => p.you) ?? players[0];
  const rival = players.find((p) => p !== yo);
  const [claveA, setClaveA] = useState<string>(yo ? claveDe(yo) : "");
  const [claveB, setClaveB] = useState<string>(rival ? claveDe(rival) : "");

  if (players.length < 2) {
    return (
      <div className="empty-state">
        <strong>Hace falta más de un invocador</strong>
        Agregá a alguien más al ladder para poder comparar.
      </div>
    );
  }

  const opciones: OpcionSelect[] = players.map((p) => {
    const t = tierFor(p.tierKey);
    return { value: claveDe(p), label: claveDe(p), detalle: `${t.name} ${p.division} · ${ROLES[p.role].label}` };
  });

  const a = players.find((p) => claveDe(p) === claveA) ?? players[0];
  const b = players.find((p) => claveDe(p) === claveB) ?? players[1];
  const mismoRol = a.role === b.role;

  // Solo los ejes que los DOS tienen: un eje se cae del radar cuando no hay
  // muestra suficiente, y comparar contra un hueco no es comparar.
  const radarB = b.radar;
  const ejes: { key: RadarMetric; a: RadarAxis; b: RadarAxis }[] = [];
  if (a.radar && radarB) {
    for (const ejeA of a.radar.axes) {
      const ejeB = radarB.axes.find((x) => x.key === ejeA.key);
      if (ejeB) ejes.push({ key: ejeA.key, a: ejeA, b: ejeB });
    }
  }

  const ganaA = ejes.filter((e) => e.a.z > e.b.z).length;
  const ganaB = ejes.length - ganaA;

  // Los dos pools completos, con los campeones compartidos marcados: la
  // intersección sola suele venir vacía (el pool está capado en 5) y una
  // sección vacía es peor que una que igual muestra algo útil.
  const champsB = new Set(b.championPool.map((c) => c.champ));
  const compartidos = a.championPool.filter((c) => champsB.has(c.champ)).map((c) => c.champ);

  return (
    <section className="section h2h">
      <div className="section-head">
        <h2 className="section-title">Cara a cara</h2>
        <span className="meta">Dos del grupo, eje por eje</span>
      </div>

      <div className="h2h-selects">
        <Select className="h2h-select" value={claveA} onChange={setClaveA} ariaLabel="Primer invocador" options={opciones} />
        <span className="h2h-vs">VS</span>
        <Select className="h2h-select" value={claveB} onChange={setClaveB} ariaLabel="Segundo invocador" options={opciones} />
      </div>

      {claveA === claveB ? (
        <div className="empty-state">
          <strong>Elegí dos distintos</strong>
          Compararlo con sí mismo siempre termina empatado.
        </div>
      ) : (
        <>
          <div className="h2h-fichas">
            <Ficha p={a} lado="a" />
            <Ficha p={b} lado="b" />
          </div>

          {ejes.length === 0 ? (
            <div className="empty-state">
              <strong>Todavía no hay con qué compararlos</strong>
              Uno de los dos no tiene suficientes partidas en su rol para armar el perfil de siete ejes.
            </div>
          ) : (
            <div className="h2h-ejes">
              <div className="h2h-ejes-head">
                <span>
                  Cuánto se despega cada uno de su rol
                  <InfoTip text="Cada barra compara desvíos contra el promedio del grupo EN EL ROL DE CADA UNO, no los números crudos. Comparar el CS/min de un ADC contra el de un support diría que el support farmea mal, y no es lo que hace. Cuando los dos juegan el mismo rol comparten el promedio de referencia, así que el resultado coincide con comparar los números directamente." />
                </span>
                <span className="h2h-marcador">
                  <strong className="a">{ganaA}</strong> — <strong className="b">{ganaB}</strong>
                </span>
              </div>

              {!mismoRol && (
                <p className="h2h-nota">
                  Juegan roles distintos ({ROLES[a.role].label} y {ROLES[b.role].label}), así que se comparan contra sus
                  propios pares y no entre ellos.
                </p>
              )}

              {ejes.map((e) => {
                const diff = Math.max(-1, Math.min(1, (e.a.z - e.b.z) / BRECHA_MAX));
                const haciaA = diff > 0;
                return (
                  <div className="h2h-eje" key={e.key}>
                    <span className={`h2h-val a${haciaA ? " gana" : ""}`}>{formatear(e.key, e.a.value)}</span>
                    <div className="h2h-barra">
                      <div
                        className={`h2h-fill ${haciaA ? "a" : "b"}`}
                        style={{
                          width: `${Math.abs(diff) * 50}%`,
                          [haciaA ? "right" : "left"]: "50%",
                        }}
                      />
                      <span className="h2h-eje-label">
                        <span>{RADAR_AXIS[e.key].long}</span>
                      </span>
                    </div>
                    <span className={`h2h-val b${!haciaA ? " gana" : ""}`}>{formatear(e.key, e.b.value)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="h2h-pools">
            {[a, b].map((p, i) => (
              <div className="h2h-pool" key={claveDe(p)}>
                <h4 className="subsection-label">
                  Pool de {p.name}
                  {compartidos.length > 0 && i === 0 && (
                    <InfoTip text="Los campeones que juegan los dos quedan marcados en los dos lados — es donde la comparación es directa, mismo campeón contra el mismo campeón." />
                  )}
                </h4>
                {p.championPool.length === 0 ? (
                  <p className="h2h-vacio">Sin partidas guardadas todavía.</p>
                ) : (
                  p.championPool.map((c) => (
                    <div className={`h2h-champ${compartidos.includes(c.champ) ? " compartido" : ""}`} key={c.champ}>
                      <ChampIcon champ={c.champ} version={ddragonVersion} className="h2h-champ-icon" />
                      <span className="h2h-champ-name">{championLabel(c.champ)}</span>
                      <span className="h2h-champ-rec">
                        {c.wins}V-{c.losses}D
                      </span>
                      <span className={`h2h-champ-wr ${c.winrate >= 50 ? "good" : "bad"}`}>{c.winrate}%</span>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
