export type RoleKey = "top" | "jungle" | "mid" | "adc" | "support";

export type TierKey =
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "emerald"
  | "diamond"
  | "master";

export interface Tier {
  name: string;
  key: TierKey;
  fg: string;
  bg: string;
  rank: number;
}

export interface Match {
  win: boolean;
  champ: string;
  k: number;
  d: number;
  a: number;
  cs: number;
  csmin: string;
  dur: number;
  dmgShare: number;
  /** Raw damage dealt to champions this game — dmgShare is the % of the team's total, this is the actual number behind it. */
  damageToChamps: number;
  gold: number;
  visionScore: number;
  killParticipation: number;
  objShare: number;
  goldTotal: number;
  playedAt: string; // ISO timestamp
  primaryRune: string | null; // keystone, e.g. "Conqueror"
  /** Real Data Dragon icon for `primaryRune` — null if the name lookup failed or the match predates rune tracking. */
  primaryRuneIconUrl: string | null;
  primaryStyle: string | null; // rune tree, e.g. "Precision"
  secondaryStyle: string | null; // e.g. "Domination"
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  champLevel: number;
  damageTaken: number;
  damageMitigated: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWards: number;
  /**
   * Objective participation — kill OR assist, from Riot's `challenges`
   * object. Not the same as the old killing-blow-only turretKills/
   * dragonKills/baronKills stats: those said "you personally landed the
   * final hit", these say "you were there for it". No equivalent field
   * exists for void grubs (Riot doesn't expose a per-grub count).
   */
  turretTakedowns: number;
  dragonTakedowns: number;
  /** monsterSubType per dragon THIS PLAYER personally landed the killing blow on (e.g. ["FIRE_DRAGON"]) — from the match timeline. Narrower than dragonTakedowns (which also counts assists), used only to pick which dragon icons to show. */
  dragonTypes: string[];
  baronTakedowns: number;
  heraldTakedowns: number;
  /** Riot has no participation-based inhibitor stat — this is the only option, and it only counts the killing blow (not assists). */
  inhibitorKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  summoner1: string | null;
  summoner2: string | null;
  /** Real Data Dragon icons for summoner1/summoner2 — null if the name lookup failed or the match predates spell-name tracking. */
  summoner1IconUrl: string | null;
  summoner2IconUrl: string | null;
  soloKills: number | null;
  skillshotsHit: number | null;
  damagePerMin: number | null;
  goldDiff10: number | null;
  goldDiff15: number | null;
  goldDiff20: number | null;
  firstBloodTimeS: number | null;
  firstTowerTimeS: number | null;
  /** Whose team got the first tower of the game — null if there wasn't one (remake) or the match predates this field. */
  firstTowerMine: boolean | null;
  firstDragonTimeS: number | null;
  firstDragonMine: boolean | null;
  firstBaronTimeS: number | null;
  firstBaronMine: boolean | null;
  /** Real purchase order (Match-V5 timeline ITEM_PURCHASED), itemIds in the order actually bought — not reconciled against later sells/undos. Empty on matches stored before this field existed. */
  itemBuild: number[];
  /** "Para repasar" — this match swung hard vs. this player's OWN recent form (see lib/matchflags.ts). Null when nothing stood out, or too few recent matches to trust a baseline yet. */
  flag: MatchFlag | null;
}

/** Why one match got flagged as worth a group look — see lib/matchflags.ts for the thresholds. */
export interface MatchFlag {
  reasons: string[];
}

interface TeamDigestPlayerRef {
  name: string;
  tag: string;
  profileIconUrl: string | null;
}

/** One end of a rank progression — same shape the profile's LP chart labels use. */
interface RankPoint {
  tier: TierKey;
  division: number;
  lp: number;
}

/**
 * "Equipo" tab — a weekly (rolling last 7 days, not calendar Mon-Sun) group
 * digest computed entirely from already-stored matches/lp_snapshots, no new
 * Riot calls. See app/api/team-digest/route.ts. Each highlight is null when
 * nothing in the window qualifies (e.g. nobody gained LP, or zero matches).
 */
