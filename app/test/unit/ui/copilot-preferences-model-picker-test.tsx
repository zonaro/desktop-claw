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
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'
import {
  defaults,
  ollamaProvider,
  partiallyPricedModel,
  missingBatchSizeModel,
  modelsForDefaultAccount,
  selectionsForDefaultAccount,
  getModelPickerButton,
  getModelPickerButtonText,
  getListItemHeight,
  assertElementTextContent,
  getCostDetailsValue,
} from '../../helpers/ui/copilot-preferences-fixtures'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import { encodeModelKey } from '../../../src/lib/copilot/byok'
import { setNumberFormatPreference } from '../../../src/models/formatting-preferences'

// Split out of the former copilot-preferences-test.tsx (see
// copilot-preferences-fixtures.tsx for why). This file covers the model
// picker's dropdown groups (Copilot models, BYOK providers) and the credit
// cost details popover.

describe('CopilotPreferences model picker', () => {
  it('renders a Copilot group with the available models', async () => {
    const view = render(<CopilotPreferences {...defaults()} />)
    const modelPickerButton = getModelPickerButton(view.container)
    const pickerLabel = __DARWIN__
      ? 'Commit Message Generation'
      : 'Commit message generation'

    assert.strictEqual(
      modelPickerButton.getAttribute('aria-label'),
      `${pickerLabel}: Auto (default)`
    )
    assert.strictEqual(modelPickerButton.getAttribute('aria-expanded'), 'false')
    assert.strictEqual(
      modelPickerButton.getAttribute('aria-haspopup'),
      'dialog'
    )
    assert.strictEqual(modelPickerButton.getAttribute('aria-controls'), null)

    fireEvent.click(modelPickerButton)

    await waitFor(() => assert.ok(screen.getByText('Claude Sonnet (2x)')))
    assert.strictEqual(modelPickerButton.getAttribute('aria-expanded'), 'true')

    const controlledContentId = modelPickerButton.getAttribute('aria-controls')
    assert.ok(controlledContentId !== null)

    const controlledContent = document.getElementById(controlledContentId)
    assert.ok(controlledContent instanceof HTMLElement)
    assert.ok(controlledContent.classList.contains('popover-dropdown-content'))

    assert.strictEqual(screen.queryByText('GitHub Copilot'), null)
    assert.ok(document.querySelector('.popover-component'))
    assert.strictEqual(document.querySelector('.popover-tip'), null)
    assert.ok(screen.getByText('Lightweight'))
    assert.ok(screen.getAllByText('Auto (default)').length >= 2)
    assert.ok(screen.getByText('Usage Billed Model'))
    assert.ok(screen.getByText('Use of credits: low'))
    assert.strictEqual(
      screen.queryByText('Usage Billed Model (low cost)'),
      null
    )
    assert.strictEqual(screen.queryByText('AI credits per 1M tokens'), null)
    assert.strictEqual(
      getListItemHeight(screen.getByText('Claude Sonnet (2x)')),
      '30px'
    )
    assert.strictEqual(
      getListItemHeight(screen.getByText('Usage Billed Model')),
      '46px'
    )
  })

  it('renders a BYOK group per provider', async () => {
    const view = render(
      <CopilotPreferences {...defaults()} byokProviders={[ollamaProvider]} />
    )

    fireEvent.click(getModelPickerButton(view.container))

    await waitFor(() => assert.ok(screen.getByText('Ollama')))
    assert.strictEqual(screen.queryByText('GitHub Copilot'), null)
  })

  it('selects the default Copilot model when no model is selected', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    assert.ok(
      getModelPickerButtonText(view.container).includes('Auto (default)')
    )
    assert.ok(
      !getModelPickerButtonText(view.container).includes('GitHub Copilot')
    )
  })

  it('shows usage billing below the selected model picker', async t => {
    enableTestTimers(['setTimeout'])
    t.after(resetTestTimers)
    const previousNumberFormat = localStorage.getItem('numberFormat')
    t.after(() => {
      if (previousNumberFormat === null) {
        localStorage.removeItem('numberFormat')
      } else {
        localStorage.setItem('numberFormat', previousNumberFormat)
      }
    })
    setNumberFormatPreference({
      thousandsSeparator: '.',
      decimalSeparator: ',',
    })

    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'usage-billed-model',
          }),
        })}
      />
    )

    const button = getModelPickerButton(view.container)

    assert.ok(within(button).getByText('Usage Billed Model'))
    assert.strictEqual(within(button).queryByText(/Use of credits/), null)
    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )
    assert.strictEqual(screen.queryByText(/AI credits per/), null)
    assert.ok(!button.textContent?.includes('low cost'))

    const costsButton = screen.getByRole('button', {
      name: 'Show Copilot model credit costs',
    })

    assert.strictEqual(costsButton.getAttribute('aria-expanded'), 'false')
    assert.strictEqual(costsButton.getAttribute('aria-controls'), null)
    assert.strictEqual(costsButton.getAttribute('aria-describedby'), null)

    fireEvent.click(costsButton)

    assert.strictEqual(costsButton.getAttribute('aria-expanded'), 'true')
    assert.strictEqual(screen.queryByRole('button', { name: 'Close' }), null)

    const costsPopover = view.container.querySelector(
      '.copilot-model-picker-cost-details'
    )
    assert.ok(costsPopover instanceof HTMLElement)
    assert.strictEqual(
      costsButton.getAttribute('aria-controls'),
      costsPopover.id
    )
    assert.strictEqual(
      costsButton.getAttribute('aria-describedby'),
      costsPopover.id
    )

    fireEvent.mouseEnter(costsButton, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(costsButton, { clientX: 20, clientY: 20 })
    advanceTimersBy(400)

    await waitFor(() => assert.ok(screen.getByText('Show credit costs')))
    assert.strictEqual(
      costsButton.getAttribute('aria-describedby'),
      costsPopover.id
    )

    assert.ok(within(costsPopover).getByText('Usage Billed Model'))
    assert.ok(within(costsPopover).getByText('Lightweight'))
    assert.ok(within(costsPopover).getByText('Context'))
    assert.strictEqual(getCostDetailsValue(costsPopover, 'Context'), '1,5m')
    assert.ok(within(costsPopover).getByText('Reasoning'))
    assert.ok(within(costsPopover).getByText('3 levels'))
    assertElementTextContent(costsPopover, 'h4', 'AI credits per 1,5m tokens')
    assert.ok(screen.getByText('Input'))
    assert.ok(screen.getByText('200'))
    assert.ok(screen.getByText('Cached input'))
    assert.ok(screen.getByText('20'))
    assert.ok(screen.getByText('Output'))
    assert.ok(screen.getByText('1.200'))

    fireEvent.keyDown(costsButton, { key: 'Escape' })

    assert.strictEqual(screen.queryByText('AI credits per 1M tokens'), null)
  })

  it('renders unavailable cost details for missing token prices', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount([partiallyPricedModel])}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'partially-priced-model',
          }),
        })}
      />
    )

    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )

    const costsButton = screen.getAllByRole('button', {
      name: 'Show Copilot model credit costs',
    })[0]
    assert.ok(costsButton instanceof HTMLButtonElement)
    fireEvent.click(costsButton)

    const costsPopover = view.container.querySelector(
      '.copilot-model-picker-cost-details'
    )
    assert.ok(costsPopover instanceof HTMLElement)

    assertElementTextContent(costsPopover, 'h4', 'AI credits per 1m tokens')
    assert.ok(within(costsPopover).getByText('200'))
    assert.strictEqual(
      within(costsPopover).getAllByText('Unavailable').length,
      2
    )
  })

  it('omits the cost details button when token batch size is missing', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount([
          missingBatchSizeModel,
        ])}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'copilot',
            modelId: 'missing-batch-size-model',
          }),
        })}
      />
    )

    assert.ok(
      screen.getAllByText('Lightweight model. Use of credits: low').length > 0
    )
    assert.strictEqual(
      screen.queryByRole('button', {
        name: 'Show Copilot model credit costs',
      }),
      null
    )
    assert.strictEqual(screen.queryByText(/AI credits per/), null)
  })

  it('treats legacy bare-string selections as Copilot models', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': 'claude-sonnet',
        })}
      />
    )

    assert.ok(
      getModelPickerButtonText(view.container).includes('Claude Sonnet (2x)')
    )
  })

  it('selects the matching BYOK option when chosen', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        byokProviders={[ollamaProvider]}
        selectedCopilotModelsByAccount={selectionsForDefaultAccount({
          'commit-message-generation': encodeModelKey({
            kind: 'byok',
            providerId: ollamaProvider.id,
            modelId: 'llama3',
          }),
        })}
      />
    )

    const buttonText = getModelPickerButtonText(view.container)
    assert.ok(buttonText.includes('Llama 3'))
    assert.ok(!buttonText.includes('Ollama'))
  })
})
