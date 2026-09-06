import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * La cerradura de la app.
 *
 * No es un sistema de usuarios: son seis amigos y no hace falta saber cuál de
 * ellos apretó el botón. Lo que hace falta es que NADIE de afuera pueda tocar
 * lo que cuesta plata o ensucia la base. Hasta ahora todas las rutas de
 * escritura estaban abiertas: cualquiera con la URL podía agregar
 * invocadores, quemar el rate limit de Riot con un backfill, mandar cargadas
 * al Discord del grupo o —la peor— generar informes del pool, que se pagan
 * por token.
 *
 * Una contraseña compartida y una cookie firmada alcanzan para eso. Si algún
 * día hace falta saber QUIÉN hizo qué, el próximo paso es entrar con Discord
 * (el grupo ya vive ahí); esto no lo estorba.
 */

const COOKIE = "grieta_sesion";
/** Un mes. Lo bastante largo para no vivir escribiendo la contraseña, lo bastante corto para que una sesión olvidada en un teléfono no sea eterna. */
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * La contraseña compartida. Sin ella la app queda CERRADA, no abierta: que
 * falte la variable es exactamente el caso en el que no hay que dejar pasar a
 * nadie.
 */
function password(): string | null {
  const p = process.env.APP_PASSWORD;
  return p && p.length > 0 ? p : null;
}

/** Compara sin filtrar por tiempo cuántos caracteres acertó. */
function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual explota si los largos difieren, y el largo igual se filtra
  // igual por el tamaño de la petición: se compara el hash, que siempre mide lo mismo.
  const ha = createHmac("sha256", "cmp").update(ba).digest();
  const hb = createHmac("sha256", "cmp").update(bb).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * El valor de la cookie: hasta cuándo vale, y una firma de eso.
 *
 * La clave de la firma es la propia contraseña. Es a propósito: cambiarla
 * cierra de una todas las sesiones abiertas, que es justo lo que se quiere
 * cuando se cambia una contraseña compartida.
 */
function firmar(vence: number, clave: string): string {
  return createHmac("sha256", clave).update(String(vence)).digest("hex");
}

export function valorDeCookie(): string | null {
  const clave = password();
  if (!clave) return null;
  const vence = Date.now() + DURACION_MS;
  return `${vence}.${firmar(vence, clave)}`;
}

export const COOKIE_SESION = COOKIE;
export const COOKIE_MAX_AGE = Math.floor(DURACION_MS / 1000);

/** Si la contraseña que mandaron es la de la casa. */
export function passwordCorrecta(intento: unknown): boolean {
  const clave = password();
  if (!clave || typeof intento !== "string") return false;
  return igual(intento, clave);
}

/** Si la petición trae una sesión válida y sin vencer. */
export function sesionValida(req: Request): boolean {
  const clave = password();
  if (!clave) return false;

  const cookies = req.headers.get("cookie");
  if (!cookies) return false;
  const cruda = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!cruda) return false;

  const [venceStr, firma] = decodeURIComponent(cruda).split(".");
  const vence = Number(venceStr);
  if (!Number.isFinite(vence) || vence < Date.now() || !firma) return false;
  return igual(firma, firmar(vence, clave));
}

/**
 * El portero de las rutas que escriben o cuestan. Devuelve null si puede
 * pasar, o la respuesta a devolver si no.
 *
 * El 401 lleva un `necesitaClave` para que el cliente sepa que tiene que
 * pedir la contraseña y no mostrar "error desconocido".
 */
export function exigirSesion(req: Request): NextResponse | null {
  if (!password()) {
    return NextResponse.json(
      { error: "La app no tiene contraseña configurada (falta APP_PASSWORD). Nadie puede escribir hasta que se defina." },
      { status: 503 },
    );
  }
  if (sesionValida(req)) return null;
  return NextResponse.json({ error: "Hace falta la contraseña del grupo.", necesitaClave: true }, { status: 401 });
}
