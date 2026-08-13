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
