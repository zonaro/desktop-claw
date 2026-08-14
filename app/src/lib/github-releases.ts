import { IGitHubReleaseInfo } from '../models/github-release'
import { getUserAgent } from './http'
import { gt, valid } from 'semver'

/** The GitHub owner of the repository that hosts Desktop Claw releases. */
export const GitHubReleasesOwner = 'zonaro'

/** The GitHub repository that hosts Desktop Claw releases. */
export const GitHubReleasesRepo = 'desktop-claw'

/** The URL of the Desktop Claw releases page on GitHub. */
export const DesktopClawReleasesUrl = `https://github.com/${GitHubReleasesOwner}/${GitHubReleasesRepo}/releases`

/** The shape of the `releases/latest` response we care about. */
interface IReleaseResponse {
  readonly tag_name?: string
  readonly name?: string
  readonly html_url?: string
  readonly published_at?: string
}

/**
 * Fetches information about the latest published release of Desktop Claw from
 * the GitHub Releases API.
 *
 * Returns `null` if the request fails or the response cannot be parsed.
 */
export async function getLatestGitHubRelease(): Promise<IGitHubReleaseInfo | null> {
  const url = `https://api.github.com/repos/${GitHubReleasesOwner}/${GitHubReleasesRepo}/releases/latest`

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': getUserAgent(),
      },
    })

    if (!response.ok) {
      log.error(
        `Failed to check for updates: ${response.status} ${response.statusText}`
      )
      return null
    }

    const json = (await response.json()) as IReleaseResponse

    const {
      tag_name: tagName,
      html_url: htmlUrl,
      published_at: publishedAt,
    } = json

    if (
      typeof tagName !== 'string' ||
      typeof htmlUrl !== 'string' ||
      typeof publishedAt !== 'string'
    ) {
      log.error('Failed to check for updates: unexpected response shape')
      return null
    }

    const name = json.name

    return {
      tagName,
      name: typeof name === 'string' ? name : tagName,
      htmlUrl,
      publishedAt,
    }
  } catch (e) {
    log.error('Failed to check for updates', e)
    return null
  }
}

/**
 * Removes a leading `v` from a release tag so it can be compared with semver.
 */
function stripVersionPrefix(version: string): string {
  return version.startsWith('v') ? version.substring(1) : version
}

/**
 * Whether the given release tag represents a newer version than the currently
 * installed version of the application.
 */
export function isUpdateAvailable(
  currentVersion: string,
  latestTagName: string
): boolean {
  const current = valid(stripVersionPrefix(currentVersion))
  const latest = valid(stripVersionPrefix(latestTagName))

  if (current === null || latest === null) {
    return false
  }

  return gt(latest, current)
}
