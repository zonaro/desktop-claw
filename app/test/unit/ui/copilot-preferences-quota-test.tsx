import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen } from '../../helpers/ui/render'
import {
  defaults,
  makeQuotaSnapshot,
  modelsForDefaultAccount,
  quotaSnapshotsForDefaultAccount,
} from '../../helpers/ui/copilot-preferences-fixtures'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import type { ICopilotQuotaSnapshot } from '../../../src/lib/stores/copilot-store'

// Split out of the former copilot-preferences-test.tsx (see
// copilot-preferences-fixtures.tsx for why). This file covers the model- and
// quota-loading states and the rendered quota/usage snapshot cards.

describe('CopilotPreferences quota snapshots', () => {
  it('shows loading message when models not yet fetched', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount(null)}
      />
    )
    assert.ok(screen.getByText('Loading available models…'))
  })

  it('shows no-models message when fetch completed with empty result', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={modelsForDefaultAccount([])}
      />
    )
    assert.ok(screen.getByText('No Copilot models available.'))
  })

  it('shows a loading message when quota snapshots have not been fetched', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(null)}
      />
    )

    assert.ok(screen.getByText('Loading Copilot usage…'))
  })

  it('renders Copilot quota snapshot cards', () => {
    const view = render(<CopilotPreferences {...defaults()} />)

    assert.strictEqual(screen.queryByRole('heading', { name: 'Usage' }), null)
    assert.ok(screen.getByAltText('Avatar for Mona Lisa'))
    assert.ok(screen.getByText('Mona Lisa'))
    assert.ok(screen.getByText('@mona'))
    assert.ok(screen.getByText('Chat messages'))
    assert.ok(screen.getByText('Premium requests'))

    const modelPicker = view.container.querySelector('.copilot-model-picker')
    const settingsScroll = view.container.querySelector(
      '.copilot-settings-scroll'
    )
    const usageSection = view.container.querySelector('.copilot-usage-section')
    assert.ok(modelPicker instanceof HTMLElement)
    assert.ok(settingsScroll instanceof HTMLElement)
    assert.ok(usageSection instanceof HTMLElement)
    assert.strictEqual(settingsScroll.contains(modelPicker), true)
    assert.strictEqual(settingsScroll.contains(usageSection), true)
    assert.strictEqual(
      usageSection.compareDocumentPosition(modelPicker) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      Node.DOCUMENT_POSITION_FOLLOWING
    )

    const progressBars = screen.getAllByRole('progressbar')
    assert.strictEqual(progressBars.length, 2)
    assert.strictEqual(progressBars[0].getAttribute('aria-valuenow'), '25')
    assert.strictEqual(
      progressBars[0].getAttribute('aria-label'),
      '25% quota used'
    )
    assert.strictEqual(progressBars[1].getAttribute('aria-valuenow'), '30')
    assert.ok(screen.getByText('25%'))
    assert.ok(screen.getByText('30%'))
  })

  it('renders code completions quota snapshots', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(
          new Map<string, ICopilotQuotaSnapshot>([
            [
              'completions',
              makeQuotaSnapshot({
                entitlementRequests: 100,
                usedRequests: 25,
                remainingPercentage: 75,
              }),
            ],
          ])
        )}
      />
    )

    assert.ok(screen.getByText('Code completions'))
    assert.ok(screen.getByText('25%'))
  })

  it('describes unlimited quotas as determinate progress', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(
          new Map<string, ICopilotQuotaSnapshot>([
            [
              'chat',
              makeQuotaSnapshot({
                isUnlimitedEntitlement: true,
                entitlementRequests: -1,
                usedRequests: 0,
                remainingPercentage: 100,
              }),
            ],
          ])
        )}
      />
    )

    const progressBar = screen.getByRole('progressbar', {
      name: 'No usage limit',
    })
    assert.strictEqual(progressBar.getAttribute('aria-valuenow'), '0')
    assert.strictEqual(progressBar.getAttribute('aria-valuemin'), '0')
    assert.strictEqual(progressBar.getAttribute('aria-valuemax'), '100')
    assert.strictEqual(
      progressBar.getAttribute('aria-valuetext'),
      'No usage limit'
    )
  })

  it('renders token-based billing quota snapshots as AI credits', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        copilotQuotaSnapshotsByAccount={quotaSnapshotsForDefaultAccount(
          new Map<string, ICopilotQuotaSnapshot>([
            [
              'chat',
              makeQuotaSnapshot({
                isUnlimitedEntitlement: true,
                entitlementRequests: -1,
                usedRequests: 0,
                remainingPercentage: 100,
                tokenBasedBilling: true,
              }),
            ],
            [
              'completions',
              makeQuotaSnapshot({
                isUnlimitedEntitlement: true,
                entitlementRequests: -1,
                usedRequests: 0,
                remainingPercentage: 100,
                tokenBasedBilling: true,
              }),
            ],
            [
              'premium_interactions',
              makeQuotaSnapshot({
                entitlementRequests: 12.5,
                usedRequests: 2.5,
                remainingPercentage: 80,
                tokenBasedBilling: true,
              }),
            ],
          ])
        )}
      />
    )

    assert.ok(screen.getByText('AI credits'))
    assert.ok(screen.getByText('(resets monthly)'))
    assert.strictEqual(screen.queryByText('Chat messages'), null)
    assert.ok(screen.getByText('20%'))
  })
})
