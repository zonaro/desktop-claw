import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { OpenCodeCommitMessageGenerator } from '../../src/lib/commit-message-generator/opencode-commit-message-generator'
import { CommitMessageGenerationCancelledError } from '../../src/lib/stores/copilot-store'
import {
  loadCommitMessageProvider,
  saveCommitMessageProvider,
} from '../../src/lib/opencode/commit-message-provider-pref'
import {
  DefaultOpenCodeConfig,
  loadOpenCodeConfig,
  saveOpenCodeConfig,
} from '../../src/lib/opencode/opencode-config'

const originalLocalStorage = globalThis.localStorage

function mockLocalStorage(initial: Record<string, string> = {}): void {
  let store = { ...initial }

  const localStorageMock: Storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value)
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  })
}

function restoreLocalStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  })
}

describe('commit message provider preference', () => {
  beforeEach(() => mockLocalStorage())

  afterEach(() => restoreLocalStorage())

  it('defaults to copilot when nothing is stored', () => {
    assert.strictEqual(loadCommitMessageProvider(), 'copilot')
  })

  it('round-trips an openCode provider selection', () => {
    saveCommitMessageProvider('openCode')
    assert.strictEqual(loadCommitMessageProvider(), 'openCode')
  })

  it('round-trips a copilot provider selection', () => {
    saveCommitMessageProvider('openCode')
    saveCommitMessageProvider('copilot')
    assert.strictEqual(loadCommitMessageProvider(), 'copilot')
  })

  it('ignores malformed stored values', () => {
    localStorage.setItem('commit-message-provider', 'definitely-not-a-provider')
    assert.strictEqual(loadCommitMessageProvider(), 'copilot')
  })
})

describe('OpenCode config', () => {
  beforeEach(() => mockLocalStorage())

  afterEach(() => restoreLocalStorage())

  it('returns defaults when nothing is stored', () => {
    const config = loadOpenCodeConfig()
    assert.deepStrictEqual(config, DefaultOpenCodeConfig)
  })

  it('round-trips a full config', () => {
    const config = {
      enabled: true,
      command: '/usr/local/bin/opencode',
      model: 'deepseek/deepseek-chat',
      timeoutMs: 120000,
      reviewOnCommit: false,
    }
    saveOpenCodeConfig(config)
    assert.deepStrictEqual(loadOpenCodeConfig(), config)
  })

  it('falls back to defaults for malformed JSON', () => {
    localStorage.setItem('opencode-config', '{not json')
    assert.deepStrictEqual(loadOpenCodeConfig(), DefaultOpenCodeConfig)
  })

  it('falls back to defaults for a wrong-shaped value', () => {
    localStorage.setItem('opencode-config', JSON.stringify({ enabled: 'yes' }))
    assert.deepStrictEqual(loadOpenCodeConfig(), DefaultOpenCodeConfig)
  })
})

describe('OpenCodeCommitMessageGenerator', () => {
  let restoreIpcInvoke: (() => void) | null = null
  let ipcRenderer: Electron.IpcRenderer

  beforeEach(async () => {
    mockLocalStorage()
    const electron = await import('electron')
    ipcRenderer = electron.ipcRenderer
    const previousInvoke = ipcRenderer.invoke
    ipcRenderer.invoke = () => Promise.resolve(undefined)
    restoreIpcInvoke = () => {
      ipcRenderer.invoke = previousInvoke
    }
  })

  afterEach(() => {
    restoreIpcInvoke?.()
    restoreIpcInvoke = null
    restoreLocalStorage()
  })

  function mockIpcInvoke(
    handler: (channel: string, args: unknown[]) => unknown
  ): void {
    ipcRenderer.invoke = (channel: string, ...args: unknown[]) => {
      try {
        return Promise.resolve(handler(channel, args))
      } catch (e) {
        return Promise.reject(e)
      }
    }
  }

  it('parses a valid runner response into title and description', async () => {
    mockIpcInvoke(channel => {
      assert.strictEqual(channel, 'opencode-run-prompt')
      return JSON.stringify({
        title: 'Add FTP deployment support',
        description: 'Implements the FTP upload engine.',
      })
    })

    const generator = new OpenCodeCommitMessageGenerator()
    const message = await generator.generate({
      diff: 'diff --git a/app/src/x.ts b/app/src/x.ts',
      repositoryPath: '/tmp/repo',
      commitMessageRules: [],
    })

    assert.strictEqual(message.title, 'Add FTP deployment support')
    assert.strictEqual(message.description, 'Implements the FTP upload engine.')
  })

  it('sends the configured command, model and cwd in the request', async () => {
    const config = {
      enabled: true,
      command: '/opt/opencode/bin/opencode',
      model: 'deepseek/deepseek-chat',
      timeoutMs: 30000,
      reviewOnCommit: false,
    }
    saveOpenCodeConfig(config)

    let receivedRequest: Record<string, unknown> | null = null
    mockIpcInvoke((channel, args) => {
      receivedRequest = args[0] as Record<string, unknown>
      return JSON.stringify({ title: 'T', description: 'D' })
    })

    const generator = new OpenCodeCommitMessageGenerator()
    await generator.generate({
      diff: 'diff',
      repositoryPath: '/tmp/repo',
      commitMessageRules: [],
    })

    assert.ok(receivedRequest !== null)
    const request = receivedRequest as Record<string, unknown>
    assert.strictEqual(request.command, '/opt/opencode/bin/opencode')
    assert.strictEqual(request.model, 'deepseek/deepseek-chat')
    assert.strictEqual(request.timeoutMs, 30000)
    assert.strictEqual(request.cwd, '/tmp/repo')
    assert.ok(typeof request.requestId === 'string')
    assert.ok(String(request.prompt).includes('diff'))
  })

  it('propagates non-cancellation errors', async () => {
    mockIpcInvoke(() => {
      throw new Error('boom')
    })

    const generator = new OpenCodeCommitMessageGenerator()
    await assert.rejects(
      generator.generate({
        diff: 'diff',
        repositoryPath: '/tmp/repo',
        commitMessageRules: [],
      }),
      /boom/
    )
  })

  it('converts an aborted signal into CommitMessageGenerationCancelledError', async () => {
    const controller = new AbortController()
    controller.abort()

    const generator = new OpenCodeCommitMessageGenerator()
    await assert.rejects(
      generator.generate({
        diff: 'diff',
        repositoryPath: '/tmp/repo',
        commitMessageRules: [],
        signal: controller.signal,
      }),
      CommitMessageGenerationCancelledError
    )
  })
})
