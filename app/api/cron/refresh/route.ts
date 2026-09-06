import { NextResponse, after } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { refreshAllSummoners } from "@/lib/refresh";
import { cerrarSemanasPendientes } from "@/lib/liga-cierre";

// Was 60 — see app/api/refresh/route.ts for why.
export const maxDuration = 300;

/**
 * GET /api/cron/refresh — pulls fresh LP + match data for every tracked
 * summoner and appends it to Supabase. Triggered by an external scheduler
 * (originally meant for Vercel's own `crons` in vercel.json, but Vercel's
 * Hobby plan only allows once-a-day cron — a free third-party scheduler
 * like cron-job.org fills the gap for a shorter interval) with
 * `Authorization: Bearer $CRON_SECRET`, checked below.
 *
 * Responds immediately and does the actual refresh in the background via
 * `after()` — cheap external schedulers (cron-job.org's free tier, e.g.)
 * cap how long THEY wait for a response at 30s, well under how long a full
 * refresh can take. `after()` keeps the underlying Vercel function alive
 * for up to `maxDuration` regardless of whether the caller is still
 * listening, so the caller's own timeout no longer matters.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  after(async () => {
    try {
      const results = await refreshAllSummoners(supabase);
      console.log("cron refresh done:", results);
    } catch (err) {
      console.error("cron refresh failed:", err instanceof Error ? err.message : err);
    }

    // Y de paso, cerrar la semana de la liga si terminó. Va acá además de en
    // su propio cron porque la operación es idempotente y este disparador es
    // el que más seguido corre: si el otro se atrasa o se pierde, este la
    // completa. En un día normal no hace nada más que una consulta.
    try {
      const liga = await cerrarSemanasPendientes(supabase);
      if (liga.cerrada) console.log("liga cerrada desde el cron de refresco:", liga);
    } catch (err) {
      console.error("cierre de liga falló:", err instanceof Error ? err.message : err);
    }
  });

  return NextResponse.json({ status: "started" });
}
