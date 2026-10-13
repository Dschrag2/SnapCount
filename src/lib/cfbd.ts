/**
 * Minimal CollegeFootballData.com (CFBD) client.
 * Docs: https://apinext.collegefootballdata.com
 *
 * Free tier is 1,000 calls/month, so every request is cached by Next's
 * fetch cache. Rankings only change weekly — revalidating every 6 hours
 * keeps us far below the cap even with traffic.
 */

const BASE_URL = "https://api.collegefootballdata.com";
const SIX_HOURS = 60 * 60 * 6;

export class CfbdConfigError extends Error {}

async function cfbd<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const key = process.env.CFBD_API_KEY;
  if (!key) {
    throw new CfbdConfigError("CFBD_API_KEY is not set. Copy .env.example to .env.local and add your key.");
  }

  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    next: { revalidate: SIX_HOURS, tags: ["cfbd"] },
  });
  if (!res.ok) {
    throw new Error(`CFBD ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────

export type PollRank = {
  rank: number;
  school: string;
  conference: string | null;
  firstPlaceVotes: number | null;
  points: number | null;
};

export type Poll = { poll: string; ranks: PollRank[] };

export type RankingsWeek = {
  season: number;
  seasonType: string;
  week: number;
  polls: Poll[];
};

/** SP+ (Bill Connelly). Includes a `nationalAverages` row with a null ranking. */
export type SpRating = {
  year: number;
  team: string;
  conference: string | null;
  rating: number;
  ranking: number | null;
};

/** ESPN Football Power Index. */
export type FpiRating = {
  year: number;
  team: string;
  conference: string | null;
  fpi: number | null;
  resumeRanks?: { fpi: number | null } | null;
};

/** Simple Rating System (margin of victory adjusted for schedule). Covers FBS and FCS. */
export type SrsRating = {
  year: number;
  team: string;
  conference: string | null;
  division: string | null;
  rating: number;
  ranking: number | null;
};

// ── Endpoints ─────────────────────────────────────────────────────────

export function getSpRatings(year: number) {
  return cfbd<SpRating[]>("/ratings/sp", { year });
}

export function getFpiRatings(year: number) {
  return cfbd<FpiRating[]>("/ratings/fpi", { year });
}

export function getSrsRatings(year: number) {
  return cfbd<SrsRating[]>("/ratings/srs", { year });
}

/** All poll weeks for a season (AP, Coaches, CFP, FCS, …). */
export function getRankings(year: number, seasonType: "regular" | "postseason" = "regular") {
  return cfbd<RankingsWeek[]>("/rankings", { year, seasonType });
}
