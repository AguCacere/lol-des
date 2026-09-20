/**
 * "Qué cambió últimamente" — los movimientos del grupo en las últimas horas,
 * para el arranque de Inicio.
 *
 * Lo único que hay para reconstruir esto son las FOTOS de LP (`lp_snapshots`,
 * que llegan acá como `Player.lpHistory`) y las partidas guardadas. No hay una
 * tabla de eventos, y no se va a inventar una: un feed que dice "subió a Oro"
 * porque alguien lo dedujo mal es peor que no tener feed. Así que cada
 * movimiento de acá sale de restar dos fotos reales, y cuando las fotos no
 * alcanzan para afirmar algo, no se afirma.
 *
 * El caso concreto: `lpHistory` son las ÚLTIMAS 20 fotos, no las de las
 * últimas N horas. Si alguien jugó veinte veces en una tarde, su foto más
 * vieja puede ser de hace tres horas — y ahí "en las últimas 24 horas subió
 * 40 LP" sería mentira por defecto: subió eso Y lo de antes, que ya no está en
 * la ventana. Por eso `desde()` exige una foto ANTERIOR al corte y devuelve
 * null si no la hay. Preferimos callarnos un movimiento real antes que
 * publicar uno recortado.
 *
 * Los LP se comparan con `rankScore` y no con el LP crudo: el LP se resetea a
 * un número bajo en cada ascenso de división, así que restar LP pelado
 * convierte una promoción —el mejor momento de la semana— en una caída de 70.
 */

import { currentStreak, rankScore, tierFor } from "./ladder";
import type { LpHistoryPoint, Player } from "./types";

/** Cuánto para atrás mira el feed. Un día: menos es un feed casi siempre vacío en un grupo de siete. */
export const VENTANA_HORAS = 24;

/**
 * Cuántos LP netos hay que moverse para que valga la pena contarlo. Por
 * debajo es una partida floja y media: el feed se llenaría de "+12 LP" y
 * dejaría de señalar nada. Un ascenso o descenso de división NO pasa por este
 * filtro — ese se cuenta aunque haya sido por un LP.
 */
export const LP_MINIMO = 25;

/** Desde cuántas seguidas una racha es noticia. Con tres ya se habla de eso en el chat. */
export const RACHA_MINIMA = 3;

export type TipoMovimiento = "ascenso" | "descenso" | "lp" | "racha";

export interface Movimiento {
  /** La clave del jugador, `Nombre#TAG`: con esto se abre su perfil. */
  key: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  tipo: TipoMovimiento;
  /** El título del movimiento, ya en castellano. */
  texto: string;
  /** El contexto corto que va al lado, o null si el título se basta solo. */
  detalle: string | null;
  /** Para pintarlo: si el movimiento es bueno, malo o neutro. */
  tono: "bueno" | "malo" | "neutro";
  /**
   * Con qué ordenar. No es un reloj: es cuánto pesa el movimiento (LP netos,
   * largo de la racha escalado). El feed de Inicio muestra tres o cuatro y
   * tienen que ser los más gordos, no los más nuevos — "hace dos horas subió
   * 8 LP" arriba de "hoy ascendió a Esmeralda" es un orden que no ayuda.
   */
  peso: number;
}

/**
 * La foto más nueva que sea ANTERIOR al corte. Null si la ventana entera cae
 * dentro de las 20 fotos guardadas, que es el caso en el que no se puede decir
 * honestamente cuánto se movió en ese rato (ver el header).
 */
function desde(historia: LpHistoryPoint[], corte: number): LpHistoryPoint | null {
  let previa: LpHistoryPoint | null = null;
  for (const h of historia) {
    const t = Date.parse(h.capturedAt);
    if (Number.isNaN(t) || t > corte) break;
    previa = h;
  }
  return previa;
}

/** "Esmeralda 4". El nombre que usa toda la app, no el de Riot. */
function rangoTexto(tier: LpHistoryPoint["tier"], division: number): string {
  return `${tierFor(tier).name} ${division}`;
}

/**
 * Los movimientos del grupo en las últimas `VENTANA_HORAS`, del más gordo al
 * más chico. Como mucho UNO por jugador: si alguien ascendió Y viene de cinco
 * al hilo, el feed cuenta el ascenso —es lo que pasó— y no ocupa dos renglones
 * de cinco con la misma persona. Sin nada que contar devuelve una lista vacía,
 * y entonces la sección no se dibuja.
 */
