import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getLiveGamesByPuuid } from "@/lib/live";
import type { LiveGame } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/live — Spectator V5 status for every tracked summoner, keyed by
 * "Name#TAG" (matches playerKey() client-side). A deliberately light sibling
 * of /api/ladder: app/page.tsx polls this every 60s to catch a friend
 * starting a game mid-session, without re-fetching and re-aggregating the
 * whole ladder (matches, LP history, mastery, duo synergy...) just to update
 * one small banner.
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: summoners, error } = await supabase.from("summoners").select("puuid, game_name, tag_line");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const puuids = (summoners ?? []).map((s) => s.puuid);
  const liveGameByPuuid = await getLiveGamesByPuuid(puuids);

  const live: Record<string, LiveGame> = {};
  for (const s of summoners ?? []) {
    const game = liveGameByPuuid.get(s.puuid);
    if (game) live[`${s.game_name}#${s.tag_line}`] = game;
  }

  return NextResponse.json({ live });
}
