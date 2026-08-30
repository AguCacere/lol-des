import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { computeClashPlayerStats, computeClashTournaments, type ClashMatchRow, type ClashPlayerInfo } from "@/lib/clash";
import { getLatestVersion, profileIconUrl } from "@/lib/ddragon";

/**
 * GET /api/clash — every stored Clash-queue match (queue_id = 700, see
 * lib/refresh.ts), grouped into "tournaments" and returned with each
 * tracked player's own stats per game. Fetched lazily by the Clash tab, not
 * part of /api/ladder's payload — Clash data changes maybe a few times a
 * year, no reason to compute it on every ladder poll.
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const [{ data: rows, error: rowsError }, { data: summoners, error: summonersError }, ddragonVersion] =
    await Promise.all([
      supabase
        .from("matches")
        .select(
          "match_id, puuid, champion, win, kills, deaths, assists, cs, cs_per_min, dmg_share, damage_to_champs, vision_score, team_position, game_duration_s, played_at"
        )
        .eq("queue_id", 700)
        .order("played_at", { ascending: true }),
      supabase.from("summoners").select("puuid, game_name, tag_line, profile_icon_id"),
      getLatestVersion(),
    ]);

  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
  if (summonersError) return NextResponse.json({ error: summonersError.message }, { status: 500 });

  const playerByPuuid = new Map<string, ClashPlayerInfo>(
    (summoners ?? []).map((s) => [
      s.puuid as string,
      {
        name: s.game_name as string,
        tag: s.tag_line as string,
        profileIconUrl: s.profile_icon_id != null ? profileIconUrl(ddragonVersion, s.profile_icon_id as number) : null,
      },
    ])
  );

  const typedRows = (rows ?? []) as ClashMatchRow[];
  const tournaments = computeClashTournaments(typedRows, playerByPuuid);
  const playerStats = computeClashPlayerStats(typedRows, playerByPuuid);
  return NextResponse.json({ tournaments, playerStats, ddragonVersion });
}
