/**
 * "La historia del día": UNA cosa, la más interesante que pasó en el grupo.
 *
 * El problema que resuelve: Inicio contestaba "qué pasó hoy" —tres partidas,
 * 2V-1D— y después mostraba el ladder y una lista de movimientos. Todo
 * correcto y todo estático: si ya sabés quién va primero, no hay ninguna razón
 * para entrar. Lo que falta es la pregunta que sigue, que es **qué vale la
 * pena mirar**.
 *
 * Así que esto elige un solo acontecimiento y lo pone en el medio de la
 * portada. Un día es una racha, otro un ascenso, otro que dos jugaron cuatro
 * juntos, otro que la liga está a 0,75 puntos de definirse. La pantalla es la
 * misma; lo que cambia es lo que cuenta.
 *
 * Tres reglas que la sostienen:
 *
 * 1. **No inventa.** Cada clase de historia sale de datos que ya están: las
 *    fotos de LP, las partidas guardadas, la sinergia de dúo y la tabla de la
 *    liga. Sin material, devuelve null y el bloque no se dibuja — una portada
 *    con un cartel de "no pasó nada" es peor que una portada más corta.
 * 2. **Una sola.** La gracia es que sea LA historia. Dos ya son una lista, y
 *    una lista es lo que ya hay abajo en "qué se movió".
 * 3. **No la repite la lista de abajo.** Cuando la historia sale de un
 *    movimiento, ese movimiento se saca del feed (ver `esElMismo`). Si no, la
 *    portada dice dos veces lo mismo con dos tamaños distintos.
 *
 * El orden lo decide `peso`, y los pesos están escritos como escalones
 * separados —10000, 8000, 6000…— para que una clase nunca le gane a la de
 * arriba por acumulación. Un ascenso de tier es más noticia que cualquier
 * racha, y una racha de diez no lo cambia.
 */

import { currentStreak, rangoTexto, rankScore, tierFor } from "./ladder";
import type { DuoPair, Player } from "./types";
import { lpDeHoy, lpDelGrupoHoy, RACHA_MINIMA, type Movimiento } from "./actividad";

// Re-exportadas: Inicio las usa para el pulso del día y no tiene por qué
// saber que viven en actividad.ts.
export { lpDeHoy, lpDelGrupoHoy };

export type ClaseHistoria = "ascenso" | "pico" | "racha" | "derrumbe" | "liga" | "duo";

export interface Historia {
  clase: ClaseHistoria;
  /** El glifo. Es el único lugar donde una historia se vuelve un ícono. */
  icono: string;
  /** La frase, entera y en una línea. Lleva el nombre adentro a propósito: es un titular, no una fila. */
  titulo: string;
  /** El dato que la respalda, o null cuando el titular se basta solo. */
  detalle: string | null;
  /** A quién abrir. Null en las historias que no son de una persona. */
  key: string | null;
  /** Adónde lleva el botón. */
  destino: "perfil" | "liga";
  tono: "bueno" | "malo" | "neutro";
  peso: number;
}

/** Desde cuántas al hilo una racha es LA historia del día (en el feed alcanza con 3). */
export const RACHA_DESTACADA = 4;

/** Cuántas partidas juntos en el día hacen noticia. Con dos no: dos es una tarde cualquiera. */
export const DUO_MINIMO = 3;

/** A cuántos puntos la liga pasa a ser la historia del día. */
export const LIGA_APRETADA = 1.5;

/** Y a cuántas horas del cierre. Un empate el martes no es tensión todavía. */
export const LIGA_HORAS = 36;

const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;
const diaArgentino = (ms: number) => Math.floor((ms - ARG_OFFSET_MS) / 86400000);

const rango = rangoTexto;
const num = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");

/** Cuántas partidas jugó hoy y cuántas ganó. */
function hoyDe(p: Player, hoy: number): { jugadas: number; ganadas: number } {
  let jugadas = 0;
  let ganadas = 0;
  for (const m of p.matches ?? []) {
    const t = Date.parse(m.playedAt);
    if (Number.isNaN(t)) continue;
    if (diaArgentino(t) < hoy) break; // vienen de la más nueva a la más vieja
    jugadas++;
    if (m.win) ganadas++;
  }
  return { jugadas, ganadas };
}

/**
 * Las horas que faltan para una fecha. Null si no se puede leer o ya pasó.
 */
function horasHasta(iso: string | undefined, ahora: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - ahora;
  if (Number.isNaN(ms) || ms <= 0) return null;
  return ms / 3600000;
}

export interface LigaParaHistoria {
  arrancoYa?: boolean;
  hasta?: string;
  tabla?: { puuid: string; name: string; puntos?: number; sinJugar: boolean }[];
}

