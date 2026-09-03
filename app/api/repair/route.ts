import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { repairMatches } from "@/lib/refresh";

// Una tanda entra cómoda acá: el ritmo lo pone el rate limit de Riot (ver
// REPAIR_PACE_MS), no la latencia, y el batch por defecto está calculado
// para terminar dentro de esta ventana.
export const maxDuration = 300;

/**
 * POST /api/repair — { batchSize? } → re-pide a Riot las partidas YA
 * guardadas a las que les faltan columnas agregadas después de guardarlas
 * (item_build, gold_diff_*, los takedowns de objetivos, opponent_champion) y
 * las pisa con la fila completa. Ver repairMatches en lib/refresh.ts para el
 * detalle de qué falta y por qué.
 *
 * No es lo mismo que /api/backfill: ese AGREGA partidas que no tenemos y
 * saltea las que ya están; este REPARA las que ya están. Uno no puede hacer
 * el trabajo del otro.
 *
 *   curl -X POST https://.../api/repair -H "Content-Type: application/json" -d '{}'
 *
 * Idempotente y reanudable: llamalo de nuevo mientras la respuesta traiga
 * `remaining > 0`. Cada tanda arranca sola donde quedó la anterior.
 *
 * Requiere la migración de `repaired_at` (ver supabase/schema.sql) corrida
 * antes de la primera llamada — sin esa columna el UPDATE falla.
 */
export async function POST(req: Request) {
  let body: { batchSize?: number } = {};
  try {
    body = (await req.json()) as { batchSize?: number };
  } catch {
    // Sin body es válido: se usa el batch por defecto.
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // A diferencia de /api/backfill, esto NO corre en after(): la respuesta
  // tiene que traer cuánto quedó pendiente, que es lo único que te dice si
  // hace falta volver a llamar. Un "started" y a mirar los logs no sirve
  // para una operación que se hace por tandas.
  try {
    const result = await repairMatches(supabase, body.batchSize);
    console.log("repair:", result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("repair failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