export interface TeamDigest {
  windowStart: string; // ISO
  windowEnd: string; // ISO
  biggestLpGain:
    | (TeamDigestPlayerRef & {
        delta: number;
        unit: "LP" | "pts";
        /** rankScore per lp_snapshot this player got THIS week, ascending — feeds a mini sparkline so the card isn't just a bare number next to the others' champion art. */
        lpScores: number[];
        /** Where the week started and ended for them — what "+225 pts" actually bought. */
        from: RankPoint;
        to: RankPoint;
      })
    | null;
  bestKda: (TeamDigestPlayerRef & { champion: string; kda: number; k: number; d: number; a: number }) | null;
  /**
   * The loss judged "most lopsided" — prefers the biggest gold deficit vs.
   * the lane opponent at whichever of @20/@15/@10 is available (in that
   * order) among this week's losses; if NONE of this week's losses have any
   * timeline data, falls back to the single worst KDA among losses instead.
   * k/d/a is always the real box score either way — goldDiffAtEnd/Minute
   * are only set when the gold-diff path was actually used.
   */
  worstLoss:
    | (TeamDigestPlayerRef & {
        champion: string;
        k: number;
        d: number;
        a: number;
        goldDiffAtEnd: number | null;
        goldDiffMinute: 10 | 15 | 20 | null;
      })
    | null;
  mostPlayedChampion:
    | {
        champion: string;
        games: number;
        wins: number;
        /** Every tracked player who played it this week, most games first. */
        players: (TeamDigestPlayerRef & { games: number; wins: number })[];
      }
    | null;
  /** Same 4 highlights, pre-formatted as a plain-text block ready to paste into Discord/WhatsApp. */
  plainText: string;
}

export interface LpHistoryPoint {
  lp: number;
  capturedAt: string; // ISO timestamp
  tier: TierKey;
  division: number;
  wins: number;
  losses: number;
}

/** Highest tier/division/LP combination ever seen in stored history — not necessarily the current one. */
export interface PeakLp {
  tier: TierKey;
  division: number;
  lp: number;
}

/** Latest Flex (RANKED_FLEX_SR) snapshot — null until we've captured at least one, since most players may not queue Flex at all. */
export interface FlexRank {
  tier: TierKey;
  division: number;
  lp: number;
  wins: number;
  losses: number;
}

/**
 * Aggregated over ALL matches stored for this player (not just the last 5
 * shown in the match history) — real data, no estimation. Riot's own
 * Champion Mastery isn't in here: it only gives points/level, not
 * win/loss/KDA, and mixes in normals/ARAM we don't track.
 */
export interface ChampionPoolEntry {
  champ: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKda: number;
  avgCsPerMin: number;
}

/** Spectator V5 snapshot — checked live on every ladder read, never persisted (would be stale instantly). */
export interface LiveGame {
  champion: string;
  queueLabel: string;
  startedMinutesAgo: number;
  /** Riot's own match id for the game in progress and this player's team (100/200) — lets the UI tell two tracked players are in the SAME game together, on the same side, rather than just coincidentally both live right now. */
  gameId: number;
  teamId: number;
}

/** One entry in the Champion Mastery V4 top-5 — Riot's career-wide signal, not derived from our own stored matches. */
export interface MasteryEntry {
  champ: string;
  level: number;
  points: number;
}

/**
 * Two tracked players who showed up as TEAMMATES (same match_id, same win
 * result — Riot doesn't need to tell us teamId for this: within one match
 * a shared win/loss result only happens for players on the same team) in
 * at least one stored match. Computed entirely from data already in
 * `matches`, no extra Riot calls.
 */
