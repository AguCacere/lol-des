import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { tierScore } from "@/lib/mock-data";
import { divisionFromRiot, normalizeRole, roleFromTeamPosition, seedFromPuuid, tierKeyFromRiot } from "@/lib/mapping";
import type { RoleKey } from "@/lib/types";
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
  vision_score: number;
  kill_participation: number | null;
  obj_share: number | null;
  primary_rune: string | null;
  primary_style: string | null;
  secondary_style: string | null;
  double_kills: number | null;
  triple_kills: number | null;
  quadra_kills: number | null;
  penta_kills: number | null;
  team_position: string | null;
  game_duration_s: number;
  played_at: string;
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
      .select(
        "puuid, champion, win, kills, deaths, assists, cs, cs_per_min, dmg_share, gold_earned, vision_score, kill_participation, obj_share, primary_rune, primary_style, secondary_style, double_kills, triple_kills, quadra_kills, penta_kills, team_position, game_duration_s, played_at"
      )
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
  // Champion / role frequency across ALL stored matches (not just the last 5
  // shown) — used as the "most played" fallback when main_champ/role aren't
  // set manually. `summoners.role` has no UI to set it yet, so in practice
  // this IS the role source — team_position comes straight from Riot.
  const champFreqByPuuid = new Map<string, Map<string, number>>();
  const roleFreqByPuuid = new Map<string, Map<RoleKey, number>>();
  for (const row of matchRows ?? []) {
    const freq = champFreqByPuuid.get(row.puuid) ?? new Map<string, number>();
    freq.set(row.champion, (freq.get(row.champion) ?? 0) + 1);
    champFreqByPuuid.set(row.puuid, freq);

    const role = roleFromTeamPosition(row.team_position);
    if (role) {
      const roleFreq = roleFreqByPuuid.get(row.puuid) ?? new Map<RoleKey, number>();
      roleFreq.set(role, (roleFreq.get(role) ?? 0) + 1);
      roleFreqByPuuid.set(row.puuid, roleFreq);
    }

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
      goldTotal: row.gold_earned,
      visionScore: row.vision_score,
      killParticipation: Math.round(Number(row.kill_participation ?? 0)),
      objShare: Math.round(Number(row.obj_share ?? 0)),
      playedAt: row.played_at,
      primaryRune: row.primary_rune,
      primaryStyle: row.primary_style,
      secondaryStyle: row.secondary_style,
      doubleKills: row.double_kills ?? 0,
      tripleKills: row.triple_kills ?? 0,
      quadraKills: row.quadra_kills ?? 0,
      pentaKills: row.penta_kills ?? 0,
    });
    matchesByPuuid.set(row.puuid, arr);
  }

  function mostPlayedChamp(puuid: string): string | null {
    const freq = champFreqByPuuid.get(puuid);
    if (!freq) return null;
    let best: string | null = null;
    let bestCount = 0;
    for (const [champ, count] of freq) {
      if (count > bestCount) {
        best = champ;
        bestCount = count;
      }
    }
    return best;
  }

  function mostPlayedRole(puuid: string): RoleKey | null {
    const freq = roleFreqByPuuid.get(puuid);
    if (!freq) return null;
    let best: RoleKey | null = null;
    let bestCount = 0;
    for (const [role, count] of freq) {
      if (count > bestCount) {
        best = role;
        bestCount = count;
      }
    }
    return best;
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
      role: row.role ? normalizeRole(row.role) : mostPlayedRole(row.puuid) ?? "mid",
      tierKey: tierKeyFromRiot(row.tier),
      division: divisionFromRiot(row.division),
      lp,
      wins,
      losses,
      seed,
      drift: 0,
      mainChamp: row.main_champ ?? mostPlayedChamp(row.puuid) ?? "—",
      spark20,
      matches,
      winrate: wins + losses > 0 ? Math.round((100 * wins) / (wins + losses)) : 0,
    };
  });

  players.sort((a, b) => tierScore(b) - tierScore(a));

  return NextResponse.json({ players });
}
