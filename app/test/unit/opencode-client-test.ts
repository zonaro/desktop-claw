import { describe, it } from 'node:test'
import assert from 'node:assert'

import { parseEventFrame } from '../../src/lib/opencode/opencode-client'

describe('parseEventFrame', () => {
  it('parses a single data line', () => {
    const event = parseEventFrame(
      'data: {"type":"session.idle","properties":{"sessionID":"ses_1"}}'
    )

    assert.deepStrictEqual(event, {
      type: 'session.idle',
      properties: { sessionID: 'ses_1' },
    })
  })

  it('joins multi-line data payloads', () => {
    const event = parseEventFrame(
      'data: {"type":"message.updated",\ndata: "properties":{"info":{"id":"msg_1"}}}'
    )

    assert.deepStrictEqual(event, {
      type: 'message.updated',
      properties: { info: { id: 'msg_1' } },
    })
  })

  it('ignores the event name and other SSE fields', () => {
    const event = parseEventFrame(
      'id: 1\nevent: message\ndata: {"type":"session.error","properties":{}}\nretry: 500'
    )

    assert.deepStrictEqual(event, { type: 'session.error', properties: {} })
  })

  it('defaults missing properties to an empty object', () => {
    const event = parseEventFrame('data: {"type":"server.connected"}')

    assert.deepStrictEqual(event, { type: 'server.connected', properties: {} })
  })

  it('returns null for heartbeats and comment frames', () => {
    assert.equal(parseEventFrame(''), null)
    assert.equal(parseEventFrame(': keep-alive'), null)
    assert.equal(parseEventFrame('event: ping'), null)
  })

  it('returns null for malformed or untyped payloads', () => {
    assert.equal(parseEventFrame('data: not json'), null)
    assert.equal(parseEventFrame('data: {"properties":{}}'), null)
    assert.equal(parseEventFrame('data: []'), null)
    assert.equal(parseEventFrame('data: null'), null)
  })
})