/** One game this specific duo shared, with BOTH sides' own champ/KDA — not one player's generic recent match, the actual game they played together. */
export interface DuoSharedMatch {
  matchId: string;
  playedAt: string; // ISO timestamp
  durationS: number;
  /** Shared by construction — a and b are only ever paired as DuoPair when their win result matched (see lib teammate rule below). */
  win: boolean;
  aChamp: string;
  aK: number;
  aD: number;
  aA: number;
  bChamp: string;
  bK: number;
  bD: number;
  bA: number;
}

export interface DuoPair {
  aName: string;
  aTag: string;
  bName: string;
  bTag: string;
  /** Same Summoner-V4 → Data Dragon icon as the profile header avatar — null falls back to initials. */
  aProfileIconUrl: string | null;
  bProfileIconUrl: string | null;
  games: number;
  wins: number;
  winrate: number;
  /** ISO timestamp of the most recent match they shared. */
  lastPlayedAt: string;
  /** Role each one played most often in the matches THEY SHARED specifically — can differ from their overall main role (duo role swaps happen). Null when team_position wasn't available for enough of their shared matches. */
  aRole: RoleKey | null;
  bRole: RoleKey | null;
  /** Each one's own KDA/main champion, computed ONLY from the games they played as teammates — not their overall career average. */
  aAvgKda: number;
  bAvgKda: number;
  aMainChamp: string | null;
  bMainChamp: string | null;
  /** Last 5 games this pair actually shared, most recent first. */
  recentMatches: DuoSharedMatch[];
}

/**
 * One (player, champion) entry in the "Mayor winrate por campeón" leaderboard
 * — real winrate on that specific champion across ALL of that player's
 * stored matches, not just their top-5-by-games champion pool (a champion
 * can clear the leaderboard's games threshold without being in a player's
 * own most-played list, in principle, if they have several champs with even
 * more games each). The same player can appear more than once if they
 * qualify on multiple champions — this is a champion leaderboard, not a
 * per-player one.
 */
export interface ChampionLeaderboardEntry {
  playerName: string;
  playerTag: string;
  profileIconUrl: string | null;
  champion: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKda: number;
}

/**
 * One tracked player's result in one Clash game — always paired with
 * others from the SAME match_id in ClashMatch.players. Carries its own `win`
 * (not a match-level one): two tracked friends can in principle land on
 * opposing Clash teams, and `win` is what actually distinguishes teams here
 * since Clash's teamId isn't stored in `matches`.
 */
export interface ClashMatchPlayer {
  playerName: string;
  playerTag: string;
  profileIconUrl: string | null;
  champion: string;
  win: boolean;
  k: number;
  d: number;
  a: number;
  cs: number;
  csPerMin: string;
  dmgShare: number;
  damageToChamps: number;
  visionScore: number;
  teamPosition: string | null;
}

export interface ClashMatch {
  matchId: string;
  playedAt: string; // ISO timestamp
  durationS: number;
  /** Only the TRACKED players who played this match — Clash rosters can include untracked friends, same convention as everywhere else in this app. */
  players: ClashMatchPlayer[];
}

/** One tracked player's lifetime Clash record — across ALL reconstructed tournaments, not just one day. */
export interface ClashPlayerStats {
  playerName: string;
  playerTag: string;
  profileIconUrl: string | null;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
}

/**
 * One reconstructed "Clash day" for the group — see lib/clash.ts for why
 * this is grouped by calendar date rather than a real Riot tournament id
 * (Clash-V1 has no history endpoint, only "currently registered").
 */
export interface ClashTournament {
  /** Calendar-date cluster key (en-CA, e.g. "2025-06-14") — stable identity for React keys, not shown in the UI. */
  key: string;
  label: string; // "Clash — 14 de junio de 2025"
  matches: ClashMatch[];
  /** Count of unique Clash games played that day (matches.length) — one team game shared by several tracked friends still counts once, not once per player. */
  gamesPlayed: number;
  /** Also per unique game, not per player-appearance — same convention as gamesPlayed. */
  wins: number;
  losses: number;
  winrate: number;
  /** Auto-generated Spanish one-liner: record, MVP of the day, and a callout on a especially good/bad day. */
  conclusion: string;
}

