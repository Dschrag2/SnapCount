# Snap Count

**Every poll. Every rating. Every line. Counted.**

Snap Count is a single, opinionated aggregation layer over public college football rankings, ratings, recruiting, stats and betting odds — for all of FBS. It counts what existing rankings and markets already say, side by side, and how they've moved. It is not a sportsbook or a tipster.

## Roadmap

1. **Rankings hub** — AP / Coaches / CFP polls, SP+ / FPI / SRS, a Snap Count composite, week-over-week movement *(in progress)*
2. **Matchups & odds** — spreads, totals, moneylines and line-movement history
3. **Stats & recruiting** — team/player profiles and recruiting classes
4. **Editorial layer** — top stories and opinion

## Stack

Next.js (App Router) + Tailwind CSS · Postgres via Supabase · scheduled GitHub Actions for ingestion · Vercel hosting. Data from [CollegeFootballData.com](https://collegefootballdata.com).

## Getting started

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then paste your free CFBD key
npm run dev                  # http://localhost:3000
```

Get a free CFBD API key at <https://collegefootballdata.com/key>.

## Data pipeline

`scripts/ingest.mjs` pulls everything CollegeFootballData.com offers for the season — polls, games, team and player box scores, advanced and havoc stats, PPA, drives, Elo, betting lines, pregame win probabilities, recruiting, rosters, transfer portal and more — plus ESPN's week-by-week FPI. It writes to `data/<season>/`:

| Folder | What's in it |
|---|---|
| `season/` | Season-to-date files, overwritten each run (git history keeps earlier versions) |
| `regular-week-NN/` | One week's games and stats. The latest week also gets SP+, FPI and SRS snapshots, which CFBD only serves as current values |
| `manifest.json` | What was fetched, when, row counts, and anything that failed |

Files over 1 MB are gzipped (`.json.gz`).

The **Ingest data** GitHub Action runs it every Monday morning and commits the results. To backfill or re-pull weeks, run it from the Actions tab with **Run workflow** and a week range like `1-6`. It needs your CFBD key as a repository secret named `CFBD_API_KEY` (Settings → Secrets and variables → Actions).

Locally: `CFBD_API_KEY=... npm run ingest -- --weeks 1-6`.

A weekly run uses about 45 CFBD calls; a backfill of six weeks about 130. The free tier allows 1,000 a month. Some endpoints (WEPA, core ratings, player success rates, passing/rushing splits) may need a CFBD Patreon tier — those are skipped and listed in the run summary rather than failing it.

## License

[MIT](LICENSE)
