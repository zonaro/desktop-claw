import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '../../helpers/ui/render'
import {
  defaults,
  getModelPickerButtons,
} from '../../helpers/ui/copilot-preferences-fixtures'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import type { CopilotFeature } from '../../../src/lib/stores/copilot-store'
import { encodeModelKey } from '../../../src/lib/copilot/byok'
import type { IOpenCodeConfig } from '../../../src/lib/opencode/opencode-config'
import { saveOpenCodeConfig } from '../../../src/lib/opencode/opencode-config'

// Split out of the former copilot-preferences-test.tsx (see
// copilot-preferences-fixtures.tsx for why). This file covers the
// conflict-resolution model picker and the OpenCode model picker/config
// round-trip.

describe('conflict resolution model picker', () => {
  it('renders a second picker', () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    assert.strictEqual(getModelPickerButtons(view.container).length, 2)
  })

  it('emits the conflict-resolution feature on change', async () => {
    const changed: Array<{
      feature: CopilotFeature
      model: string | null
    }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        onSelectedCopilotModelChanged={(_, f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )
    const buttons = getModelPickerButtons(view.container)
    const conflictPickerButton = buttons[1]
    assert.ok(conflictPickerButton instanceof HTMLButtonElement)

    fireEvent.click(conflictPickerButton)
    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    fireEvent.click(screen.getByText('Claude Sonnet (2x)'))

    assert.deepStrictEqual(changed, [
      {
        feature: 'conflict-resolution',
        model: encodeModelKey({
          kind: 'copilot',
          modelId: 'claude-sonnet',
        }),
      },
    ])
  })
})

describe('OpenCode model picker', () => {
  it('shows model picker when OpenCode is selected', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    // Initially, the model picker should not be visible
    assert.strictEqual(
      view.container.querySelector('.opencode-model-picker'),
      null
    )
  })

  it('saves the selected model to config', () => {
    // Test that selecting a model updates the config
    const config: IOpenCodeConfig = {
      enabled: true,
      command: 'opencode',
      model: null,
      timeoutMs: 60000,
      reviewOnCommit: false,
      serverHost: null,
      serverPort: null,
      serverUser: null,
      serverPassword: null,
      userName: null,
      memory: [],
    }
    saveOpenCodeConfig(config)

    const updatedConfig = {
      ...config,
      model: 'anthropic/claude-3-5-sonnet-20241022',
    }
    saveOpenCodeConfig(updatedConfig)

    const {
      loadOpenCodeConfig,
    } = require('../../../src/lib/opencode/opencode-config')
    const loaded = loadOpenCodeConfig()
    assert.strictEqual(loaded.model, 'anthropic/claude-3-5-sonnet-20241022')
  })

  it('handles empty model selection (default)', () => {
    const config: IOpenCodeConfig = {
      enabled: true,
      command: 'opencode',
      model: 'anthropic/claude-3-5-sonnet-20241022',
      timeoutMs: 60000,
      reviewOnCommit: false,
      serverHost: null,
      serverPort: null,
      serverUser: null,
      serverPassword: null,
      userName: null,
      memory: [],
    }
    saveOpenCodeConfig(config)

    const updatedConfig = { ...config, model: null }
    saveOpenCodeConfig(updatedConfig)

    const {
      loadOpenCodeConfig,
    } = require('../../../src/lib/opencode/opencode-config')
    const loaded = loadOpenCodeConfig()
    assert.strictEqual(loaded.model, null)
  })
})