export interface RoleAverages {
  kda: number | null;
  csPerMin: number | null;
  dmgShare: number | null;
  killParticipation: number | null;
  objShare: number | null;
  /** How many peer MATCHES (from anyone tracked, actually played in this role — not "players whose overall role matches") fed the average. 0 means no peer games in this role yet. */
  sampleSize: number;
}

export interface Player {
  name: string;
  tag: string;
  you?: boolean;
  role: RoleKey;
  tierKey: TierKey;
  division: number;
  lp: number;
  wins: number;
  losses: number;
  mainChamp: string;
  /** Real Riot profile icon (Summoner-V4 + Data Dragon), for the profile header avatar — null falls back to champion-initials. */
  profileIconUrl: string | null;
  /** Summoner-V4 account level — same call that already fetches profileIconUrl, no extra Riot cost. Null until the first refresh after this field shipped. */
  summonerLevel: number | null;
  // derived, filled in by app/api/ladder/route.ts
  lpHistory: LpHistoryPoint[];
  peakLp: PeakLp;
  flexRank: FlexRank | null;
  championPool: ChampionPoolEntry[];
  masteryPool: MasteryEntry[];
  liveGame: LiveGame | null;
  matches: Match[];
  winrate: number;
  /**
   * Peer comparison for `role`, computed server-side from every tracked
   * player's REAL per-match team_position — not from "players whose overall
   * declared role also happens to be this one". A player who rotates roles
   * constantly still gets a fair, well-sampled comparison for whichever
   * role they're shown under, pooled from every actual game played in that
   * role by the whole group (this player's own games excluded).
   */
  roleAverages: RoleAverages;
  /**
   * % of this player's own stored matches played in each role (top/jungle/
   * mid/adc/support, always all 5, 0 for one never played), from Match-V5's
   * real team_position — not the single derived `role` label. This is what
   * actually shows someone rotating roles constantly instead of hiding it
   * behind one "main". Empty array means no stored matches with a resolved
   * role yet.
   */
  roleDistribution: { role: RoleKey; pct: number }[];
  /** Best/most-extreme single-game numbers across EVERY stored match (not just the last 5 shown) — null if there are no stored matches yet. */
  personalRecords: PersonalRecords | null;
  /** Inferred "Aegis of Valor" count (Riot exposes nothing about it — see lib/aegis.ts) — null if there isn't enough clean, isolated LP-delta data yet to infer anything. */
  aegisStats: AegisStats | null;
}

/**
 * Riot doesn't expose "Aegis of Valor" (the 2026 double-LP/loss-protection
 * mechanic for good performances in an autofilled role) anywhere in the
 * Match-V5 API — confirmed by scanning full match JSON for any
 * aegis/valor-named field, three times, including a match known to have
 * triggered it. This is a STATISTICAL INFERENCE from lp_snapshots instead:
 * an isolated match's real LP delta compared against this player's own
 * median delta for a win/loss. Never a certainty — always shown as
 * "posible", not confirmed.
 */
export interface AegisStats {
  /** Wins whose isolated LP delta was well above this player's own median win delta. */
  doubleLp: number;
  /** Losses whose isolated LP delta was well above (less negative than) this player's own median loss delta. */
  protectedLosses: number;
  /** How many isolated (unambiguous single-match) windows fed both medians — context for how much to trust the counts above. */
  sampleSize: number;
}

export interface PersonalRecords {
  longestGameMin: number;
  bestKda: number;
  /** Which champion the best-KDA game was on, for a bit of flavor next to the raw number. */
  bestKdaChamp: string;
  /** Longest run of consecutive wins anywhere in stored history — not the CURRENT streak (see currentStreak() in lib/ladder.ts for that). */
  longestWinStreak: number;
  mostKillsSingleGame: number;
  mostDamageSingleGame: number;
  mostCsSingleGame: number;
}
