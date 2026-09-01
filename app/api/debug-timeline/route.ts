import { NextResponse } from "next/server";
import { getAccountByRiotId, getMatchIdsByPuuid, getMatchTimeline } from "@/lib/riot";

// One-shot diagnostic — item_build/dragon_types/gold_diff_* have been empty
// on EVERY stored match (confirmed via a direct DB query), which only
// happens if getMatchTimeline() is throwing every single time (it's wrapped
// in a try/catch in lib/refresh.ts that silently swallows the error so the
// rest of the match still gets saved). This calls it directly for the most
// recent ranked match and reports the real error instead of swallowing it.
// Delete once checked.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName");
  const tagLine = searchParams.get("tagLine");
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Pasá ?gameName=...&tagLine=..." }, { status: 400 });
  }
  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    const [matchId] = await getMatchIdsByPuuid(account.puuid, 1);
    if (!matchId) return NextResponse.json({ error: "Sin partidas ranked recientes" }, { status: 404 });
    try {
      const timeline = await getMatchTimeline(matchId);
      return NextResponse.json({
        matchId,
        ok: true,
        frameCount: timeline.info.frames.length,
        eventTypeSample: timeline.info.frames.flatMap((f) => f.events.map((e) => e.type)).slice(0, 20),
      });
    } catch (timelineErr) {
      return NextResponse.json({
        matchId,
        ok: false,
        error: timelineErr instanceof Error ? timelineErr.message : String(timelineErr),
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
