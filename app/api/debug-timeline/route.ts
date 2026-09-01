import { NextResponse } from "next/server";
import { getAccountByRiotId, getMatchById, getMatchIdsByPuuid, getMatchTimeline } from "@/lib/riot";

// One-shot diagnostic, round 2 — the first check showed getMatchTimeline()
// throwing a 403 Forbidden on the most recent match. That's odd: 403 (not
// 429) rules out rate limiting, and the SAME key/request already got this
// far via getAccountByRiotId + getMatchIdsByPuuid (also Match-V5). This
// checks 3 recent matches, and for each one calls BOTH getMatchById (known
// to work — that's where champion/kills/etc. come from) and getMatchTimeline
// with the exact same key/matchId, to see whether 403 is universal to the
// timeline endpoint or specific to certain matches. Delete once checked.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName");
  const tagLine = searchParams.get("tagLine");
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Pasá ?gameName=...&tagLine=..." }, { status: 400 });
  }
  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    const matchIds = await getMatchIdsByPuuid(account.puuid, 3);
    const results = [];
    for (const matchId of matchIds) {
      let matchOk = false;
      let matchError: string | null = null;
      try {
        await getMatchById(matchId);
        matchOk = true;
      } catch (err) {
        matchError = err instanceof Error ? err.message : String(err);
      }
      let timelineOk = false;
      let timelineError: string | null = null;
      try {
        await getMatchTimeline(matchId);
        timelineOk = true;
      } catch (err) {
        timelineError = err instanceof Error ? err.message : String(err);
      }
      results.push({ matchId, matchOk, matchError, timelineOk, timelineError });
    }
    return NextResponse.json({ puuid: account.puuid, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
