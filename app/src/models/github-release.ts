/**
 * Information about a release of Desktop Claw published on GitHub.
 */
export interface IGitHubReleaseInfo {
  /** The tag of the release, e.g. `v26.225.1942`. */
  readonly tagName: string

  /** The display name of the release. */
  readonly name: string

  /** The URL of the release page on GitHub. */
  readonly htmlUrl: string

  /** The ISO 8601 date the release was published. */
  readonly publishedAt: string
}
