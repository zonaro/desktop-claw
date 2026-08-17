/**
 * The localStorage key used to persist the configured repo directory.
 */
const RepoDirectoryKey = 'repo-directory'

/**
 * Returns the configured repo directory, or null if none has been set.
 *
 * The repo directory is the default location where repositories are cloned
 * and whose subfolders are automatically added to the app when they are
 * Git repositories.
 */
export function getRepoDirectory(): string | null {
  const value = localStorage.getItem(RepoDirectoryKey)
  return value !== null && value.length > 0 ? value : null
}

/**
 * Sets the configured repo directory.
 */
export function setRepoDirectory(path: string): void {
  localStorage.setItem(RepoDirectoryKey, path)
}
