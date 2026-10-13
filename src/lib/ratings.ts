import type { FpiRating, SpRating, SrsRating } from "./cfbd";

export const RATING_SYSTEMS = ["sp", "fpi", "srs"] as const;
export type RatingSystem = (typeof RATING_SYSTEMS)[number];

export const RATING_LABELS: Record<RatingSystem, string> = {
  sp: "SP+",
  fpi: "FPI",
  srs: "SRS",
};

export type RatingCell = { value: number; rank: number };

export type RatingRow = {
  team: string;
  conference: string | null;
  sp: RatingCell | null;
  fpi: RatingCell | null;
  srs: RatingCell | null;
};

type Raw = { team: string; conference: string | null; value: number };

/**
 * Rank by value, highest first, among the given teams only. Ties share a rank
 * (1, 2, 2, 4). Ranking ourselves keeps all three systems on the same
 * all-FBS scale — CFBD's SRS ranking, for one, also counts FCS teams.
 */
function rank(entries: Raw[]): Map<string, RatingCell> {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const out = new Map<string, RatingCell>();
  sorted.forEach((e, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const r = prev && prev.value === e.value ? out.get(prev.team)!.rank : i + 1;
    out.set(e.team, { value: e.value, rank: r });
  });
  return out;
}

/**
 * Join SP+, FPI and SRS into one row per FBS team. Any source may be null
 * (failed or not yet published) — the others still render.
 *
 * FBS membership comes from SRS's division field plus SP+'s ranked teams
 * (SP+ is FBS-only); FPI is used only if neither is available.
 */
export function buildRatingRows(
  sp: SpRating[] | null,
  fpi: FpiRating[] | null,
  srs: SrsRating[] | null,
): RatingRow[] {
  const spRaw: Raw[] = (sp ?? [])
    .filter((r) => r.ranking !== null && r.team !== "nationalAverages")
    .map((r) => ({ team: r.team, conference: r.conference, value: r.rating }));
  const srsFbs: Raw[] = (srs ?? [])
    .filter((r) => r.division?.toLowerCase() === "fbs")
    .map((r) => ({ team: r.team, conference: r.conference, value: r.rating }));
  const fpiRaw: Raw[] = (fpi ?? [])
    .filter((r): r is FpiRating & { fpi: number } => typeof r.fpi === "number")
    .map((r) => ({ team: r.team, conference: r.conference, value: r.fpi }));

  const conference = new Map<string, string | null>();
  for (const e of [...spRaw, ...srsFbs]) if (!conference.has(e.team)) conference.set(e.team, e.conference);
  if (conference.size === 0) for (const e of fpiRaw) conference.set(e.team, e.conference);

  const isFbs = (e: Raw) => conference.has(e.team);
  const spRank = rank(spRaw.filter(isFbs));
  const fpiRank = rank(fpiRaw.filter(isFbs));
  const srsRank = rank(srsFbs.filter(isFbs));

  const rows: RatingRow[] = [...conference].map(([team, conf]) => ({
    team,
    conference: conf,
    sp: spRank.get(team) ?? null,
    fpi: fpiRank.get(team) ?? null,
    srs: srsRank.get(team) ?? null,
  }));

  // Default order: SP+, then FPI, then SRS, then name. Teams missing a rating sort last.
  const key = (c: RatingCell | null) => c?.rank ?? Number.POSITIVE_INFINITY;
  return rows.sort(
    (a, b) =>
      key(a.sp) - key(b.sp) ||
      key(a.fpi) - key(b.fpi) ||
      key(a.srs) - key(b.srs) ||
      a.team.localeCompare(b.team),
  );
}
