"use client";

import type { Juntos } from "@/lib/juntos";
import { MINIMO_JUNTAS } from "@/lib/juntos";
import { tonoDeWinrate, winrateExacto, winrateTexto } from "@/lib/winrate";
import { PlayerAvatar } from "./PlayerAvatar";
import { InfoTip } from "./InfoTip";

/**
 * "Cómo jugamos juntos" — el bloque que le da a Equipo su pregunta propia.
 *
 * Antes esta pestaña era solo el resumen de la semana: cuatro tarjetas con el
 * que más subió, el mejor KDA, la peor derrota y el campeón más jugado. Todos
 * datos INDIVIDUALES, y los cuatro ya contados en otro lado — el que más subió
 * está en Inicio ("qué se movió"), y los otros tres son la misma materia que
 * los récords y la portada del período en Estadísticas.
 *
 * Esto contesta lo que no contestaba nadie: cuánto de lo que juega este grupo
 * es con el grupo, y si así les va mejor o peor. Ver lib/juntos.ts para el
 * cálculo y por qué la sinergia de dúo de Estadísticas no puede contestarlo.
 *
 * No se dibuja ningún par acá a propósito: el explorador de dúos ya existe y
 * es par por par. Lo único que se toma prestado es UN nombre por fila —con
 * quién juega más—, que es contexto y no una vista.
 */

/** Cuántos puntos porcentuales de brecha hacen falta para teñirla. Debajo de esto es empate. */
const BRECHA_NOTABLE = 3;

