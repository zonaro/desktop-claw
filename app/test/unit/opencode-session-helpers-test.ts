import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  formatModelValue,
  getFileReferenceQuery,
  getFileReferences,
  getModelOptions,
  getSessionModelSelection,
  getToolSummary,
  isSessionBusy,
  MaxToolOutputLength,
  parseModelValue,
  truncateToolOutput,
} from '../../src/lib/opencode/opencode-session-helpers'
import {
  getOpenCodeErrorText,
  IOpenCodeMessage,
  IOpenCodeProvider,
  IOpenCodeSession,
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

describe('getModelOptions', () => {
  const providers: ReadonlyArray<IOpenCodeProvider> = [
    {
      id: 'opencode',
      name: 'OpenCode Zen',
      models: {
        'deepseek-v4-flash-free': {
          id: 'deepseek-v4-flash-free',
          name: 'DeepSeek V4 Flash Free',
          variants: { low: {}, high: {}, max: {} },
        },
        'nemotron-3.5-lightning-free': {
          id: 'nemotron-3.5-lightning-free',
          name: 'Nemotron 3.5 Lightning Free',
        },
      },
    },
    {
      id: 'google',
      models: { 'gemini-3-pro': { id: 'gemini-3-pro', name: 'Gemini 3 Pro' } },
    },
  ]

  it('flattens providers into pickable entries', () => {
    const options = getModelOptions(providers)

    assert.equal(options.length, 3)
    assert.deepStrictEqual(options[0], {
      providerID: 'google',
      providerName: 'google',
      modelID: 'gemini-3-pro',
      modelName: 'Gemini 3 Pro',
      variants: [],
    })
  })

  it('exposes the variant names of a model that has them', () => {
    const deepseek = getModelOptions(providers).find(
      o => o.modelID === 'deepseek-v4-flash-free'
    )

    assert.deepStrictEqual(deepseek?.variants, ['low', 'high', 'max'])
  })

  it('sorts by provider, then by model name', () => {
    const names = getModelOptions(providers).map(o => o.modelName)

    assert.deepStrictEqual(names, [
      'Gemini 3 Pro',
      'DeepSeek V4 Flash Free',
      'Nemotron 3.5 Lightning Free',
    ])
  })

  it('falls back to ids when names are missing', () => {
    const options = getModelOptions([
      { id: 'custom', models: { 'my-model': { id: 'my-model' } } },
    ])

    assert.equal(options[0].providerName, 'custom')
    assert.equal(options[0].modelName, 'my-model')
  })
})

describe('formatModelValue / parseModelValue', () => {
  it('round-trips a selection', () => {
    const value = formatModelValue('opencode', 'deepseek-v4-flash-free')

    assert.deepStrictEqual(parseModelValue(value), {
      providerID: 'opencode',
      modelID: 'deepseek-v4-flash-free',
    })
  })

  it('keeps slashes that belong to the model id', () => {
    assert.deepStrictEqual(parseModelValue('openrouter/meta/llama-3'), {
      providerID: 'openrouter',
      modelID: 'meta/llama-3',
    })
  })

  it('rejects values that are not a pair', () => {
    assert.equal(parseModelValue('opencode'), null)
    assert.equal(parseModelValue('/model'), null)
    assert.equal(parseModelValue('provider/'), null)
  })
})

describe('getFileReferenceQuery', () => {
  it('finds the reference being typed at the caret', () => {
    const text = 'look at @app/src'

    assert.deepStrictEqual(getFileReferenceQuery(text, text.length), {
      query: 'app/src',
      start: 8,
    })
  })

  it('matches an @ at the very start', () => {
    assert.deepStrictEqual(getFileReferenceQuery('@readme', 7), {
      query: 'readme',
      start: 0,
    })
  })

  it('offers every file right after the @', () => {
    assert.deepStrictEqual(getFileReferenceQuery('check @', 7), {
      query: '',
      start: 6,
    })
  })

  it('ignores an @ inside a word, such as an email address', () => {
    const text = 'mail me at bob@example.com'

    assert.equal(getFileReferenceQuery(text, text.length), null)
  })

  it('closes once the reference is finished', () => {
    const text = 'see @app/main.ts please'

    assert.equal(getFileReferenceQuery(text, text.length), null)
  })

  it('uses the caret rather than the end of the text', () => {
    const text = '@one and @two'

    assert.deepStrictEqual(getFileReferenceQuery(text, 4), {
      query: 'one',
      start: 0,
    })
  })
})

describe('getFileReferences', () => {
  it('collects every reference in the prompt', () => {
    assert.deepStrictEqual(
      getFileReferences('compare @app/a.ts with @app/b.ts'),
      ['app/a.ts', 'app/b.ts']
    )
  })

  it('ignores @ inside words', () => {
    assert.deepStrictEqual(getFileReferences('write to bob@example.com'), [])
  })

  it('returns nothing for a prompt without references', () => {
    assert.deepStrictEqual(getFileReferences('just a question'), [])
  })
})

describe('getSessionModelSelection', () => {
  const session = (model?: IOpenCodeSession['model']): IOpenCodeSession => ({
    id: 'ses_1',
    directory: '/repo',
    time: { created: 1, updated: 2 },
    ...(model === undefined ? {} : { model }),
  })

  it('restores the model a conversation last ran with', () => {
    assert.deepStrictEqual(
      getSessionModelSelection(
        session({ id: 'deepseek-v4-flash-free', providerID: 'opencode' })
      ),
      {
        model: { providerID: 'opencode', modelID: 'deepseek-v4-flash-free' },
        variant: null,
      }
    )
  })

  it('restores the reasoning variant too', () => {
    const { variant } = getSessionModelSelection(
      session({ id: 'm', providerID: 'p', variant: 'high' })
    )

    assert.equal(variant, 'high')
  })

  it("treats the server's 'default' variant as no variant", () => {
    const { variant } = getSessionModelSelection(
      session({ id: 'm', providerID: 'p', variant: 'default' })
    )

    assert.equal(variant, null)
  })

  it('starts a conversation that never ran on the default model', () => {
    assert.deepStrictEqual(getSessionModelSelection(session()), {
      model: null,
      variant: null,
    })
    assert.deepStrictEqual(getSessionModelSelection(undefined), {
      model: null,
      variant: null,
    })
  })
})
