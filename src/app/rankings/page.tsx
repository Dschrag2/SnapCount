import type { Metadata } from "next";
import { getFbsTeams, getPolls, getRatings, latestSeason, weekFolders, type WeekFolder } from "@/lib/data";
import { buildPollViews, type PollView } from "@/lib/rankings";
import { buildRatingRows, RATING_LABELS, RATING_SYSTEMS, withMovement, type RatingRow } from "@/lib/ratings";
import { Movement } from "@/components/movement";
import { RatingsTable } from "@/components/ratings-table";

export const metadata: Metadata = { title: "Rankings" };

// Everything here comes from data/ files written by the weekly ingest
// (scripts/ingest.mjs), so the page renders at build time and costs no API calls.

const weekLabel = (w: WeekFolder) => (w.seasonType === "postseason" ? `bowl week ${w.week}` : `week ${w.week}`);

export default async function RankingsPage() {
  const season = await latestSeason();
  if (season === null) {
    return (
      <p className="text-muted">
        No data yet. Run the <span className="font-mono">Ingest data</span> workflow (or{" "}
        <span className="font-mono">npm run ingest</span>) to pull it.
      </p>
    );
  }

  const [polls, fbs, folders] = await Promise.all([getPolls(season), getFbsTeams(season), weekFolders(season)]);
  const views: PollView[] = polls ? buildPollViews(polls) : [];

  // Ratings: the latest week folder that has any, plus the one before it for movement.
  const withData: { w: WeekFolder; rows: RatingRow[] }[] = [];
  for (const w of [...folders].reverse()) {
    const r = await getRatings(season, w.folder);
    if (!r.sp && !r.fpi && !r.srs) continue;
    withData.push({ w, rows: buildRatingRows(r.sp, r.fpi, r.srs, fbs) });
    if (withData.length === 2) break;
  }
  const ratingsWeek = withData[0]?.w ?? null;
  const prevWeek = withData[1]?.w ?? null;
  const ratings = withData[0] ? withMovement(withData[0].rows, withData[1]?.rows ?? null) : [];
  const missing = new Set(RATING_SYSTEMS.filter((s) => ratings.length > 0 && ratings.every((r) => r[s] === null)));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-sm text-accent uppercase tracking-widest">{season} season</p>
        <h1 className="font-display uppercase text-4xl sm:text-5xl tracking-tight">Rankings</h1>
        <p className="text-muted max-w-2xl">
          The human polls side by side, with movement from each poll&apos;s previous release, then the
          computer ratings for every FBS team. The Snap Count composite is next.
        </p>
      </header>

      {views.length === 0 && <p className="text-muted">No polls in the data for {season} yet.</p>}

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

      {ratingsWeek && (
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-display uppercase text-2xl sm:text-3xl tracking-tight">Computer ratings</h2>
            <p className="text-muted max-w-2xl">
              SP+, ESPN&apos;s FPI and SRS for all FBS teams, ranked among FBS only. Each number is the
              system&apos;s rating, roughly points better than an average team on a neutral field, with its
              rank beside it.
            </p>
            <p className="font-mono text-xs text-muted uppercase tracking-wider">
              After {weekLabel(ratingsWeek)}
              {prevWeek ? ` · arrows show rank change since ${weekLabel(prevWeek)}` : ""}
            </p>
          </div>
          {missing.size > 0 && (
            <p className="font-mono text-sm text-muted">
              {[...missing].map((x) => RATING_LABELS[x]).join(", ")}: not in the data for {weekLabel(ratingsWeek)}.
            </p>
          )}
          <RatingsTable rows={ratings} missing={missing} />
        </section>
      )}
    </div>
  );
}
