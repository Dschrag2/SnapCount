#!/usr/bin/env node
/**
 * Snap Count data ingestion.
 *
 * Pulls everything CollegeFootballData.com (CFBD) offers for a season, plus
 * ESPN's week-by-week FPI, and writes it under data/<season>/:
 *
 *   season/<name>.json        Season-to-date files, overwritten each run
 *                             (git history keeps every earlier version).
 *   <type>-week-NN/<name>.json  Per-week files. Safe to backfill any past week.
 *                             The latest completed week also gets snapshots of
 *                             SP+, FPI and SRS, which CFBD only serves "as of now".
 *   manifest.json             What was fetched, when, row counts, and failures.
 *
 * Files over 1 MB are gzipped (<name>.json.gz) to keep the repo small.
 *
 * Usage:
 *   node scripts/ingest.mjs                       # latest completed week + season files
 *   node scripts/ingest.mjs --weeks 1-6           # backfill weeks 1–6
 *   node scripts/ingest.mjs --weeks 3,5 --no-season
 *   node scripts/ingest.mjs --season 2026 --season-type postseason --weeks 1
 *   node scripts/ingest.mjs --only fpi-espn,elo --weeks 1-6
 *
 * Env: CFBD_API_KEY (required for CFBD). CFBD_BASE_URL / ESPN_BASE_URL override
 * the hosts (used by tests). MAX_CALLS caps CFBD requests per run (default 250).
 */

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const CFBD_BASE = process.env.CFBD_BASE_URL ?? "https://api.collegefootballdata.com";
const ESPN_BASE =
  process.env.ESPN_BASE_URL ?? "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 250);
const GZIP_OVER_BYTES = 1_000_000;
const DATA_DIR = path.resolve(process.cwd(), "data");

// ── What we pull ──────────────────────────────────────────────────────
// `fbs: true` adds classification=fbs (keeps the heavy per-game files to FBS games).
// `typed: true` passes seasonType. Endpoints marked tier may need a CFBD Patreon
// tier; a 401/403 on those is recorded and skipped, not treated as a failure.

/** Season-level: year only. Overwritten each run. */
const SEASON_ENDPOINTS = [
  { name: "calendar", path: "/calendar" },
  { name: "teams-fbs", path: "/teams/fbs" },
  { name: "games", path: "/games", typed: true, fbs: true },
  { name: "polls", path: "/rankings", typed: true },
  { name: "records", path: "/records" },
  { name: "team-season-stats", path: "/stats/season" },
  { name: "team-season-advanced", path: "/stats/season/advanced" },
  { name: "player-season-stats", path: "/stats/player/season", typed: true },
  { name: "team-ppa", path: "/ppa/teams" },
  { name: "player-ppa-season", path: "/ppa/players/season" },
  { name: "player-success-season", path: "/stats/player/success", typed: true, tier: true },
  { name: "player-usage", path: "/player/usage" },
  { name: "team-ats", path: "/teams/ats" },
  { name: "conference-sp", path: "/ratings/sp/conferences" },
  { name: "ratings-core", path: "/ratings/core", tier: true },
  { name: "wepa-team", path: "/wepa/team/season", tier: true },
  { name: "wepa-passing", path: "/wepa/players/passing", tier: true },
  { name: "wepa-rushing", path: "/wepa/players/rushing", tier: true },
  { name: "wepa-kicking", path: "/wepa/players/kicking", tier: true },
  { name: "recruiting-teams", path: "/recruiting/teams" },
  { name: "recruits", path: "/recruiting/players" },
  { name: "talent", path: "/talent" },
  { name: "returning-production", path: "/player/returning" },
  { name: "transfer-portal", path: "/player/portal" },
  { name: "roster", path: "/roster" },
  { name: "coaches", path: "/coaches" },
];

