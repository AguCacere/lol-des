"use client";

/**
 * El marco de la competencia: cuánto falta y quién se lleva el premio.
 *
 * Existe porque la liga tenía la regla más importante escondida. Se juega por
 * plata y para cobrarla hay que cumplir dos mínimos —diez partidas en la semana
 * y tres el último día— y en ningún lado decía **quién los cumple hoy**. El que
 * abría la pantalla veía un primer puesto y daba por hecho que ese cobra, y
 * puede no ser así: el premio se lo lleva el primero que además cumple, y puede
 * no haber ninguno y la semana cerrar sin premio. Eso es el drama de toda la
 * cosa y era invisible.
 *
 * Lo otro que faltaba era el tiempo. "7 sept – 13 sept" es un rótulo de
 * archivo, no una cuenta regresiva. Una competencia con fecha de cierre tiene
 * que decir en qué punto de la semana está, y la barra de siete días lo dice de
 * un vistazo: cuántos pasaron, cuál es hoy, y que el último es el que decide.
 *
 * Lo que este panel NO hace: coronar a nadie con la semana a medio jugar. Si el
 * que va primero todavía no cumple los mínimos, dice eso —que el primero no
 * cobra y qué le falta— y se calla el resto. Antes anunciaba al segundo que sí
 * cumplía ("Hoy lo cobra Fulano") y eso es un ganador que en dos horas puede no
 * serlo: la tabla está abajo y el que quiera sacar la cuenta la saca.
 */

import { formatRelativeTime } from "@/lib/ladder";

export interface CorredorEstado {
  name: string;
  victorias: number;
  derrotas: number;
  sinJugar: boolean;
  /** Si cumple los DOS mínimos. Opcional por la ventana de caché del CDN. */
  habilitado?: boolean;
  ultimoDia?: number;
}

interface Props {
  /** El rango de la semana, ya escrito ("14 sept – 20 sept"). */
  rango: string;
  /**
   * Cuándo se escribieron estos números, en ISO. Null si no se sabe.
   *
   * Llega como marca y no como texto ya armado a propósito: el que lo escribe
   * es el cliente, con SU reloj, y así el cartel envejece solo mientras la
   * pestaña queda abierta. Ver el tick de LigaSemanal.
   */
  actualizado: string | null;
  /** Los nombres de día del torneo. Ya no son siempre siete: puede durar ocho. */
  dias: string[];
  /** Cuántos ya arrancaron, contando el de hoy. Entre 1 y la duración. */
  corridos: number;
  /**
   * El día en que se juega la última partida, y los días que cubre el mínimo
   * del final. Vienen del server porque el huso es argentino.
   *
   * Opcionales por la ventana de caché del CDN: una respuesta anterior al
   * deploy no los trae, y hasta que expire la pantalla cae al texto de antes.
   */
  cierraDia?: string;
  diasDelCierre?: string[];
  /** Si el último día ya está corriendo. */
  esUltimoDia: boolean;
  /** Cuánto falta para que cierre, ya escrito ("faltan 28 horas"). */
  falta: string;
  /** Si la semana todavía no arrancó, a qué hora lo hace. */
  arrancaA: string | null;
  minimoSemanal: number | null;
  minimoUltimoDia: number | null;
  /** La tabla ya ordenada: el primero de acá es el primero de la liga. */
  tabla: CorredorEstado[];
}

/** "Fulano, Mengano y 2 más" — la lista corta que se lee de un saque. */
/**
 * "el domingo", "el domingo o el lunes", "el sábado, el domingo o el lunes".
 *
 * Con "o" y no con "y": son días ALTERNATIVOS para cumplir el mínimo, no una
 * lista de días en los que hay que aparecer en todos. La diferencia importa —
 * "el domingo y el lunes" se lee como que hay que jugar los dos.
 */
function listaO(dias: string[]): string {
  if (dias.length === 0) return "";
  if (dias.length === 1) return `el ${dias[0]}`;
  return `el ${dias.slice(0, -1).join(", el ")} o el ${dias[dias.length - 1]}`;
}

function listaCorta(nombres: string[], tope = 2): string {
  if (nombres.length === 0) return "";
  if (nombres.length <= tope + 1) {
    if (nombres.length === 1) return nombres[0];
    return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  }
  return `${nombres.slice(0, tope).join(", ")} y ${nombres.length - tope} más`;
}

