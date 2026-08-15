import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent, within } from '../../helpers/ui/render'
import {
  defaults,
  makeAccount,
  defaultModel,
  models,
  quotaSnapshots,
} from '../../helpers/ui/copilot-preferences-fixtures'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import { getCopilotAccountCacheKey } from '../../../src/lib/stores/copilot-store'
import { Account } from '../../../src/models/account'

// Split out of the former copilot-preferences-test.tsx (see
// copilot-preferences-fixtures.tsx for why). This file covers sign-in and
// account-access states: no account, GHES-only, loading metadata, missing
// license, disabled Desktop access, and multi-account rendering.

describe('CopilotPreferences access states', () => {
  it('shows sign-in call to action when no account is available', () => {
    let called = 0

    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[]}
        onSignIn={() => {
          called += 1
        }}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to an account with a Copilot license to configure Copilot settings.'
      )
    )

    const signInButton = screen.getByRole('button', {
      name: 'Sign In',
    })
    fireEvent.click(signInButton)

    assert.strictEqual(called, 1)
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows sign-in call to action when only GHES accounts are available', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            endpoint: 'https://enterprise.example.com/api/v3',
            id: 2,
            login: 'octo',
            isCopilotDesktopEnabled: undefined,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to an account with a Copilot license to configure Copilot settings.'
      )
    )
    assert.strictEqual(screen.queryByText('Checking Copilot access…'), null)
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows checking message when Copilot account metadata has not loaded', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            isCopilotDesktopEnabled: undefined,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(screen.getByText('Checking Copilot access…'))
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('shows checking message when Copilot license metadata has not loaded', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            isCopilotDesktopEnabled: true,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(screen.getByText('Checking Copilot access…'))
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('opens Copilot plans when the user does not have a Copilot license', () => {
    let called = 0

    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            copilotLicenseType: 'NO_ACCESS',
          }),
        ]}
        onOpenCopilotPlans={() => {
          called += 1
        }}
      />
    )

    assert.ok(
      screen.getByText(
        'Copilot features in Desktop Claw require a GitHub Copilot license.'
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Copilot plans' }))

    assert.strictEqual(called, 1)
    assert.strictEqual(screen.queryByRole('combobox'), null)
  })

  it('opens Copilot feature settings when Desktop access is disabled', () => {
    let called = 0
    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({
            isCopilotDesktopEnabled: false,
          }),
        ]}
        showBYOKSettings={true}
        onOpenCopilotFeatureSettings={() => {
          called += 1
        }}
      />
    )

    assert.ok(
      screen.getByText(
        'A Copilot license is available for your account, but "Copilot in GitHub Desktop" is disabled in your Copilot feature settings.'
      )
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Copilot feature settings' })
    )

    assert.strictEqual(called, 1)
    assert.strictEqual(screen.queryByRole('combobox'), null)
    assert.strictEqual(
      view.container.querySelectorAll('[role="tab"]').length,
      0
    )
  })

  it('uses Copilot when a GHE account has Copilot enabled', () => {
    const account = makeAccount({
      endpoint: 'https://api.octocorp.ghe.com',
      id: 2,
      login: 'octo',
      name: 'Octo Cat',
      isCopilotDesktopEnabled: true,
      copilotLicenseType: 'COPILOT_BUSINESS',
    })

    render(
      <CopilotPreferences
        {...defaults()}
        copilotModelsByAccount={
          new Map([[getCopilotAccountCacheKey(account), models]])
        }
        copilotQuotaSnapshotsByAccount={
          new Map([[getCopilotAccountCacheKey(account), quotaSnapshots]])
        }
        accounts={[makeAccount({ copilotLicenseType: 'NO_ACCESS' }), account]}
      />
    )

    assert.ok(screen.getAllByRole('button', { name: /Auto/ }).length > 0)
    assert.ok(screen.getByText('@octo (Octo Cat)'))
    assert.ok(screen.getByText('https://octocorp.ghe.com/'))
    assert.strictEqual(screen.queryByText('@mona'), null)
    assert.strictEqual(screen.queryByText('View Copilot plans'), null)
  })

  it('renders Snapshot cards instead of model settings for multiple Copilot accounts', () => {
    const mona = makeAccount()
    const octo = makeAccount({
      endpoint: 'https://api.octocorp.ghe.com',
      id: 2,
      login: 'octo',
      name: 'Octo Cat',
      copilotLicenseType: 'COPILOT_BUSINESS',
    })

    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[mona, octo]}
        copilotQuotaSnapshotsByAccount={
          new Map([
            [getCopilotAccountCacheKey(mona), quotaSnapshots],
            [getCopilotAccountCacheKey(octo), quotaSnapshots],
          ])
        }
      />
    )

    assert.ok(screen.getByRole('heading', { name: 'GitHub.com' }))
    assert.ok(screen.getByRole('heading', { name: 'GitHub Enterprise' }))
    assert.ok(screen.getByText('Mona Lisa'))
    assert.ok(screen.getByText('@mona'))
    assert.ok(screen.getByText('@octo (Octo Cat)'))
    assert.ok(screen.getByText('https://octocorp.ghe.com/'))
    assert.strictEqual(
      view.container.querySelector('.copilot-model-picker'),
      null
    )
    assert.strictEqual(
      screen.getAllByRole('button', { name: /Configure…/i }).length,
      2
    )
  })

  it('excludes accounts without Copilot SDK access from settings', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount(),
          makeAccount({
            endpoint: 'https://api.octocorp.ghe.com',
            id: 2,
            login: 'octo',
            name: 'Octo Cat',
            features: [],
            copilotLicenseType: 'COPILOT_BUSINESS',
          }),
        ]}
      />
    )

    assert.ok(screen.getAllByRole('button', { name: /Auto/ }).length > 0)
    assert.ok(screen.getByText('Mona Lisa'))
    assert.strictEqual(screen.queryByText('@octo (Octo Cat)'), null)
    assert.strictEqual(
      screen.queryByRole('heading', { name: 'GitHub Enterprise' }),
      null
    )
  })

  it('makes multiple account Snapshot cards scrollable', () => {
    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount(),
          makeAccount({
            endpoint: 'https://api.octocorp.ghe.com',
            id: 2,
            login: 'octo',
            name: 'Octo Cat',
            copilotLicenseType: 'COPILOT_BUSINESS',
          }),
        ]}
      />
    )

    const settingsScroll = view.container.querySelector(
      '.copilot-settings-scroll'
    )
    const snapshotGroups = view.container.querySelector(
      '.copilot-account-snapshot-groups'
    )
    assert.ok(settingsScroll instanceof HTMLElement)
    assert.ok(snapshotGroups instanceof HTMLElement)
    assert.strictEqual(settingsScroll.contains(snapshotGroups), true)
  })

  it('requests account-specific Copilot settings from a Snapshot card', () => {
    const mona = makeAccount()
    const octo = makeAccount({
      endpoint: 'https://api.octocorp.ghe.com',
      id: 2,
      login: 'octo',
      name: 'Octo Cat',
      copilotLicenseType: 'COPILOT_BUSINESS',
    })
    const configuredAccounts = new Array<Account>()

    const view = render(
      <CopilotPreferences
        {...defaults()}
        accounts={[mona, octo]}
        copilotModelsByAccount={
          new Map([
            [getCopilotAccountCacheKey(mona), [defaultModel]],
            [getCopilotAccountCacheKey(octo), models],
          ])
        }
        copilotQuotaSnapshotsByAccount={
          new Map([
            [getCopilotAccountCacheKey(mona), quotaSnapshots],
            [getCopilotAccountCacheKey(octo), quotaSnapshots],
          ])
        }
        onConfigureModels={account => configuredAccounts.push(account)}
      />
    )

    const cards = view.container.querySelectorAll('.copilot-snapshot-card')
    assert.strictEqual(cards.length, 2)
    const octoCard = cards[1]
    assert.ok(octoCard instanceof HTMLElement)
    fireEvent.click(
      within(octoCard).getByRole('button', { name: /Configure…/i })
    )

    assert.deepStrictEqual(configuredAccounts, [octo])
    assert.strictEqual(screen.queryByText('Copilot Settings: @octo'), null)
  })

  it('ignores GHES accounts while checking Copilot access', () => {
    render(
      <CopilotPreferences
        {...defaults()}
        accounts={[
          makeAccount({ copilotLicenseType: 'NO_ACCESS' }),
          makeAccount({
            endpoint: 'https://enterprise.example.com/api/v3',
            id: 2,
            login: 'octo',
            isCopilotDesktopEnabled: undefined,
            copilotLicenseType: undefined,
          }),
        ]}
      />
    )

    assert.ok(
      screen.getByText(
        'Copilot features in Desktop Claw require a GitHub Copilot license.'
      )
    )
    assert.strictEqual(screen.queryByRole('combobox'), null)
    assert.strictEqual(screen.queryByText('Checking Copilot access…'), null)
  })
})
