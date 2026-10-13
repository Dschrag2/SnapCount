import { RATING_LABELS, RATING_SYSTEMS, type RatingCell, type RatingRow, type RatingSystem } from "@/lib/ratings";

const PREVIEW = 25;

function Cell({ cell }: { cell: RatingCell | null }) {
  if (!cell) {
    return (
      <td className="py-1.5 pr-3 sm:pr-[3.25rem] text-right font-mono text-muted">
        <span aria-label="Not rated">—</span>
      </td>
    );
  }
  // Phones: rank stacks under the rating so all three systems fit. sm+: rank sits to the right.
  return (
    <td className="py-1.5 pr-3 sm:pr-4 text-right font-mono tabular whitespace-nowrap">
      <span className="block sm:inline">{cell.value.toFixed(1)}</span>
      <span className="block sm:inline-block sm:w-9 text-xs text-muted">#{cell.rank}</span>
    </td>
  );
}

function Rows({ rows, offset = 0 }: { rows: RatingRow[]; offset?: number }) {
  return (
    <tbody>
      {rows.map((r, i) => (
        <tr key={r.team} className="border-b border-line/60 last:border-0">
          <td className="font-mono tabular text-right py-1.5 pl-3 sm:pl-4 pr-2 sm:pr-3 text-muted">{offset + i + 1}</td>
          <td className="py-1.5 pr-3">
            {r.team}
            {r.conference && (
              <span className="hidden sm:inline font-mono text-xs text-muted ml-2">{r.conference}</span>
            )}
          </td>
          <Cell cell={r.sp} />
          <Cell cell={r.fpi} />
          <Cell cell={r.srs} />
        </tr>
      ))}
    </tbody>
  );
}

/** Shared column widths so the preview table and the "show all" table line up. */
function Cols() {
  return (
    <colgroup>
      <col className="w-9 sm:w-12" />
      <col />
      <col className="w-16 sm:w-28" />
      <col className="w-16 sm:w-28" />
      <col className="w-16 sm:w-28" />
    </colgroup>
  );
}

function Head({ missing }: { missing: Set<RatingSystem> }) {
  return (
    <thead>
      <tr className="border-b border-line font-display uppercase tracking-wide text-xs text-muted">
        <th className="py-2 pl-3 sm:pl-4 pr-2 sm:pr-3 text-right font-normal">
          <span className="sr-only">Row</span>#
        </th>
        <th className="py-2 pr-3 text-left font-normal">Team</th>
        {RATING_SYSTEMS.map((s) => (
          <th key={s} className="py-2 pr-3 sm:pr-[3.25rem] text-right font-normal">
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
            <Rows rows={rest} offset={PREVIEW} />
          </table>
        </details>
      )}
    </div>
  );
}
