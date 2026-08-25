import { NextResponse } from "next/server";
import { getLadder } from "@/lib/mock-data";

/**
 * GET /api/ladder — returns the group's ladder, sorted by tier/division/LP.
 *
 * TODO(db): this currently returns the deterministic mock data from
 * lib/mock-data.ts. Once supabase/schema.sql is applied and summoners are
 * being tracked, replace the body with:
 *   1. getSupabaseServerClient().from("ladder").select("*")
 *      (the `ladder` view already joins each summoner with its latest
 *      lp_snapshots row — see supabase/schema.sql).
 *   2. Map each row's puuid to a Player-shaped object (see lib/types.ts) —
 *      spark20/matches will come from the `matches` table instead of being
 *      generated.
 * Consider revalidating this route (e.g. `export const revalidate = 60`)
 * once it's backed by real data, so the browser isn't hitting Supabase on
 * every load.
 */
export async function GET() {
  const players = getLadder();
  return NextResponse.json({ players });
}
