import Link from "next/link";

const PHASES = [
  {
    n: 1,
    title: "Rankings hub",
    body: "AP, Coaches and CFP polls beside SP+, FPI and SRS for every FBS team, plus a Snap Count composite and week-over-week movement.",
    status: "In progress",
  },
  {
    n: 2,
    title: "Matchups & odds",
    body: "Game cards with spread, total and moneyline, and line-movement charts built from our own polled snapshots.",
    status: "Planned",
  },
  {
    n: 3,
    title: "Stats & recruiting",
    body: "Team and player statistical profiles and recruiting-class pages, tied back to the rankings.",
    status: "Planned",
  },
  {
    n: 4,
    title: "Editorial layer",
    body: "A top-stories feed and opinion pieces alongside the data.",
    status: "Planned",
  },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="space-y-5 pt-6">
        <p className="font-mono text-sm text-accent uppercase tracking-widest">All FBS · Season 2026</p>
        <h1 className="font-display uppercase text-5xl sm:text-7xl leading-none tracking-tight">
          Every poll. Every rating.
          <br />
          Every line. <span className="text-accent">Counted.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Snap Count lines up what the polls, the computers and the markets already say about
          college football — side by side, and how they&apos;ve moved.
        </p>
        <Link
          href="/rankings"
          className="inline-block font-display uppercase tracking-wide bg-accent text-bg px-5 py-3 rounded hover:opacity-90"
        >
          See this week&apos;s rankings
        </Link>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-2xl mb-6">Roadmap</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {PHASES.map((p) => (
            <li key={p.n} className="bg-panel rounded-lg p-5 border border-line">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-display uppercase tracking-wide text-lg">
                  <span className="font-mono text-accent mr-2">0{p.n}</span>
                  {p.title}
                </span>
                <span className="font-mono text-xs text-muted uppercase">{p.status}</span>
              </div>
              <p className="text-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
