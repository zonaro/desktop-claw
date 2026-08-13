import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdir, writeFile } from 'fs/promises'
import * as path from 'path'

import { getTrackedFiles } from '../../../src/lib/git/ls-files'
import { createCommit } from '../../../src/lib/git/commit'
import { setupEmptyRepository } from '../../helpers/repositories'
import { getStatusOrThrow } from '../../helpers/status'

describe('git/ls-files', () => {
  describe('getTrackedFiles', () => {
    it('returns the list of tracked files relative to the repo root', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(path.join(repo.path, 'README.md'), '# Hello\n', 'utf8')
      await mkdir(path.join(repo.path, 'src'))
      await writeFile(path.join(repo.path, 'src', 'index.ts'), '// code\n')

      const status = await getStatusOrThrow(repo)
      await createCommit(repo, 'Add files', status.workingDirectory.files)

      const files = await getTrackedFiles(repo)

      assert.deepStrictEqual([...files].sort(), ['README.md', 'src/index.ts'])
    })

    it('returns an empty list for a repository with no tracked files', async t => {
      const repo = await setupEmptyRepository(t)

      const files = await getTrackedFiles(repo)

      assert.deepStrictEqual(files, [])
    })

    it('handles paths containing spaces', async t => {
      const repo = await setupEmptyRepository(t)

      await writeFile(
        path.join(repo.path, 'my file with spaces.txt'),
        'content\n',
        'utf8'
      )

      const status = await getStatusOrThrow(repo)
      await createCommit(
        repo,
        'Add file with spaces',
        status.workingDirectory.files
      )

      const files = await getTrackedFiles(repo)

      assert.deepStrictEqual(files, ['my file with spaces.txt'])
    })
  })
})
