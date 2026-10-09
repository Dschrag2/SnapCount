import Link from "next/link";

const NAV = [
  { href: "/rankings", label: "Rankings", live: true },
  { href: "#", label: "Matchups", live: false },
  { href: "#", label: "Stats", live: false },
  { href: "#", label: "Recruiting", live: false },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="font-display uppercase tracking-wider text-xl">
          Snap<span className="text-accent">Count</span>
        </Link>
        <nav className="flex gap-5 font-display uppercase tracking-wide text-sm">
          {NAV.map((item) =>
            item.live ? (
              <Link key={item.label} href={item.href} className="hover:text-accent">
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className="text-muted/60 hidden sm:inline" title="Coming soon">
                {item.label}
              </span>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
