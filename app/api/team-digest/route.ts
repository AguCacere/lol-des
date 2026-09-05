import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { rankScore, tierFor } from "@/lib/ladder";
import { tierKeyFromRiot, divisionFromRiot } from "@/lib/mapping";
import { profileIconUrl, getLatestVersion } from "@/lib/ddragon";
import { RANKED_SOLO_QUEUE_ID } from "@/lib/refresh";
import type { TeamDigest, TeamDigestResumen } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;

interface SummonerRow {
  puuid: string;
  game_name: string;
  tag_line: string;
  profile_icon_id: number | null;
}

interface MatchRow {
  puuid: string;
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gold_diff_10: number | null;
  gold_diff_15: number | null;
  gold_diff_20: number | null;
  played_at: string;
}

interface LpRow {
  puuid: string;
  tier: string;
  division: string;
  lp: number;
  captured_at: string;
}

/**
 * GET /api/team-digest — "Equipo" tab. Rolling last 7 days (not calendar
 * Mon-Sun — simpler, no timezone/boundary logic, and "last week" reads fine
 * either way), computed entirely from matches/lp_snapshots already in the
 * DB. Zero new Riot calls, unlike everything else the cron does.
 */
export async function GET() {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con Supabase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [summonersRes, matchesRes, lpRes, ddragonVersion] = await Promise.all([
    supabase.from("summoners").select("puuid, game_name, tag_line, profile_icon_id").returns<SummonerRow[]>(),
    supabase
      .from("matches")
      .select("puuid, champion, win, kills, deaths, assists, gold_diff_10, gold_diff_15, gold_diff_20, played_at")
      .eq("queue_id", RANKED_SOLO_QUEUE_ID)
      .gte("played_at", windowStart.toISOString())
      .returns<MatchRow[]>(),
    supabase
      .from("lp_snapshots")
      .select("puuid, tier, division, lp, captured_at")
      .eq("queue_type", "RANKED_SOLO_5x5")
      .gte("captured_at", windowStart.toISOString())
      .order("captured_at", { ascending: true })
      .returns<LpRow[]>(),
    getLatestVersion(),
  ]);

  if (summonersRes.error) return NextResponse.json({ error: summonersRes.error.message }, { status: 500 });
  if (matchesRes.error) return NextResponse.json({ error: matchesRes.error.message }, { status: 500 });
  if (lpRes.error) return NextResponse.json({ error: lpRes.error.message }, { status: 500 });

  const summonerByPuuid = new Map((summonersRes.data ?? []).map((s) => [s.puuid, s]));
  function playerRef(puuid: string) {
    const s = summonerByPuuid.get(puuid);
    return {
      name: s?.game_name ?? "?",
      tag: s?.tag_line ?? "",
      profileIconUrl: s?.profile_icon_id != null ? profileIconUrl(ddragonVersion, s.profile_icon_id) : null,
    };
  }

  // Mayor subida de LP — first vs. last snapshot per puuid WITHIN the
  // window (lpRes is already captured_at ascending, so per-puuid
  // subsequences stay in order). Only a real gain counts; nobody gaining
  // LP this week (a quiet week, or a rough one) just leaves this null.
  const lpByPuuid = new Map<string, LpRow[]>();
  for (const row of lpRes.data ?? []) {
    const arr = lpByPuuid.get(row.puuid) ?? [];
    arr.push(row);
    lpByPuuid.set(row.puuid, arr);
  }
  let biggestLpGain: TeamDigest["biggestLpGain"] = null;
  for (const [puuid, rows] of lpByPuuid) {
    if (rows.length < 2) continue;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const firstScore = rankScore(tierKeyFromRiot(first.tier), divisionFromRiot(first.division), first.lp);
    const lastScore = rankScore(tierKeyFromRiot(last.tier), divisionFromRiot(last.division), last.lp);
    const delta = lastScore - firstScore;
    if (delta <= 0) continue;
    if (biggestLpGain === null || delta > biggestLpGain.delta) {
      const crossedBoundary = first.tier !== last.tier || first.division !== last.division;
      const lpScores = rows.map((r) => rankScore(tierKeyFromRiot(r.tier), divisionFromRiot(r.division), r.lp));
      biggestLpGain = {
        ...playerRef(puuid),
        delta,
        unit: crossedBoundary ? "pts" : "LP",
        lpScores,
        from: { tier: tierKeyFromRiot(first.tier), division: divisionFromRiot(first.division), lp: first.lp },
        to: { tier: tierKeyFromRiot(last.tier), division: divisionFromRiot(last.division), lp: last.lp },
      };
    }
  }

  const matches = matchesRes.data ?? [];

  // Mejor KDA individual de una partida.
  let bestKda: TeamDigest["bestKda"] = null;
  for (const m of matches) {
    const kda = (m.kills + m.assists) / Math.max(1, m.deaths);
    if (bestKda === null || kda > bestKda.kda) {
      bestKda = { ...playerRef(m.puuid), champion: m.champion, kda: Number(kda.toFixed(2)), k: m.kills, d: m.deaths, a: m.assists };
    }
  }

  // Peor derrota — el gold diff más negativo entre las derrotas de la
  // semana (prefiere @20, después @15, después @10, lo último que haya
  // quedado guardado por esa partida puntual), y si NINGUNA derrota de la
  // semana tiene timeline guardado, la que tuvo el peor KDA entre las
  // derrotas en su lugar.
  let worstLoss: TeamDigest["worstLoss"] = null;
  let worstLossGoldDiff = 0; // más negativo = peor, arranca en 0 así cualquier negativo real le gana
  let worstLossKdaFallback: TeamDigest["worstLoss"] = null;
  let worstLossKda = Infinity;
  for (const m of matches) {
    if (m.win) continue;
    const diff = m.gold_diff_20 ?? m.gold_diff_15 ?? m.gold_diff_10 ?? null;
    const minute = m.gold_diff_20 != null ? 20 : m.gold_diff_15 != null ? 15 : m.gold_diff_10 != null ? 10 : null;
    if (diff != null && diff < worstLossGoldDiff) {
      worstLossGoldDiff = diff;
      worstLoss = { ...playerRef(m.puuid), champion: m.champion, k: m.kills, d: m.deaths, a: m.assists, goldDiffAtEnd: diff, goldDiffMinute: minute as 10 | 15 | 20 };
    }
    const kda = (m.kills + m.assists) / Math.max(1, m.deaths);
    if (kda < worstLossKda) {
      worstLossKda = kda;
      worstLossKdaFallback = { ...playerRef(m.puuid), champion: m.champion, k: m.kills, d: m.deaths, a: m.assists, goldDiffAtEnd: null, goldDiffMinute: null };
    }
  }
  if (worstLoss === null) worstLoss = worstLossKdaFallback;

  // Campeón más jugado del grupo esa semana, y quién lo jugó (más partidas primero).
  const champCount = new Map<string, { games: number; wins: number }>();
  for (const m of matches) {
    const agg = champCount.get(m.champion) ?? { games: 0, wins: 0 };
    agg.games += 1;
    agg.wins += m.win ? 1 : 0;
    champCount.set(m.champion, agg);
  }
  let topChampion: { champion: string; games: number; wins: number } | null = null;
  for (const [champion, agg] of champCount) {
    if (topChampion === null || agg.games > topChampion.games) {
      topChampion = { champion, games: agg.games, wins: agg.wins };
    }
  }
  let mostPlayedChampion: TeamDigest["mostPlayedChampion"] = null;
  if (topChampion) {
    const perPuuid = new Map<string, { games: number; wins: number }>();
    for (const m of matches) {
      if (m.champion !== topChampion.champion) continue;
      const agg = perPuuid.get(m.puuid) ?? { games: 0, wins: 0 };
      agg.games += 1;
      agg.wins += m.win ? 1 : 0;
      perPuuid.set(m.puuid, agg);
    }
    const players = [...perPuuid.entries()]
      .map(([puuid, agg]) => ({ ...playerRef(puuid), ...agg }))
      .sort((a, b) => b.games - a.games);
    mostPlayedChampion = { ...topChampion, players };
  }

  // El resumen del grupo. Sale de las mismas dos consultas que ya se hicieron
  // arriba, así que no cuesta nada: es agregar sobre lo que ya está en
  // memoria.
  const partidasVentana = matchesRes.data ?? [];
  const porJugador = new Map<string, number>();
  for (const m of partidasVentana) porJugador.set(m.puuid, (porJugador.get(m.puuid) ?? 0) + 1);
  let masActivo: TeamDigestResumen["masActivo"] = null;
  for (const [puuid, games] of porJugador) {
    if (masActivo === null || games > masActivo.games) masActivo = { ...playerRef(puuid), games };
  }
  // El neto del grupo suma subidas Y bajadas: es la única cifra de la
  // pestaña que dice si la semana fue buena para todos o si uno solo tapó a
  // los demás.
  let lpNeto = 0;
  for (const rows of lpByPuuid.values()) {
    if (rows.length < 2) continue;
    const primero = rows[0];
    const ultimo = rows[rows.length - 1];
    lpNeto +=
      rankScore(tierKeyFromRiot(ultimo.tier), divisionFromRiot(ultimo.division), ultimo.lp) -
      rankScore(tierKeyFromRiot(primero.tier), divisionFromRiot(primero.division), primero.lp);
  }
  const victorias = partidasVentana.filter((m) => m.win).length;
  const resumen: TeamDigestResumen = {
    partidas: partidasVentana.length,
    victorias,
    derrotas: partidasVentana.length - victorias,
    jugadores: porJugador.size,
    lpNeto,
    masActivo,
  };

  const plainText = buildPlainText({ resumen, biggestLpGain, bestKda, worstLoss, mostPlayedChampion });

  const digest: TeamDigest = {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    resumen,
    biggestLpGain,
    bestKda,
    worstLoss,
    mostPlayedChampion,
    plainText,
  };
  // Edge-cached: the underlying data only moves when the ~15-min cron writes,
  // and every friend opening the tab within 5 min gets the same answer — no
  // reason to recompute per visitor. s-maxage is honored by Vercel's CDN even
  // with force-dynamic (that flag only disables Next's own data cache).
  return NextResponse.json(digest, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

function buildPlainText(d: Omit<TeamDigest, "windowStart" | "windowEnd" | "plainText">): string {
  const lines = ["📊 Resumen semanal — Grieta Central"];
  const r = d.resumen;
  if (r.partidas > 0) {
    const wr = Math.round((100 * r.victorias) / r.partidas);
    lines.push(
      `El grupo: ${r.partidas} partidas (${r.victorias}V-${r.derrotas}D, ${wr}%) entre ${r.jugadores} jugadores · ${r.lpNeto >= 0 ? "+" : ""}${r.lpNeto} pts netos`
    );
  }
  if (d.biggestLpGain) {
    const g = d.biggestLpGain;
    const rank = (p: typeof g.from) => `${tierFor(p.tier).name} ${p.division}`;
    // Only worth spelling out when they actually changed division — otherwise
    // it reads "Platino 1 → Platino 1", which says nothing the LP didn't.
    const moved = rank(g.from) !== rank(g.to) ? ` (${rank(g.from)} → ${rank(g.to)})` : "";
    lines.push(`🔺 Mayor subida de LP: ${g.name} +${g.delta} ${g.unit}${moved}`);
  }
  if (d.bestKda) {
    lines.push(`⚔️ Mejor KDA: ${d.bestKda.name} (${d.bestKda.champion}) ${d.bestKda.k}/${d.bestKda.d}/${d.bestKda.a} — ${d.bestKda.kda.toFixed(2)} KDA`);
  }
  if (d.worstLoss) {
    const detail =
      d.worstLoss.goldDiffAtEnd != null
        ? `${d.worstLoss.goldDiffAtEnd.toLocaleString("es-AR")} oro @${d.worstLoss.goldDiffMinute}'`
        : `${d.worstLoss.k}/${d.worstLoss.d}/${d.worstLoss.a}`;
    lines.push(`💀 Peor derrota: ${d.worstLoss.name} (${d.worstLoss.champion}) ${detail}`);
  }
  if (d.mostPlayedChampion) {
    lines.push(
      `🏆 Campeón más jugado: ${d.mostPlayedChampion.champion} (${d.mostPlayedChampion.games} partidas, ${d.mostPlayedChampion.wins}V-${d.mostPlayedChampion.games - d.mostPlayedChampion.wins}D)`
    );
  }
  if (lines.length === 1) lines.push("Sin partidas guardadas esta semana todavía.");
  return lines.join("\n");
}
