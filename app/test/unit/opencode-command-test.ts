import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import * as Path from 'path'

import {
  getOpenCodeSearchDirectories,
  isExplicitPath,
  resolveOpenCodeCommand,
} from '../../src/main-process/opencode-command'

describe('isExplicitPath', () => {
  it('recognises absolute and relative paths', () => {
    assert.equal(isExplicitPath('/home/me/.opencode/bin/opencode'), true)
    assert.equal(isExplicitPath('./opencode'), true)
    assert.equal(isExplicitPath('bin/opencode'), true)
  })

  it('treats a bare binary name as a lookup', () => {
    assert.equal(isExplicitPath('opencode'), false)
    assert.equal(isExplicitPath('opencode-nightly'), false)
  })
})

describe('getOpenCodeSearchDirectories', () => {
  it('puts PATH entries before the well-known directories', () => {
    const directories = getOpenCodeSearchDirectories({
      PATH: ['/first', '/second'].join(Path.delimiter),
    })

    assert.equal(directories[0], '/first')
    assert.equal(directories[1], '/second')
    assert.ok(
      directories.includes(Path.join(homedir(), '.opencode', 'bin')),
      'the installer directory should be searched as a fallback'
    )
  })

  it('still searches the well-known directories with an empty PATH', () => {
    const directories = getOpenCodeSearchDirectories({ PATH: '' })

    assert.ok(directories.includes(Path.join(homedir(), '.opencode', 'bin')))
  })

  it('drops empty segments and duplicates', () => {
    const directories = getOpenCodeSearchDirectories({
      PATH: ['/dup', '', '/dup', '/other'].join(Path.delimiter),
    })

    assert.deepStrictEqual(directories.slice(0, 2), ['/dup', '/other'])
  })
})

describe('resolveOpenCodeCommand', () => {
  let directory: string
  let executablePath: string

  before(async () => {
    directory = await mkdtemp(Path.join(tmpdir(), 'opencode-command-test-'))
    executablePath = Path.join(directory, 'opencode')

    await writeFile(executablePath, '#!/bin/sh\nexit 0\n')
    await chmod(executablePath, 0o755)
  })

  after(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('resolves a bare command against PATH', async () => {
    const resolved = await resolveOpenCodeCommand('opencode', {
      PATH: directory,
    })

    assert.equal(resolved, executablePath)
  })

  it('leaves an explicit path untouched', async () => {
    const resolved = await resolveOpenCodeCommand('/opt/custom/opencode', {
      PATH: directory,
    })

    assert.equal(resolved, '/opt/custom/opencode')
  })

  it('returns the command unchanged when nothing matches, so the spawn error names it', async () => {
    const resolved = await resolveOpenCodeCommand('opencode-does-not-exist', {
      PATH: directory,
    })

    assert.equal(resolved, 'opencode-does-not-exist')
  })

  it('ignores a non-executable file of the same name', async () => {
    const otherDirectory = await mkdtemp(
      Path.join(tmpdir(), 'opencode-command-test-noexec-')
    )

    try {
      await writeFile(Path.join(otherDirectory, 'opencode'), 'not executable')
      await chmod(Path.join(otherDirectory, 'opencode'), 0o644)

      // The non-executable directory comes first, so a match there would win
      // if the execute bit weren't checked.
      const resolved = await resolveOpenCodeCommand('opencode', {
        PATH: [otherDirectory, directory].join(Path.delimiter),
      })

      assert.equal(resolved, executablePath)
    } finally {
      await rm(otherDirectory, { recursive: true, force: true })
    }
  })

  it('passes an empty command through', async () => {
    assert.equal(await resolveOpenCodeCommand('', { PATH: directory }), '')
  })
})
