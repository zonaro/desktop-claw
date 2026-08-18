import * as React from 'react'
import classNames from 'classnames'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

import type { Dispatcher } from '../dispatcher'
import { isDotComAccount, type Account } from '../../models/account'
import { DialogContent } from '../dialog'
import { Select } from '../lib/select'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import {
  type IMemoryEntry,
  type IOpenCodeConfig,
  loadOpenCodeConfig,
  saveOpenCodeConfig,
} from '../../lib/opencode/opencode-config'
import {
  createMemoryId,
  deleteOpenCodeMemoryEntry,
  loadOpenCodeMemoryIntoConfig,
  writeOpenCodeMemoryEntry,
} from '../../lib/opencode/opencode-memory'
import { checkOpenCodeCliAvailability } from '../../lib/commit-message-generator'
import type { IOpenCodeAvailability } from '../../models/opencode'
import { invoke } from '../../lib/ipc-renderer'

interface IOpenCodePreferencesProps {
  /** Used to tell the Agent tab that the OpenCode server settings changed. */
  readonly dispatcher: Dispatcher
  /** Signed-in accounts; the first one provides the default user name. */
  readonly accounts: ReadonlyArray<Account>
}

interface IOpenCodePreferencesState {
  readonly opencodeConfig: IOpenCodeConfig
  readonly checkingAvailability: boolean
  readonly availabilityResult: IOpenCodeAvailability | null
  readonly opencodeModels: ReadonlyArray<string>
  readonly loadingModels: boolean
  readonly modelsError: string | null

  // Memory editor
  readonly memoryEditorOpen: boolean
  /** The entry being edited, or null when adding a new one. */
  readonly editingMemory: IMemoryEntry | null
  readonly memoryTitle: string
  readonly memoryContent: string
  readonly showMemoryPreview: boolean
  readonly savingMemory: boolean
  readonly memoryError: string | null
  /** Id of the entry whose delete button is awaiting confirmation. */
  readonly confirmingDeleteId: string | null
}

/**
 * The OpenCode tab of the AI preferences: CLI/server configuration, the model
 * picker and the memory (custom instructions) editor. Each memory entry is
 * persisted as its own Markdown file through the main process.
 */
export class OpenCodePreferences extends React.Component<
  IOpenCodePreferencesProps,
  IOpenCodePreferencesState
