/**
 * **"Alguien te pasó"**: cuando cambia el orden de arriba del ladder.
 *
 * El ciclo de refresco corre cada quince minutos y sabe el ladder de antes y
 * el de después, así que no hace falta guardar nada: alcanza con comparar las
 * dos listas. Lo que sale es, como mucho, UN mensaje por ciclo.
 *
 * Tres reglas, y las tres existen para que esto no se vuelva ruido:
 *
 * 1. **Solo los primeros puestos.** Que el noveno pase al décimo no es
 *    noticia; que alguien entre al podio sí.
 * 2. **El que pasa tiene que haber JUGADO.** Si su puntaje no se movió en
 *    este ciclo, el cambio de orden lo produjo el otro al perder, y ese caso
 *    ya lo cuenta el bot por otro lado (la racha, el descenso). Sin esta
 *    regla, además, dos empatados se pasarían de ida y de vuelta cada vez que
 *    el cron redondea distinto.
 * 3. **Uno solo por ciclo**, el del puesto más alto. Si en quince minutos se
 *    movieron tres puestos, lo que importa es el de arriba.
 *
 * Se compara con `rankScore` y no con el LP crudo, igual que todo lo demás:
 * el LP se resetea al ascender.
 */

/** Una posición del ladder, ya resuelta a puntaje comparable. */
export interface PuestoLadder {
  puuid: string;
  /** Cómo se lo nombra en el mensaje. */
  label: string;
  score: number;
  /** Para escribir "ahora está en Esmeralda 2 · 45 LP". */
  rango: string;
  lp: number;
}

export interface Sorpasso {
  quien: string;
  aQuien: string;
  /** 1 = primero. Es el puesto que ocupa el que pasó, DESPUÉS de pasar. */
  puesto: number;
  /** Por cuánto quedó arriba, en la escala de rankScore. */
  porLp: number;
  rango: string;
  lp: number;
}

/** Hasta qué puesto vale la pena contarlo. */
export const PUESTOS_VIGILADOS = 3;

const ordinal = (n: number) => `${n}º`;

export function detectarSorpaso(
  antes: PuestoLadder[],
  despues: PuestoLadder[],
  puestos = PUESTOS_VIGILADOS,
): Sorpasso | null {
  if (antes.length < 2 || despues.length < 2) return null;
  const posAntes = new Map(antes.map((p, i) => [p.puuid, i]));
  const scoreAntes = new Map(antes.map((p) => [p.puuid, p.score]));

  for (let i = 0; i < Math.min(puestos, despues.length, antes.length); i++) {
    const nuevo = despues[i];
    const viejo = antes[i];
    if (nuevo.puuid === viejo.puuid) continue;

    // Los dos tienen que estar en las dos listas: alguien que recién aparece
    // (o que desapareció) no "pasó" a nadie, apareció.
    const dondeEstaba = posAntes.get(nuevo.puuid);
    const scorePrevio = scoreAntes.get(nuevo.puuid);
    if (dondeEstaba === undefined || scorePrevio === undefined) continue;
    if (!posAntes.has(viejo.puuid)) continue;

    // Tiene que haber subido, no haber quedado arriba porque el otro bajó de
    // la lista; y tiene que haber jugado.
    if (dondeEstaba <= i) continue;
    if (scorePrevio === nuevo.score) continue;

    // Contra quién: el que ocupaba ESE puesto, que ahora está abajo.
    const pasado = despues.find((p) => p.puuid === viejo.puuid);
    if (!pasado) continue;

    return {
      quien: nuevo.label,
      aQuien: pasado.label,
      puesto: i + 1,
      porLp: nuevo.score - pasado.score,
      rango: nuevo.rango,
      lp: nuevo.lp,
    };
  }
  return null;
}

/** El texto que sale en el canal. Pura presentación: ningún cálculo acá. */
export function mensajeDeSorpaso(s: Sorpasso): string {
  const corona = s.puesto === 1 ? "👑 " : "⚡ ";
  const porCuanto = s.porLp === 1 ? "por 1 LP" : `por ${s.porLp} LP`;
  const cierre =
    s.puesto === 1
      ? `Es el **nuevo número 1** del ladder — ${s.rango} · ${s.lp} LP.`
      : `Queda **${ordinal(s.puesto)}** — ${s.rango} · ${s.lp} LP.`;
  return `${corona}**${s.quien}** le pasó a **${s.aQuien}** ${porCuanto}. ${cierre}`;
}
