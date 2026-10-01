"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleKey, TierKey } from "@/lib/types";
import type { Edicion, EnPalmares } from "@/lib/palmares";
import type { RecordLiga } from "@/lib/liga-ahora";

/**
 * Los datos de la liga, UNA sola vez por pestaña del navegador.
 *
 * Antes esto vivía adentro de LigaSemanal y no molestaba a nadie: la liga era
 * la única pantalla que la pedía. Desde que Inicio muestra el adelanto de la
 * competencia son dos componentes, en dos secciones distintas, pidiendo la
 * misma respuesta — y `/api/liga` no es liviana: trae TODAS las partidas de la
 * semana de cada uno con su LP y su KDA.
 *
 * El CDN ya la cachea 240 segundos, así que el segundo pedido no llegaba a la
 * base ni al pool de Supabase (que es lo que importa; ver DECISIONES → la
 * caída de septiembre). Pero seguía siendo una descarga entera de más por
 * cambiar de pestaña, y el adelanto de Inicio parpadeaba cargando algo que ya
 * estaba en memoria dos pantallas más allá.
 *
 * Es un caché de módulo y no un contexto de React a propósito: no hay
 * proveedor que envolver —LigaSemanal se dibuja tres niveles adentro de
 * LadderTable— y lo único que se comparte es el resultado de un fetch.
 */
let cache: Datos | null = null;
let enVuelo: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  for (const f of oyentes) f();
}

/**
 * `forzar` saltea la caché del CDN con un parámetro que cambia. Hace falta
 * después de anotar o desanotar a alguien: sin esto vuelve la respuesta
 * cacheada de antes del cambio y parece que el botón no hizo nada.
 */
async function traer(forzar: boolean): Promise<void> {
  // Sin `forzar`, dos componentes que montan a la vez comparten el mismo
  // pedido en lugar de disparar dos. Con `forzar` sí se pide de nuevo: el que
  // fuerza acaba de cambiar algo y quiere ver el resultado.
  if (!forzar && enVuelo) return enVuelo;
  const p = (async () => {
    try {
      const res = await fetch(forzar ? `/api/liga?t=${Date.now()}` : "/api/liga");
      if (!res.ok) return;
      cache = (await res.json()) as Datos;
      avisar();
    } finally {
      enVuelo = null;
    }
  })();
  enVuelo = p;
  return p;
}

/**
 * Devuelve los datos de la liga y si todavía está cargando. El segundo
 * componente que la pida en la misma pestaña los tiene en el primer render:
 * `cargando` arranca en false si el caché ya está lleno, para no dibujar un
 * esqueleto sobre datos que ya existen.
 */
export function useLiga(): { d: Datos | null; cargando: boolean; recargar: (forzar?: boolean) => Promise<void> } {
  const [, setTick] = useState(0);
  const [cargando, setCargando] = useState(cache === null);

  useEffect(() => {
    const oir = () => setTick((n) => n + 1);
    oyentes.add(oir);
    return () => {
      oyentes.delete(oir);
    };
  }, []);

  const recargar = useCallback(async (forzar = false) => {
    setCargando(cache === null);
    await traer(forzar);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recargar cambia el estado cuando el fetch resuelve, no durante este render
    recargar();
  }, [recargar]);

  return { d: cache, cargando: cargando && cache === null, recargar };
}

