import type { Metadata } from "next";
import { CfbdConfigError, getFpiRatings, getRankings, getSpRatings, getSrsRatings } from "@/lib/cfbd";
import { buildPollViews, type PollView } from "@/lib/rankings";
import { buildRatingRows, RATING_LABELS, RATING_SYSTEMS, type RatingRow, type RatingSystem } from "@/lib/ratings";
import { Movement } from "@/components/movement";
import { RatingsTable } from "@/components/ratings-table";

export const metadata: Metadata = { title: "Rankings" };

// Re-render at most every 6 hours; polls change weekly.
export const revalidate = 21600;

const SEASON = Number(process.env.CFBD_SEASON ?? new Date().getFullYear());

export default async function RankingsPage() {
  let views: PollView[] = [];
  let ratings: RatingRow[] = [];
  const missing = new Set<RatingSystem>();
  const empty: RatingSystem[] = [];
  let error: string | null = null;

  // Fetch all four in parallel; one source failing shouldn't blank the page.
  const [polls, sp, fpi, srs] = await Promise.allSettled([
    getRankings(SEASON),
    getSpRatings(SEASON),
    getFpiRatings(SEASON),
    getSrsRatings(SEASON),
  ]);

  const configError = [polls, sp, fpi, srs].find(
    (r) => r.status === "rejected" && r.reason instanceof CfbdConfigError,
  );
  if (configError) {
    error = (configError as PromiseRejectedResult).reason.message;
  } else {
    if (polls.status === "fulfilled") views = buildPollViews(polls.value);
    const ok = <T,>(r: PromiseSettledResult<T>, s: RatingSystem) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`CFBD ${RATING_LABELS[s]} failed`, r.reason);
      missing.add(s);
      return null;
    };
    ratings = buildRatingRows(ok(sp, "sp"), ok(fpi, "fpi"), ok(srs, "srs"));
    // Loaded fine but nothing rated yet (e.g. not published for this season).
    for (const s of RATING_SYSTEMS) {
      if (!missing.has(s) && ratings.length > 0 && ratings.every((r) => r[s] === null)) empty.push(s);
    }
    if (polls.status === "rejected") {
      console.error(polls.reason);
      if (ratings.length === 0) error = "Couldn't reach CollegeFootballData.com right now.";
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-sm text-accent uppercase tracking-widest">{SEASON} season</p>
        <h1 className="font-display uppercase text-4xl sm:text-5xl tracking-tight">Rankings</h1>
        <p className="text-muted max-w-2xl">
          The human polls side by side, with movement from each poll&apos;s previous release, then the
          computer ratings for every FBS team. The Snap Count composite is next.
        </p>
      </header>

      {error && (
        <div className="bg-panel border border-line rounded-lg p-5 font-mono text-sm">
          {error}
        </div>
      )}

      {!error && views.length === 0 && polls.status === "fulfilled" && (
        <p className="text-muted">No polls published for {SEASON} yet.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {views.map((v) => (
          <section key={v.poll} className="bg-panel border border-line rounded-lg overflow-hidden">
            <h2 className="flex items-baseline justify-between px-4 py-3 border-b border-line">
              <span className="font-display uppercase tracking-wide">{v.poll}</span>
              <span className="font-mono text-xs text-muted">WK {v.week}</span>
            </h2>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Change</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.school} className="border-b border-line/60 last:border-0">
                    <td className="font-mono tabular text-right w-10 py-1.5 pl-4 pr-3 text-muted">{r.rank}</td>
                    <td className="py-1.5">
                      {r.school}
                      {r.firstPlaceVotes ? (
                        <span className="font-mono text-xs text-muted ml-1">({r.firstPlaceVotes})</span>
                      ) : null}
                    </td>
                    <td className="w-12 text-right pr-3">
                      <Movement change={r.change} />
                    </td>
                    <td className="font-mono tabular text-right pr-4 text-muted w-16">{r.points ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      {!error && (
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-display uppercase text-2xl sm:text-3xl tracking-tight">Computer ratings</h2>
            <p className="text-muted max-w-2xl">
              SP+, ESPN&apos;s FPI and SRS for all FBS teams, ranked among FBS only. Each number is the
              system&apos;s rating, roughly points better than an average team on a neutral field, with its
              rank beside it.
            </p>
          </div>
          {missing.size > 0 && (
            <p className="font-mono text-sm text-muted">
              {[...missing].map((s) => RATING_LABELS[s]).join(", ")} unavailable right now.
            </p>
          )}
          {empty.length > 0 && (
            <p className="font-mono text-sm text-muted">
              {empty.map((s) => RATING_LABELS[s]).join(", ")}: no {SEASON} ratings published yet.
            </p>
          )}
          {ratings.length > 0 ? (
            <RatingsTable rows={ratings} missing={missing} />
          ) : (
            <p className="text-muted">No computer ratings published for {SEASON} yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
