import type { Poll, RankingsWeek } from "./cfbd";

/** The FBS polls we surface in Phase 1, in display order. */
export const FEATURED_POLLS = ["AP Top 25", "Coaches Poll", "Playoff Committee Rankings"] as const;

export type RankRow = {
  rank: number;
  school: string;
  conference: string | null;
  firstPlaceVotes: number | null;
  points: number | null;
  /** Positive = moved up. null = newly ranked this week. */
  change: number | null;
};

export type PollView = { poll: string; week: number; rows: RankRow[] };

/** Latest week for each featured poll, with movement vs. that poll's previous week. */
export function buildPollViews(weeks: RankingsWeek[]): PollView[] {
  const sorted = [...weeks].sort((a, b) => a.week - b.week);
  const views: PollView[] = [];

  for (const name of FEATURED_POLLS) {
    const appearances = sorted
      .map((w) => ({ week: w.week, poll: w.polls.find((p) => p.poll === name) }))
      .filter((x): x is { week: number; poll: Poll } => Boolean(x.poll));
    if (appearances.length === 0) continue;

    const latest = appearances[appearances.length - 1];
    const prev = appearances.length > 1 ? appearances[appearances.length - 2] : null;
    const prevRank = new Map(prev?.poll.ranks.map((r) => [r.school, r.rank]));

    views.push({
      poll: name,
      week: latest.week,
      rows: [...latest.poll.ranks]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => {
          const before = prevRank.get(r.school);
          return { ...r, change: prev ? (before === undefined ? null : before - r.rank) : 0 };
        }),
    });
  }
  return views;
}
