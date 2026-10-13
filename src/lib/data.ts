/**
 * Read the files the ingest pipeline writes to data/<season>/ (see scripts/ingest.mjs).
 * Server-only: uses the filesystem. Pages that call these render at build time,
 * so a deploy after each weekly data commit picks up the new numbers.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import type { FpiRating, RankingsWeek, SpRating, SrsRating } from "./cfbd";

const DATA_DIR = path.join(process.cwd(), "data");

/** Read <name>.json or <name>.json.gz; null if neither exists. */
async function readJson<T>(...parts: string[]): Promise<T | null> {
  const plain = path.join(DATA_DIR, ...parts) + ".json";
  if (existsSync(plain)) return JSON.parse(await readFile(plain, "utf8")) as T;
  const gz = plain + ".gz";
  if (existsSync(gz)) return JSON.parse(gunzipSync(await readFile(gz)).toString("utf8")) as T;
  return null;
}

/** Most recent season with data, unless CFBD_SEASON pins one. */
export async function latestSeason(): Promise<number | null> {
  if (process.env.CFBD_SEASON) return Number(process.env.CFBD_SEASON);
  if (!existsSync(DATA_DIR)) return null;
  const years = (await readdir(DATA_DIR)).filter((d) => /^\d{4}$/.test(d)).map(Number);
  return years.length ? Math.max(...years) : null;
}

export type WeekFolder = { folder: string; seasonType: "regular" | "postseason"; week: number };

/** Week folders in play order: regular weeks, then postseason. */
export async function weekFolders(season: number): Promise<WeekFolder[]> {
  const dir = path.join(DATA_DIR, String(season));
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .map((folder) => {
      const m = folder.match(/^(regular|postseason)-week-(\d+)$/);
      return m ? { folder, seasonType: m[1] as WeekFolder["seasonType"], week: Number(m[2]) } : null;
    })
    .filter((x): x is WeekFolder => x !== null)
    .sort((a, b) => (a.seasonType === b.seasonType ? a.week - b.week : a.seasonType === "regular" ? -1 : 1));
}

export function getPolls(season: number) {
  return readJson<RankingsWeek[]>(String(season), "season", "polls");
}

export async function getFbsTeams(season: number) {
  const teams = await readJson<{ id: number; school: string; conference: string | null }[]>(
    String(season),
    "season",
    "teams-fbs",
  );
  return teams ? new Map(teams.map((t) => [t.school, t.conference])) : null;
}

type EspnFpiRow = { teamId: number | null; school: string | null; fpi: number | null; fpirank: number | null };

export type RatingsSources = { sp: SpRating[] | null; fpi: FpiRating[] | null; srs: SrsRating[] | null };

/**
 * One week's ratings. FPI prefers ESPN's per-week file (true weekly history);
 * CFBD's FPI snapshot is the fallback. SP+ and SRS exist only for weeks the
 * pipeline was running, since CFBD serves them as current values only.
 */
export async function getRatings(season: number, folder: string): Promise<RatingsSources> {
  const s = String(season);
  const [sp, srs, espn, cfbdFpi] = await Promise.all([
    readJson<SpRating[]>(s, folder, "sp"),
    readJson<SrsRating[]>(s, folder, "srs"),
    readJson<EspnFpiRow[]>(s, folder, "fpi-espn"),
    readJson<FpiRating[]>(s, folder, "fpi-cfbd"),
  ]);
  const fpi: FpiRating[] | null = espn
    ? espn
        .filter((r): r is EspnFpiRow & { school: string } => r.school !== null)
        .map((r) => ({ year: season, team: r.school, conference: null, fpi: r.fpi }))
    : cfbdFpi;
  return { sp, fpi, srs };
}
