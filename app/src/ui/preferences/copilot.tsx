import * as React from 'react'
import type { IBYOKProvider } from '../../lib/copilot/byok'
import { isGHES } from '../../lib/endpoint-capabilities'
import {
  enableCopilotSdkCommitMessageGeneration,
  enableOpenCodeCommitMessages,
} from '../../lib/feature-flag'
import {
  type CopilotFeature,
  getCopilotAccountCacheKey,
  type CopilotModelsByAccount,
  type CopilotModelSelections,
  type CopilotModelSelectionsByAccount,
  type CopilotQuotaSnapshotsByAccount,
  type CopilotQuotaSnapshots,
} from '../../lib/stores/copilot-store'
import {
  CopilotLicenseTypeNoAccess,
  isDotComAccount,
  isEnterpriseAccount,
  type Account,
} from '../../models/account'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { CallToAction } from '../lib/call-to-action'
import type { Model } from '@github/copilot-sdk/dist/generated/rpc'
import { CopilotUserSettings } from './copilot-user-settings'
import { SnapshotCard } from './snapshot-card'
import { Select } from '../lib/select'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import {
  type CommitMessageProvider,
  loadCommitMessageProvider,
  saveCommitMessageProvider,
} from '../../lib/opencode/commit-message-provider-pref'
import {
  type IOpenCodeConfig,
  loadOpenCodeConfig,
  saveOpenCodeConfig,
} from '../../lib/opencode/opencode-config'
import { checkOpenCodeCliAvailability } from '../../lib/commit-message-generator'
import type { IOpenCodeAvailability } from '../../models/opencode'
import { invoke } from '../../lib/ipc-renderer'

interface ICopilotPreferencesProps {
  readonly selectedCopilotModelsByAccount: CopilotModelSelectionsByAccount
  readonly copilotModelsByAccount: CopilotModelsByAccount
  readonly copilotQuotaSnapshotsByAccount: CopilotQuotaSnapshotsByAccount
  readonly accounts: ReadonlyArray<Account>
  readonly byokProviders: ReadonlyArray<IBYOKProvider>
  readonly showBYOKSettings: boolean
  readonly onSignIn: () => void
  readonly onOpenCopilotPlans: () => void
  readonly onOpenCopilotFeatureSettings: () => void
  readonly alwaysUseCopilotForConflictResolution: boolean
  readonly onSelectedCopilotModelChanged: (
    account: Account,
    feature: CopilotFeature,
    model: string | null
  ) => void
  readonly onAlwaysUseCopilotForConflictResolutionChanged: (
    checked: boolean
  ) => void
  readonly onConfigureCustomProviders: () => void
  readonly onConfigureModels: (account: Account) => void
}

interface ICopilotPreferencesState {
  readonly selectedProvider: CommitMessageProvider
  readonly opencodeConfig: IOpenCodeConfig
  readonly checkingAvailability: boolean
  readonly availabilityResult: IOpenCodeAvailability | null
  readonly opencodeModels: ReadonlyArray<string>
  readonly loadingModels: boolean
  readonly modelsError: string | null
}

type CopilotAccessState =
  | 'signed-out'
  | 'checking'
  | 'no-license'
  | 'desktop-disabled'

export class CopilotPreferences extends React.Component<
  ICopilotPreferencesProps,
  ICopilotPreferencesState
