import {
  RATING_LABELS,
  RATING_SYSTEMS,
  type CompositeCell,
  type RatingCell,
  type RatingRow,
  type RatingSystem,
} from "@/lib/ratings";

const PREVIEW = 25;

/** Rank change arrow. Green/red are reserved for exactly this. Nothing when unmoved or unknown. */
function Arrow({ change, className = "" }: { change: number | null; className?: string }) {
  if (change === null || change === 0) return null;
  const up = change > 0;
  return (
    <span
      className={`text-[0.65rem] ${up ? "text-up" : "text-down"} ${className}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(change)} from last week`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
}

/**
 * One system's cell. Phones show just the rank (the composite gets the room);
 * sm+ shows the rating with its rank beside it.
 */
function SystemCell({ cell }: { cell: RatingCell | null }) {
  if (!cell) {
    return (
      <td className="py-1.5 pr-2 sm:pr-[5.25rem] text-right font-mono text-muted">
        <span aria-label="Not rated">—</span>
      </td>
    );
  }
  return (
    <td className="py-1.5 pr-2 sm:pr-4 text-right font-mono tabular whitespace-nowrap">
      <span className="hidden sm:inline">{cell.value.toFixed(1)}</span>
      <span className="sm:inline-block sm:w-[4.25rem] sm:pl-2 sm:text-left text-sm sm:text-xs sm:text-muted">
        #{cell.rank}
        <Arrow change={cell.change} className="block sm:inline sm:ml-1 leading-tight" />
      </span>
    </td>
  );
}

function CompositeCellView({ cell }: { cell: CompositeCell | null | undefined }) {
  if (!cell) return <td className="py-1.5 pr-3 text-right font-mono text-muted">—</td>;
  return (
    <td className="py-1.5 pr-3 sm:pr-6 text-right font-mono tabular whitespace-nowrap">
      <span className="font-semibold text-text">{cell.value.toFixed(1)}</span>
      {cell.systems < 3 && (
        <span className="text-muted" title={`Based on ${cell.systems} of 3 systems`}>
          *
        </span>
      )}
      <Arrow change={cell.change} className="block sm:inline sm:ml-1 leading-tight" />
    </td>
  );
}

function Rows({ rows }: { rows: RatingRow[] }) {
  return (
    <tbody>
      {rows.map((r) => (
        <tr key={r.team} className="border-b border-line/60 last:border-0">
          <td className="font-mono tabular text-right py-1.5 pl-3 sm:pl-4 pr-2 sm:pr-3 text-muted">
            {r.composite?.rank ?? "–"}
          </td>
          <td className="py-1.5 pr-2 sm:pr-3">
            {r.team}
            {r.conference && (
              <span className="hidden sm:inline font-mono text-xs text-muted ml-2">{r.conference}</span>
            )}
          </td>
          <CompositeCellView cell={r.composite} />
          {RATING_SYSTEMS.map((s) => (
            <SystemCell key={s} cell={r[s]} />
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** Shared column widths so the preview table and the "show all" table line up. */
function Cols() {
  return (
    <colgroup>
      <col className="w-8 sm:w-12" />
      <col />
      <col className="w-16 sm:w-28" />
      <col className="w-11 sm:w-32" />
      <col className="w-11 sm:w-32" />
      <col className="w-11 sm:w-32" />
    </colgroup>
  );
}

function Head({ missing }: { missing: Set<RatingSystem> }) {
  return (
    <thead>
      <tr className="border-b border-line font-display uppercase tracking-wide text-xs text-muted">
        <th className="py-2 pl-3 sm:pl-4 pr-2 sm:pr-3 text-right font-normal">
          <span className="sr-only">Snap Count rank</span>#
        </th>
        <th className="py-2 pr-2 sm:pr-3 text-left font-normal">Team</th>
        <th className="py-2 pr-3 sm:pr-6 text-right font-normal text-accent">
          <span className="sm:hidden">Snap</span>
          <span className="hidden sm:inline">Snap Count</span>
        </th>
        {RATING_SYSTEMS.map((s) => (
          <th key={s} className="py-2 pr-2 sm:pr-[5.25rem] text-right font-normal">
            {RATING_LABELS[s]}
            {missing.has(s) && <span className="sr-only"> (unavailable)</span>}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function RatingsTable({ rows, missing }: { rows: RatingRow[]; missing: Set<RatingSystem> }) {
  const preview = rows.slice(0, PREVIEW);
  const rest = rows.slice(PREVIEW);

  return (
    <div className="bg-panel border border-line rounded-lg overflow-x-auto">
      <table className="w-full table-fixed text-sm">
        <Cols />
        <Head missing={missing} />
        <Rows rows={preview} />
      </table>
      {rest.length > 0 && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer list-none px-4 py-3 font-display uppercase tracking-wide text-sm text-accent hover:underline">
            <span className="group-open:hidden">Show all {rows.length} FBS teams</span>
            <span className="hidden group-open:inline">Show top {PREVIEW} only</span>
          </summary>
          <table className="w-full table-fixed text-sm border-t border-line">
            <Cols />
            <Rows rows={rest} />
          </table>
        </details>
      )}
    </div>
  );
}
