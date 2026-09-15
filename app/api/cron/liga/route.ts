import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { cerrarSemanasPendientes } from "@/lib/liga-cierre";

/**
 * GET /api/cron/liga — cierra la semana que terminó y anuncia al ganador.
 *
 * No está atado a un horario exacto a propósito: pregunta "¿hay alguna semana
 * terminada y sin anunciar?" y actúa solo si la hay. Así da igual cuándo se
 * dispare, si se atrasa o si se pierde una corrida.
 *
 * De hecho es el disparador MENOS importante de los tres: el cron de refresco
 * (externo, cada 15 minutos — ver app/api/cron/refresh/route.ts) hace este
 * mismo cierre, y leer /api/liga también. Este queda como red de contención.
 *
 * Por eso mismo YA NO ESTÁ EN vercel.json. El plan Hobby deja dos crons y el
 * segundo lugar se lo llevó el parte diario de la liga, que sí necesita un
 * disparador propio —nadie más lo llama— mientras que el cierre tiene otros
 * dos caminos que lo hacen igual. La ruta queda para pegarle a mano si alguna
 * vez hace falta forzar un cierre.
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
