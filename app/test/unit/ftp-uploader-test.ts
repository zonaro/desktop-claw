import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as Fs from 'fs/promises'
import * as Os from 'os'
import * as Path from 'path'

import { FTPError } from 'basic-ftp'
import {
  buildFtpUploadFileList,
  mapFtpError,
} from '../../src/lib/ftp/ftp-uploader'

/**
 * Creates a temporary directory under the OS tmp directory. The caller must
 * clean up the returned path when done.
 */
async function makeTempDir(): Promise<string> {
  return await Fs.mkdtemp(Path.join(Os.tmpdir(), 'ftp-upload-test-'))
}

/**
 * Recursively creates files from a map of `{ relativePath: content }` inside
 * the given root directory. Intermediate directories are created as needed.
 */
async function createFiles(
  root: string,
  files: Record<string, string>
): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = Path.join(root, relPath)
    await Fs.mkdir(Path.dirname(absPath), { recursive: true })
    await Fs.writeFile(absPath, content)
  }
}

describe('buildFtpUploadFileList', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await Fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('returns sorted repo-relative posix paths for a nested directory tree', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      'src/index.ts': 'content',
      'src/lib/utils.ts': 'content',
      'README.md': 'content',
      'deep/nested/file.txt': 'content',
    })

    const files = await buildFtpUploadFileList(tempDir, [])

    assert.deepStrictEqual(files, [
      'README.md',
      'deep/nested/file.txt',
      'src/index.ts',
      'src/lib/utils.ts',
    ])
  })

  it('always excludes .git directory', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      '.git/config': 'config',
      '.git/objects/x': 'object data',
      'src/main.ts': 'content',
      'README.md': 'content',
    })

    const files = await buildFtpUploadFileList(tempDir, [])

    assert.deepStrictEqual(files, ['README.md', 'src/main.ts'])
  })

  it('skips symlinks (file and directory)', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      'src/main.ts': 'content',
      'subdir/real.txt': 'real content',
      'README.md': 'content',
    })

    let symlinkCreated = false
    try {
      await Fs.symlink(
        Path.join(tempDir, 'src/main.ts'),
        Path.join(tempDir, 'link-to-file.ts')
      )
      await Fs.symlink(
        Path.join(tempDir, 'subdir'),
        Path.join(tempDir, 'link-to-dir')
      )
      symlinkCreated = true
    } catch {
      // Symlinks may require privileges on some platforms; skip assertions
    }

    const files = await buildFtpUploadFileList(tempDir, [])

    if (symlinkCreated) {
      assert.deepStrictEqual(files, [
        'README.md',
        'src/main.ts',
        'subdir/real.txt',
      ])
    } else {
      // Even without symlinks, real files should still be discoverable
      assert.deepStrictEqual(files, [
        'README.md',
        'src/main.ts',
        'subdir/real.txt',
      ])
    }
  })

  it('excludes files matching *.log anywhere in the tree', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      'src/app.ts': 'content',
      'errors.log': 'log data',
      'debug.log': 'debug data',
      'subdir/data.log': 'sub log',
      'README.md': 'content',
    })

    const files = await buildFtpUploadFileList(tempDir, ['*.log'])

    assert.deepStrictEqual(files, ['README.md', 'src/app.ts'])
  })

  it('excludes everything under dist/ with a trailing-slash pattern', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      'src/app.ts': 'content',
      'dist/bundle.js': 'bundle',
      'dist/styles.css': 'css',
      'dist/sub/nested.js': 'nested',
      'README.md': 'content',
    })

    const files = await buildFtpUploadFileList(tempDir, ['dist/'])

    assert.deepStrictEqual(files, ['README.md', 'src/app.ts'])
  })

  it('re-includes a file with negation !keep.log when *.log excludes it', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      'src/app.ts': 'content',
      'errors.log': 'log data',
      'debug.log': 'debug data',
      'keep.log': 'important log',
      'README.md': 'content',
    })

    const files = await buildFtpUploadFileList(tempDir, ['*.log', '!keep.log'])

    assert.deepStrictEqual(files, ['README.md', 'keep.log', 'src/app.ts'])
  })

  it('includes everything except .git when the pattern list is empty', async () => {
    tempDir = await makeTempDir()
    await createFiles(tempDir, {
      'src/index.ts': 'content',
      'src/lib/utils.ts': 'content',
      'dist/bundle.js': 'dist',
      'README.md': 'content',
      '.git/config': 'config',
      '.git/objects/x': 'obj',
    })

    const files = await buildFtpUploadFileList(tempDir, [])

    assert.deepStrictEqual(files, [
      'README.md',
      'dist/bundle.js',
      'src/index.ts',
      'src/lib/utils.ts',
    ])
  })
})

describe('mapFtpError', () => {
  it('maps FTPError code 530 to "Authentication failed"', () => {
    const result = mapFtpError(
      new FTPError({ code: 530, message: 'auth' })
    )
    assert.ok(result instanceof Error)
    assert.strictEqual(result.message, 'Authentication failed')
  })

  it('maps FTPError code 550 to "Permission denied or file not found"', () => {
    const result = mapFtpError(
      new FTPError({ code: 550, message: 'no access' })
    )
    assert.ok(result instanceof Error)
    assert.strictEqual(result.message, 'Permission denied or file not found')
  })

  it('maps ECONNREFUSED to "Connection refused"', () => {
    const err = Object.assign(new Error('connect'), {
      code: 'ECONNREFUSED',
    })
    const result = mapFtpError(err)
    assert.ok(result instanceof Error)
    assert.strictEqual(result.message, 'Connection refused')
  })

  it('maps ETIMEDOUT to "Connection timed out"', () => {
    const err = Object.assign(new Error('timeout'), {
      code: 'ETIMEDOUT',
    })
    const result = mapFtpError(err)
    assert.ok(result instanceof Error)
    assert.strictEqual(result.message, 'Connection timed out')
  })

  it('passes through unrecognised Error instances unchanged', () => {
    const err = new Error('something else')
    const result = mapFtpError(err)
    assert.strictEqual(result, err)
  })

  it('wraps non-Error values into an Error with String(e) as message', () => {
    const result = mapFtpError('plain string')
    assert.ok(result instanceof Error)
    assert.strictEqual(result.message, 'plain string')
  })
})
