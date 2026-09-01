import { NextResponse } from "next/server";
import { getAccountByRiotId, getMatchById, getMatchIdsByPuuid } from "@/lib/riot";

// One-shot diagnostic — dump the raw `challenges` object (not just the small
// subset RiotParticipant currently types) plus the base turretKills/
// dragonKills/baronKills/inhibitorKills for a few recent ranked matches, to
// find the real participation-based field names (e.g. dragonTakedowns,
// riftHeraldTakedowns, hordeTakedowns for void grubs) — the base stats only
// count the killing blow, not participation. Delete once checked.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameName = searchParams.get("gameName");
  const tagLine = searchParams.get("tagLine");
  const count = Number(searchParams.get("count") ?? "3");
  if (!gameName || !tagLine) {
    return NextResponse.json({ error: "Pasá ?gameName=...&tagLine=..." }, { status: 400 });
  }
  try {
    const account = await getAccountByRiotId(gameName, tagLine);
    const matchIds = await getMatchIdsByPuuid(account.puuid, count);
    const results = [];
    for (const matchId of matchIds) {
      const match = await getMatchById(matchId);
      const me = match.info.participants.find((p) => p.puuid === account.puuid);
      if (!me) continue;
      results.push({
        matchId,
        win: me.win,
        teamPosition: me.teamPosition,
        baseStats: {
          turretKills: me.turretKills,
          dragonKills: me.dragonKills,
          baronKills: me.baronKills,
          inhibitorKills: me.inhibitorKills,
        },
        challenges: me.challenges,
      });
    }
    return NextResponse.json({ puuid: account.puuid, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