function pp(n: number): string {
  // Con coma, como todo número con decimal en la app, y con signo siempre:
  // "3,2" sin el signo no dice para qué lado.
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1).replace(".", ",")}`;
}

export function ComoJugamosJuntos({ juntos }: { juntos: Juntos | null }) {
  if (!juntos || juntos.juntas === 0) {
    return (
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Cómo jugamos juntos</h2>
        </div>
        {/* Corto a propósito: falta un dato, no hay nada que explicar en tres
            renglones (ver las reglas de estados vacíos del plan). */}
        <p className="eq-vacio">Todavía no hay partidas guardadas de dos del grupo en el mismo equipo.</p>
      </section>
    );
  }

  const wrJuntos = winrateExacto(juntos.juntasWins, juntos.juntas);
  const wrSolos = winrateExacto(juntos.solasWins, juntos.solas);
  const brechaGrupo = wrJuntos - wrSolos;
  const pctAcompanadas = Math.round((juntos.juntas / juntos.filas) * 100);
  // El orden ya viene por partidas acompañadas desde el servidor. Acá se parte
  // en dos: los que juegan con el grupo llevan fila, y los que lo hicieron una
  // o dos veces van a un renglón al pie. No es por ahorrar espacio — con dos
  // partidas la fila decía "0.0%" en rojo del mismo tamaño que un 63,5% de 74,
  // que es exactamente lo que el plan prohíbe (no destacar un porcentaje sin
  // su muestra). Los que nunca jugaron con nadie no aparecen.
  const filas = juntos.personas.filter((p) => p.juntas >= MINIMO_JUNTAS);
  const sueltos = juntos.personas.filter((p) => p.juntas > 0 && p.juntas < MINIMO_JUNTAS);

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Cómo jugamos juntos</h2>
        <span className="meta">sobre todas las partidas guardadas</span>
      </div>

      <div className="eq-banda">
        <div className="eq-bloque">
          <span className="eq-et">De lo que juega el grupo</span>
          <span className="eq-cifra">{pctAcompanadas}%</span>
          <span className="eq-dato">
            es con alguien del grupo · {juntos.juntas} de {juntos.filas}
          </span>
        </div>
        <div className="eq-bloque">
          <span className="eq-et">Acompañados</span>
          <span className={`eq-cifra ${tonoDeWinrate(juntos.juntasWins, juntos.juntas)}`}>
            {winrateTexto(juntos.juntasWins, juntos.juntas)}
          </span>
          <span className="eq-dato">
            {juntos.juntasWins}V-{juntos.juntas - juntos.juntasWins}D
          </span>
        </div>
        <div className="eq-bloque">
          <span className="eq-et">Solos</span>
          <span className={`eq-cifra ${tonoDeWinrate(juntos.solasWins, juntos.solas)}`}>
            {winrateTexto(juntos.solasWins, juntos.solas)}
          </span>
          <span className="eq-dato">
            {juntos.solasWins}V-{juntos.solas - juntos.solasWins}D
          </span>
        </div>
      </div>

      {/* La conclusión escrita, que es lo que alguien se lleva de acá. Sale de
          los dos números de arriba, no de un cálculo aparte. */}
      <p className="eq-lectura">
        {Math.abs(brechaGrupo) < BRECHA_NOTABLE ? (
          <>Juntos o solos les va prácticamente igual: {pp(brechaGrupo)} puntos de diferencia.</>
        ) : brechaGrupo > 0 ? (
          <>
            Juntos les va <strong className="good">mejor</strong>: {pp(brechaGrupo)} puntos de winrate contra jugar
            solos.
          </>
        ) : (
          <>
            Juntos les va <strong className="bad">peor</strong>: {pp(brechaGrupo)} puntos de winrate contra jugar
            solos.
          </>
        )}
      </p>

      <div className="eq-tabla">
        <div className="eq-cab">
          <span />
          <span>Con el grupo</span>
          <span className="eq-num">Juntos</span>
          <span className="eq-num">Solos</span>
          <span className="eq-num">
            Dif.
            <InfoTip
              align="end"
              text={`La diferencia entre el winrate acompañado y el de jugar solo, en puntos porcentuales. Se escribe solo cuando hay al menos ${MINIMO_JUNTAS} partidas de cada lado: un 0% en dos partidas al lado de un 54% en cuarenta y ocho no es una brecha, es ruido.`}
            />
          </span>
        </div>
        {filas.map((p) => {
          const total = p.juntas + p.solas;
          const porcentaje = Math.round((p.juntas / total) * 100);
          const tono = p.brecha === null || Math.abs(p.brecha) < BRECHA_NOTABLE ? "" : p.brecha > 0 ? "good" : "bad";
          return (
            <div className="eq-fila" key={p.puuid}>
              <span className="eq-quien">
                <PlayerAvatar name={p.name} iconUrl={p.profileIconUrl} className="eq-avatar" />
                <span className="eq-quien-txt">
                  <span className="eq-nombre">{p.name}</span>
                  {p.masCon && (
                    <span className="eq-con">
                      más con {p.masCon.name} · {p.masCon.games}
                    </span>
                  )}
                </span>
              </span>
              <span className="eq-cuanto">
                {/* La barra es la MISMA escala para todos (0 a 100% de lo que
                    juega cada uno), que es lo que hace comparable un 47% de 62
                    partidas con un 44% de 170. */}
                <span className="eq-barra">
                  <span className="eq-barra-fill" style={{ width: `${porcentaje}%` }} />
                </span>
                <span className="eq-cuanto-txt">
                  {porcentaje}% <span className="eq-mini">· {p.juntas} de {total}</span>
                </span>
              </span>
              {/* Las dos clases de posición existen para el teléfono: ahí la
                  fila se parte en renglones y cada número se pone su propio
                  rótulo con un ::before. Con :nth-of-type no alcanza —todos
                  los hijos son <span>, así que cuenta spans y no clases. */}
              <span className={`eq-wr eq-wr-juntos ${tonoDeWinrate(p.juntasWins, p.juntas)}`}>
                {winrateTexto(p.juntasWins, p.juntas)}
              </span>
              <span className={`eq-wr eq-wr-solos ${tonoDeWinrate(p.solasWins, p.solas)}`}>
                {p.solas > 0 ? winrateTexto(p.solasWins, p.solas) : "—"}
              </span>
              <span className={`eq-brecha ${tono}`}>{p.brecha === null ? "—" : pp(p.brecha)}</span>
            </div>
          );
        })}
      </div>

      {sueltos.length > 0 && (
        <p className="eq-pie">
          Casi nunca juegan con el grupo:{" "}
          {sueltos.map((p, i) => (
            <span key={p.puuid}>
              {i > 0 && (i === sueltos.length - 1 ? " y " : ", ")}
              {p.name} <span className="eq-mini">({p.juntas} de {p.juntas + p.solas})</span>
            </span>
          ))}
          .
        </p>
      )}
    </section>
  );
}
