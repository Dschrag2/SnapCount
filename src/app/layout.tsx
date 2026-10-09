import type { Metadata } from "next";
import { Oswald, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Snap Count", template: "%s · Snap Count" },
  description: "Every poll. Every rating. Every line. Counted.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${sourceSerif.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10">
          {children}
        </main>
        <footer className="border-t border-line text-muted text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 justify-between">
            <span>Snap Count — an aggregation layer, not a sportsbook.</span>
            <span>
              Data:{" "}
              <a className="text-accent hover:underline" href="https://collegefootballdata.com">
                CollegeFootballData.com
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