export interface Fila {
  puuid: string;
  name: string;
  tag: string;
  profileIconUrl: string | null;
  /** El puntaje de la semana: lo que decide. Opcional por la ventana de caché del CDN. */
  puntos?: number;
  /** Victorias menos derrotas. Ya no puntúa; queda como cuenta rápida. */
  netas?: number;
  lpNeto: number;
  /** Cuánto le recortó el tope por victoria. Opcional: una respuesta anterior al deploy no lo trae. */
  lpRecortado?: number;
  victorias: number;
  derrotas: number;
  sinJugar: boolean;
  /** Partidas del último día y si cumple los dos mínimos. Opcionales por la ventana de caché del CDN. */
  ultimoDia?: number;
  habilitado?: boolean;
  rango: { tier: TierKey; division: number; lp: number } | null;
  /** El acumulado al cierre de cada día, para la carrera. Opcional por la ventana de caché del CDN. */
  porDia?: number[];
  entroTarde: string | null;
  /** Ajuste a mano del puntaje de la semana. Ya viene sumado en `puntos`; está acá para poder decir por qué. Opcional por la ventana de caché del CDN. */
  ajuste?: { puntos: number; motivo: string } | null;
  /** Con qué racha viene DENTRO de la semana. Opcional: una respuesta anterior al deploy no lo trae. */
  racha?: { resultado: "W" | "L"; cantidad: number } | null;
  /** Con qué campeón y en qué línea jugó la semana. Opcionales: una respuesta anterior al deploy no los trae. */
  champion?: string | null;
  linea?: RoleKey | null;
  /** Las últimas partidas con el LP de cada una. Opcional por la ventana de caché del CDN. */
  ultimas?: PartidaLiga[];
}
export interface PartidaLiga {
  matchId: string;
  champion: string | null;
  win: boolean;
  playedAt: string;
  lp: number | null;
  sinLp: "varias" | "sin-foto" | null;
  /** Opcionales por la ventana de caché del CDN: una pestaña vieja no los trae. */
  lpTramo?: number | null;
  juntas?: number;
  /** Cuánto sumó o restó esta partida: 1, 1,25 o −0,75. */
  puntos?: number;
  /**
   * Cómo jugó esa partida. Opcionales por la misma ventana de caché: si la
   * respuesta es anterior al deploy que los agregó, la línea sale sin el KDA
   * en vez de con ceros inventados.
   */
  kills?: number;
  deaths?: number;
  assists?: number;
  /** Cuánto duró, en segundos. Ver PartidaLiga en lib/liga.ts: está para auditar el filtro de remakes. */
  duracionS?: number;
  /** Se jugó pero no puntúa, y por qué: "afk" (se le fue un compañero) o "duo" (jugó con una cuenta vetada, ver lib/vetados.ts). Lleva el motivo y no un booleano porque el cartel explica cosas distintas. */
  anulada?: "afk" | "duo" | "mitigada";
}
export interface DelPlantel {
  puuid: string;
  name: string;
  tag: string;
  participa: boolean;
}
export interface Datos {
  /** Si la semana en curso ya es de la liga. Antes del arranque no hay tabla, no marcadores viejos. */
  arrancada: boolean;
  /**
   * Si el pistoletazo ya sonó. No es lo mismo que `arrancada`: a esa le
   * alcanza con que la semana TERMINE después del arranque, así que el lunes
   * antes de las 23:30 daba true y la tabla se dibujaba como una liga en curso
   * llena de ceros. Opcional por si llega una respuesta anterior al deploy.
   */
  arrancoYa?: boolean;
  arrancaEl: string;
  semana: string;
  desde: string;
  hasta: string;
  tabla: Fila[];
  plantel: DelPlantel[];
  /**
   * El historial de la liga, de la edición más nueva a la más vieja.
   *
   * Es el mismo tipo que usa `lib/palmares.ts` y no una copia estructural:
   * estuvo copiado acá con sus campos declarados a mano, y cuando la ruta
   * empezó a mandar el podio y el relato de cada edición el tipo de este lado
   * no los tenía. La pantalla los recibía igual —el JSON no sabe de tipos— y
   * TypeScript no podía avisar de nada.
   */
  historial: Edicion[];
  /**
   * El palmarés contado sobre TODAS las semanas cerradas, no sobre las ocho
   * de `historial`. Opcional por la ventana de caché del CDN: el JSON viejo
   * no trae el campo y el componente vuelve a contarlo con lo que tiene.
   */
  palmares?: EnPalmares[];
  /** La mejor semana de la historia de la liga. Null si ninguna tiene puntaje. Opcional por la caché del CDN. */
  record?: RecordLiga | null;
  /** Para el arte de campeón. Opcional por la misma razón. */
  ddragonVersion?: string | null;
  /**
   * Cuándo se escribieron por última vez estos números. Opcional por la
   * ventana de caché del CDN: una pestaña vieja contra la API nueva no lo
   * trae, y ahí lo correcto es no mostrar nada — no inventar una hora.
   */
  actualizado?: string | null;
  /** Los dos mínimos para cobrar y si el último día ya arrancó. Opcionales por la caché del CDN. */
  minimoSemanal?: number;
  minimoUltimoDia?: number;
  ultimoDia?: boolean;
  /** Los siete días de la semana ("lun", "mar"…) y cuántos van corridos. Opcionales por la misma razón. */
  dias?: string[];
  diasCorridos?: number;
  /** Cuántos días dura el torneo. Ya no es siempre 7. */
  duracion?: number;
  /** El día de la última partida, y los días que cubre el mínimo del final. */
  cierraDia?: string;
  diasDelCierre?: string[];
  /** Qué torneo está corriendo, y si sale de una fila editable o del lunes a domingo deducido. */
  torneo?: { id: string | null; nombre: string | null; guardado: boolean };
  /** La tabla de puntos, para escribir la regla con los mismos números que la calculan. */
  puntaje?: { victoria: number; derrota: number; rachaDesde: number; enRacha: number };
}
