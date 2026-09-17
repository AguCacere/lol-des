"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchConClave } from "./Cerradura";
import { InfoTip } from "./InfoTip";

/**
 * El panel para planificar los torneos, atrás de la contraseña del grupo.
 *
 * Existe porque hasta acá la liga no TENÍA fechas: las deducía del calendario
 * —el lunes de la semana en curso, más siete días— y no había ningún lugar
 * donde decir "este torneo arranca el X y cierra el Y". El día que hubo que
 * agregarle un lunes, porque había gente que no podía jugar el domingo, no
 * había dónde tocarlo. Ver `lib/torneo.ts`.
 *
 * Las fechas se editan con `datetime-local`, que trabaja en el reloj del que
 * mira. Eso está bien acá y NO hay que "arreglarlo" pasándolo a UTC: el que
 * carga un torneo lo piensa en su hora, que es la argentina. Lo que viaja al
 * servidor sí es ISO con huso, que es lo que se guarda.
 *
 * El cierre es EXCLUSIVO y la pantalla lo dice: para que un torneo termine el
 * domingo a la noche hay que poner el lunes a las 00:00. Es la fuente número
 * uno de confusión de todo esto, así que va escrito al lado del campo y no en
 * un comentario que no lee nadie.
 */

interface TorneoJSON {
  id: string | null;
  nombre: string | null;
  arranca: string;
  cierra: string;
  minimoTotal: number;
  minimoUltimo: number;
  ultimoDesde: string;
  premio: string | null;
  guardado: boolean;
}

/** ISO → el valor que quiere un <input type="datetime-local">, en la hora del que mira. */
function paraInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** Y la vuelta: lo que escribió el usuario, en su reloj, a un instante real. */
function deInput(valor: string): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** En qué día del torneo estamos. La misma cuenta que diaCorriente, del lado del cliente. */
function diaDe(t: TorneoJSON): number {
  const piso = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const corridos = Math.floor((piso(Date.now()) - piso(new Date(t.arranca).getTime())) / 86400000) + 1;
  return Math.min(duracion(t.arranca, t.cierra), Math.max(1, corridos));
}

/** "lunes 14", para hablar de un día sin decir la hora. */
function diaCorto(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric" });
}

/**
 * Lo que el torneo va a significar, en prosa, mientras se escribe.
 *
 * Es la pieza que faltaba: los tres campos de fecha son correctos pero no se
 * leen solos, sobre todo el cierre exclusivo —"22/09 00:00" no dice "termina el
 * lunes 21"— y el tramo del mínimo, que puede cubrir más de un día sin que
 * ningún campo lo muestre. Acá se ve antes de guardar.
 */
function resumen(b: Borrador): string | null {
  const arranca = deInput(b.arranca);
  const cierra = deInput(b.cierra);
  if (!arranca || !cierra) return null;
  const dias = duracion(arranca, cierra);
  if (dias <= 0) return "El cierre tiene que ser posterior al arranque.";

  const ultimoJugable = new Date(new Date(cierra).getTime() - 1).toISOString();
  let texto = `${dias} días: del ${diaCorto(arranca)} al ${diaCorto(ultimoJugable)}.`;

  const desde = deInput(b.ultimoDesde);
  if (desde) {
    const d0 = new Date(desde).getTime();
    const d1 = new Date(ultimoJugable).getTime();
    if (d0 < new Date(arranca).getTime() || d0 > d1) {
      return `${texto} Ojo: el último día cae fuera del torneo.`;
    }
    // Cuántos días CALENDARIO cubre el mínimo del final. Suele ser uno; con el
    // torneo extendido dejando el mínimo abierto desde el domingo, son dos.
    const dia = 86400000;
    const piso = (ms: number) => {
      const x = new Date(ms);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    };
    const cubre = Math.round((piso(d1) - piso(d0)) / dia) + 1;
    texto +=
      cubre <= 1
        ? ` El mínimo de ${b.minimoUltimo || "?"} cuenta solo el ${diaCorto(desde)}.`
        : ` El mínimo de ${b.minimoUltimo || "?"} se puede cumplir en cualquiera de los últimos ${cubre} días (desde el ${diaCorto(desde)}).`;
  }
  return texto;
}

/** Cuántos días de calendario ocupa, que es lo que la gente cuenta. */
function duracion(arranca: string, cierra: string): number {
  const a = new Date(arranca).getTime();
  const c = new Date(cierra).getTime() - 1;
  if (Number.isNaN(a) || Number.isNaN(c) || c <= a) return 0;
  const dia = 86400000;
  return Math.floor((c - a) / dia) + 1;
}

interface Borrador {
  nombre: string;
  arranca: string;
  cierra: string;
  minimoTotal: string;
  minimoUltimo: string;
  ultimoDesde: string;
  premio: string;
}