/** Per-week: year + week + seasonType. Backfillable. */
const WEEK_ENDPOINTS = [
  { name: "team-box", path: "/games/teams", fbs: true },
  { name: "player-box", path: "/games/players", fbs: true },
  { name: "team-advanced", path: "/stats/game/advanced" },
  { name: "team-havoc", path: "/stats/game/havoc" },
  { name: "team-ppa-games", path: "/ppa/games" },
  { name: "player-ppa-games", path: "/ppa/players/games" },
  { name: "player-success-games", path: "/stats/player/success/game", tier: true },
  { name: "team-passing", path: "/passing/teams/games", tier: true },
  { name: "team-rushing", path: "/rushing/teams/games", tier: true },
  { name: "player-passing", path: "/passing/players/games", tier: true },
  { name: "player-rushing", path: "/rushing/players/games", tier: true },
  { name: "drives", path: "/drives", fbs: true },
  { name: "elo", path: "/ratings/elo" },
  { name: "lines", path: "/lines" },
  { name: "pregame-wp", path: "/metrics/wp/pregame" },
  { name: "weather", path: "/games/weather", tier: true },
];

/** "As of now" only — saved into the latest completed week's folder. */
const SNAPSHOT_ENDPOINTS = [
  { name: "sp", path: "/ratings/sp" },
  { name: "fpi-cfbd", path: "/ratings/fpi" },
  { name: "srs", path: "/ratings/srs" },
  { name: "srs-expanded", path: "/ratings/srs/expanded" },
];

// ── CLI ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { weeks: null, season: null, seasonType: null, season_files: true, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--weeks") args.weeks = parseWeeks(next());
    else if (a === "--season") args.season = Number(next());
    else if (a === "--season-type") args.seasonType = next();
    else if (a === "--no-season") args.season_files = false;
    else if (a === "--only") args.only = new Set(next().split(",").map((s) => s.trim()));
    else if (a === "--help" || a === "-h") {
      console.log("See the header of scripts/ingest.mjs for usage.");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.seasonType && !["regular", "postseason"].includes(args.seasonType)) {
    throw new Error("--season-type must be regular or postseason");
  }
  return args;
}