export function movimientosRecientes(players: Player[], ahora = Date.now()): Movimiento[] {
  const corte = ahora - VENTANA_HORAS * 3600000;
  const out: Movimiento[] = [];

  for (const p of players) {
    const key = `${p.name}#${p.tag}`;
    const base = { key, name: p.name, tag: p.tag, profileIconUrl: p.profileIconUrl };
    const historia = p.lpHistory ?? [];
    const previa = historia.length >= 2 ? desde(historia, corte) : null;
    const ultima = historia[historia.length - 1] ?? null;

    let elegido: Movimiento | null = null;

    if (previa && ultima && previa !== ultima) {
      const delta = rankScore(ultima.tier, ultima.division, ultima.lp) - rankScore(previa.tier, previa.division, previa.lp);
      const cruzo = previa.tier !== ultima.tier || previa.division !== ultima.division;

      if (cruzo) {
        // Un cambio de rango se cuenta SIEMPRE, aunque el neto sea chico:
        // ascender es el evento que el grupo festeja, y pasa justo cuando el
        // LP vuelve a cero — o sea, con el delta más flaco de la semana.
        const subio = delta > 0;
        elegido = {
          ...base,
          tipo: subio ? "ascenso" : "descenso",
          texto: `${subio ? "Ascendió" : "Bajó"} a ${rangoTexto(ultima.tier, ultima.division)}`,
          detalle: `desde ${rangoTexto(previa.tier, previa.division)}`,
          tono: subio ? "bueno" : "malo",
          // Por encima de cualquier movimiento de LP puro: 10.000 es más que
          // el LP que se puede mover en un día por cualquier camino.
          peso: 10000 + Math.abs(delta),
        };
      } else if (Math.abs(delta) >= LP_MINIMO) {
        elegido = {
          ...base,
          tipo: "lp",
          texto: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} LP`,
          detalle: rangoTexto(ultima.tier, ultima.division),
          tono: delta > 0 ? "bueno" : "malo",
          peso: Math.abs(delta),
        };
      }
    }

    if (!elegido) {
      // La racha se mira solo si no hubo movimiento de rango ni de LP que
      // contar. Y solo cuenta si la ÚLTIMA partida cae dentro de la ventana:
      // una racha de seis terminada el martes no es actividad de hoy.
      const racha = currentStreak(p.matches ?? []);
      const ultimaPartida = p.matches?.[0];
      const fresca = ultimaPartida ? Date.parse(ultimaPartida.playedAt) >= corte : false;
      if (racha && fresca && racha.count >= RACHA_MINIMA) {
        const gana = racha.result === "W";
        elegido = {
          ...base,
          tipo: "racha",
          texto: `${racha.count}${racha.capped ? "+" : ""} ${gana ? "ganadas" : "perdidas"} al hilo`,
          detalle: rangoTexto(p.tierKey, p.division),
          tono: gana ? "bueno" : "malo",
          // Escalado para que compita con el LP sin taparlo: cinco al hilo
          // pesan como 50 LP, que es más o menos lo que valen.
          peso: racha.count * 10,
        };
      }
    }

    if (elegido) out.push(elegido);
  }

  return out.sort((a, b) => b.peso - a.peso);
}

/**
 * Argentina está en UTC−3 todo el año. Tercera copia de la constante, y a
 * propósito: `lib/ladder.ts` y `lib/liga.ts` ya la tienen cada uno por su lado
 * para no armar un ciclo de imports entre los tres. Si algún día vuelve el
 * horario de verano, son tres lugares — está anotado en DECISIONES.
 */
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

/** En qué día argentino cayó ese instante, como número de día corrido. */
function diaArgentino(ms: number): number {
  return Math.floor((ms - ARG_OFFSET_MS) / 86400000);
}

/** Lo que hizo el grupo HOY: partidas, cómo salieron y cuántos jugaron. */
export interface Hoy {
  partidas: number;
  victorias: number;
  derrotas: number;
  /** Cuántos del grupo jugaron al menos una hoy. */
  jugaron: number;
}

/**
 * El pulso del día. Existe porque el encabezado de la app ya dice cuántos
 * invocadores hay, en qué región y quién está en partida —los tres datos de
 * "estado ambiente"— y repetirlos abajo, más grandes, no es un resumen: es la
 * misma línea dos veces. Lo que no dice ninguno es qué pasó HOY, que es
 * justamente la pregunta con la que uno entra.
 *
 * Días CALENDARIO argentinos, no bloques de 24 horas: "hoy" arranca a las
 * 00:00 de acá. Es la misma cuenta que usa la liga para repartir las partidas
 * por día, así que las dos pantallas no se pueden contradecir.
 */
export function resumenDeHoy(players: Player[], ahora = Date.now()): Hoy {
  const hoy = diaArgentino(ahora);
  let partidas = 0;
  let victorias = 0;
  let jugaron = 0;
  for (const p of players) {
    let suyas = 0;
    for (const m of p.matches ?? []) {
      const t = Date.parse(m.playedAt);
      if (Number.isNaN(t)) continue;
      // Las partidas vienen de la más nueva a la más vieja: en cuanto
      // aparece una de ayer, las que siguen también lo son.
      if (diaArgentino(t) < hoy) break;
      suyas++;
      if (m.win) victorias++;
    }
    partidas += suyas;
    if (suyas > 0) jugaron++;
  }
  return { partidas, victorias, derrotas: partidas - victorias, jugaron };
}
