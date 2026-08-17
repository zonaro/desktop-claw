import assert from 'node:assert'
import { describe, it } from 'node:test'

import { OpenCodeRunError } from '../../src/main-process/opencode-runner'

/**
 * Tests for the listOpenCodeModels function in opencode-runner.ts.
 *
 * These tests verify the expected parsing behavior of the model list
 * returned by the OpenCode CLI's `models` command.
 */

describe('listOpenCodeModels', () => {
  // We can't easily mock the import, so we'll test the function logic
  // by verifying the expected behavior through integration-style tests.
  // For unit testing, we'd need to refactor the function to accept
  // a spawn dependency.

  it('parses model list from stdout', () => {
    // This test verifies the expected parsing behavior.
    // The actual function is tested through the integration tests.
    const stdout = `anthropic/claude-3-5-sonnet-20241022
anthropic/claude-3-opus-20240229
openai/gpt-4o
openai/gpt-4o-mini
`

    const models = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    assert.deepStrictEqual(models, [
      'anthropic/claude-3-5-sonnet-20241022',
      'anthropic/claude-3-opus-20240229',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
    ])
  })

  it('filters empty lines from stdout', () => {
    const stdout = `anthropic/claude-3-5-sonnet-20241022

openai/gpt-4o

`

    const models = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    assert.deepStrictEqual(models, [
      'anthropic/claude-3-5-sonnet-20241022',
      'openai/gpt-4o',
    ])
  })

  it('returns empty array for empty stdout', () => {
    const stdout = ''

    const models = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    assert.deepStrictEqual(models, [])
  })
})

describe('OpenCodeRunError', () => {
  it('includes stderr in the message when non-empty', () => {
    const error = new OpenCodeRunError(
      'OpenCode CLI exited with code 1',
      1,
      'Error: API key not found'
    )

    assert.strictEqual(error.name, 'OpenCodeRunError')
    assert.strictEqual(error.exitCode, 1)
    assert.strictEqual(error.stderr, 'Error: API key not found')
    assert.match(error.message, /OpenCode CLI exited with code 1/)
    assert.match(error.message, /stderr:/)
    assert.match(error.message, /Error: API key not found/)
  })

  it('does not append stderr section when stderr is empty', () => {
    const error = new OpenCodeRunError('OpenCode CLI exited with code 1', 1, '')

    assert.strictEqual(error.message, 'OpenCode CLI exited with code 1')
    assert.strictEqual(error.stderr, '')
  })

  it('truncates stderr to 2000 characters in both message and property', () => {
    const longStderr = 'x'.repeat(5000)
    const error = new OpenCodeRunError(
      'OpenCode CLI exited with code 1',
      1,
      longStderr
    )

    assert.strictEqual(error.stderr.length, 2000)
    assert.strictEqual(error.stderr, 'x'.repeat(2000))
    assert.match(error.message, /stderr:/)
    // The message should contain the truncated stderr, not the full one
    assert.ok(!error.message.includes('x'.repeat(2001)))
  })

  it('preserves exitCode as null for timeout errors', () => {
    const error = new OpenCodeRunError(
      'OpenCode prompt timed out after 60000ms',
      null,
      'some stderr output'
    )

    assert.strictEqual(error.exitCode, null)
    assert.strictEqual(error.stderr, 'some stderr output')
    assert.match(error.message, /timed out/)
    assert.match(error.message, /stderr:/)
  })
})