/** "1-6" → [1..6], "3,5,7" → [3,5,7], "" → null */
function parseWeeks(s) {
  if (!s || !s.trim()) return null;
  const out = new Set();
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Bad --weeks value: ${s}`);
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    for (let w = Math.min(a, b); w <= Math.max(a, b); w++) out.add(w);
  }
  return [...out].sort((x, y) => x - y);
}

// ── HTTP ──────────────────────────────────────────────────────────────

let cfbdCalls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    this.status = status;
    this.body = body ?? "";
  }
}

async function getJson(url, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) throw new HttpError(res.status, url, await res.text().catch(() => ""));
    const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** (attempt - 1);
    await sleep(Math.min(wait, 60_000));
  }
}

async function cfbd(pathname, params) {
  if (!process.env.CFBD_API_KEY) throw new Error("CFBD_API_KEY is not set");
  if (cfbdCalls >= MAX_CALLS) throw new Error(`MAX_CALLS (${MAX_CALLS}) reached — stopping to protect the API quota`);
  const url = new URL(pathname, CFBD_BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  cfbdCalls++;
  const data = await getJson(url, { Authorization: `Bearer ${process.env.CFBD_API_KEY}` });
  await sleep(250); // be polite
  return data;
}

// ── Output ────────────────────────────────────────────────────────────

const manifest = { files: {}, runs: [] };
const failures = [];
const skipped = [];

async function loadManifest(season) {
  const p = path.join(DATA_DIR, String(season), "manifest.json");
  if (existsSync(p)) Object.assign(manifest, JSON.parse(await readFile(p, "utf8")));
}

async function save(season, folder, name, data, meta) {
  const dir = path.join(DATA_DIR, String(season), folder);
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify(data);
  const plain = path.join(dir, `${name}.json`);
  const gz = `${plain}.gz`;
  let written;
  if (Buffer.byteLength(json) > GZIP_OVER_BYTES) {
    await writeFile(gz, gzipSync(json, { level: 9 }));
    await rm(plain, { force: true });
    written = gz;
  } else {
    await writeFile(plain, json + "\n");
    await rm(gz, { force: true });
    written = plain;
  }
  const rel = path.relative(path.join(DATA_DIR, String(season)), written);
  manifest.files[rel] = {
    ...meta,
    rows: Array.isArray(data) ? data.length : 1,
    bytes: Buffer.byteLength(json),
    fetchedAt: new Date().toISOString(),
  };
  console.log(`  ✓ ${rel} (${manifest.files[rel].rows} rows)`);
}

/** Run one fetch-and-save; record failures instead of aborting the run. */
async function attempt(label, isTier, fn) {
  try {
    await fn();
  } catch (e) {
    const status = e instanceof HttpError ? e.status : null;
    // CFBD answers 401 "This endpoint requires a Patreon subscription" for paid endpoints.
    const patreon = e instanceof HttpError && /patreon/i.test(e.body);
    if ((isTier || patreon) && (status === 401 || status === 403)) {
      skipped.push({ label, reason: `HTTP ${status} (needs a CFBD Patreon tier)` });
      console.log(`  – ${label}: skipped, HTTP ${status} (tier-gated)`);
    } else {
      failures.push({ label, error: e.message });
      console.error(`  ✗ ${label}: ${e.message}`);
    }
  }
}

// ── ESPN FPI (week by week) ───────────────────────────────────────────

async function fetchEspnFpi(season, seasonType, week, teamNames) {
  const typeId = seasonType === "postseason" ? 3 : 2;
  const base = `${ESPN_BASE}/seasons/${season}/types/${typeId}/weeks/${week}/powerindex`;
  const items = [];
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const body = await getJson(`${base}?limit=200&page=${page}`);
    pages = body.pageCount ?? 1;
    items.push(...(body.items ?? []));
    await sleep(250);
  }
  const unmatched = [];
  const rows = items.map((it) => {
    const teamId = Number(String(it.team?.$ref ?? "").match(/\/teams\/(\d+)/)?.[1]) || null;
    const school = teamId != null ? (teamNames.get(teamId) ?? null) : null;
    if (school === null) unmatched.push(teamId);
    const row = { teamId, school, week, lastUpdated: it.lastUpdated ?? null };
    for (const s of [...(it.predictives ?? []), ...(it.efficiencies ?? [])]) {
      if (s?.name) row[s.name] = typeof s.value === "number" ? s.value : null;
    }
    return row;
  });
  rows.sort((a, b) => (a.fpirank ?? 999) - (b.fpirank ?? 999));
  return { rows, unmatched };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  // Jan–Jul belongs to the previous season (bowls, offseason).
  const season = args.season ?? (now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  const want = (name) => !args.only || args.only.has(name);
  await loadManifest(season);

  console.log(`Snap Count ingest — season ${season}`);

  // Calendar decides which week is "latest completed" and whether we're in the offseason.
  const calendar = await cfbd("/calendar", { year: season });
  const done = calendar
    .filter((w) => new Date(w.lastGameStart ?? w.endDate) < new Date(now.getTime() - 6 * 3600_000))
    .sort((a, b) => new Date(a.lastGameStart ?? a.endDate) - new Date(b.lastGameStart ?? b.endDate));
  const latest = done.at(-1) ?? null;
  const latestType = latest?.seasonType ?? "regular";
  const offseason = !latest || now - new Date(latest.lastGameStart ?? latest.endDate) > 14 * 86400_000;

  const seasonType = args.seasonType ?? (args.weeks ? "regular" : latestType);
  let weeks = args.weeks;
  if (!weeks) {
    weeks = latest && !offseason ? [latest.week] : [];
    if (weeks.length === 0) console.log("No week finished in the last 14 days — refreshing season-level files only.");
  }
  const isLatest = (w) => latest && !offseason && latest.week === w && latestType === seasonType;
  console.log(
    `Latest completed: ${latest ? `${latestType} week ${latest.week}` : "none"} · processing ${seasonType} weeks: ${weeks.join(", ") || "none"}`,
  );

  // Team ID → school name, for ESPN rows. CFBD team IDs are ESPN's IDs.
  let teamNames = new Map();
  await attempt("teams-fbs", false, async () => {
    const teams = await cfbd("/teams/fbs", { year: season });
    teamNames = new Map(teams.map((t) => [t.id, t.school]));
    if (args.season_files && want("teams-fbs")) {
      await save(season, "season", "teams-fbs", teams, { source: "cfbd", endpoint: "/teams/fbs" });
    }
  });

  if (args.season_files) {
    console.log("Season-level files");
    if (want("calendar")) {
      await save(season, "season", "calendar", calendar, { source: "cfbd", endpoint: "/calendar" });
    }
    const postseasonStarted = calendar.some(
      (w) => w.seasonType === "postseason" && new Date(w.firstGameStart ?? w.startDate) < now,
    );
    for (const ep of SEASON_ENDPOINTS) {
      if (ep.name === "calendar" || ep.name === "teams-fbs" || !want(ep.name)) continue;
      const types = ep.typed ? (postseasonStarted ? ["regular", "postseason"] : ["regular"]) : [null];
      for (const t of types) {
        const name = t === "postseason" ? `${ep.name}-postseason` : ep.name;
        const params = { year: season, seasonType: t ?? undefined, classification: ep.fbs ? "fbs" : undefined };
        await attempt(name, ep.tier, async () =>
          save(season, "season", name, await cfbd(ep.path, params), { source: "cfbd", endpoint: ep.path, params }),
        );
      }
    }
  }

  for (const week of weeks) {
    const folder = `${seasonType}-week-${String(week).padStart(2, "0")}`;
    console.log(`${seasonType} week ${week}`);
    for (const ep of WEEK_ENDPOINTS) {
      if (!want(ep.name)) continue;
      const params = { year: season, week, seasonType, classification: ep.fbs ? "fbs" : undefined };
      await attempt(`${folder}/${ep.name}`, ep.tier, async () =>
        save(season, folder, ep.name, await cfbd(ep.path, params), { source: "cfbd", endpoint: ep.path, params }),
      );
    }
    if (want("fpi-espn")) {
      await attempt(`${folder}/fpi-espn`, false, async () => {
        const { rows, unmatched } = await fetchEspnFpi(season, seasonType, week, teamNames);
        if (rows.length === 0) throw new Error("ESPN returned no FPI rows");
        if (unmatched.length) console.log(`  ! ${unmatched.length} ESPN team IDs not in CFBD's FBS list: ${unmatched.join(", ")}`);
        await save(season, folder, "fpi-espn", rows, {
          source: "espn",
          endpoint: `/seasons/${season}/types/${seasonType === "postseason" ? 3 : 2}/weeks/${week}/powerindex`,
          unmatchedTeamIds: unmatched,
        });
      });
    }
    if (isLatest(week)) {
      for (const ep of SNAPSHOT_ENDPOINTS) {
        if (!want(ep.name)) continue;
        await attempt(`${folder}/${ep.name}`, ep.tier, async () =>
          save(season, folder, ep.name, await cfbd(ep.path, { year: season }), {
            source: "cfbd",
            endpoint: ep.path,
            note: "Current ratings as of fetch time; CFBD has no per-week history for this endpoint.",
          }),
        );
      }
    }
  }

  manifest.runs = [
    ...(manifest.runs ?? []).slice(-49),
    {
      at: now.toISOString(),
      seasonType,
      weeks,
      seasonFiles: args.season_files,
      cfbdCalls,
      failures: failures.length,
      skipped: skipped.length,
    },
  ];
  manifest.lastFailures = failures;
  manifest.lastSkipped = skipped;
  await mkdir(path.join(DATA_DIR, String(season)), { recursive: true });
  await writeFile(path.join(DATA_DIR, String(season), "manifest.json"), JSON.stringify(sortKeys(manifest), null, 2) + "\n");

  const summary = [
    `### Snap Count ingest — ${season} ${seasonType}, weeks ${weeks.join(", ") || "none"}`,
    `CFBD calls: **${cfbdCalls}** · failed: **${failures.length}** · skipped (tier-gated): **${skipped.length}**`,
    ...failures.map((f) => `- ✗ \`${f.label}\`: ${f.error}`),
    ...skipped.map((s) => `- – \`${s.label}\`: ${s.reason}`),
  ].join("\n");
  console.log("\n" + summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n", { flag: "a" });

  if (failures.length) process.exitCode = 1;
}

function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === "object") return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  return o;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
