import type { FpiRating, SpRating, SrsRating } from "./cfbd";

export const RATING_SYSTEMS = ["sp", "fpi", "srs"] as const;
export type RatingSystem = (typeof RATING_SYSTEMS)[number];

export const RATING_LABELS: Record<RatingSystem, string> = {
  sp: "SP+",
  fpi: "FPI",
  srs: "SRS",
};

export type RatingCell = {
  value: number;
  rank: number;
  /** Rank change vs. the previous week's file (positive = moved up). null = no previous data. */
  change: number | null;
};

export type CompositeCell = RatingCell & {
  /** How many of the three systems fed this team's composite. */
  systems: number;
};

export type RatingRow = {
  team: string;
  conference: string | null;
  sp: RatingCell | null;
  fpi: RatingCell | null;
  srs: RatingCell | null;
  /** Snap Count composite — filled in by withComposite(). */
  composite?: CompositeCell | null;
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
    out.set(e.team, { value: e.value, rank: r, change: null });
  });
  return out;
}

/**
 * Join SP+, FPI and SRS into one row per FBS team. Any source may be null
 * (failed or not yet published) — the others still render.
 *
 * Every rank is recomputed among FBS teams only. Pass `fbs` (school → conference,
 * from the saved FBS team list) to decide membership authoritatively; without it,
 * membership is inferred from the ratings themselves.
 */
export function buildRatingRows(
  sp: SpRating[] | null,
  fpi: FpiRating[] | null,
  srs: SrsRating[] | null,
  fbs?: Map<string, string | null> | null,
): RatingRow[] {
  const spRaw: Raw[] = (sp ?? [])
    .filter((r) => r.ranking !== null && r.team !== "nationalAverages")
    .map((r) => ({ team: r.team, conference: r.conference, value: r.rating }));
  const fpiRaw: Raw[] = (fpi ?? [])
    .filter((r): r is FpiRating & { fpi: number } => typeof r.fpi === "number")
    .map((r) => ({ team: r.team, conference: r.conference, value: r.fpi }));
  const srsRaw = (srs ?? []).filter((r) => typeof r.rating === "number");

  // FBS membership: SP+ is FBS-only; FPI stands in if SP+ is missing. SRS also
  // covers FCS, and its `division` field is often null, so an SRS team counts
  // as FBS if it's labeled "fbs" OR already appears in SP+/FPI.
  const conference = new Map<string, string | null>(fbs ?? []);
  if (!fbs?.size) for (const e of spRaw.length ? spRaw : fpiRaw) conference.set(e.team, e.conference);
  for (const r of srsRaw) {
    if (!fbs?.size && r.division?.toLowerCase() === "fbs" && !conference.has(r.team)) {
      conference.set(r.team, r.conference);
    }
  }
  // Last resort (SP+ and FPI both down, SRS unlabeled): take SRS as-is.
  if (conference.size === 0) for (const r of srsRaw) conference.set(r.team, r.conference);

  const isFbs = (e: { team: string }) => conference.has(e.team);
  const spRank = rank(spRaw.filter(isFbs));
  const fpiRank = rank(fpiRaw.filter(isFbs));
  const srsRank = rank(
    srsRaw.filter(isFbs).map((r) => ({ team: r.team, conference: r.conference, value: r.rating })),
  );

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

/**
 * Fill in each cell's week-over-week rank change from the previous week's rows.
 * A system with no previous data keeps change = null (nothing is shown).
 */
export function withMovement(current: RatingRow[], previous: RatingRow[] | null): RatingRow[] {
  if (!previous) return current;
  const prev = new Map(previous.map((r) => [r.team, r]));
  return current.map((row) => {
    const before = prev.get(row.team);
    const out = { ...row };
    for (const s of RATING_SYSTEMS) {
      const now = row[s];
      const then = before?.[s];
      if (now && then) out[s] = { ...now, change: then.rank - now.rank };
    }
    return out;
  });
}

// ── Snap Count composite ──────────────────────────────────────────────

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/**
 * Snap Count composite v1: an equal-weight average of SP+, FPI and SRS.
 *
 * 1. Normalize — turn each system's rating into a z-score across FBS teams
 *    (standard deviations above/below that system's FBS average), so a system
 *    with a wider scale doesn't outweigh the others.
 * 2. Average each team's z-scores over the systems that rated it. A team needs
 *    at least two systems when two or more exist that week.
 * 3. Spread back out — averaging pulls numbers toward zero, so the averages are
 *    rescaled to the systems' typical standard deviation. The result reads like
 *    the inputs: roughly points better than an average FBS team.
 *
 * Kept as one pure function so a trained model can replace it later.
 */
export function withComposite(rows: RatingRow[]): RatingRow[] {
  const present = RATING_SYSTEMS.filter((s) => rows.some((r) => r[s]));
  if (present.length === 0) return rows.map((r) => ({ ...r, composite: null }));
  const minSystems = Math.min(2, present.length);

  const stats = new Map(
    present.map((s) => {
      const vals = rows.flatMap((r) => (r[s] ? [r[s]!.value] : []));
      return [s, { mean: mean(vals), sd: stdev(vals) || 1 }];
    }),
  );

  const avgZ = new Map<string, { z: number; n: number }>();
  for (const r of rows) {
    const zs = present.flatMap((s) => {
      const c = r[s];
      const st = stats.get(s)!;
      return c ? [(c.value - st.mean) / st.sd] : [];
    });
    if (zs.length >= minSystems) avgZ.set(r.team, { z: mean(zs), n: zs.length });
  }

  const zSd = stdev([...avgZ.values()].map((v) => v.z)) || 1;
  const scale = mean(present.map((s) => stats.get(s)!.sd));
  const scored = [...avgZ].map(([team, { z, n }]) => ({ team, value: (z / zSd) * scale, n }));
  const ranks = rank(scored.map((x) => ({ team: x.team, conference: null, value: x.value })));
  const systems = new Map(scored.map((x) => [x.team, x.n]));

  const key = (r: RatingRow) => r.composite?.rank ?? Number.POSITIVE_INFINITY;
  return rows
    .map((r) => {
      const c = ranks.get(r.team);
      return { ...r, composite: c ? { ...c, systems: systems.get(r.team)! } : null };
    })
    .sort((a, b) => key(a) - key(b) || a.team.localeCompare(b.team));
}

/**
 * Composite movement vs. last week — only when last week's composite used the
 * same systems, so a change in inputs isn't shown as a team moving.
 */
export function withCompositeMovement(current: RatingRow[], previous: RatingRow[] | null): RatingRow[] {
  if (!previous) return current;
  const sameInputs = RATING_SYSTEMS.every(
    (s) => current.some((r) => r[s]) === previous.some((r) => r[s]),
  );
  if (!sameInputs) return current;
  const prev = new Map(previous.map((r) => [r.team, r.composite?.rank]));
  return current.map((r) => {
    const before = prev.get(r.team);
    return r.composite && before ? { ...r, composite: { ...r.composite, change: before - r.composite.rank } } : r;
  });
}
