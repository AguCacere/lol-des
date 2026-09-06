import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { refreshAllSummoners } from "@/lib/refresh";
import { exigirSesion } from "@/lib/auth";

// Was 60 — a growing group plus the bounded-concurrency refresh (see
// lib/refresh.ts) still needs headroom; Vercel clamps this to whatever the
// plan actually allows, so it's safe to ask for more than we might get.
export const maxDuration = 300;

/**
 * POST /api/refresh — refresh manual bajo demanda (sin botón en la UI desde
 * que el refresh automático corre cada 15 min vía cron externo, ver
 * app/api/cron/refresh/route.ts). Mismo refresh que el cron, pero solo pega
 * contra Riot para summoners no refrescados en los últimos
 * MANUAL_REFRESH_COOLDOWN_MS (ver lib/refresh.ts) — así invocaciones
 * repetidas no queman la cuota de la key personal.
 */
export async function POST(req: Request) {
  // Cuesta llamadas a Riot, plata o el Discord del grupo: solo los de casa.
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

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
