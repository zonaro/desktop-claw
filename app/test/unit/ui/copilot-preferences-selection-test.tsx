import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '../../helpers/ui/render'
import {
  defaults,
  ollamaProvider,
  otherModel,
  modelsForDefaultAccount,
  selectionsForDefaultAccount,
  getModelPickerButton,
  getModelPickerButtons,
  getModelPickerButtonText,
} from '../../helpers/ui/copilot-preferences-fixtures'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import {
  DefaultCopilotModel,
  DisabledCopilotModel,
  type CopilotFeature,
} from '../../../src/lib/stores/copilot-store'
import { encodeModelKey } from '../../../src/lib/copilot/byok'

// Split out of the former copilot-preferences-test.tsx (see
// copilot-preferences-fixtures.tsx for why). This file covers change-event
// emission, the "None" (disable generation) option, and the fallback logic
// that kicks in when a persisted model selection no longer exists.

describe('CopilotPreferences model selection', () => {
  it('emits the encoded composite key on change', async () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        onSelectedCopilotModelChanged={(_, f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    fireEvent.click(screen.getByText('Claude Sonnet (2x)'))

    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({ kind: 'copilot', modelId: 'claude-sonnet' }),
      },
    ])
  })

  it('emits the selected value directly on change', async () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'claude-sonnet',
        })}
        onSelectedCopilotModelChanged={(_, f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    fireEvent.click(getModelPickerButton(view.container))

    const defaultModelItem = await waitFor(() => {
      const popover = document.querySelector('.popover-dropdown-content')
      assert.ok(popover instanceof HTMLElement)
      return within(popover).getByText('Auto (default)')
    })

    fireEvent.click(defaultModelItem)

    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: encodeModelKey({
          kind: 'copilot',
          modelId: DefaultCopilotModel,
        }),
      },
    ])
  })

  it('offers a "None" option to disable commit message generation', async () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    fireEvent.click(getModelPickerButton(view.container))

    await waitFor(() =>
      assert.ok(screen.getByText('None (hide Copilot button)'))
    )
  })

  it('shows the None selection on the button when generation is disabled', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': DisabledCopilotModel,
        })}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes(
        'None (hide Copilot button)'
      )
    )
  })

  it('emits the None value when generation is disabled', async () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []
    const view = render(
      <CopilotPreferences
        {...defaults()}
        onSelectedCopilotModelChanged={(_, f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    await waitFor(() =>
      assert.ok(screen.getByText('None (hide Copilot button)'))
    )
    fireEvent.click(screen.getByText('None (hide Copilot button)'))

    assert.deepStrictEqual(changed, [
      {
        feature: 'commit-message-generation',
        model: DisabledCopilotModel,
      },
    ])
  })

  it('offers the None option for conflict resolution too', async () => {
    const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
    try {
      const view = render(<CopilotPreferences {...defaults()} />)
      const conflictPickerButton = getModelPickerButtons(view.container)[1]
      assert.ok(conflictPickerButton instanceof HTMLButtonElement)

      fireEvent.click(conflictPickerButton)
      await waitFor(() =>
        assert.ok(screen.getByText('None (hide Copilot button)'))
      )
    } finally {
      if (previousPreviewFeatures === undefined) {
        delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      } else {
        process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreviewFeatures
      }
    }
  })

  it('falls back to the default Copilot model when persisted selection is not in the model list', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'deleted-model',
        })}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Auto (default)')
    )
  })

  it('falls back to the default Copilot model when the BYOK provider for the persisted selection is gone', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: 'missing-provider',
            modelId: 'llama3',
          }),
        })}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Auto (default)')
    )
  })

  it('falls back to the first available Copilot model when DefaultCopilotModel is unavailable', () => {
    const onlyOtherModel = [otherModel]
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount(onlyOtherModel)}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'deleted-model',
        })}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Claude Sonnet (2x)')
    )
  })

  it('falls back to the first BYOK model when no Copilot models are available', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount([])}
        byokProviders={[ollamaProvider]}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'deleted-model',
        })}
      />
    )

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
  })

  it('always shows models without settings tabs', () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const tabs = view.container.querySelectorAll('[role="tab"]')
    assert.strictEqual(tabs.length, 0)
    assert.ok(getModelPickerButtons(view.container).length > 0)
  })

  it('hides custom provider configuration when BYOK settings are disabled', () => {
    const view = render(
      <CopilotPreferences {...defaults()} showBYOKSettings={false} />
    )
    fireEvent.click(getModelPickerButton(view.container))
    assert.strictEqual(
      screen.queryByRole('button', { name: 'Configure custom providers…' }),
      null
    )
  })

  it('opens custom provider configuration from the model picker', () => {
    let called = 0
    const view = render(
      <CopilotPreferences
        {...defaults()}
        showBYOKSettings={true}
        onConfigureCustomProviders={() => {
          called += 1
        }}
      />
    )

    fireEvent.click(getModelPickerButton(view.container))
    fireEvent.click(
      screen.getByRole('button', { name: 'Configure custom providers…' })
    )

    assert.strictEqual(called, 1)
  })
})
