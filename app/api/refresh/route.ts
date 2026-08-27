import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { refreshAllSummoners } from "@/lib/refresh";

// Was 60 — a growing group plus the bounded-concurrency refresh (see
// lib/refresh.ts) still needs headroom; Vercel clamps this to whatever the
// plan actually allows, so it's safe to ask for more than we might get.
export const maxDuration = 300;

/**
 * POST /api/refresh — "Actualizar ahora" en la UI. Mismo refresh que el cron
 * diario, pero solo pega contra Riot para summoners no refrescados en los
 * últimos MANUAL_REFRESH_COOLDOWN_MS (ver lib/refresh.ts) — así clicks
 * repetidos, o varios del grupo apretando a la vez, no queman la cuota de
 * la key personal.
 */
export async function POST() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const results = await refreshAllSummoners(supabase, { onlyStale: true });
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo actualizar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