function borradorDe(t: TorneoJSON): Borrador {
  return {
    nombre: t.nombre ?? "",
    arranca: paraInput(t.arranca),
    cierra: paraInput(t.cierra),
    minimoTotal: String(t.minimoTotal),
    minimoUltimo: String(t.minimoUltimo),
    ultimoDesde: paraInput(t.ultimoDesde),
    premio: t.premio ?? "",
  };
}

/** La lectura pelada, sin tocar estado: la usan el efecto y la recarga a mano. */
async function pedirTorneos(): Promise<{ torneos: TorneoJSON[]; enCurso: TorneoJSON | null; error: string | null }> {
  try {
    const res = await fetchConClave("/api/torneos");
    const j = await res.json();
    if (!res.ok) {
      return { torneos: [], enCurso: null, error: j.falta ?? j.error ?? "No se pudieron leer los torneos." };
    }
    return { torneos: j.torneos ?? [], enCurso: j.enCurso ?? null, error: null };
  } catch {
    return { torneos: [], enCurso: null, error: "No se pudieron leer los torneos." };
  }
}

export default function LigaTorneoAdmin() {
  const [torneos, setTorneos] = useState<TorneoJSON[]>([]);
  const [enCurso, setEnCurso] = useState<TorneoJSON | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    // El estado se toca en el callback y NO en el cuerpo del efecto: un
    // setState sincrónico ahí encadena renders y el linter lo corta. Es el
    // mismo patrón de LigaTorneo.tsx, con la bandera de vivo para no escribir
    // sobre un componente que ya se desmontó.
    const j = await pedirTorneos();
    if (j.error) setError(j.error);
    else {
      setError(null);
      setTorneos(j.torneos);
      setEnCurso(j.enCurso);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    let vivo = true;
    void pedirTorneos().then((j) => {
      if (!vivo) return;
      if (j.error) setError(j.error);
      else {
        setTorneos(j.torneos);
        setEnCurso(j.enCurso);
      }
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function guardar(id: string | null) {
    if (!borrador) return;
    const arranca = deInput(borrador.arranca);
    const cierra = deInput(borrador.cierra);
    if (!arranca || !cierra) {
      setError("Faltan el arranque o el cierre.");
      return;
    }
    setGuardando(true);
    setError(null);
    setAviso(null);
    const cuerpo = {
      ...(id ? { id } : {}),
      nombre: borrador.nombre || null,
      arranca,
      cierra,
      minimoTotal: Number(borrador.minimoTotal),
      minimoUltimo: Number(borrador.minimoUltimo),
      ultimoDesde: deInput(borrador.ultimoDesde),
      premio: borrador.premio || null,
    };
    try {
      const res = await fetchConClave("/api/torneos", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "No se pudo guardar.");
        return;
      }
      setEditando(null);
      setBorrador(null);
      setAviso(
        id
          ? "Guardado. La tabla se recalcula sola en el próximo refresco de la pantalla."
          : "Torneo creado.",
      );
      await cargar();
    } catch {
      setError("No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    // Sin ventana de confirmación del navegador a propósito: el botón ya dice
    // "borrar" y borrar un torneo no pierde nada de lo jugado — la ventana
    // vuelve a ser el lunes a domingo deducido y la tabla se rearma sola.
    setGuardando(true);
    try {
      const res = await fetchConClave(`/api/torneos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) setError(j.error ?? "No se pudo borrar.");
      else await cargar();
    } finally {
      setGuardando(false);
    }
  }

  function nuevo() {
    // Arranca donde termina el último cargado, o el lunes que viene. Es la
    // cuenta que uno hace igual, y evita cargar dos que se pisen.
    const ultimo = torneos[0];
    const desde = ultimo ? new Date(ultimo.cierra) : proximoLunes();
    const hasta = new Date(desde.getTime() + 7 * 86400000);
    setEditando("nuevo");
    setBorrador({
      nombre: "",
      arranca: paraInput(desde.toISOString()),
      cierra: paraInput(hasta.toISOString()),
      minimoTotal: "10",
      minimoUltimo: "3",
      ultimoDesde: paraInput(new Date(hasta.getTime() - 86400000).toISOString()),
      premio: "",
    });
  }

  if (cargando) return <p className="liga-torneo-nota">Cargando torneos…</p>;

  return (
    <div className="liga-torneo-admin">
      <p>
        Cuándo arranca y cuándo cierra cada torneo.
        <InfoTip text="El cierre es exclusivo: para que termine el domingo a la noche, poné el lunes a las 00:00. Mover el cierre de un torneo en curso le cambia la regla a gente que ya organizó su semana — avisá en el Discord." />
      </p>

      {error && <p className="liga-torneo-error">{error}</p>}
      {aviso && <p className="liga-torneo-aviso">{aviso}</p>}

      {/* El estado de AHORA arriba de todo: es lo primero que uno viene a
          mirar, y tenerlo que deducir de una lista de fechas es trabajo. */}
      {enCurso && (
        <div className={enCurso.guardado ? "liga-torneo-ahora" : "liga-torneo-ahora sin-fila"}>
          <strong>{enCurso.nombre ?? (enCurso.guardado ? "Sin nombre" : "Semana deducida")}</strong>
          <span>
            Día <b>{diaDe(enCurso)}</b> de <b>{duracion(enCurso.arranca, enCurso.cierra)}</b> · cierra el{" "}
            <b>{diaCorto(new Date(new Date(enCurso.cierra).getTime() - 1).toISOString())}</b> a las 23:59
          </span>
          {!enCurso.guardado && (
            <span className="liga-torneo-hint">
              Sin fila propia: se está usando el lunes a domingo de siempre. Creá un torneo para poder editar las
              fechas.
            </span>
          )}
        </div>
      )}

      {editando === "nuevo" && borrador && (
        <Formulario
          borrador={borrador}
          setBorrador={setBorrador}
          guardando={guardando}
          onGuardar={() => guardar(null)}
          onCancelar={() => {
            setEditando(null);
            setBorrador(null);
          }}
        />
      )}

      <ul className="liga-torneo-lista">
        {torneos.map((t) => {
          const dias = duracion(t.arranca, t.cierra);
          const corriendo = enCurso?.id === t.id;
          return (
            <li key={t.id ?? t.arranca} className={corriendo ? "liga-torneo-fila es-actual" : "liga-torneo-fila"}>
              {editando === t.id && borrador ? (
                <Formulario
                  borrador={borrador}
                  setBorrador={setBorrador}
                  guardando={guardando}
                  onGuardar={() => guardar(t.id)}
                  onCancelar={() => {
                    setEditando(null);
                    setBorrador(null);
                  }}
                />
              ) : (
                <>
                  <div className="liga-torneo-datos">
                    <strong>
                      {t.nombre ?? "Sin nombre"}
                      {corriendo && <span className="liga-torneo-chip">en curso</span>}
                    </strong>
                    <span>
                      Del <b>{diaCorto(t.arranca)}</b> al{" "}
                      <b>{diaCorto(new Date(new Date(t.cierra).getTime() - 1).toISOString())}</b> · {dias} días
                    </span>
                    <span className="liga-torneo-min">
                      {t.minimoTotal} partidas en total y {t.minimoUltimo} desde el {diaCorto(t.ultimoDesde)}
                      {t.premio ? ` · ${t.premio}` : ""}
                    </span>
                  </div>
                  <div className="liga-torneo-acciones">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(t.id);
                        setBorrador(borradorDe(t));
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" disabled={guardando} onClick={() => t.id && borrar(t.id)}>
                      Borrar
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {editando !== "nuevo" && (
        <button type="button" className="liga-torneo-nuevo" onClick={nuevo}>
          + Torneo nuevo
        </button>
      )}
    </div>
  );
}

/** El lunes que viene a las 00:00 de la hora del que mira. El arranque por defecto. */
function proximoLunes(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

function Formulario({
  borrador,
  setBorrador,
  guardando,
  onGuardar,
  onCancelar,
}: {
  borrador: Borrador;
  setBorrador: (b: Borrador) => void;
  guardando: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const set = (k: keyof Borrador) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBorrador({ ...borrador, [k]: e.target.value });
  const resumenTexto = resumen(borrador);

  return (
    <div className="liga-torneo-form">
      <div className="liga-torneo-dos">
        <label>
          Nombre
          <input type="text" value={borrador.nombre} onChange={set("nombre")} placeholder="Semana del 14" />
        </label>
        <label>
          Premio
          <input type="text" value={borrador.premio} onChange={set("premio")} placeholder="10 lucas" />
        </label>
      </div>
      <div className="liga-torneo-dos">
        <label>
          Arranca
          <input type="datetime-local" value={borrador.arranca} onChange={set("arranca")} />
        </label>
        <label>
          Cierra <span className="liga-torneo-hint">el lunes 00:00 = termina el domingo</span>
          <input type="datetime-local" value={borrador.cierra} onChange={set("cierra")} />
        </label>
      </div>
      <div className="liga-torneo-dos">
        <label>
          Último día desde <span className="liga-torneo-hint">cuándo abre el mínimo final</span>
          <input type="datetime-local" value={borrador.ultimoDesde} onChange={set("ultimoDesde")} />
        </label>
        <div className="liga-torneo-dos">
          <label>
            Mínimo total
            <input type="number" min={0} value={borrador.minimoTotal} onChange={set("minimoTotal")} />
          </label>
          <label>
            Mín. último
            <input type="number" min={0} value={borrador.minimoUltimo} onChange={set("minimoUltimo")} />
          </label>
        </div>
      </div>
      {/* Lo que va a pasar, en castellano, antes de guardar. Los campos de
          fecha son exactos pero no se leen solos. */}
      {resumenTexto && <p className="liga-torneo-resumen">{resumenTexto}</p>}
      <div className="liga-torneo-acciones">
        <button type="button" disabled={guardando} onClick={onGuardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
