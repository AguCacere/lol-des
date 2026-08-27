import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { refreshAllSummoners } from "@/lib/refresh";

// Was 60 — see app/api/refresh/route.ts for why.
export const maxDuration = 300;

/**
 * GET /api/cron/refresh — pulls fresh LP + match data for every tracked
 * summoner and appends it to Supabase. Scheduled via vercel.json's `crons`;
 * Vercel calls this with `Authorization: Bearer $CRON_SECRET`, checked below
 * (see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
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

  try {
    const results = await refreshAllSummoners(supabase);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo refrescar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
