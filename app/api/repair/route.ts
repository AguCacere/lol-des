import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { repairMatches } from "@/lib/refresh";
import { exigirSesion } from "@/lib/auth";

// 300 es lo que este endpoint PIDE, no lo que necesariamente obtiene: un
// plan que no lo sostenga lo recorta en silencio y Vercel corta la función
// con un 504 antes de este número (visto en producción). El batch por
// defecto (REPAIR_DEFAULT_BATCH, ver lib/refresh.ts) ya está calculado para
// entrar aun si el límite real es bastante más bajo que esto.
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
 * Si tira 504 (Gateway Timeout, con un body que no es JSON): el plan cortó
 * la función antes de que la tanda terminara. Lo ya reparado hasta ese punto
 * quedó guardado igual — cada fila se escribe apenas se repara, no al final
 * de la tanda — así que no hay nada que deshacer, solo llamar nuevo con un
 * batchSize más chico: { "batchSize": 8 }.
 *
 * Requiere la migración de `repaired_at` (ver supabase/schema.sql) corrida
 * antes de la primera llamada — sin esa columna el UPDATE falla.
 */
export async function POST(req: Request) {
  // Cuesta llamadas a Riot, plata o el Discord del grupo: solo los de casa.
  const cerrado = exigirSesion(req);
  if (cerrado) return cerrado;

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
