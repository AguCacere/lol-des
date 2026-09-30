"use client";

import { useState } from "react";
import type { DuoPair, Player } from "@/lib/types";
import { RADAR_AXIS, type RadarMetric } from "@/lib/radar";
import { formatRelativeTime, rangoTexto, ROLES, tierFor } from "@/lib/ladder";
import { championLabel } from "@/lib/champion-names";
import { tonoDeWinrate, winrateTexto } from "@/lib/winrate";
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

/** Un eje del cara a cara: el promedio de cada uno y, si existe, su z contra los pares de su rol. */
interface Eje {
  key: RadarMetric;
  valorA: number;
  valorB: number;
  zA: number | null;
  zB: number | null;
}

function claveDe(p: Player): string {
  return `${p.name}#${p.tag}`;
}

function formatear(metric: RadarMetric, valor: number): string {
  const info = RADAR_AXIS[metric];
  return `${valor.toFixed(info.decimals)}${info.suffix ?? ""}`;
}

function Ficha({ p, lado }: { p: Player; lado: "a" | "b" }) {
  const t = tierFor(p.tierKey);
  // La forma reciente la pedía el plan y no estaba: dos fichas con el rango y
  // el winrate de la season no dicen cuál de los dos está jugando bien AHORA,
  // que es la mitad de por qué alguien abre un cara a cara. Mismo material y
  // mismo lenguaje que la banda del Resumen del perfil: los puntitos de las
  // últimas cinco y el winrate de las últimas veinte contra su propio
  // histórico. Los puntitos venían de la banda del Resumen del perfil; esa
  // banda se fue al rehacer el perfil y el dibujo se quedó acá, que es el
  // único lugar que todavía lo usa.
  const ultimas = p.matches.slice(0, 5);
  const v = ultimas.filter((m) => m.win).length;
  const wr = p.recentForm?.winrate ?? null;
  const pp = wr ? Math.round(wr.recent - wr.baseline) : null;
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
          {rangoTexto(p.tierKey, p.division)}
        </span>
        <span className="h2h-sep">·</span>
        <span>{p.lp} LP</span>
        <span className="h2h-sep">·</span>
        <span>
          {winrateTexto(p.wins, p.wins + p.losses)} <span className="h2h-mini">en {p.wins + p.losses}</span>
        </span>
      </div>
      {(ultimas.length > 0 || wr) && (
        <div className="h2h-forma">
          {ultimas.length > 0 && (
            <span className="h2h-forma-bloque">
              <span className="h2h-puntos" aria-hidden>
                {ultimas.map((m, i) => (
                  <span key={i} className={`h2h-punto ${m.win ? "good" : "bad"}`} />
                ))}
              </span>
              <span className="h2h-mini">
                {v}V·{ultimas.length - v}D
              </span>
            </span>
          )}
          {wr && (
            <span className="h2h-forma-bloque">
              <span className="h2h-mini">últimas {p.recentForm!.recentGames}</span>
              <strong className={wr.recent >= 50 ? "gd-pos" : "gd-neg"}>{Math.round(wr.recent)}%</strong>
              {pp !== null && pp !== 0 && (
                <span className={`h2h-mini ${pp > 0 ? "gd-pos" : "gd-neg"}`}>
                  {pp > 0 ? "+" : "−"}
                  {Math.abs(pp)} pp
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function HeadToHead({
  players,
  duos,
  ddragonVersion,
}: {
  players: Player[];
  /** La sinergia de dúo ya calculada (pestaña Estadísticas): acá se usa para el par elegido. */
  duos: DuoPair[];
  ddragonVersion: string | null;
}) {
  // Por defecto: vos contra el primero del ladder que no seas vos. Es la
  // comparación que alguien abre esta pestaña para ver.
  const yo = players.find((p) => p.you) ?? players[0];
  const rival = players.find((p) => p !== yo);
  const [claveA, setClaveA] = useState<string>(yo ? claveDe(yo) : "");
  const [claveB, setClaveB] = useState<string>(rival ? claveDe(rival) : "");

  if (players.length < 2) {
    // Con el encabezado puesto, y en un renglón. Antes era una caja centrada
    // suelta: la pestaña quedaba como una página en blanco con un cartel en
    // el medio, sin decir siquiera que eso era "Cara a cara".
    return (
      <section className="section h2h">
        <div className="section-head">
          <h2 className="section-title">Cara a cara</h2>
        </div>
        <p className="h2h-nada">Hace falta más de un invocador en el ladder para poder comparar.</p>
      </section>
    );
  }

  const opciones: OpcionSelect[] = players.map((p) => ({
    value: claveDe(p),
    label: claveDe(p),
    detalle: `${rangoTexto(p.tierKey, p.division)} · ${ROLES[p.role].label}`,
  }));

  const a = players.find((p) => claveDe(p) === claveA) ?? players[0];
  const b = players.find((p) => claveDe(p) === claveB) ?? players[1];
  const mismoRol = a.role === b.role;

  // El par en la lista de dúos, en cualquiera de los dos órdenes. Va DESPUÉS
  // de a y b: son const, así que leerlas antes de su declaración explota en
  // runtime aunque el tipo cierre.
  const juntos = duos.find(
    (d) =>
      (d.aName === a.name && d.aTag === a.tag && d.bName === b.name && d.bTag === b.tag) ||
      (d.aName === b.name && d.aTag === b.tag && d.bName === a.name && d.bTag === a.tag)
  );


  // Los ejes salen de las MÉTRICAS PROPIAS, no del radar. El radar necesita
  // muestra del resto del grupo en el mismo rol y se cae seguido —si sos el
  // único ADC, no hay contra quién sacar el z-score—, y con él se caía toda
  // la sección, que es el caso más común y el peor: dos jugadores completos
  // en pantalla y un cartel de "no hay con qué compararlos".
  //
  // Cuando LOS DOS tienen radar se usa el z (cada uno contra los de su propio
  // rol), que es la comparación justa entre roles distintos. Cuando no, se
  // comparan los promedios directos y se avisa si los roles no coinciden.
  const zDe = (p: Player, key: RadarMetric): number | null => p.radar?.axes.find((x) => x.key === key)?.z ?? null;
  // `?? []` y no `a.metricas` a secas: las respuestas de /api/ladder se
  // cachean en el CDN, así que después de un deploy el código nuevo puede
  // recibir un JSON viejo —sin este campo— durante un minuto largo. Iterar
  // undefined ahí tira la pestaña entera abajo.
  const ejes: Eje[] = [];
  for (const mA of a.metricas ?? []) {
    const mB = (b.metricas ?? []).find((x) => x.key === mA.key);
    if (!mB) continue;
    const zA = zDe(a, mA.key);
    const zB = zDe(b, mA.key);
    ejes.push({ key: mA.key, valorA: mA.value, valorB: mB.value, zA, zB });
  }
  const hayZ = ejes.length > 0 && ejes.every((e) => e.zA !== null && e.zB !== null);

  /** Cuánto le gana A a B en este eje, normalizado a -1..1. */
  function ventaja(e: Eje): number {
    if (hayZ) return Math.max(-1, Math.min(1, (e.zA! - e.zB!) / BRECHA_MAX));
    // Sin z, la brecha se mide en proporción al mayor de los dos: es la única
    // escala común entre ejes con unidades distintas (KDA 2,4 y oro 412).
    const mayor = Math.max(Math.abs(e.valorA), Math.abs(e.valorB), 0.0001);
    return Math.max(-1, Math.min(1, ((e.valorA - e.valorB) / mayor) * 2));
  }

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
        {/* El value sale de `a`/`b` y no del estado crudo: si el componente se
            monta antes de que carguen los invocadores, el estado arranca
            vacío y los dos selects mostraban al primero de la lista mientras
            la comparación de abajo usaba al primero y al segundo. */}
        <Select className="h2h-select" value={claveDe(a)} onChange={setClaveA} ariaLabel="Primer invocador" options={opciones} />
        <span className="h2h-vs">VS</span>
        <Select className="h2h-select" value={claveDe(b)} onChange={setClaveB} ariaLabel="Segundo invocador" options={opciones} />
      </div>

      {claveDe(a) === claveDe(b) ? (
        <p className="h2h-nada">Elegí dos distintos: compararlo con sí mismo siempre termina empatado.</p>
      ) : (
        <>
          <div className="h2h-fichas">
            <Ficha p={a} lado="a" />
            <Ficha p={b} lado="b" />
          </div>

          {juntos && (
            // El dato que una vista "versus" pide sola y no estaba: cuánto
            // juegan JUNTOS y cómo les va. Sale de la sinergia de dúo, que ya
            // se calculaba para la pestaña de estadísticas.
            <div className="h2h-juntos">
              <span className="h2h-juntos-label">Cuando juegan juntos</span>
              <span className="h2h-juntos-datos">
                <strong>{juntos.games}</strong> partidas
                <span className="tw-dot">·</span>
                {juntos.wins}V-{juntos.games - juntos.wins}D
                <span className="tw-dot">·</span>
                <strong className={tonoDeWinrate(juntos.wins, juntos.games) === "bad" ? "gd-neg" : "gd-pos"}>
                  {winrateTexto(juntos.wins, juntos.games)}
                </strong>
                <span className="tw-dot">·</span>
                <span className="h2h-juntos-ultima">última {formatRelativeTime(juntos.lastPlayedAt)}</span>
              </span>
            </div>
          )}

          {ejes.length === 0 ? (
            <p className="h2h-nada">
              Todavía no hay con qué compararlos: hacen falta al menos diez partidas guardadas de cada uno para que
              los promedios signifiquen algo.
            </p>
          ) : (
            <div className="h2h-ejes">
              <div className="h2h-ejes-head">
                <span>
                  {hayZ ? "Cuánto se despega cada uno de su rol" : "Promedio de cada uno"}
                  <InfoTip
                    text={
                      hayZ
                        ? "Cada barra compara cuánto se despega cada uno del promedio DE SU PROPIO ROL, y no los números pelados. Comparar el CS/min de un ADC contra el de un support diría que el support farmea mal, y no es lo que hace. Cuando los dos juegan el mismo rol la referencia es la misma, así que da igual que compararlos de una."
                        : "Los promedios de cada uno sobre sus partidas guardadas. Para compararlos contra los que juegan su mismo rol —que es lo justo cuando juegan roles distintos— hacen falta varios del grupo jugando ese rol, y todavía no son suficientes."
                    }
                  />
                </span>
                {/* Acá había un marcador "4 — 3": cuántos ejes gana cada uno.
                    Se fue. Contar ejes equivale a decir que el KDA y la visión
                    por minuto pesan lo mismo, y no pesan; el número salía
                    grande arriba a la derecha y se leía como el resultado del
                    cara a cara. Las diferencias siguen estando eje por eje,
                    que es donde significan algo. */}
              </div>

              {!mismoRol && (
                <p className="h2h-nota">
                  {hayZ ? (
                    <>
                      Juegan roles distintos ({ROLES[a.role].label} y {ROLES[b.role].label}), así que se comparan contra
                      sus propios pares y no entre ellos.
                    </>
                  ) : (
                    <>
                      Ojo: juegan roles distintos ({ROLES[a.role].label} y {ROLES[b.role].label}) y estos son los
                      números crudos. El CS y el oro por minuto dependen mucho del rol — un support farmea menos porque
                      así se juega, no porque le salga mal.
                    </>
                  )}
                </p>
              )}

              {ejes.map((e) => {
                const diff = ventaja(e);
                const haciaA = diff > 0;
                return (
                  <div className="h2h-eje" key={e.key}>
                    {/* La etiqueta AL COSTADO y no encima de la barra. Estaba
                        centrada sobre la pista, con fondo propio para que el
                        relleno no le pasara por debajo, y el resultado era que
                        tapaba el relleno: la brecha típica mide 29px y arranca
                        justo en el medio, o sea abajo de la etiqueta. Se veía
                        la barra vacía en seis de siete ejes. */}
                    <span className="h2h-eje-label">
                      {/* Las dos versiones y el CSS elige, igual que en
                          Mejorar: en el teléfono la etiqueta se pone en su
                          propio renglón y ahí "Participación en objetivos"
                          salía recortada. */}
                      <span className="h2h-eje-larga">{RADAR_AXIS[e.key].long}</span>
                      <span className="h2h-eje-corta">{RADAR_AXIS[e.key].short}</span>
                    </span>
                    <span className={`h2h-val a${haciaA ? " gana" : ""}`}>{formatear(e.key, e.valorA)}</span>
                    <div className="h2h-barra">
                      <div
                        className={`h2h-fill ${haciaA ? "a" : "b"}`}
                        style={{
                          width: `${Math.abs(diff) * 50}%`,
                          [haciaA ? "right" : "left"]: "50%",
                        }}
                      />
                    </div>
                    <span className={`h2h-val b${!haciaA ? " gana" : ""}`}>{formatear(e.key, e.valorB)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="h2h-pools">
            {[a, b].map((p, i) => (
              <div className="h2h-pool" key={claveDe(p)}>
                <h4 className={`h2h-pool-titulo ${i === 0 ? "a" : "b"}`}>
                  Pool de <strong>{p.name}</strong>
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
                      <span className="h2h-champ-kda">{c.avgKda} KDA</span>
                      <span className={`h2h-champ-wr ${tonoDeWinrate(c.wins, c.wins + c.losses)}`}>{winrateTexto(c.wins, c.wins + c.losses)}</span>
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
