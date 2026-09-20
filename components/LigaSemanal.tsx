"use client";

import { useEffect, useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { LigaCarrera } from "./LigaCarrera";
import { LigaEstado } from "./LigaEstado";
import { LigaTorneo } from "./LigaTorneo";
import { LigaDiaADia } from "./LigaDiaADia";
import { InfoTip } from "./InfoTip";
import LigaTorneoAdmin from "./LigaTorneoAdmin";
import { fetchConClave } from "./Cerradura";
import { TierEmblem } from "./TierEmblem";
import { StreakIcon } from "./StreakIcon";
import { ChampIcon } from "./ChampIcon";
import { RoleIcon } from "./RoleIcon";
import { championLabel } from "@/lib/champion-names";
import { ROLES, tierFor } from "@/lib/ladder";
import { puntajeTexto, rangoDeSemana } from "@/lib/liga";
import { useLiga, type Datos, type Fila, type PartidaLiga } from "./useLiga";

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

/** La hora de un instante, en argentino: "23:30". */
const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    // hour12 explícito: `es-AR` sin esto devuelve 12 horas con "p. m." —
    // medido en Chrome, "09:14 p. m."— mientras el resto de la app escribe 24
    // ("cierra 23:30"). Dos relojes distintos en la misma pantalla.
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });

/**
 * "+18 LP" / "−24 LP" / "0 LP", con el menos de verdad (−).
 *
 * El guion del toString de un número es más corto que el signo más y en una
 * columna alineada a la derecha se notaba: los negativos quedaban corridos.
 */
