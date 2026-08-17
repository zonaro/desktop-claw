import { describe, it } from 'node:test'
import assert from 'node:assert'

import { parseListeningUrl } from '../../src/main-process/opencode-server'

describe('parseListeningUrl', () => {
  it('reads the port out of the startup banner', () => {
    assert.equal(
      parseListeningUrl(
        'opencode server listening on http://127.0.0.1:41234\n'
      ),
      'http://127.0.0.1:41234'
    )
  })

  it('finds the banner among other output on the same chunk', () => {
    const output = [
      'Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.',
      'opencode server listening on http://127.0.0.1:8080',
    ].join('\n')

    assert.equal(parseListeningUrl(output), 'http://127.0.0.1:8080')
  })

  it('strips a trailing slash so paths can be appended', () => {
    assert.equal(
      parseListeningUrl('listening on http://127.0.0.1:3000/'),
      'http://127.0.0.1:3000'
    )
  })

  it('accepts https', () => {
    assert.equal(
      parseListeningUrl('listening on https://127.0.0.1:443'),
      'https://127.0.0.1:443'
    )
  })

  it('returns null for output that is not the banner', () => {
    assert.equal(parseListeningUrl(''), null)
    assert.equal(parseListeningUrl('INFO service=server starting'), null)
    assert.equal(parseListeningUrl('Error: address already in use'), null)
  })
})
