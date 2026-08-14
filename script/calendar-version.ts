/**
 * Desktop Claw versions are stamped from the build's UTC date and time rather
 * than bumped by hand, in the format `{YY}.{dayOfYear}.{HHMM}`:
 *
 *     2026-08-13 19:42 UTC  ->  26.225.1942
 *     2026-01-05 09:05 UTC  ->  26.5.905
 *
 * Every component is written as a plain number, without padding. Semver
 * forbids leading zeroes in numeric identifiers, and a version that isn't
 * valid semver is rejected by Squirrel, electron-builder and npm alike. The
 * values stay in ascending order regardless: day 5 sorts before day 225, and
 * 09:05 (905) before 19:42 (1942).
 */

/** Milliseconds in a day. */
const MsPerDay = 24 * 60 * 60 * 1000

/**
 * The 1-based day of the year for the given date, in UTC.
 * January 1st is day 1, December 31st is day 365 (366 in a leap year).
 */
export function getDayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const startOfDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )
  return Math.round((startOfDay - startOfYear) / MsPerDay) + 1
}

/**
 * Formats the given date as a calendar version. Always produces a valid semver
 * version, so it can be handed straight to the packaging tools.
 */
export function formatCalendarVersion(date: Date): string {
  const year = date.getUTCFullYear() % 100
  const dayOfYear = getDayOfYear(date)
  const timeOfDay = date.getUTCHours() * 100 + date.getUTCMinutes()

  return `${year}.${dayOfYear}.${timeOfDay}`
}

let cachedVersion: string | undefined

/**
 * The version for the build currently running.
 *
 * CI computes this once and passes it to every job through `APP_VERSION`, so
 * that all platforms in a release share a single version. When that variable
 * isn't set the version is stamped from the current time and then reused for
 * the rest of the process.
 *
 * Note that `build` and `package` run as separate processes. Export
 * `APP_VERSION` when packaging a release locally, otherwise the two steps
 * stamp their own time and disagree if the minute rolls over between them.
 */
export function getCalendarVersion(): string {
  const fromEnvironment = process.env.APP_VERSION

  if (fromEnvironment !== undefined && fromEnvironment.length > 0) {
    return fromEnvironment
  }

  cachedVersion ??= formatCalendarVersion(new Date())

  return cachedVersion
}

// Lets CI (and anyone else) read the version without booting the build:
//
//   yarn version:calendar          (through ts-node)
//   node script/calendar-version.ts  (Node >= 24 strips the types itself, and
//                                     this file has no imports, so it runs
//                                     before dependencies are installed)
//
// Checking argv rather than `require.main`/`import.meta` keeps this working
// whether the file is loaded as CommonJS or as an ES module.
if (process.argv[1]?.endsWith('calendar-version.ts') === true) {
  process.stdout.write(`${getCalendarVersion()}\n`)
}
