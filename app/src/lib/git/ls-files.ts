import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Returns the list of all tracked files in the repository, relative to the
 * repository root. Uses `git ls-files` with NUL-separated output so that
 * paths containing spaces or newlines are handled correctly.
 */
export async function getTrackedFiles(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const result = await git(
    ['ls-files', '-z'],
    repository.path,
    'getTrackedFiles'
  )

  return result.stdout.split('\0').filter(f => f.length > 0)
}

/**
 * Returns the list of all files in the working directory (tracked + untracked),
 * relative to the repository root. Includes hidden files.
 */
export async function getAllFiles(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const result = await git(
    ['ls-files', '-z', '--others', '--exclude-standard'],
    repository.path,
    'getAllFiles'
  )

  const untrackedFiles = result.stdout.split('\0').filter(f => f.length > 0)
  const trackedFiles = await getTrackedFiles(repository)

  // Combine and deduplicate
  const allFiles = new Set([...trackedFiles, ...untrackedFiles])
  return Array.from(allFiles).sort()
}
