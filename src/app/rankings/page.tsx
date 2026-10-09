import type { Metadata } from "next";
import { CfbdConfigError, getRankings } from "@/lib/cfbd";
import { buildPollViews, type PollView } from "@/lib/rankings";
import { Movement } from "@/components/movement";

export const metadata: Metadata = { title: "Rankings" };

// Re-render at most every 6 hours; polls change weekly.
export const revalidate = 21600;

const SEASON = Number(process.env.CFBD_SEASON ?? new Date().getFullYear());

export default async function RankingsPage() {
  let views: PollView[] = [];
  let error: string | null = null;

  try {
    views = buildPollViews(await getRankings(SEASON));
  } catch (e) {
    error = e instanceof CfbdConfigError ? e.message : "Couldn't reach CollegeFootballData.com right now.";
    if (!(e instanceof CfbdConfigError)) console.error(e);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-sm text-accent uppercase tracking-widest">{SEASON} season</p>
        <h1 className="font-display uppercase text-4xl sm:text-5xl tracking-tight">Rankings</h1>
        <p className="text-muted max-w-2xl">
          The human polls side by side, with movement from each poll&apos;s previous release. Computer
          ratings and the Snap Count composite are next.
        </p>
      </header>

      {error && (
        <div className="bg-panel border border-line rounded-lg p-5 font-mono text-sm">
          {error}
        </div>
      )}

      {!error && views.length === 0 && (
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
    </div>
  );
}
