import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  getToolSummary,
  isSessionBusy,
  MaxToolOutputLength,
  truncateToolOutput,
} from '../../src/lib/opencode/opencode-session-helpers'
import {
  getOpenCodeErrorText,
  IOpenCodeMessage,
  IOpenCodeToolPart,
  IOpenCodeToolState,
} from '../../src/models/opencode-session'

/** Builds a tool part with the given state for the summary tests. */
function toolPart(state: IOpenCodeToolState): IOpenCodeToolPart {
  return {
    id: 'prt_1',
    type: 'tool',
    callID: 'call_1',
    tool: 'bash',
    state,
  }
}

/** Builds an assistant message with the given completion/error fields. */
function assistantMessage(
  time: { created: number; completed?: number },
  error?: unknown
): IOpenCodeMessage {
  return {
    info: {
      id: 'msg_1',
      sessionID: 'ses_1',
      role: 'assistant',
      time,
      ...(error === undefined ? {} : { error }),
    },
    parts: [],
  }
}

describe('getToolSummary', () => {
  it('prefers the title the server computed', () => {
    const part = toolPart({
      status: 'completed',
      title: 'Read package.json',
      input: { filePath: '/tmp/other.txt' },
    })

    assert.equal(getToolSummary(part), 'Read package.json')
  })

  it('falls back to the highest priority input key', () => {
    const part = toolPart({
      status: 'running',
      input: { path: '/tmp/a', command: 'ls -la' },
    })

    assert.equal(getToolSummary(part), 'ls -la')
  })

  it('returns null when there is nothing to summarise', () => {
    assert.equal(getToolSummary(toolPart({ status: 'pending' })), null)
    assert.equal(
      getToolSummary(toolPart({ status: 'pending', input: { count: 3 } })),
      null
    )
  })

  it('ignores empty strings', () => {
    const part = toolPart({
      status: 'completed',
      title: '',
      input: { command: '', pattern: 'TODO' },
    })

    assert.equal(getToolSummary(part), 'TODO')
  })
})

describe('truncateToolOutput', () => {
  it('leaves short output untouched', () => {
    assert.equal(truncateToolOutput('hello'), 'hello')
  })

  it('truncates long output and reports how much was dropped', () => {
    const output = 'x'.repeat(MaxToolOutputLength + 25)
    const truncated = truncateToolOutput(output)

    assert.ok(truncated.startsWith('x'.repeat(MaxToolOutputLength)))
    assert.ok(truncated.endsWith('… 25 more characters'))
  })

  it('keeps output of exactly the limit intact', () => {
    const output = 'x'.repeat(MaxToolOutputLength)

    assert.equal(truncateToolOutput(output), output)
  })
})

describe('isSessionBusy', () => {
  it('is false for an empty conversation', () => {
    assert.equal(isSessionBusy([]), false)
  })

  it('is true while the last assistant message has no completion time', () => {
    assert.equal(isSessionBusy([assistantMessage({ created: 1 })]), true)
  })

  it('is false once the last assistant message completed', () => {
    assert.equal(
      isSessionBusy([assistantMessage({ created: 1, completed: 2 })]),
      false
    )
  })

  it('is false when the last assistant message failed', () => {
    assert.equal(
      isSessionBusy([
        assistantMessage({ created: 1 }, { name: 'AbortedError' }),
      ]),
      false
    )
  })

  it('is false when the conversation ends with a user message', () => {
    const message: IOpenCodeMessage = {
      info: {
        id: 'msg_2',
        sessionID: 'ses_1',
        role: 'user',
        time: { created: 3 },
      },
      parts: [],
    }

    assert.equal(isSessionBusy([message]), false)
  })
})

describe('getOpenCodeErrorText', () => {
  it('returns null when there is no error', () => {
    assert.equal(getOpenCodeErrorText(undefined), null)
    assert.equal(getOpenCodeErrorText(null), null)
  })

  it('unwraps the nested data.message the server sends', () => {
    const error = { name: 'ProviderAuthError', data: { message: 'No API key' } }

    assert.equal(getOpenCodeErrorText(error), 'No API key')
  })

  it('falls back to the top level message, then the name', () => {
    assert.equal(getOpenCodeErrorText({ message: 'boom' }), 'boom')
    assert.equal(getOpenCodeErrorText({ name: 'AbortedError' }), 'AbortedError')
  })

  it('passes strings through', () => {
    assert.equal(getOpenCodeErrorText('plain failure'), 'plain failure')
  })

  it('describes an unrecognised error object', () => {
    assert.equal(getOpenCodeErrorText({}), 'The agent run failed.')
  })
})