> {
  public constructor(props: ICopilotPreferencesProps) {
    super(props)
    this.state = {
      selectedProvider: loadCommitMessageProvider(),
      opencodeConfig: loadOpenCodeConfig(),
      checkingAvailability: false,
      availabilityResult: null,
      opencodeModels: [],
      loadingModels: false,
      modelsError: null,
    }
  }

  public render() {
    const accounts = this.getCopilotSettingsAccounts()
    const showOpenCodeSections = enableOpenCodeCommitMessages()

    return (
      <DialogContent className="copilot-tab">
        {showOpenCodeSections && this.renderProviderPicker()}
        {showOpenCodeSections &&
          this.state.selectedProvider === 'openCode' &&
          this.renderOpenCodeSettings()}
        {this.renderCopilotContent(accounts)}
      </DialogContent>
    )
  }

  private renderCopilotContent(
    accounts: ReadonlyArray<Account>
  ): JSX.Element | null {
    if (accounts.length === 1) {
      return this.renderUserSettings(accounts[0])
    }

    if (accounts.length > 1) {
      return this.renderAccountSnapshotCards(accounts)
    }

    const accessState = this.getCopilotAccessState()
    return (
      <div className="copilot-tab-content">
        <div className="copilot-settings-scroll">
          <div className="copilot-section">
            {this.renderAccessState(accessState)}
          </div>
        </div>
      </div>
    )
  }

  private renderUserSettings(account: Account): JSX.Element {
    return (
      <CopilotUserSettings
        account={account}
        selectedCopilotModels={this.getSelectedCopilotModels(account)}
        copilotModels={this.getCopilotModels(account)}
        copilotQuotaSnapshots={this.getCopilotQuotaSnapshots(account)}
        byokProviders={this.props.byokProviders}
        showBYOKSettings={this.props.showBYOKSettings}
        alwaysUseCopilotForConflictResolution={
          this.props.alwaysUseCopilotForConflictResolution
        }
        onSelectedCopilotModelChanged={this.props.onSelectedCopilotModelChanged}
        onAlwaysUseCopilotForConflictResolutionChanged={
          this.props.onAlwaysUseCopilotForConflictResolutionChanged
        }
        onConfigureCustomProviders={this.props.onConfigureCustomProviders}
      />
    )
  }

  private renderAccountSnapshotCards(
    accounts: ReadonlyArray<Account>
  ): JSX.Element {
    const dotComAccounts = accounts.filter(isDotComAccount)
    const enterpriseAccounts = accounts.filter(isEnterpriseAccount)

    return (
      <div className="copilot-tab-content">
        <div className="copilot-settings-scroll">
          <div className="copilot-section copilot-account-snapshot-groups">
            {this.renderAccountSnapshotCardGroup('GitHub.com', dotComAccounts)}
            {this.renderAccountSnapshotCardGroup(
              'GitHub Enterprise',
              enterpriseAccounts
            )}
          </div>
        </div>
      </div>
    )
  }

  private renderAccountSnapshotCardGroup(
    heading: string,
    accounts: ReadonlyArray<Account>
  ): JSX.Element | null {
    if (accounts.length === 0) {
      return null
    }

    return (
      <div className="copilot-account-snapshot-card-group">
        <h2>{heading}</h2>
        <div className="copilot-account-snapshot-card-list">
          {accounts.map(account => (
            <SnapshotCard
              key={getCopilotAccountCacheKey(account)}
              account={account}
              snapshots={this.getCopilotQuotaSnapshots(account)}
              onConfigureModels={this.props.onConfigureModels}
            />
          ))}
        </div>
      </div>
    )
  }

  private renderProviderPicker(): JSX.Element {
    return (
      <div className="copilot-section">
        <h2>Commit message provider</h2>
        <Select
          label="Provider"
          value={this.state.selectedProvider}
          onChange={this.onSelectedProviderChanged}
        >
          <option value="copilot">GitHub Copilot</option>
          <option value="openCode">OpenCode</option>
        </Select>
        <p className="settings-description">
          Choose which AI tool generates your commit messages. You can override
          this per repository in Repository Settings.
        </p>
      </div>
    )
  }

  private renderOpenCodeSettings(): JSX.Element {
    const { opencodeConfig, checkingAvailability, availabilityResult } =
      this.state

    return (
      <div className="copilot-section opencode-settings">
        <h2>OpenCode</h2>
        <Checkbox
          label="Enabled"
          value={
            opencodeConfig.enabled ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onOpenCodeEnabledChanged}
          ariaDescribedBy="opencode-enabled-description"
        />
        <div
          id="opencode-enabled-description"
          className="settings-description"
        >
          <p>Requires the OpenCode CLI to be installed and available.</p>
        </div>
        <Checkbox
          label="Generate code review on commit"
          value={
            opencodeConfig.reviewOnCommit ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onOpenCodeReviewOnCommitChanged}
          ariaDescribedBy="opencode-review-on-commit-description"
        />
        <div
          id="opencode-review-on-commit-description"
          className="settings-description"
        >
          <p>
            When enabled, Desktop Claw runs OpenCode after each commit to
            analyze the code and writes a Markdown review report to{' '}
            .desktop-claw/review-&lt;commit&gt;.md in the repository root.
          </p>
        </div>
        <TextBox
          label="Path to opencode executable"
          value={opencodeConfig.command}
          onValueChanged={this.onOpenCodeCommandChanged}
          placeholder="opencode"
        />
        <p className="settings-description">
          Leave empty to use 'opencode' from your PATH.
        </p>
        <div className="opencode-availability-row">
          <Button
            onClick={this.onCheckAvailability}
            disabled={checkingAvailability}
          >
            {checkingAvailability ? 'Checking…' : 'Check availability'}
          </Button>
          {availabilityResult !== null &&
            this.renderAvailabilityResult(availabilityResult)}
        </div>
        {this.renderOpenCodeModelPicker()}
      </div>
    )
  }

  private renderAvailabilityResult(
    result: IOpenCodeAvailability
  ): JSX.Element {
    if (result.available) {
      return (
        <span className="opencode-availability-success">
          OpenCode CLI is available
          {result.version !== null ? ` (${result.version})` : ''}
        </span>
      )
    }

    return (
      <span className="opencode-availability-error">
        OpenCode CLI is not available
      </span>
    )
  }

  private renderOpenCodeModelPicker(): JSX.Element {
    const { opencodeModels, loadingModels, modelsError } = this.state

    if (loadingModels) {
      return (
        <div className="opencode-model-picker">
          <p className="settings-description">Loading available models…</p>
        </div>
      )
    }

    if (modelsError !== null) {
      return (
        <div className="opencode-model-picker">
          <p className="settings-description opencode-models-error">
            {modelsError}
          </p>
          <div className="opencode-models-refresh-row">
            <Button
              onClick={this.refreshOpenCodeModels}
              disabled={loadingModels}
            >
              Retry
            </Button>
          </div>
        </div>
      )
    }

    if (opencodeModels.length === 0) {
      return (
        <div className="opencode-model-picker">
          <p className="settings-description">
            No models available. Check that the OpenCode CLI is installed and
            configured.
          </p>
          <div className="opencode-models-refresh-row">
            <Button
              onClick={this.refreshOpenCodeModels}
              disabled={loadingModels}
            >
              Refresh models
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="opencode-model-picker">
        <div className="opencode-model-picker-row">
          <Select
            label="Model"
            value={this.state.opencodeConfig.model ?? ''}
            onChange={this.onOpenCodeModelChanged}
          >
            <option value="">Default</option>
            {opencodeModels.map(model => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
          <Button
            onClick={this.refreshOpenCodeModels}
            disabled={loadingModels}
            className="opencode-models-refresh-button"
          >
            Refresh
          </Button>
        </div>
        <p className="settings-description">
          Choose which model OpenCode uses for commit messages. Leave as
          "Default" to use OpenCode's configured default.
        </p>
      </div>
    )
  }

  private getCopilotAccounts(): ReadonlyArray<Account> {
    return this.props.accounts.filter(account => !isGHES(account.endpoint))
  }

  private onSelectedProviderChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value as CommitMessageProvider
    this.setState({ selectedProvider: value, availabilityResult: null })
    saveCommitMessageProvider(value)
    if (value === 'openCode') {
      this.refreshOpenCodeModels()
    }
  }

  private onOpenCodeEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const enabled = event.currentTarget.checked
    const config = { ...this.state.opencodeConfig, enabled }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
  }

  private onOpenCodeReviewOnCommitChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const checked = event.currentTarget.checked
    const config = { ...this.state.opencodeConfig, reviewOnCommit: checked }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
  }

  private onOpenCodeCommandChanged = (command: string) => {
    const config = { ...this.state.opencodeConfig, command }
    this.setState({ opencodeConfig: config, availabilityResult: null })
    saveOpenCodeConfig(config)
    this.refreshOpenCodeModels()
  }

  private onCheckAvailability = async () => {
    this.setState({ checkingAvailability: true, availabilityResult: null })
    try {
      const result = await checkOpenCodeCliAvailability(
        this.state.opencodeConfig.command
      )
      this.setState({ availabilityResult: result })
    } catch (e) {
      this.setState({
        availabilityResult: { available: false, version: null },
      })
    } finally {
      this.setState({ checkingAvailability: false })
    }
  }

  private onOpenCodeModelChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value || null
    const config = { ...this.state.opencodeConfig, model: value }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
  }

  private refreshOpenCodeModels = async () => {
    const command = this.state.opencodeConfig.command
    if (command.trim() === '') {
      return
    }

    this.setState({ loadingModels: true, modelsError: null })
    try {
      const models = await invoke('opencode-list-models', command)
      this.setState({ opencodeModels: models })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      this.setState({ modelsError: `Failed to load models: ${message}` })
    } finally {
      this.setState({ loadingModels: false })
    }
  }

  private getCopilotSettingsAccounts(): ReadonlyArray<Account> {
    return this.getCopilotAccounts().filter(
      account =>
        enableCopilotSdkCommitMessageGeneration(account) &&
        account.isCopilotDesktopEnabled === true &&
        account.copilotLicenseType !== undefined &&
        account.copilotLicenseType !== CopilotLicenseTypeNoAccess
    )
  }

  private getCopilotModels(account: Account): ReadonlyArray<Model> | null {
    return (
      this.props.copilotModelsByAccount.get(
        getCopilotAccountCacheKey(account)
      ) ?? null
    )
  }

  private getSelectedCopilotModels(account: Account): CopilotModelSelections {
    return (
      this.props.selectedCopilotModelsByAccount.get(
        getCopilotAccountCacheKey(account)
      ) ?? {}
    )
  }

  private getCopilotQuotaSnapshots(
    account: Account
  ): CopilotQuotaSnapshots | null {
    return (
      this.props.copilotQuotaSnapshotsByAccount.get(
        getCopilotAccountCacheKey(account)
      ) ?? null
    )
  }

  private getCopilotAccessState(): CopilotAccessState {
    const accounts = this.getCopilotAccounts()

    if (accounts.length === 0) {
      return 'signed-out'
    }

    let hasCheckingAccount = false
    let hasNoAccessAccount = false
    let hasDesktopDisabledAccount = false

    for (const account of accounts) {
      if (
        account.copilotLicenseType === undefined ||
        account.isCopilotDesktopEnabled === undefined
      ) {
        hasCheckingAccount = true
      } else if (account.copilotLicenseType === CopilotLicenseTypeNoAccess) {
        hasNoAccessAccount = true
      } else if (account.isCopilotDesktopEnabled === false) {
        hasDesktopDisabledAccount = true
      }
    }

    if (hasCheckingAccount) {
      return 'checking'
    }

    if (hasDesktopDisabledAccount) {
      return 'desktop-disabled'
    }

    if (hasNoAccessAccount) {
      return 'no-license'
    }

    return 'checking'
  }

  private renderAccessState(accessState: CopilotAccessState): JSX.Element {
    switch (accessState) {
      case 'signed-out':
        return this.renderAccessCallToAction(
          'Sign in to an account with a Copilot license to configure Copilot settings.',
          'Sign In',
          this.props.onSignIn,
          DialogPreferredFocusClassName
        )
      case 'checking':
        return <p>Checking Copilot access…</p>
      case 'no-license':
        return this.renderAccessCallToAction(
          'Copilot features in Desktop Claw require a GitHub Copilot license.',
          'View Copilot plans',
          this.props.onOpenCopilotPlans
        )
      case 'desktop-disabled':
        return this.renderAccessCallToAction(
          'A Copilot license is available for your account, but "Copilot in GitHub Desktop" is disabled in your Copilot feature settings.',
          'Open Copilot feature settings',
          this.props.onOpenCopilotFeatureSettings
        )
    }
  }

  private renderAccessCallToAction(
    message: string,
    actionTitle: string,
    onAction: () => void,
    buttonClassName?: string
  ): JSX.Element {
    return (
      <div className="copilot-access-call-to-action">
        <CallToAction
          actionTitle={actionTitle}
          onAction={onAction}
          buttonClassName={buttonClassName}
        >
          <div>{message}</div>
        </CallToAction>
      </div>
    )
  }
}
