import { NextResponse } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_SESION, passwordCorrecta, sesionValida, valorDeCookie } from "@/lib/auth";

/**
 * La puerta. GET dice si ya estás adentro, POST te deja entrar con la
 * contraseña del grupo, DELETE te saca.
 *
 * La cookie es HttpOnly a propósito: el JavaScript de la página nunca la
 * toca, así que ni un script inyectado ni una extensión pueden robársela.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json({ adentro: sesionValida(req) });
}

export async function POST(req: Request) {
  let body: { password?: unknown } = {};
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    // Sin body es igual que con la contraseña mal.
  }

  if (!passwordCorrecta(body.password)) {
    // Un rato de espera para que probar contraseñas a mano sea tedioso. No es
    // una defensa seria contra un ataque automatizado —para eso está el largo
    // de la contraseña— pero no cuesta nada.
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const valor = valorDeCookie();
  if (!valor) {
    return NextResponse.json({ error: "La app no tiene contraseña configurada." }, { status: 503 });
  }

  const res = NextResponse.json({ adentro: true });
  res.cookies.set(COOKIE_SESION, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ adentro: false });
  res.cookies.set(COOKIE_SESION, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