export function LigaEstado({
  rango,
  actualizado,
  dias,
  corridos,
  cierraDia,
  diasDelCierre,
  esUltimoDia,
  falta,
  arrancaA,
  minimoSemanal,
  minimoUltimoDia,
  tabla,
}: Props) {
  const jugaron = tabla.filter((f) => !f.sinJugar);
  // El mismo criterio que ganadorDe en lib/liga.ts: el PRIMERO de la tabla que
  // además cumple. No tabla[0] — esa es justamente la confusión que este panel
  // viene a deshacer.
  const cobra = jugaron.find((f) => f.habilitado) ?? null;
  const lider = jugaron[0] ?? null;
  const conSemana =
    minimoSemanal != null ? jugaron.filter((f) => f.victorias + f.derrotas >= minimoSemanal) : [];
  const sinSemana = minimoSemanal != null ? jugaron.filter((f) => f.victorias + f.derrotas < minimoSemanal) : [];

  /** El titular del premio y su explicación. Tres estados bien distintos. */
  const premio = (() => {
    if (minimoSemanal == null || minimoUltimoDia == null) {
      return { tono: "neutro", titulo: "Gana el que más puntos hace", detalle: null as string | null };
    }
    if (cobra && lider && cobra.name === lider.name) {
      return {
        tono: "ok",
        titulo: `Lo cobra ${cobra.name}`,
        detalle: "Va primero y ya cumple los dos mínimos.",
      };
    }
    if (cobra && lider) {
      // El que va primero no cumple y otro sí. Se dice ESO —que el primero
      // todavía no cobra y qué le falta— y NADA MÁS: coronar al que sí cumple
      // con la semana a medio jugar es anunciar un ganador que puede no serlo
      // en dos horas. La tabla está abajo y el que quiera sacar la cuenta la
      // saca; la pantalla no la saca por él.
      const jugadas = lider.victorias + lider.derrotas;
      const faltanSemana = Math.max(0, minimoSemanal - jugadas);
      const faltanHoy = Math.max(0, minimoUltimoDia - (lider.ultimoDia ?? 0));
      const loQueFalta = faltanSemana > 0
        ? `Le ${faltanSemana === 1 ? "falta" : "faltan"} ${faltanSemana} de la semana`
        : `Le ${faltanHoy === 1 ? "falta" : "faltan"} ${faltanHoy} de hoy`;
      return {
        tono: "alerta",
        titulo: `${lider.name} todavía no cobra`,
        detalle: `Va primero, pero si la semana cerrara ahora el premio no es suyo. ${loQueFalta}.`,
      };
    }
    if (esUltimoDia) {
      const faltanPocas = jugaron
        .filter((f) => f.victorias + f.derrotas >= minimoSemanal && (f.ultimoDia ?? 0) < minimoUltimoDia)
        .map((f) => f.name);
      return {
        tono: "alerta",
        titulo: "Todavía no lo tiene nadie",
        detalle: faltanPocas.length
          ? `${listaCorta(faltanPocas)} ya tienen la semana: les faltan las ${minimoUltimoDia} de hoy.`
          : `Hay que jugar ${minimoUltimoDia} partidas hoy, y ${minimoSemanal} en la semana.`,
      };
    }
    // "el domingo", "el domingo o el lunes" — sale del torneo y no escrito a
    // mano. Al extender el torneo al lunes dejando el mínimo abierto desde el
    // domingo, la ventana cubre DOS días y decir uno solo sería mentira.
    const cuando = listaO(diasDelCierre ?? ["domingo"]);
    return {
      tono: "espera",
      titulo: `Se define ${cuando}`,
      detalle: conSemana.length
        ? `${listaCorta(conSemana.map((f) => f.name))} ya tienen las ${minimoSemanal} de la semana. Después hay que aparecer ${cuando} y jugar ${minimoUltimoDia}.`
        : `Nadie llegó todavía a las ${minimoSemanal} de la semana.`,
    };
  })();

  return (
    <div className="estado">
      {/* El rango de fechas, como rótulo del panel entero.

          Estaba suelto arriba, en gris, con su propio "faltan 6 días" al lado
          — el mismo dato que este panel ya pone en grande cuarenta píxeles más
          abajo. Dos veces lo mismo, y encima una línea que no pertenecía a
          nada: el único elemento de la sección que no era ni la regla, ni el
          panel, ni el gráfico, ni la lista. Acá adentro es lo que siempre fue,
          el título de esta semana. */}
      <span className="estado-semana-rotulo">
        {rango}
        {/* La edad de los números, al lado del período que cubren. Las dos
            cosas enmarcan lo mismo —una dice QUÉ se está mirando, la otra
            CUÁN vieja está— así que van en el mismo renglón y no en una caja
            nueva.

            Existe porque sin esto no había forma de distinguir "el cron viene
            atrasado" de "esto se rompió": pasó de verdad, se miró el gráfico,
            los números no se habían movido, y no había nada en pantalla que
            dijera de cuándo eran. El "actualizado" del TopBar no sirve acá —
            sale de /api/ladder, que es otra respuesta con otra caché, y puede
            decir "recién" con esta tabla cuatro minutos atrás. */}
        {actualizado && (
          <span
            className="estado-frescura"
            title="Los datos se refrescan cada 15 minutos. Esta pantalla puede estar hasta 4 minutos atrás de ese refresco, por la caché."
          >
            actualizado {formatRelativeTime(actualizado)}
          </span>
        )}
      </span>
      <div className="estado-tiempo">
        <span className="estado-rotulo">
          {arrancaA ? "Arranca" : esUltimoDia ? "Último día" : `Cierra el ${cierraDia ?? "domingo"}`}
        </span>
        <strong className={`estado-reloj${esUltimoDia ? " urge" : ""}`}>{arrancaA ? arrancaA : falta}</strong>
        {/* La semana entera, no solo lo corrido: ver los días que faltan es la
            mitad del dato. El último va marcado siempre — es el que decide el
            premio, y que se vea desde el lunes es justamente el punto. */}
        <div className="estado-semana" aria-hidden>
          {dias.map((d, i) => (
            <span
              key={`${d}-${i}`}
              className={
                "estado-dia" +
                (i < corridos - 1 ? " pasado" : "") +
                (i === corridos - 1 ? " hoy" : "") +
                (i === dias.length - 1 ? " decide" : "")
              }
            >
              {d.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className={`estado-premio t-${premio.tono}`}>
        <span className="estado-rotulo">El premio</span>
        <strong className="estado-premio-titulo">{premio.titulo}</strong>
        {premio.detalle && <span className="estado-premio-detalle">{premio.detalle}</span>}
        {/* Quién está afuera por la semana, contado y no listado: si son cuatro
            de seis, el detalle de arriba se vuelve un párrafo. */}
        {sinSemana.length > 0 && minimoSemanal != null && (
          <span className="estado-premio-afuera">
            {sinSemana.length === 1
              ? `1 de ${jugaron.length} no llega a las ${minimoSemanal} todavía.`
              : `${sinSemana.length} de ${jugaron.length} no llegan a las ${minimoSemanal} todavía.`}
          </span>
        )}
      </div>
    </div>
  );
}
