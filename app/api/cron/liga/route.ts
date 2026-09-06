import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { cerrarSemanasPendientes } from "@/lib/liga-cierre";

/**
 * GET /api/cron/liga — cierra la semana que terminó y anuncia al ganador.
 *
 * Corre TODOS LOS DÍAS a propósito, no solo el domingo. El plan de Vercel
 * dispara los crons una vez por día y sin puntualidad garantizada, así que
 * atarlo a un horario exacto es pedirle a la infraestructura algo que no
 * promete. En vez de eso la corrida pregunta "¿hay alguna semana terminada y
 * sin anunciar?" y actúa solo si la hay: si el disparo se atrasa o se pierde,
 * el del día siguiente lo arregla.
 *
 * Lo que hace que esto sea seguro es la tabla liga_semanas: una semana ya
 * registrada no se vuelve a anunciar, por más veces que corra.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sin Supabase." }, { status: 500 });
  }

  try {
    const resultado = await cerrarSemanasPendientes(supabase);
    console.log("cron/liga:", resultado);
    return NextResponse.json(resultado);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cron/liga falló:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