> {
  public constructor(props: IOpenCodePreferencesProps) {
    super(props)

    this.state = {
      opencodeConfig: loadOpenCodeConfig(),
      checkingAvailability: false,
      availabilityResult: null,
      opencodeModels: [],
      loadingModels: false,
      modelsError: null,
      memoryEditorOpen: false,
      editingMemory: null,
      memoryTitle: '',
      memoryContent: '',
      showMemoryPreview: false,
      savingMemory: false,
      memoryError: null,
      confirmingDeleteId: null,
    }
  }

  public async componentWillMount() {
    // Pre-fill "how the AI should call You?" from the signed-in account the
    // first time the OpenCode tab is opened.
    const config = loadOpenCodeConfig()
    if (config.userName === null) {
      const account =
        this.props.accounts.find(isDotComAccount) ??
        this.props.accounts.at(0)
      if (account !== undefined) {
        saveOpenCodeConfig({ ...config, userName: account.friendlyName })
      }
    }

    // The Markdown files on disk are the source of truth for memory entries.
    // Refresh the config so entries created before startup show up here.
    try {
      await loadOpenCodeMemoryIntoConfig()
      this.setState({ opencodeConfig: loadOpenCodeConfig() })
    } catch {
      // Keep whatever is in the config; the memory directory is best-effort.
    }

    this.refreshOpenCodeModels()
  }

  public render() {
    return (
      <DialogContent className="copilot-tab">
        {this.renderOpenCodeSettings()}
        {this.renderMemorySection()}
        {this.state.memoryEditorOpen && this.renderMemoryEditor()}
      </DialogContent>
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
          value={opencodeConfig.enabled ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onOpenCodeEnabledChanged}
          ariaDescribedBy="opencode-enabled-description"
        />
        <div id="opencode-enabled-description" className="settings-description">
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
          label="Name"
          value={opencodeConfig.userName ?? ''}
          onValueChanged={this.onOpenCodeUserNameChanged}
          placeholder={this.getDefaultUserName() ?? ''}
        />
        <p className="settings-description">
          How the AI should call You? Leave empty to use your GitHub name.
        </p>
        <TextBox
          label="Path to opencode executable"
          value={opencodeConfig.command}
          onValueChanged={this.onOpenCodeCommandChanged}
          placeholder="opencode"
        />
        <p className="settings-description">
          Leave empty to use 'opencode' from your PATH.
        </p>
        <div className="opencode-server-row">
          <TextBox
            label="Server host"
            value={opencodeConfig.serverHost ?? ''}
            onValueChanged={this.onOpenCodeServerHostChanged}
            placeholder="127.0.0.1"
          />
          <TextBox
            label="Server port"
            type="text"
            value={
              opencodeConfig.serverPort === null
                ? ''
                : String(opencodeConfig.serverPort)
            }
            onValueChanged={this.onOpenCodeServerPortChanged}
            placeholder="4096"
          />
        </div>
        <div className="opencode-server-row">
          <TextBox
            label="Server user"
            value={opencodeConfig.serverUser ?? ''}
            onValueChanged={this.onOpenCodeServerUserChanged}
            placeholder="user"
          />
          <TextBox
            label="Server password"
            type="password"
            value={opencodeConfig.serverPassword ?? ''}
            onValueChanged={this.onOpenCodeServerPasswordChanged}
          />
        </div>
        <p className="settings-description">
          Set both to use an OpenCode server you already run — the Agent tab
          connects to it instead of starting one. Leave them empty to have
          Desktop Claw start a server from the executable above. If the server
          requires authentication, fill in the user and password.
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

  private renderAvailabilityResult(result: IOpenCodeAvailability): JSX.Element {
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

  private renderMemorySection(): JSX.Element {
    const { memory } = this.state.opencodeConfig

    return (
      <div className="copilot-section opencode-memory-section">
        <div className="opencode-memory-header">
          <div className="opencode-memory-header-text">
            <h2>Memory</h2>
            <p className="settings-description">
              Custom instructions the AI follows when generating commit
              messages and reviews. Each entry is stored as a Markdown file.
            </p>
          </div>
          <Button
            onClick={this.onAddMemory}
            disabled={this.state.savingMemory}
            className="opencode-memory-add-button"
          >
            <Octicon symbol={octicons.plus} />
            Add memory
          </Button>
        </div>

        {this.state.memoryError !== null && (
          <p className="opencode-memory-error">{this.state.memoryError}</p>
        )}

        {memory.length === 0 ? (
          <p className="settings-description opencode-memory-empty">
            No memory entries yet. Add one to give the AI standing
            instructions.
          </p>
        ) : (
          <ul className="opencode-memory-list">
            {memory.map(entry => this.renderMemoryEntry(entry))}
          </ul>
        )}
      </div>
    )
  }

  private renderMemoryEntry(entry: IMemoryEntry): JSX.Element {
    const isConfirmingDelete = this.state.confirmingDeleteId === entry.id
    const preview = this.getMemoryPreview(entry.content)

    return (
      <li key={entry.id} className="opencode-memory-entry">
        <div className="opencode-memory-entry-info">
          <div className="opencode-memory-entry-title">
            <Octicon symbol={octicons.note} />
            <span>{entry.title}</span>
          </div>
          {preview.length > 0 && (
            <div className="opencode-memory-entry-preview">{preview}</div>
          )}
          <div className="opencode-memory-entry-meta">
            Updated {formatMemoryDate(entry.updatedAt)}
          </div>
        </div>
        <div className="opencode-memory-entry-actions">
          <Button
            size="small"
            onClick={() => this.onEditMemory(entry)}
            ariaLabel="Edit memory entry"
            disabled={this.state.savingMemory}
          >
            <Octicon symbol={octicons.pencil} />
          </Button>
          <Button
            size="small"
            onClick={() => this.onDeleteMemory(entry)}
            ariaLabel={
              isConfirmingDelete
                ? 'Confirm deleting memory entry'
                : 'Delete memory entry'
            }
            disabled={this.state.savingMemory}
            className={isConfirmingDelete ? 'opencode-memory-delete-confirm' : ''}
          >
            {isConfirmingDelete ? 'Confirm' : <Octicon symbol={octicons.trash} />}
          </Button>
        </div>
      </li>
    )
  }

  private renderMemoryEditor(): JSX.Element {
    const isEditing = this.state.editingMemory !== null
    const canSave =
      this.state.memoryTitle.trim().length > 0 && !this.state.savingMemory

    return (
      <div
        className="opencode-memory-editor-overlay"
        onClick={this.onCancelMemoryEdit}
        onKeyDown={this.onMemoryEditorKeyDown}
      >
        <div
          className="opencode-memory-editor"
          onClick={e => e.stopPropagation()}
        >
          <h3>{isEditing ? 'Edit memory' : 'Add memory'}</h3>
          <TextBox
            label="Title"
            value={this.state.memoryTitle}
            onValueChanged={this.onMemoryTitleChanged}
            placeholder="e.g. Code style preferences"
            autoFocus={true}
          />
          <div className="opencode-memory-editor-mode" role="tablist">
            <Button
              size="small"
              className={classNames({
                selected: !this.state.showMemoryPreview,
              })}
              onClick={() => this.setState({ showMemoryPreview: false })}
            >
              Edit
            </Button>
            <Button
              size="small"
              className={classNames({
                selected: this.state.showMemoryPreview,
              })}
              onClick={() => this.setState({ showMemoryPreview: true })}
            >
              Preview
            </Button>
          </div>
          {this.state.showMemoryPreview ? (
            <div
              className="opencode-memory-editor-preview markdown-body"
              dangerouslySetInnerHTML={{
                __html: this.renderMarkdown(this.state.memoryContent),
              }}
            />
          ) : (
            <textarea
              className="opencode-memory-editor-textarea"
              value={this.state.memoryContent}
              onChange={this.onMemoryContentChanged}
              placeholder="Write the instructions in Markdown…"
              aria-label="Memory content"
              spellCheck={false}
            />
          )}
          {this.state.memoryError !== null && (
            <p className="opencode-memory-error">{this.state.memoryError}</p>
          )}
          <div className="opencode-memory-editor-actions">
            <Button
              onClick={this.onCancelMemoryEdit}
              disabled={this.state.savingMemory}
            >
              Cancel
            </Button>
            <Button onClick={this.onSaveMemory} disabled={!canSave}>
              {this.state.savingMemory ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    )
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

  private onOpenCodeUserNameChanged = (userName: string) => {
    const config = {
      ...this.state.opencodeConfig,
      userName: userName.trim().length === 0 ? null : userName,
    }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
  }

  private onOpenCodeServerHostChanged = (host: string) => {
    const trimmed = host.trim()
    const config = {
      ...this.state.opencodeConfig,
      serverHost: trimmed.length === 0 ? null : trimmed,
    }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
    // The Agent tab caches its connection, so it has to be told to re-read it.
    this.props.dispatcher.resetOpenCodeServer()
  }

  private onOpenCodeServerPortChanged = (port: string) => {
    const trimmed = port.trim()
    const parsed = Number.parseInt(trimmed, 10)
    const config = {
      ...this.state.opencodeConfig,
      serverPort:
        trimmed.length === 0 || !Number.isInteger(parsed) || parsed <= 0
          ? null
          : parsed,
    }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
    this.props.dispatcher.resetOpenCodeServer()
  }

  private onOpenCodeServerUserChanged = (user: string) => {
    const trimmed = user.trim()
    const config = {
      ...this.state.opencodeConfig,
      serverUser: trimmed.length === 0 ? null : trimmed,
    }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
    // The Agent tab caches its connection, so it has to be told to re-read it.
    this.props.dispatcher.resetOpenCodeServer()
  }

  private onOpenCodeServerPasswordChanged = (password: string) => {
    // Trim only to decide emptiness — the stored password stays untouched so
    // passwords with leading/trailing whitespace still authenticate.
    const config = {
      ...this.state.opencodeConfig,
      serverPassword: password.trim().length === 0 ? null : password,
    }
    this.setState({ opencodeConfig: config })
    saveOpenCodeConfig(config)
    this.props.dispatcher.resetOpenCodeServer()
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

  private onAddMemory = () => {
    this.setState({
      memoryEditorOpen: true,
      editingMemory: null,
      memoryTitle: '',
      memoryContent: '',
      showMemoryPreview: false,
      memoryError: null,
      confirmingDeleteId: null,
    })
  }

  private onEditMemory = (entry: IMemoryEntry) => {
    this.setState({
      memoryEditorOpen: true,
      editingMemory: entry,
      memoryTitle: entry.title,
      memoryContent: entry.content,
      showMemoryPreview: false,
      memoryError: null,
      confirmingDeleteId: null,
    })
  }

  private onCancelMemoryEdit = () => {
    if (this.state.savingMemory) {
      return
    }

    this.setState({
      memoryEditorOpen: false,
      editingMemory: null,
      memoryTitle: '',
      memoryContent: '',
      showMemoryPreview: false,
      memoryError: null,
    })
  }

  private onMemoryEditorKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Keep Escape from dismissing the whole preferences dialog.
      event.preventDefault()
      this.onCancelMemoryEdit()
    }
  }

  private onMemoryTitleChanged = (memoryTitle: string) => {
    this.setState({ memoryTitle })
  }

  private onMemoryContentChanged = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    this.setState({ memoryContent: event.currentTarget.value })
  }

  private onSaveMemory = async () => {
    const title = this.state.memoryTitle.trim()
    if (title.length === 0 || this.state.savingMemory) {
      return
    }

    const now = Date.now()
    const editing = this.state.editingMemory
    const entry: IMemoryEntry = {
      id: editing !== null ? editing.id : createMemoryId(),
      title,
      content: this.state.memoryContent,
      createdAt: editing !== null ? editing.createdAt : now,
      updatedAt: now,
    }

    this.setState({ savingMemory: true, memoryError: null })
    try {
      await writeOpenCodeMemoryEntry(entry)

      const config = loadOpenCodeConfig()
      const memory = editing
        ? config.memory.map(m => (m.id === entry.id ? entry : m))
        : [...config.memory, entry]
      // Most recently updated first, matching the file listing on disk.
      memory.sort((a, b) => b.updatedAt - a.updatedAt)

      const nextConfig = { ...config, memory }
      saveOpenCodeConfig(nextConfig)

      this.setState({
        opencodeConfig: nextConfig,
        memoryEditorOpen: false,
        editingMemory: null,
        memoryTitle: '',
        memoryContent: '',
        showMemoryPreview: false,
        savingMemory: false,
      })
    } catch (e) {
      this.setState({
        savingMemory: false,
        memoryError:
          e instanceof Error ? e.message : 'Failed to save memory entry',
      })
    }
  }

  private onDeleteMemory = async (entry: IMemoryEntry) => {
    if (this.state.confirmingDeleteId !== entry.id) {
      this.setState({ confirmingDeleteId: entry.id })
      return
    }

    this.setState({ confirmingDeleteId: null, savingMemory: true, memoryError: null })
    try {
      await deleteOpenCodeMemoryEntry(entry.id)

      const config = loadOpenCodeConfig()
      const memory = config.memory.filter(m => m.id !== entry.id)
      const nextConfig = { ...config, memory }
      saveOpenCodeConfig(nextConfig)

      this.setState({ opencodeConfig: nextConfig, savingMemory: false })
    } catch (e) {
      this.setState({
        savingMemory: false,
        memoryError:
          e instanceof Error ? e.message : 'Failed to delete memory entry',
      })
    }
  }

  private getDefaultUserName(): string | null {
    const account =
      this.props.accounts.find(isDotComAccount) ?? this.props.accounts.at(0)
    return account !== undefined ? account.friendlyName : null
  }

  /** Converts markdown to sanitized HTML for the live preview. */
  private renderMarkdown(markdown: string): string {
    const rawHtml = marked(markdown, { gfm: true, breaks: true })
    return DOMPurify.sanitize(rawHtml as string, {
      USE_PROFILES: { html: true },
    })
  }

  /** Strips markdown down to a short plain-text preview for the list. */
  private getMemoryPreview(content: string): string {
    const plain = content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`~[\]()!-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain
  }
}

/** Formats a timestamp as a short localized date for the entry meta row. */
function formatMemoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}