/**
 * La historia del día, o null si el grupo no dio para una.
 *
 * `duos` y `liga` son opcionales: Inicio los tiene, pero la función se puede
 * llamar con lo que haya y las clases que no se puedan calcular simplemente
 * no compiten.
 */
export function historiaDelDia(
  players: Player[],
  duos: DuoPair[] = [],
  liga: LigaParaHistoria | null = null,
  ahora = Date.now(),
): Historia | null {
  const hoy = diaArgentino(ahora);
  const candidatas: Historia[] = [];

  for (const p of players) {
    const key = `${p.name}#${p.tag}`;
    const { jugadas, ganadas } = hoyDe(p, hoy);
    if (jugadas === 0) continue;
    const lp = lpDeHoy(p, hoy);
    const lpTxt = lp === null ? null : `${lp > 0 ? "+" : lp < 0 ? "−" : ""}${Math.abs(lp)} LP hoy`;

    // ── Ascenso. El de TIER pesa más que el de división: pasar de Platino a
    //    Esmeralda es la noticia del mes; de Esmeralda 2 a Esmeralda 1, la del
    //    día.
    const h = p.lpHistory ?? [];
    const arranque = hoy * 86400000 + ARG_OFFSET_MS;
    let antes = null as (typeof h)[number] | null;
    for (const f of h) {
      const t = Date.parse(f.capturedAt);
      if (Number.isNaN(t) || t >= arranque) break;
      antes = f;
    }
    const ahoraFoto = h[h.length - 1] ?? null;
    if (antes && ahoraFoto) {
      const subioTier = tierFor(ahoraFoto.tier).rank > tierFor(antes.tier).rank;
      const bajoTier = tierFor(ahoraFoto.tier).rank < tierFor(antes.tier).rank;
      const cambioDiv = antes.division !== ahoraFoto.division || antes.tier !== ahoraFoto.tier;
      const delta = rankScore(ahoraFoto.tier, ahoraFoto.division, ahoraFoto.lp) - rankScore(antes.tier, antes.division, antes.lp);
      if (subioTier) {
        candidatas.push({
          clase: "ascenso", icono: "👑",
          titulo: `${p.name} subió a ${tierFor(ahoraFoto.tier).name}`,
          detalle: [`${rango(antes.tier, antes.division)} → ${rango(ahoraFoto.tier, ahoraFoto.division)}`, lpTxt].filter(Boolean).join(" · "),
          key, destino: "perfil", tono: "bueno", peso: 10000,
        });
      } else if (bajoTier) {
        candidatas.push({
          clase: "derrumbe", icono: "💀",
          titulo: `${p.name} se cayó a ${tierFor(ahoraFoto.tier).name}`,
          detalle: [`${rango(antes.tier, antes.division)} → ${rango(ahoraFoto.tier, ahoraFoto.division)}`, lpTxt].filter(Boolean).join(" · "),
          key, destino: "perfil", tono: "malo", peso: 9500,
        });
      } else if (cambioDiv && delta > 0) {
        candidatas.push({
          clase: "ascenso", icono: "📈",
          titulo: `${p.name} ascendió a ${rango(ahoraFoto.tier, ahoraFoto.division)}`,
          detalle: lpTxt,
          key, destino: "perfil", tono: "bueno", peso: 6000,
        });
      }
    }

    // ── El pico de la temporada. Solo si HOY subió: estar en el pico sin
    //    haberse movido es el estado normal del que va primero, no una noticia.
    const actual = rankScore(p.tierKey, p.division, p.lp);
    const pico = rankScore(p.peakLp.tier, p.peakLp.division, p.peakLp.lp);
    if (lp !== null && lp > 0 && actual >= pico) {
      candidatas.push({
        clase: "pico", icono: "🗻",
        titulo: `${p.name} está en su pico de la temporada`,
        detalle: [`${rango(p.tierKey, p.division)} · ${p.lp} LP`, lpTxt].filter(Boolean).join(" · "),
        key, destino: "perfil", tono: "bueno", peso: 8000,
      });
    }

    // ── La racha. En el feed alcanza con tres; para ser LA historia del día
    //    hacen falta cuatro.
    const racha = currentStreak(p.matches ?? []);
    if (racha && racha.count >= RACHA_DESTACADA) {
      const gana = racha.result === "W";
      candidatas.push({
        clase: gana ? "racha" : "derrumbe",
        icono: gana ? "🔥" : "🧊",
        titulo: `${p.name} lleva ${racha.count}${racha.capped ? "+" : ""} ${gana ? "victorias" : "derrotas"} al hilo`,
        detalle: [`${rango(p.tierKey, p.division)}`, lpTxt].filter(Boolean).join(" · "),
        key, destino: "perfil", tono: gana ? "bueno" : "malo",
        // Escalonado dentro de su franja: cinco al hilo le gana a cuatro, pero
        // ninguna racha le gana a un ascenso de tier.
        peso: 4000 + racha.count * 10,
      });
    } else if (racha && racha.count >= RACHA_MINIMA && jugadas >= RACHA_MINIMA) {
      // Tres al hilo TODAS hoy sí es la historia de la tarde.
      const gana = racha.result === "W";
      candidatas.push({
        clase: gana ? "racha" : "derrumbe",
        icono: gana ? "🔥" : "🧊",
        titulo: `${p.name} ganó ${ganadas} de ${jugadas} hoy`,
        detalle: [`${racha.count} al hilo`, `${rango(p.tierKey, p.division)}`, lpTxt].filter(Boolean).join(" · "),
        key, destino: "perfil", tono: gana ? "bueno" : "malo", peso: 3000 + racha.count * 10,
      });
    }
  }

  // ── El dúo del día. Sale de `recentMatches` de la sinergia, que son las
  //    últimas cinco compartidas con su fecha: si tres o más cayeron hoy, esos
  //    dos se pasaron la tarde juntos y eso es una historia de grupo.
  for (const d of duos) {
    const deHoy = (d.recentMatches ?? []).filter((m) => {
      const t = Date.parse(m.playedAt);
      return !Number.isNaN(t) && diaArgentino(t) === hoy;
    });
    if (deHoy.length < DUO_MINIMO) continue;
    const ganadas = deHoy.filter((m) => m.win).length;
    // `recentMatches` son las ÚLTIMAS CINCO compartidas: si las cinco son de
    // hoy, pudieron ser más y el número se escribe con un "+". Es la misma
    // honestidad que la racha del ladder, que también sale de una ventana.
    const tope = deHoy.length >= 5;
    candidatas.push({
      clase: "duo", icono: "⚔",
      titulo: `${d.aName} y ${d.bName} jugaron ${deHoy.length}${tope ? "+" : ""} juntos hoy`,
      detalle: `${ganadas}V-${deHoy.length - ganadas}D cuando juegan juntos`,
      key: null, destino: "perfil", tono: ganadas * 2 >= deHoy.length ? "bueno" : "malo",
      peso: 5000 + deHoy.length * 10,
    });
  }

  // ── La liga, cuando está por definirse. Las dos condiciones juntas: poca
  //    diferencia Y poco tiempo. Cualquiera de las dos sola no es tensión.
  if (liga?.arrancoYa && liga.tabla) {
    const jugaron = liga.tabla.filter((f) => !f.sinJugar);
    const horas = horasHasta(liga.hasta, ahora);
    if (jugaron.length >= 2 && horas !== null && horas <= LIGA_HORAS) {
      const orden = [...jugaron].sort((a, b) => (b.puntos ?? 0) - (a.puntos ?? 0));
      const ventaja = Math.round(((orden[0].puntos ?? 0) - (orden[1].puntos ?? 0)) * 100) / 100;
      if (ventaja <= LIGA_APRETADA) {
        candidatas.push({
          clase: "liga", icono: "🏆",
          titulo: ventaja === 0
            ? `${orden[0].name} y ${orden[1].name} están empatados en la punta`
            : `La liga está a ${num(ventaja)} ${ventaja === 1 ? "punto" : "puntos"}`,
          detalle: `${orden[0].name} ${num(orden[0].puntos ?? 0)} · ${orden[1].name} ${num(orden[1].puntos ?? 0)} · cierra en ${Math.max(1, Math.round(horas))} h`,
          key: null, destino: "liga", tono: "neutro", peso: 7000,
        });
      }
    }
  }

  if (candidatas.length === 0) return null;
  candidatas.sort((a, b) => b.peso - a.peso);
  return candidatas[0];
}

/**
 * Si un movimiento del feed es el MISMO acontecimiento que la historia
 * destacada. Se compara por persona y por clase y no por el texto: los dos lo
 * escriben distinto a propósito —uno es un titular y el otro una fila— así que
 * comparar frases daría siempre falso.
 */
export function esElMismo(m: Movimiento, h: Historia | null): boolean {
  if (!h || !h.key || m.key !== h.key) return false;
  if (h.clase === "ascenso") return m.tipo === "ascenso";
  if (h.clase === "derrumbe") return m.tipo === "descenso" || m.tipo === "racha";
  if (h.clase === "racha") return m.tipo === "racha";
  // El pico sale de un movimiento de LP del día, así que también se pisan.
  if (h.clase === "pico") return m.tipo === "lp" || m.tipo === "ascenso";
  return false;
}
