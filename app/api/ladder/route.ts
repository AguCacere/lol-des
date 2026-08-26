import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { tierScore } from "@/lib/mock-data";
import { divisionFromRiot, normalizeRole, seedFromPuuid, tierKeyFromRiot } from "@/lib/mapping";
import type { Match, Player } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LadderRow {
  puuid: string;
  game_name: string;
  tag_line: string;
  role: string | null;
  main_champ: string | null;
  is_you: boolean;
  tier: string | null;
  division: string | null;
  lp: number | null;
  wins: number | null;
  losses: number | null;
}

interface MatchRow {
  puuid: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  cs_per_min: number;
  dmg_share: number | null;
  gold_earned: number;
  game_duration_s: number;
}

/**
 * GET /api/ladder — reads the `ladder` view (summoners joined with their
 * latest lp_snapshots row, see supabase/schema.sql) plus the last 20 LP
 * snapshots (for the spark chart) and last 5 matches per summoner.
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: ladderRows, error: ladderError } = await supabase
    .from("ladder")
    .select("*")
    .returns<LadderRow[]>();

  if (ladderError) {
    return NextResponse.json({ error: ladderError.message }, { status: 500 });
  }

  const puuids = (ladderRows ?? []).map((r) => r.puuid);
  if (puuids.length === 0) {
    return NextResponse.json({ players: [] });
  }

  const [{ data: snapshots }, { data: matchRows }] = await Promise.all([
    supabase
      .from("lp_snapshots")
      .select("puuid, lp, captured_at")
      .in("puuid", puuids)
      .order("captured_at", { ascending: true }),
    supabase
      .from("matches")
      .select("puuid, champion, win, kills, deaths, assists, cs, cs_per_min, dmg_share, gold_earned, game_duration_s")
      .in("puuid", puuids)
      .order("played_at", { ascending: false })
      .returns<MatchRow[]>(),
  ]);

  const sparkByPuuid = new Map<string, number[]>();
  for (const row of snapshots ?? []) {
    const arr = sparkByPuuid.get(row.puuid) ?? [];
    arr.push(row.lp);
    sparkByPuuid.set(row.puuid, arr);
  }

  const matchesByPuuid = new Map<string, Match[]>();
  for (const row of matchRows ?? []) {
    const arr = matchesByPuuid.get(row.puuid) ?? [];
    if (arr.length >= 5) continue;
    const durationMin = row.game_duration_s / 60;
    arr.push({
      win: row.win,
      champ: row.champion,
      k: row.kills,
      d: row.deaths,
      a: row.assists,
      cs: row.cs,
      csmin: Number(row.cs_per_min).toFixed(1),
      dur: Math.round(durationMin),
      dmgShare: Math.round(Number(row.dmg_share ?? 0)),
      gold: Math.round(row.gold_earned / durationMin),
    });
    matchesByPuuid.set(row.puuid, arr);
  }

  const players: Player[] = (ladderRows ?? []).map((row): Player => {
    const lp = row.lp ?? 0;
    const spark = sparkByPuuid.get(row.puuid) ?? [];
    const spark20 = spark.length >= 2 ? spark.slice(-20) : [lp, lp];
    const matches = matchesByPuuid.get(row.puuid) ?? [];
    const wins = row.wins ?? 0;
    const losses = row.losses ?? 0;
    const seed = seedFromPuuid(row.puuid);

    return {
      name: row.game_name,
      tag: row.tag_line,
      you: row.is_you,
      role: normalizeRole(row.role),
      tierKey: tierKeyFromRiot(row.tier),
      division: divisionFromRiot(row.division),
      lp,
      wins,
      losses,
      seed,
      drift: 0,
      mainChamp: row.main_champ ?? matches[0]?.champ ?? "—",
      spark20,
      matches,
      winrate: wins + losses > 0 ? Math.round((100 * wins) / (wins + losses)) : 0,
    };
  });

  players.sort((a, b) => tierScore(b) - tierScore(a));

  return NextResponse.json({ players });
}
