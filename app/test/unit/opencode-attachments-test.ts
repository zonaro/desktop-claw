import { describe, it } from 'node:test'
import assert from 'node:assert'
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import * as Path from 'path'

import {
  createFileAttachment,
  createFileReference,
  getAttachmentMimeType,
  getDisplayPath,
} from '../../src/lib/opencode/opencode-attachments'

describe('getAttachmentMimeType', () => {
  it('recognises the types OpenCode handles specially', () => {
    assert.equal(getAttachmentMimeType('/tmp/shot.PNG'), 'image/png')
    assert.equal(getAttachmentMimeType('/tmp/doc.pdf'), 'application/pdf')
    assert.equal(getAttachmentMimeType('/tmp/data.json'), 'application/json')
  })

  it('treats source files and unknown extensions as plain text', () => {
    assert.equal(getAttachmentMimeType('/tmp/main.ts'), 'text/plain')
    assert.equal(getAttachmentMimeType('/tmp/LICENSE'), 'text/plain')
  })
})

describe('getDisplayPath', () => {
  it('shows a repository file relative to its root', () => {
    assert.equal(
      getDisplayPath('/repo/app/src/main.ts', '/repo'),
      Path.join('app', 'src', 'main.ts')
    )
  })

  it('keeps the absolute path for a file outside the repository', () => {
    assert.equal(
      getDisplayPath('/elsewhere/notes.md', '/repo'),
      '/elsewhere/notes.md'
    )
  })
})

describe('createFileReference', () => {
  it('points the server at a repository file without embedding it', () => {
    const reference = createFileReference('app/src/main.ts', '/repo')

    assert.equal(reference.isReference, true)
    assert.equal(reference.path, 'app/src/main.ts')
    assert.equal(reference.filename, 'main.ts')
    assert.equal(reference.url, 'file:///repo/app/src/main.ts')
  })

  it('leaves an absolute reference where it is', () => {
    const reference = createFileReference('/etc/hosts', '/repo')

    assert.equal(reference.url, 'file:///etc/hosts')
  })
})

describe('createFileAttachment', () => {
  it('embeds the file content as a data URL', async () => {
    const directory = await mkdtemp(Path.join(tmpdir(), 'opencode-attach-'))

    try {
      const filePath = Path.join(directory, 'note.txt')
      await writeFile(filePath, 'hello')
      await chmod(filePath, 0o644)

      const attachment = await createFileAttachment(filePath, directory)

      assert.equal(attachment.isReference, false)
      assert.equal(attachment.filename, 'note.txt')
      assert.equal(attachment.mime, 'text/plain')
      assert.equal(
        attachment.url,
        `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`
      )
      // Inside the repository, so it shows as a relative path.
      assert.equal(attachment.path, 'note.txt')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
