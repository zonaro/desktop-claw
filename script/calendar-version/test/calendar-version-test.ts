import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as semver from 'semver'

import {
  formatCalendarVersion,
  getDayOfYear,
} from '../../calendar-version'

describe('getDayOfYear', () => {
  it('treats January 1st as day 1', () => {
    assert.equal(getDayOfYear(new Date('2026-01-01T00:00:00Z')), 1)
  })

  it('counts through the year', () => {
    assert.equal(getDayOfYear(new Date('2026-08-13T19:42:00Z')), 225)
    assert.equal(getDayOfYear(new Date('2026-12-31T23:59:00Z')), 365)
  })

  it('accounts for the extra day in a leap year', () => {
    // 2028 is a leap year, so March 1st shifts by one compared to 2026.
    assert.equal(getDayOfYear(new Date('2026-03-01T00:00:00Z')), 60)
    assert.equal(getDayOfYear(new Date('2028-03-01T00:00:00Z')), 61)
    assert.equal(getDayOfYear(new Date('2028-12-31T00:00:00Z')), 366)
  })
})

describe('formatCalendarVersion', () => {
  it('formats as {YY}.{dayOfYear}.{HHMM}', () => {
    assert.equal(
      formatCalendarVersion(new Date('2026-08-13T19:42:00Z')),
      '26.225.1942'
    )
  })

  it('omits padding so the version stays valid semver', () => {
    // 09:05 on day 5 would be '26.005.0905' if padded, which semver rejects.
    assert.equal(
      formatCalendarVersion(new Date('2026-01-05T09:05:00Z')),
      '26.5.905'
    )
  })

  it('uses 0 for midnight', () => {
    assert.equal(
      formatCalendarVersion(new Date('2026-01-01T00:00:00Z')),
      '26.1.0'
    )
  })

  it('reads the date in UTC, not the local timezone', () => {
    // Same instant, written with an offset: still 19:42 UTC on day 225.
    assert.equal(
      formatCalendarVersion(new Date('2026-08-13T16:42:00-03:00')),
      '26.225.1942'
    )
  })

  it('always produces a valid semver version', () => {
    // Walk a leap year in strides that land on many hour/minute combinations,
    // including the padded-looking ones that semver would reject.
    const start = Date.UTC(2028, 0, 1, 0, 0, 0)

    for (let i = 0; i < 2000; i++) {
      const date = new Date(start + i * ((11 * 60 + 7) * 60 * 1000))
      const version = formatCalendarVersion(date)

      assert.ok(
        semver.valid(version) !== null,
        `${date.toISOString()} produced invalid semver: ${version}`
      )
    }
  })

  it('increases as the build time advances', () => {
    const dates = [
      '2026-01-01T00:00:00Z',
      '2026-01-01T09:05:00Z',
      '2026-01-01T19:42:00Z',
      '2026-01-05T00:01:00Z',
      '2026-08-13T19:42:00Z',
      '2026-12-31T23:59:00Z',
      '2027-01-01T00:00:00Z',
    ].map(d => new Date(d))

    for (let i = 1; i < dates.length; i++) {
      const previous = formatCalendarVersion(dates[i - 1])
      const current = formatCalendarVersion(dates[i])

      assert.ok(
        semver.lt(previous, current),
        `expected ${previous} < ${current}`
      )
    }
  })
})
