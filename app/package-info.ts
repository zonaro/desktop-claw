import { bundleID, companyName, productName } from './package.json'
import { getCalendarVersion } from '../script/calendar-version'

export function getProductName() {
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return companyName
}

/**
 * The version of the build currently running.
 *
 * The `version` field in package.json is only a placeholder kept in sync with
 * upstream; the real version is stamped from the build's date and time. See
 * script/calendar-version.ts.
 */
export function getVersion() {
  return getCalendarVersion()
}

export function getSemverCompatibleVersion() {
  // The calendar version is already valid semver, so there's nothing to
  // rewrite unless something upstream of us overrode it.
  return process.env.SEMVER_COMPATIBLE_VERSION || getCalendarVersion()
}

export function getBundleID() {
  return process.env.NODE_ENV === 'development' ? `${bundleID}Dev` : bundleID
}
