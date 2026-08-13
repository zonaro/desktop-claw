import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  DefaultOpenCodeConfig,
  loadOpenCodeConfig,
  saveOpenCodeConfig,
} from '../../src/lib/opencode/opencode-config'
import { buildCommitReviewPrompt } from '../../src/lib/opencode/commit-review'

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

describe('buildCommitReviewPrompt', () => {
  const diff = 'diff --git a/app/src/x.ts b/app/src/x.ts\n+const x = 1'
  const commitSha = 'abc1234'

  it('includes the commit sha', () => {
    const prompt = buildCommitReviewPrompt(diff, commitSha)
    assert.ok(prompt.includes(commitSha))
  })

  it('includes the diff', () => {
    const prompt = buildCommitReviewPrompt(diff, commitSha)
    assert.ok(prompt.includes(diff))
  })

  it('includes all required section headings', () => {
    const prompt = buildCommitReviewPrompt(diff, commitSha)
    assert.ok(prompt.includes('## Issues encontrados'))
    assert.ok(prompt.includes('## Caveats'))
    assert.ok(prompt.includes('## Melhorias'))
    assert.ok(prompt.includes('## Otimizações'))
    assert.ok(prompt.includes('## Sugestões'))
    assert.ok(prompt.includes('## Resumo'))
  })

  it('instructs markdown-only output', () => {
    const prompt = buildCommitReviewPrompt(diff, commitSha)
    assert.ok(
      prompt.includes('APENAS') || prompt.includes('ONLY'),
      'prompt should instruct markdown-only output'
    )
  })
})

describe('OpenCode config type guard', () => {
  beforeEach(() => mockLocalStorage())

  afterEach(() => restoreLocalStorage())

  it('falls back to defaults when reviewOnCommit is not a boolean', () => {
    localStorage.setItem(
      'opencode-config',
      JSON.stringify({
        enabled: true,
        command: 'opencode',
        model: null,
        timeoutMs: 60000,
        reviewOnCommit: 'yes',
      })
    )
    assert.deepStrictEqual(loadOpenCodeConfig(), DefaultOpenCodeConfig)
  })

  it('round-trips a config with reviewOnCommit enabled', () => {
    const config = {
      enabled: true,
      command: 'opencode',
      model: null,
      timeoutMs: 60000,
      reviewOnCommit: true,
    }
    saveOpenCodeConfig(config)
    assert.deepStrictEqual(loadOpenCodeConfig(), config)
  })
})
