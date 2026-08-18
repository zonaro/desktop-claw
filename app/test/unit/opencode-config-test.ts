import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  DefaultOpenCodeConfig,
  getOpenCodeServerUrl,
  isOpenCodeConfig,
} from '../../src/lib/opencode/opencode-config'

describe('getOpenCodeServerUrl', () => {
  it('is null when no server is configured', () => {
    assert.equal(getOpenCodeServerUrl(DefaultOpenCodeConfig), null)
  })

  it('builds a URL from a host and a port', () => {
    assert.equal(
      getOpenCodeServerUrl({
        ...DefaultOpenCodeConfig,
        serverHost: '127.0.0.1',
        serverPort: 4096,
      }),
      'http://127.0.0.1:4096'
    )
  })

  it('keeps a scheme the user typed', () => {
    assert.equal(
      getOpenCodeServerUrl({
        ...DefaultOpenCodeConfig,
        serverHost: 'https://opencode.local',
        serverPort: 443,
      }),
      'https://opencode.local:443'
    )
  })

  it('needs both halves of the target', () => {
    assert.equal(
      getOpenCodeServerUrl({ ...DefaultOpenCodeConfig, serverHost: 'host' }),
      null
    )
    assert.equal(
      getOpenCodeServerUrl({ ...DefaultOpenCodeConfig, serverPort: 4096 }),
      null
    )
    assert.equal(
      getOpenCodeServerUrl({
        ...DefaultOpenCodeConfig,
        serverHost: '   ',
        serverPort: 4096,
      }),
      null
    )
  })
})

describe('isOpenCodeConfig', () => {
  it('accepts a config written before the server fields existed', () => {
    assert.equal(
      isOpenCodeConfig({
        enabled: true,
        command: 'opencode',
        model: null,
        timeoutMs: 60000,
        reviewOnCommit: false,
      }),
      true
    )
  })

  it('accepts a config carrying the server fields', () => {
    assert.equal(
      isOpenCodeConfig({
        ...DefaultOpenCodeConfig,
        serverHost: '127.0.0.1',
        serverPort: 4096,
      }),
      true
    )
  })

  it('rejects a port that is not a usable number', () => {
    for (const serverPort of [0, -1, 70000, 1.5, '4096']) {
      assert.equal(
        isOpenCodeConfig({ ...DefaultOpenCodeConfig, serverPort }),
        false,
        `expected ${serverPort} to be rejected`
      )
    }
  })
})
