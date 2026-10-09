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

For the scheduled workflow in `.github/workflows/ingest.yml`, add the same key as a repository secret named `CFBD_API_KEY` (Settings → Secrets and variables → Actions).

## License

[MIT](LICENSE)