function lpTexto(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} LP`;
}

/** "1,25" y no "1.25": la regla se lee en castellano. */
function coma(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/** "cuarta", "quinta"… para escribir la regla de la racha sin un número suelto. */
function ordinal(n: number): string {
  return ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima"][n] ?? `${n}ª`;
}

/**
 * "28m" — los minutos de una partida, redondeados.
 *
 * Solo minutos y no "28:14": el número está para auditar, no para cronometrar.
 * Lo que tiene que saltar a la vista es la diferencia entre 28 y 4, y los
 * segundos en una columna de cuarenta filas son ruido que tapa eso mismo.
 */
function duracionTexto(s: number): string {
  return `${Math.round(s / 60)}m`;
}

/** La clase de color por signo, que es la misma en todos lados. */
function tono(n: number): string {
  return n > 0 ? "gd-pos" : n < 0 ? "gd-neg" : "";
}

/** Un día de la semana con sus partidas, lo que movió y en cuánto quedó. */
interface DiaDeLaSemana {
  dia: number;
  nombre: string;
  partidas: PartidaLiga[];
  delta: number;
  acumulado: number;
  /**
   * El récord del día, contando TODAS las que se jugaron —anuladas incluidas—
   * porque es lo que se ve en la lista de abajo: si el día muestra cuatro ✕ y
   * el encabezado dice "3D", el que abrió el detalle para auditar el puntaje
   * se encuentra con que la app no sabe contar. Lo que las anuladas no mueven
   * es el `delta`, que va al lado y es otro número.
   */
  victorias: number;
  derrotas: number;
}

/**
 * Las partidas de la semana agrupadas por día, del más nuevo al más viejo.
 *
 * Existe porque una lista corrida de cuarenta partidas no es transparencia, es
 * un volcado: el número grande de arriba dice "+7,25" y para llegar a él hay
 * que ir sumando de a 0,75 con el dedo. Con el día como unidad, la cuenta se
 * lee de arriba abajo — "el sábado hizo +2,25 y quedó en +7,25"— y adentro de
 * cada día son tres o cuatro partidas, que sí se suman de cabeza.
 *
 * El acumulado NO se recalcula acá: sale de `porDia`, la misma curva que dibuja
 * la carrera y que llena la grilla del día a día. Sumar las partidas por mi
 * cuenta daría otro número el día que cambie el bonus de racha, y entonces la
 * pantalla se contradiría con su propio gráfico.
 *
 * El índice del día es el mismo de esa curva: días CALENDARIO argentinos
 * contados desde el lunes 00:00, no bloques de 24 horas. Ver diasCorridos en
 * lib/liga.ts para por qué esa distinción ya rompió algo una vez.
 */
function agruparPorDia(f: Fila, semana: string, dias: string[]): DiaDeLaSemana[] {
  const lunes = Date.parse(`${semana}T03:00:00Z`);
  if (Number.isNaN(lunes)) return [];
  const porIndice = new Map<number, PartidaLiga[]>();
  for (const m of f.ultimas ?? []) {
    const i = Math.floor((Date.parse(m.playedAt) - lunes) / 86400000);
    if (i < 0 || i > 6) continue;
    const arr = porIndice.get(i) ?? [];
    arr.push(m);
    porIndice.set(i, arr);
  }
  const serie = f.porDia ?? [];
  return [...porIndice.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dia, partidas]) => ({
      dia,
      nombre: dias[dia] ?? `día ${dia + 1}`,
      // Dentro del día, de la más nueva a la más vieja, igual que la lista
      // entera: se lee hacia atrás en el tiempo en los dos niveles.
      partidas: [...partidas].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt)),
      acumulado: serie[dia + 1] ?? 0,
      delta: (serie[dia + 1] ?? 0) - (serie[dia] ?? 0),
      victorias: partidas.filter((m) => m.win).length,
      derrotas: partidas.filter((m) => !m.win).length,
    }));
}

/** Cuánto falta para que cierre, en criollo. */
function loQueFalta(hasta: string): string {
  const ms = Date.parse(hasta) - Date.now();
  if (ms <= 0) return "cerrada";
  const horas = Math.floor(ms / 3600000);
  if (horas >= 48) return `faltan ${Math.floor(horas / 24)} días`;
  if (horas >= 2) return `faltan ${horas} horas`;
  return "cierra en menos de dos horas";
}

/**
 * "Liga de la semana" — la competencia interna por LP neto, de lunes 00:00 a
 * domingo 23:59 hora argentina.
 *
 * Es lo que el ladder no puede medir: el ladder dice dónde llegaste, y cuando
 * el elo de cada uno ya está más o menos definido deja de haber pelea. Esto
 * mide cuánto te MOVISTE en la semana, así que el que sube 200 desde Plata le
 * gana al que sube 50 desde Diamante.
 *
 * Compite solo el que se anota. Anotarlos pide la contraseña del grupo.
 */
export function LigaSemanal({ conEncabezado = true }: { conEncabezado?: boolean } = {}) {
  /**
   * Los datos salen de useLiga y no de un fetch propio: Inicio muestra el
   * adelanto de la competencia y pedía la MISMA respuesta por su cuenta. Ver
   * el header de components/useLiga.ts.
   */
  const { d, cargando, recargar: cargar } = useLiga();
  const [admin, setAdmin] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  /** Qué fila está abierta mostrando sus últimas partidas. */
  const [abierta, setAbierta] = useState<string | null>(null);
  /**
   * Qué días del detalle están desplegados. `null` significa "nadie tocó
   * nada todavía", y ahí vale la regla por defecto: el día más nuevo abierto
   * y los anteriores cerrados.
   *
   * Existe porque el detalle de alguien que jugó toda la semana son cuarenta
   * partidas, y cuarenta renglones abiertos de una en un celular no son
   * transparencia: son media hora de scroll para encontrar la de anoche. El
   * día de hoy es el que se viene a mirar; los de atrás están a un toque.
   */
  const [diasAbiertos, setDiasAbiertos] = useState<Set<number> | null>(null);
  /** Qué semana vieja está abierta en el cartel de "cómo terminó". Null = ninguna. */
  const [torneo, setTorneo] = useState<string | null>(null);
  /** Si está abierta la grilla del día a día. */
  const [diaADia, setDiaADia] = useState(false);

  /**
   * Un tick cada 30 segundos, SOLO para que el "actualizado hace X" envejezca
   * en pantalla. No vuelve a pedir nada: es una resta contra el reloj del que
   * mira.
   *
   * Sin esto el cartel se congela en el minuto en que cargó la pestaña y dice
   * "hace 1 min" durante media hora — un reloj parado marcando una hora
   * plausible, que es peor que no tener reloj. Y ese es justo el caso que este
   * cartel viene a resolver: la pestaña que quedó abierta.
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  async function anotar(puuid: string, participa: boolean) {
    setGuardando(puuid);
    try {
      const res = await fetchConClave("/api/liga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puuid, participa }),
      });
      if (res.ok) await cargar(true);
    } finally {
      setGuardando(null);
    }
  }

  /**
   * Abre (o cierra) el detalle de una fila. Resetea los días desplegados: el
   * estado de "qué días miré" es de ESE jugador, y arrastrarlo al siguiente
   * abriría el martes de alguien que nunca se tocó.
   */
  function abrirFila(puuid: string) {
    setAbierta(abierta === puuid ? null : puuid);
    setDiasAbiertos(null);
  }

  if (cargando) {
    return (
      <div className="empty-state">
        <strong>Cargando la liga…</strong>
      </div>
    );
  }
  if (!d) return null;

  // Con guarda: una pestaña vieja contra la API nueva (o al revés) no tiene el
  // campo, y ahí lo correcto es asumir que arrancó — que es como se comportaba
  // antes de existir el aviso.
  const yaArranco = d.arrancoYa ?? true;
  const anotados = d.plantel.filter((p) => p.participa).length;
  const sinJugar = d.tabla.filter((f) => f.sinJugar).length;
  // Los mínimos vienen de la API para que cambiarlos en lib/liga.ts alcance.
  // Con guarda: una pestaña vieja contra la API nueva no los trae, y ahí lo
  // correcto es no mostrar la regla en vez de inventar un número que no es el
  // que aplica el cierre.
  const minSemana = d.minimoSemanal ?? null;
  const minDia = d.minimoUltimoDia ?? null;
  const esUltimoDia = d.ultimoDia ?? false;
  const tp = d.puntaje ?? null;
  // Para escalar las barras de partidas: el que más jugó ocupa todo el ancho.
  const maxPartidas = Math.max(1, ...d.tabla.map((f) => f.victorias + f.derrotas));

  /**
   * Cuánto sumó o restó HOY, sacado de la curva por día: el último cierre
   * menos el anterior.
   *
   * Es el dato vivo que a la tabla le faltaba. Todo lo demás —el puntaje, el
   * récord, el rango— es el acumulado de la semana y no se mueve de un rato
   * para otro; en una competencia que cierra el domingo, "hoy va +2,25" es lo
   * que hace que valga la pena volver a mirar.
   */
  function loDeHoy(f: Fila): number {
    const p = f.porDia;
    if (!p || p.length < 2) return 0;
    return Math.round((p[p.length - 1] - p[p.length - 2]) * 100) / 100;
  }

  /**
   * "se anotó el martes" existe para explicar por qué alguien tiene menos
   * partidas que el resto. Si lo dice TODA la tabla no explica nada: son seis
   * renglones grises idénticos que le agregan una línea a cada fila y hacen la
   * tabla más alta sin decir nada. Pasa en la primera semana de la liga, que
   * es cuando se anotaron todos juntos.
   */
  const entraronTodosTarde = d.tabla.length > 0 && d.tabla.every((f) => f.entroTarde);

  /**
   * El estado de cobro de una fila: "cobra" si cumple los dos mínimos, o lo que
   * le falta. Devuelve null cuando la API todavía no manda los mínimos, así una
   * pestaña vieja no muestra un requisito inventado.
   */
  function cupo(f: Fila) {
    if (minSemana == null || minDia == null) return null;
    const total = f.victorias + f.derrotas;
    if (f.habilitado) {
      return (
        <span className="liga-cupo ok" title={`Jugó ${total} en la semana y ${f.ultimoDia ?? 0} el último día: cobra.`}>
          cobra
        </span>
      );
    }
    if (total < minSemana) {
      return (
        <span className="liga-cupo" title={`Le faltan ${minSemana - total} partidas en la semana para poder cobrar.`}>
          <b>
            {total} / {minSemana}
          </b>{" "}
          partidas
        </span>
      );
    }
    // Ya cumplió la semana: lo que falta es el último día. Pero antes de que el
    // último día ARRANQUE, esta condición dice lo mismo en todas las filas
    // —"0 / 3 último día"— porque nadie pudo jugarla todavía: seis chips
    // idénticos que no distinguen a nadie y no se pueden accionar. La regla ya
    // está escrita arriba, en la tira de reglas. Desde que el último día
    // empieza sí importa, y ahí es lo único que le falta.
    if (!esUltimoDia) return null;
    return (
      <span className="liga-cupo chico urge" title={`Le faltan ${minDia - (f.ultimoDia ?? 0)} partidas de hoy para poder cobrar.`}>
        <b>
          {f.ultimoDia ?? 0} / {minDia}
        </b>{" "}
        hoy
      </span>
    );
  }

  /**
   * "14 sept – 20 sept". Sin el "faltan N días" al lado, que es lo que estaba
   * duplicado: el panel de estado lo pone en grande treinta píxeles más abajo.
   */
  const rangoTexto = `${dia(d.desde)} – ${dia(new Date(Date.parse(d.hasta) - 1).toISOString())}`;

  return (
    <section className="liga">
      {/* Cuando la liga vive adentro del ladder, el título ya lo puso el
          interruptor de arriba: acá solo queda el rango de fechas. */}
      {/* El encabezado se queda solo con el título. La fecha y el "faltan N
          días" que iban acá al lado pasaron al panel de estado, que es donde
          pertenecen: los tres son el marco de la semana y estaban repartidos en
          dos lugares diciendo lo mismo. */}
      {conEncabezado && (
        <div className="section-head">
          <h2>Liga de la semana</h2>
        </div>
      )}

      {/* Un solo bloque de contexto arriba de la tabla: a la izquierda cómo se
          puntúa, a la derecha de qué semana estamos hablando. Antes las fechas
          tenían una banda propia pegadas a la derecha, con la regla en otra
          abajo: dos renglones sueltos y un hueco en el medio entre el título y
          la tabla. Son dos datos del mismo tipo —el marco de la competencia— y
          van juntos. */}
      <div className="liga-contexto">
        {/* Las reglas ahora viven ADENTRO de la tarjeta de estado (ver
            LigaEstado). Acá quedan solo para el caso en que esa tarjeta no se
            dibuje —la ventana de caché del CDN puede traer una respuesta sin
            `dias`—, porque el puntaje es la regla más importante de la liga y
            no puede desaparecer de la pantalla por un dato que falta. */}
        {d.arrancada !== false && !(d.dias && d.dias.length > 0) && (
          <div className="liga-reglas">
            {/* De párrafo a tablero. El mismo contenido en prosa eran cuatro
                renglones que había que LEER; acá cada regla es una ficha y se
                escanea en un vistazo. El bonus de racha va aparte y en dorado
                porque no es una regla más: es la mecánica que hace que
                convenga seguir jugando cuando venís ganando. */}
            {tp ? (
              <>
                <span className="liga-reglas-label">Cómo se puntúa</span>
                <span className="liga-ficha v">
                  Victoria <b>+{coma(tp.victoria)}</b>
                </span>
                <span className="liga-ficha d">
                  Derrota <b>−{coma(Math.abs(tp.derrota))}</b>
                </span>
                <span className="liga-ficha bonus" title={`Desde la ${ordinal(tp.rachaDesde)} victoria al hilo, cada una vale ${coma(tp.enRacha)} en vez de ${coma(tp.victoria)}.`}>
                  <StreakIcon result="W" />
                  {tp.rachaDesde}.ª al hilo <b>+{coma(tp.enRacha)}</b>
                </span>
              </>
            ) : (
              <span className="liga-reglas-label">Gana el que más puntos hace</span>
            )}
            <span className="liga-reglas-nota">
              El LP no puntúa: va solo de referencia.
              {minSemana != null && minDia != null && (
                <>
                  {" "}Para cobrar hay que jugar <b>{minSemana}</b> partidas en la semana y <b>{minDia}</b> el último
                  día{esUltimoDia ? ", que es hoy" : ""}.
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* En qué punto de la semana estamos y quién se lleva el premio. Va
          ARRIBA de la carrera y de la tabla porque es el marco: primero cuánto
          falta y qué está en juego, después cómo se dio y por último el
          marcador. Con guarda por la ventana de caché del CDN: una respuesta
          anterior al deploy no trae los días.

          La guarda pregunta si HAY días, no si son siete. Era `=== 7`, y con un
          torneo de ocho días —que es para lo que existe lib/torneo.ts— este
          bloque entero desaparecía de la pantalla sin que nada avisara. */}
      {d.arrancada !== false && d.dias && d.dias.length > 0 && (
        <LigaEstado
          reglas={
            <>
              {tp ? (
                <>
                  <span className="liga-reglas-label">Cómo se puntúa</span>
                  <span className="liga-ficha v">
                    Victoria <b>+{coma(tp.victoria)}</b>
                  </span>
                  <span className="liga-ficha d">
                    Derrota <b>−{coma(Math.abs(tp.derrota))}</b>
                  </span>
                  <span className="liga-ficha bonus" title={`Desde la ${ordinal(tp.rachaDesde)} victoria al hilo, cada una vale ${coma(tp.enRacha)} en vez de ${coma(tp.victoria)}.`}>
                    <StreakIcon result="W" />
                    {tp.rachaDesde}.ª al hilo <b>+{coma(tp.enRacha)}</b>
                  </span>
                </>
              ) : (
                <span className="liga-reglas-label">Gana el que más puntos hace</span>
              )}
              {/* Los mínimos, comprimidos a dato. Eran una frase con dos
                  cláusulas —"El LP no puntúa: va solo de referencia. Para
                  cobrar hay que jugar 10 partidas en la semana y 3 el último
                  día"— que ocupaba un renglón entero para decir dos números.
                  El "el LP no puntúa" pasa al título del grupo, que es donde
                  se pregunta. */}
              {minSemana != null && minDia != null && (
                <span className="liga-reglas-nota" title="El LP no puntúa: va solo de referencia. Para cobrar el premio hay que cumplir los dos mínimos.">
                  Para cobrar: <b>{minSemana}</b> en la semana · <b>{minDia}</b> el último día
                  {esUltimoDia ? ", que es hoy" : ""}
                </span>
              )}
            </>
          }
          rango={rangoTexto}
          actualizado={d.actualizado ?? null}
          dias={d.dias}
          corridos={d.diasCorridos ?? 1}
          cierraDia={d.cierraDia}
          diasDelCierre={d.diasDelCierre}
          esUltimoDia={esUltimoDia}
          falta={loQueFalta(d.hasta)}
          arrancaA={yaArranco ? null : horaDe(d.desde)}
          minimoSemanal={minSemana}
          minimoUltimoDia={minDia}
          tabla={d.tabla}
        />
      )}

      {d.arrancada === false ? (
        <div className="empty-state">
          <strong>La liga arranca el lunes</strong>
          Todos empiezan en 0. El LP que ya está guardado es de antes y no cuenta — sería empezar el campeonato con
          marcadores puestos.
        </div>
      ) : d.tabla.length === 0 ? (
        <div className="empty-state">
          <strong>Todavía no hay nadie anotado</strong>
          La liga la corren los que se anotan, no todos los trackeados. Con la contraseña del grupo se anota desde acá
          abajo.
        </div>
      ) : (
        <div className="liga-tabla">
          {/* La carrera, arriba de todo. Va antes de la tabla porque cuenta la
              semana y la tabla cuenta el marcador de hoy: primero cómo se dio,
              después quién va ganando.

              Reemplaza a la columna de curvitas que estaba acá abajo, una por
              fila. Siete miniaturas separadas dicen la forma de cada semana
              por su cuenta pero nunca la carrera, y encima se comían 190px de
              una tabla que ya venía apretada. */}
          {d.dias && d.dias.length >= 2 && (
            <LigaCarrera
              dias={d.dias}
              onVerDiaADia={() => setDiaADia(true)}
              corredores={d.tabla
                .filter((f) => !f.sinJugar && f.porDia && f.porDia.length >= 2)
                .map((f) => ({
                  puuid: f.puuid,
                  name: f.name,
                  porDia: f.porDia ?? [0],
                  puntos: f.puntos ?? f.netas ?? f.victorias - f.derrotas,
                }))}
            />
          )}
          {/* NO hay encabezado de columnas, y es la decisión que más cambia
              esta sección. Una fila de rótulos arriba —INVOCADOR · RANGO ·
              RÉCORD · PUNTOS— es LA señal de "esto es una planilla": promete
              columnas para comparar de arriba abajo, cuando lo que se hace acá
              es leer jugador por jugador. Cada dato se rotula solo: el emblema
              dice el rango, "7V · 1D" dice el récord y el marcador lleva la
              palabra "puntos" abajo del número. */}
          {/* Sin esto, la primera noche la tabla mostraba puestos y ceros como
              si la liga estuviera en curso y nadie sumara: parecía rota. */}
          {!yaArranco && (
            <p className="liga-aviso">
              Todavía no arrancó. Lo que se juegue antes de las {horaDe(d.desde)} no cuenta — desde ahí, todos en 0.
            </p>
          )}
          {d.tabla.map((f, i) => {
            const puesto = i + 1;
              const t = f.rango ? tierFor(f.rango.tier) : null;
              const total = f.victorias + f.derrotas;
              // Con guarda: durante la ventana de caché del CDN llega el JSON
              // anterior al deploy. Se cae a las netas y, si tampoco están, a
              // la resta a mano.
              const puntaje = f.puntos ?? f.netas ?? f.victorias - f.derrotas;
              const anterior = i > 0 ? d.tabla[i - 1] : null;
              const puntajeAnterior = anterior
                ? anterior.puntos ?? anterior.netas ?? anterior.victorias - anterior.derrotas
                : null;
              const empatado = !f.sinJugar && puntajeAnterior != null && puntajeAnterior === puntaje;
              return (
                <div key={f.puuid} className="liga-grupo">
                <div
                  className={`jug${puesto === 1 && !f.sinJugar ? " lider" : ""}${f.sinJugar ? " en-pausa" : ""}${
                    abierta === f.puuid ? " abierta" : ""
                  }${(f.ultimas?.length ?? 0) > 0 ? " tocable" : ""}`}
                  role={(f.ultimas?.length ?? 0) > 0 ? "button" : undefined}
                  tabIndex={(f.ultimas?.length ?? 0) > 0 ? 0 : undefined}
                  onClick={() => (f.ultimas?.length ?? 0) > 0 && abrirFila(f.puuid)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && (f.ultimas?.length ?? 0) > 0) {
                      e.preventDefault();
                      abrirFila(f.puuid);
                    }
                  }}
                  // El escalonado de la entrada. Va como variable y no como
                  // clase porque el índice es un número: 40ms entre fila y
                  // fila alcanza para que la lista se ARME en vez de aparecer.
                  style={{ ["--fila" as string]: i }}
                >
                  <span
                    className={`jug-puesto p${puesto <= 3 ? puesto : 0}${empatado ? " empatado" : ""}`}
                    title={
                      empatado
                        ? "Empatado en puntos con el de arriba. Adelante va el que lo hizo en menos partidas."
                        : undefined
                    }
                  >
                    {/* El empate marcado. Con dos en +3 la lista los ponía uno
                        arriba del otro sin decir por qué, y en una liga con
                        premio eso se lee como que el orden es arbitrario. */}
                    {empatado && (
                      <span className="jug-empate" aria-label="Empatado en puntos">
                        =
                      </span>
                    )}
                    {puesto === 1 && !f.sinJugar ? (
                      // La corona en vez del "1": el que va ganando la semana
                      // se tiene que ver de un vistazo, no leerse.
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-label="Va ganando" role="img">
                        <path d="M3 8l4.5 3.5L12 4l4.5 7.5L21 8l-1.8 10.2a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8L3 8z" />
                      </svg>
                    ) : (
                      puesto
                    )}
                  </span>

                  {/* La cara: el ícono de perfil con el campeón de la semana
                      montado en la esquina y la línea arriba de él.

                      Eran DOS columnas separadas —avatar y campeón— y esa
                      separación es mitad del aire de planilla: dos casillas
                      alineadas con las de las filas de arriba y abajo. Montados
                      son UN objeto, el retrato de esa persona esta semana, y la
                      fila arranca con una sola cosa en vez de con dos celdas. */}
                  <span className="jug-cara">
                    <PlayerAvatar name={f.name} iconUrl={f.profileIconUrl} className="duo-avatar jug-avatar" />
                    {f.champion && (
                      <ChampIcon champ={f.champion} version={d.ddragonVersion ?? null} className="jug-champ" />
                    )}
                  </span>

                  {/* Quién es, en dos alturas: el nombre manda y abajo va todo
                      lo que lo describe —rango, LP, línea, desde cuándo
                      compite— en UNA línea corrida de metadata.

                      El rango tenía columna propia, con su emblema, su nombre y
                      su LP apilados. Como columna obligaba a que todas las
                      filas reservaran ese ancho aunque el dato sea secundario;
                      como metadata abajo del nombre se lee de corrido y deja de
                      pedir su casilla. */}
                  <span className="jug-quien">
                    <span className="jug-nombre">
                      {f.name}
                      <span className="jug-tag">#{f.tag}</span>
                    </span>
                    <span className="jug-meta">
                      {f.rango && t ? (
                        <>
                          <TierEmblem tierKey={f.rango.tier} division={f.rango.division} />
                          <span style={{ color: t.fg }}>
                            {t.name} {f.rango.division}
                          </span>
                          <span className="jug-meta-lp">{f.rango.lp} LP</span>
                        </>
                      ) : (
                        <span className="jug-apagado">sin rango</span>
                      )}
                      {/* La línea, con su ícono y su nombre en la misma línea
                          de metadata. Antes era un dot montado sobre el arte
                          del campeón: con el campeón ya montado sobre el
                          avatar, un tercer objeto encima era apilar por apilar. */}
                      {f.linea && (
                        <span className="jug-meta-linea">
                          <RoleIcon role={f.linea} />
                          {ROLES[f.linea].label}
                        </span>
                      )}
                      {/* Que se vea por qué tiene menos partidas que el resto:
                          sin esto, el que entró el miércoles parece que no jugó. */}
                      {f.entroTarde && !entraronTodosTarde && (
                        <span className="jug-entro" title="Solo le cuenta lo que hizo desde que se anotó">
                          desde el{" "}
                          {new Date(f.entroTarde).toLocaleDateString("es-AR", {
                            weekday: "long",
                            timeZone: "America/Argentina/Buenos_Aires",
                          })}
                        </span>
                      )}
                      {/* El ajuste a mano, pegado al nombre y con el motivo a
                          la vista. Va acá y no escondido en el desglose porque
                          es lo único del puntaje que NO salió de una partida:
                          un número que se movió por fuera de la Grieta y no
                          dice por qué es justo lo que hace que alguien
                          desconfíe de toda la tabla. */}
                      {f.ajuste && (
                        <span className="jug-ajuste" title={`Ajuste acordado por el grupo: ${f.ajuste.motivo}`}>
                          {puntajeTexto(f.ajuste.puntos)} · {f.ajuste.motivo}
                        </span>
                      )}
                    </span>

                    {/* Cómo le fue, en la MISMA columna que el nombre.

                        Tenía zona propia contra el borde derecho, y a 1180px
                        eso dejaba novecientos píxeles de aire entre el nombre y
                        el récord: dos islas lejanas que el ojo tenía que unir a
                        mano, que es exactamente la sensación de columnas. Todo
                        lo que DESCRIBE a la persona vive abajo de su nombre, y
                        a la derecha queda una sola cosa —el marcador—. Un
                        bloque de tres alturas a la izquierda contra un número
                        grande a la derecha es una lista; dos bloques separados
                        por un vacío es una tabla a la que le faltan columnas. */}
                    {total > 0 ? (
                      <span className="jug-forma">
                        <span className="jug-record">
                          <b className="rec-v">{f.victorias}</b>
                          <i>V</i>
                          <span className="rec-sep" aria-hidden>
                            ·
                          </span>
                          <b className="rec-d">{f.derrotas}</b>
                          <i>D</i>
                          {/* La barra de volumen es el SUBRAYADO del récord: del
                              ancho que le toca contra el que más jugó, pegada
                              abajo. Como bloque aparte era otra cajita. */}
                          <span className="jug-volumen" aria-hidden>
                            <span className="jug-volumen-total" style={{ width: `${(100 * total) / maxPartidas}%` }}>
                              <span className="jug-volumen-v" style={{ width: `${(100 * f.victorias) / total}%` }} />
                              <span className="jug-volumen-d" />
                            </span>
                          </span>
                        </span>
                        {/* La racha DE LA SEMANA, no la de la season: en una
                            competencia de siete días, "ganó las últimas cuatro"
                            es lo que está pasando ahora. */}
                        {f.racha && f.racha.cantidad >= 2 && (
                          <span className={`liga-racha ${f.racha.resultado === "W" ? "w" : "l"}`}>
                            <StreakIcon result={f.racha.resultado} />
                            {f.racha.cantidad}
                          </span>
                        )}
                        {loDeHoy(f) !== 0 && (
                          <span
                            className={`liga-hoy ${loDeHoy(f) > 0 ? "sube" : "baja"}`}
                            title="Lo que sumó o restó en el día de hoy"
                          >
                            {puntajeTexto(loDeHoy(f))} hoy
                          </span>
                        )}
                        {/* Si cobra o qué le falta: lo único que le avisa al que
                            va primero que quedarse quieto no le alcanza. */}
                        {cupo(f)}
                      </span>
                    ) : (
                      <span className="jug-apagado">todavía no jugó</span>
                    )}
                  </span>

                  {/* El marcador. Sin placa, sin caja y sin columna: es el
                      número más grande de la fila y con eso alcanza. El LP va
                      abajo, chiquito, porque sigue siendo lo que cada uno mira
                      para entender su semana — pero ya no decide nada. */}
                  <span className={`jug-marcador ${tono(puntaje)}`}>
                    <span className="jug-pts">{puntajeTexto(puntaje)}</span>
                    {/* "1 punto", no "1 puntos". Es una palabra y nadie la va a
                        aplaudir, pero un plural mal puesto en el dato más
                        grande de la pantalla se nota. Y ahora va SIEMPRE: sin
                        encabezado de columna, es lo único que dice qué se
                        cuenta. */}
                    <span className="jug-unidad">{Math.abs(puntaje) === 1 ? "punto" : "puntos"}</span>
                    {!f.sinJugar && (
                      <span
                        className={`jug-lp ${tono(f.lpNeto)}`}
                        title="El LP real de la semana. No puntúa: está solo como referencia."
                      >
                        {lpTexto(f.lpNeto)}
                      </span>
                    )}
                  </span>
                </div>

                {/* El detalle: partida por partida, con lo que movió cada una.
                    Existe porque el grupo desconfía del cálculo —y tenía
                    razón, el LP por victoria no era igual para todos— y la
                    forma de terminar la discusión es que cualquiera pueda
                    abrir la fila y verlo. */}
                {abierta === f.puuid && (f.ultimas?.length ?? 0) > 0 && (
                  <div className="liga-detalle">
                    {/* El encabezado de un historial, no el de una tabla: qué
                        se está viendo arriba y la aclaración abajo, más chica y
                        más apagada. Antes iban los dos en el mismo renglón y
                        con el mismo peso, así que la aclaración competía con el
                        título en vez de acompañarlo. */}
                    <p className="liga-detalle-titulo">
                      Las {f.ultimas!.length} de la semana
                      <span className="liga-detalle-nota">
                        De dónde sale su {puntajeTexto(f.puntos ?? 0)}, partida por partida y día por día.
                      </span>
                    </p>
                    {agruparPorDia(f, d.semana, d.dias ?? []).map((grupo, iDia, grupos) => {
                      // Por defecto solo el día más nuevo —el primero, que la
                      // lista viene del más nuevo al más viejo—. Desde que
                      // alguien toca un encabezado manda el Set.
                      const abiertoDia = diasAbiertos ? diasAbiertos.has(grupo.dia) : iDia === 0;
                      function alternarDia() {
                        const base = diasAbiertos ?? new Set(grupos.length > 0 ? [grupos[0].dia] : []);
                        const proximo = new Set(base);
                        if (abiertoDia) proximo.delete(grupo.dia);
                        else proximo.add(grupo.dia);
                        setDiasAbiertos(proximo);
                      }
                      return (
                      <div className={`liga-dia${abiertoDia ? " abierto" : ""}`} key={grupo.dia}>
                        {/* El encabezado del día: qué hizo ESE día y en cuánto
                            quedó después. Es lo que convierte una lista de
                            cuarenta partidas en algo auditable — con solo los
                            valores sueltos hay que ir sumando de a 0,75 para
                            entender de dónde salió el número grande de arriba.
                            El acumulado sale de la MISMA curva que dibuja la
                            carrera, así que las dos no se pueden contradecir. */}
                        <button
                          type="button"
                          className="liga-dia-head"
                          onClick={alternarDia}
                          aria-expanded={abiertoDia}
                          title={abiertoDia ? "Cerrar el día" : "Ver las partidas del día"}
                        >
                          <span className="liga-dia-flecha" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                          <span className="liga-dia-nombre">{grupo.nombre}</span>
                          {/* El récord del día, y en qué quedó. Cerrado, esta
                              línea es TODO lo que se ve del día: sin el "3V ·
                              1D" el encabezado decía cuánto se movió pero no
                              cómo, y eso es justamente lo que se viene a
                              mirar. */}
                          <span className="liga-dia-record">
                            <span className="wc-v">{grupo.victorias}V</span>
                            <span className="wc-sep">·</span>
                            <span className="wc-d">{grupo.derrotas}D</span>
                          </span>
                          <span className={`liga-dia-delta ${tono(grupo.delta)}`}>{puntajeTexto(grupo.delta)}</span>
                          <span className="liga-dia-acum">quedó en {puntajeTexto(grupo.acumulado)}</span>
                        </button>
                        {abiertoDia && grupo.partidas.map((m) => (
                      <div className={`liga-partida ${m.win ? "gano" : "perdio"}${m.anulada ? " anulada" : ""}`} key={m.matchId}>
                        {/* El nodo de la línea de tiempo. Es el resultado y el
                            punto de la secuencia a la vez: un ✓ o una ✕ del
                            color que corresponde, con el fondo de la sección
                            atrás para que el hilo no le pase por encima. Antes
                            era una "V" o una "D" adentro de un rectángulo
                            pintado, que es lo que hacía que la primera columna
                            se leyera como la columna de una planilla. */}
                        <span className={`liga-partida-res ${m.win ? "gano" : "perdio"}`} aria-label={m.win ? "Ganada" : "Perdida"}>
                          {m.win ? "✓" : "✕"}
                        </span>
                        <ChampIcon champ={m.champion ?? ""} version={d.ddragonVersion ?? null} className="liga-partida-champ" />
                        <span className="liga-partida-champ-nombre">{m.champion ? championLabel(m.champion) : "—"}</span>
                        {/* Cómo jugó. Va entre el campeón y los puntos porque
                            ese es su lugar en la jerarquía: más que el LP,
                            menos que lo que decide la liga. Con guarda: si la
                            respuesta es anterior al deploy que trajo el KDA,
                            no se dibuja nada —un "0/0/0" inventado sería peor
                            que el hueco—. */}
                        {m.kills != null && m.deaths != null && m.assists != null ? (
                          <span className="liga-partida-kda" title="Asesinatos / muertes / asistencias">
                            {m.kills}<i>/</i>{m.deaths}<i>/</i>{m.assists}
                          </span>
                        ) : (
                          <span className="liga-partida-kda vacio" aria-hidden />
                        )}
                        {/* Cuánto duró. Está para AUDITAR el filtro de remakes,
                            que vive en el servidor y es invisible: hasta acá
                            había que creerle. Con esta columna se verifica solo
                            — si todas dicen veinte o treinta minutos el filtro
                            anda, y si alguna vez aparece una de cuatro es un
                            bug que grita, porque esa partida no tendría que
                            estar en la lista ni haber restado 0,75. */}
                        {m.duracionS != null ? (
                          <span
                            className="liga-partida-dur"
                            title="Cuánto duró. Las de menos de cinco minutos son remakes y no cuentan para la liga: si ves una acá, avisá."
                          >
                            {duracionTexto(m.duracionS)}
                          </span>
                        ) : (
                          <span className="liga-partida-dur vacio" aria-hidden />
                        )}
                        {/* Los puntos y el LP, apilados y alineados a la
                            derecha: los puntos arriba y grandes porque son los
                            que deciden la liga, el LP abajo y apagado porque es
                            contexto. Antes iban uno al lado del otro y con
                            tamaños parecidos, así que la pantalla no decía cuál
                            de los dos importa. */}
                        <span className="liga-partida-cuenta">
                          {/* Lo que valió ESA partida. Puede ser 1,25 si fue la
                              cuarta al hilo o más, así que no se puede deducir
                              del resultado: viene calculado.

                              Una anulada dice "no contó" en vez de "0 pt": el
                              cero se lee como un resultado del cálculo, y acá
                              lo que pasó es que la partida quedó afuera. Se
                              muestra igual, y no se esconde como los remakes,
                              porque esta sí se jugó — el desglose es la prueba
                              de dónde sale el puntaje y una derrota que
                              desaparece parece que la app se la comió. */}
                          {m.anulada ? (
                            <span
                              className="liga-partida-anulada"
                              title={
                                m.anulada === "duo"
                                  ? "Jugaste en duo con alguien que no está en la liga. Esa partida no suma, no resta y no cuenta para las 10 del mínimo — es la regla del duo con gente de afuera."
                                  : m.anulada === "mitigada"
                                    ? "Pérdida mitigada: Riot no te sacó LP por esta derrota, así que la liga tampoco te cobra. Está acá para que se vea que pasó, pero no suma, no resta y no cuenta para las 10 del mínimo."
                                    : "Se te fue un compañero: Riot no te saca LP por una así, y la liga no cobra lo que Riot no cobra. La partida está acá para que se vea que pasó, pero no suma, no resta y no cuenta para las 10 del mínimo."
                              }
                            >
                              no contó
                            </span>
                          ) : (
                            <span className="liga-partida-netas">
                              {/* La marca de racha. Una victoria puede valer
                                  1 o 1,25 y del "✓" de la izquierda no se
                                  deduce cuál: el bonus arranca en la cuarta
                                  al hilo y ese estado no se ve en la fila.
                                  Sin la marca, dos renglones idénticos —misma
                                  ✓, mismo campeón— muestran números distintos
                                  y parece un error de la app.

                                  Se compara contra la tabla de puntos que
                                  manda la API, no contra un 1 escrito acá: el
                                  día que cambie el valor de la victoria, esto
                                  sigue diciendo la verdad. Sin esa tabla —una
                                  pestaña vieja contra la API nueva— no se
                                  dibuja nada, que es mejor que marcar mal. */}
                              {tp && m.win && (m.puntos ?? 0) > tp.victoria && (
                                <i
                                  className="liga-partida-racha"
                                  title={`Valió ${puntajeTexto(m.puntos ?? tp.enRacha)} en vez de ${puntajeTexto(tp.victoria)}: iba ${tp.rachaDesde} o más al hilo.`}
                                  aria-label="Con bonus de racha"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                    <path d="M13.5 2c.4 3.2-1.1 5-2.7 6.6C9 10.4 7 12.2 7 15a5 5 0 0 0 10 0c0-1.6-.6-2.8-1.3-3.8-.3.9-.9 1.6-1.7 1.9.3-2-.2-3.9-1.2-5.3.6 2-.4 3.3-1.4 4.1-.6.5-1 1.1-1 1.9a1.8 1.8 0 0 0 3.6 0c0-.3 0-.5-.1-.8 1 .9 1.6 2 1.6 3.2a3.5 3.5 0 0 1-7 0c0-2 1.5-3.4 3-4.9C13.3 9.6 14.6 7.8 13.5 2z" />
                                  </svg>
                                </i>
                              )}
                              {puntajeTexto(m.puntos ?? (m.win ? 1 : -1))}
                              <i className="liga-partida-unidad">pt</i>
                            </span>
                          )}
                          {m.lp !== null ? (
                            <span className={`liga-partida-lp ${tono(m.lp)}`}>{lpTexto(m.lp)}</span>
                          ) : m.lpTramo != null ? (
                            // Cayó junta con otras entre dos fotos: se muestra lo
                            // que movieron TODAS, aclarando cuántas son. Antes acá
                            // había un guion y la pregunta se quedaba sin
                            // respuesta; repartir el total en partes iguales, en
                            // cambio, le ponía "+9" a una derrota.
                            <span
                              className={`liga-partida-lp junta ${tono(m.lpTramo)}`}
                              title={`Estas ${m.juntas ?? 2} partidas cayeron entre las mismas dos fotos de LP: juntas movieron ${lpTexto(
                                m.lpTramo,
                              )}. Cuánto dio cada una no se puede saber, así que no se inventa.`}
                            >
                              {lpTexto(m.lpTramo)} <i>entre {m.juntas ?? 2}</i>
                            </span>
                          ) : (
                            <span className="liga-partida-lp sin" title="Todavía no hay una foto de LP posterior a esta partida.">
                              — LP
                            </span>
                          )}
                        </span>
                      </div>
                        ))}
                      </div>
                      );
                    })}
                  </div>
                )}
                </div>
              );
            })}
        </div>
      )}

      {/* La vitrina. Era una línea de log —la clave ISO de la semana, el Riot ID
          con tag y un "+144" verde— y tenía un problema peor que el aspecto: ese
          número era el LP NETO, y la liga se gana por PUNTOS. Un tipo que ganó
          con +10,25 aparecía con un +144 al lado, contradiciendo a la tabla de
          la que había salido.

          La forma sale del patrón de vitrina que usan las ligas de fantasy: el
          campeón vigente va destacado y con cara, las semanas viejas quedan
          compactas debajo, y cuando alguien gana más de una vez eso se cuenta
          —que en una liga SEMANAL es la estadística que importa rápido—. */}
      {d.arrancada && d.historial.length > 0 && (() => {
        const [vigente, ...viejas] = d.historial;
        const veces = new Map<string, number>();
        for (const h of d.historial) if (h.nombre) veces.set(h.nombre, (veces.get(h.nombre) ?? 0) + 1);
        const repiten = [...veces.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
        /* El marcador de cada semana: el puntaje con el que ganó, que es lo que
           decide la liga.

           Las semanas que cerraron ANTES de que el puntaje se guardara no lo
           tienen. Ahí llegó a mostrarse el `lp_neto` rotulado ("+144 LP") y se
           sacó: el LP no se mide en esta liga, así que poner un número de una
           unidad que no compite es ruido por no dejar el lugar vacío. En su
           lugar va la cuenta de títulos del que ganó esa semana —"1 🏆"—, que
           es el otro dato que una vitrina tiene para decir. Va en gris y con la
           copa justamente para que no se lea como el puntaje de la semana. */
        const marcador = (h: Datos["historial"][number]) => {
          if (h.puntos != null) return <span className={`vitrina-pts ${tono(h.puntos)}`}>{puntajeTexto(h.puntos)}</span>;
          const titulos = h.nombre ? (veces.get(h.nombre) ?? 0) : 0;
          if (titulos === 0) return null;
          return (
            <span className="vitrina-pts es-titulos" aria-label={`${titulos} ${titulos === 1 ? "título" : "títulos"}`}>
              {titulos} <span aria-hidden>🏆</span>
            </span>
          );
        };
        return (
          <div className="vitrina">
            {/* El botón va acá arriba y no adentro de cada fila: una fila con
                un botón adentro es un control, y estas son un registro que se
                lee. Igual cada fila abre SU semana al tocarla — el botón es la
                afordancia, el click en la fila es el atajo. */}
            <div className="vitrina-head">
              <span className="vitrina-label">Campeones anteriores</span>
              <button type="button" className="vitrina-ver" onClick={() => setTorneo(vigente.semana)}>
                Ver cómo terminó
              </button>
            </div>

            <div
              className="vitrina-vigente"
              onClick={() => setTorneo(vigente.semana)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTorneo(vigente.semana);
                }
              }}
            >
              <span className="vitrina-trofeo" aria-hidden>🏆</span>
              <PlayerAvatar name={vigente.nombre ?? "?"} iconUrl={vigente.iconUrl} className="duo-avatar vitrina-avatar" />
              <span className="vitrina-quien">
                <strong className="vitrina-nombre">{vigente.nombre ?? "No ganó nadie"}</strong>
                <span className="vitrina-meta">
                  {rangoDeSemana(vigente.semana)}
                  {vigente.jugadores > 0 && ` · entre ${vigente.jugadores}`}
                </span>
              </span>
              {marcador(vigente)}
            </div>

            {viejas.length > 0 && (
              <div className="vitrina-viejas">
                {viejas.map((h) => (
                  <div className="vitrina-fila" key={h.semana} onClick={() => setTorneo(h.semana)}>
                    <span className="vitrina-fila-semana">{rangoDeSemana(h.semana)}</span>
                    <span className="vitrina-fila-quien">{h.nombre ?? "no ganó nadie"}</span>
                    {marcador(h)}
                  </div>
                ))}
              </div>
            )}

            {repiten.length > 0 && (
              <span className="vitrina-repiten">
                {repiten.map(([n, v]) => `${n} ganó ${v} veces`).join(" · ")}
              </span>
            )}

            {torneo && (
              <LigaTorneo semanas={d.historial.map((h) => h.semana)} inicial={torneo} onCerrar={() => setTorneo(null)} />
            )}
          </div>
        );
      })()}

      {/* La grilla del día a día va ACÁ, al nivel de la sección, y no adentro
          del bloque de la vitrina como estaba primero: ese bloque solo se
          dibuja si hay semanas cerradas, así que con la liga recién arrancada
          el botón de la carrera abría la nada. */}
      {diaADia && d.dias && (
        <LigaDiaADia
          dias={d.dias}
          corridos={d.diasCorridos ?? 1}
          rango={rangoTexto}
          tabla={d.tabla}
          onCerrar={() => setDiaADia(false)}
        />
      )}

      {/* El pie dice quiénes están en carrera. Los que todavía no jugaron se
          cuentan aparte a propósito: es la parte que dice "esto no está
          cerrado", que en una liga de siete días es la mitad de la gracia. */}
      <div className="liga-pie">
        <button type="button" className="liga-admin-toggle" onClick={() => setAdmin((v) => !v)}>
          {admin ? "Listo" : `Quién compite · ${anotados} de ${d.plantel.length}`}
        </button>
        {!admin && sinJugar > 0 && (
          <span className="liga-pie-nota">
            {sinJugar === 1 ? "1 anotado todavía no jugó" : `${sinJugar} anotados todavía no jugaron`}
          </span>
        )}
      </div>

      {admin && (
        <div className="liga-admin">
          {/* La planificación del torneo va ARRIBA del selector: primero cuándo
              se juega y después quiénes, que es el orden en que se decide. */}
          <LigaTorneoAdmin />

          <p>
            Se anota el que quiere, no todos los trackeados.{" "}
            <b>
              {anotados} de {d.plantel.length}
            </b>
            <InfoTip text="Anotar y desanotar pide la contraseña del grupo. Si no la tenés cargada, al tocar un nombre aparece el cartel para escribirla." />
          </p>
          <div className="liga-admin-todos">
            <button
              type="button"
              onClick={() => d.plantel.filter((p) => !p.participa).forEach((p) => anotar(p.puuid, true))}
              disabled={anotados === d.plantel.length}
            >
              Marcar todos
            </button>
            <button
              type="button"
              onClick={() => d.plantel.filter((p) => p.participa).forEach((p) => anotar(p.puuid, false))}
              disabled={anotados === 0}
            >
              Ninguno
            </button>
          </div>
          {d.plantel.map((p) => (
            <label className="liga-admin-fila" key={p.puuid}>
              <input
                type="checkbox"
                checked={p.participa}
                disabled={guardando === p.puuid}
                onChange={(e) => anotar(p.puuid, e.target.checked)}
              />
              <span>
                {p.name} <span className="player-tag">#{p.tag}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
