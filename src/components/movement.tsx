/** Week-over-week rank movement. Green/red are reserved for exactly this. */
export function Movement({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="font-mono text-xs text-accent">NEW</span>;
  }
  if (change === 0) {
    return <span className="font-mono text-muted" aria-label="No change">–</span>;
  }
  const up = change > 0;
  return (
    <span
      className={`font-mono tabular ${up ? "text-up" : "text-down"}`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(change)}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
}
