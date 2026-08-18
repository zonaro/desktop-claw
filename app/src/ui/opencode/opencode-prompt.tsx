import * as React from 'react'
import classNames from 'classnames'
import { clipboard } from 'electron'
import { writeFile } from 'fs/promises'
import * as Path from 'path'
import * as os from 'os'

import {
  formatModelValue,
  getFileReferenceQuery,
  parseModelValue,
} from '../../lib/opencode/opencode-session-helpers'
import { createFileAttachment } from '../../lib/opencode/opencode-attachments'
import {
  IOpenCodeAgent,
  IOpenCodeAttachment,
  IOpenCodeModelOption,
  IOpenCodeModelSelection,
} from '../../models/opencode-session'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { showOpenDialog } from '../main-process-proxy'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { invoke } from '../../lib/ipc-renderer'
import { loadOpenCodeConfig } from '../../lib/opencode/opencode-config'

/** The tallest the prompt box grows before it starts scrolling. */
const MaxPromptHeight = 320

/** How many file suggestions the `@` popup shows at once. */
const MaxFileSuggestions = 8

/** How long to wait after a keystroke before searching for files. */
const FileSearchDebounce = 150

interface IOpenCodePromptProps {
  /** The repository the conversation belongs to. */
  readonly repositoryPath: string

  /** The agents that can be picked for the next prompt. */
  readonly agents: ReadonlyArray<IOpenCodeAgent>

  /** The currently selected agent name, or null for OpenCode's default. */
  readonly selectedAgent: string | null

  /** Every model the configured providers offer. */
  readonly modelOptions: ReadonlyArray<IOpenCodeModelOption>

  /** The model picked for the next prompt, or null for OpenCode's default. */
  readonly selectedModel: IOpenCodeModelSelection | null

  /** The reasoning variant picked for the next prompt, or null. */
  readonly selectedVariant: string | null

  /** Whether the session is currently producing a response. */
  readonly isBusy: boolean

  /** How many prompts are already waiting for the current run to finish. */
  readonly queuedCount: number

  /** Called with the prompt when the user submits. */
  readonly onSubmit: (
    text: string,
    attachments: ReadonlyArray<IOpenCodeAttachment>
  ) => void

  /**
   * Called to send the prompt to the run already in progress, so the agent
   * takes it into account instead of waiting for its turn to end.
   */
  readonly onSteer: (
    text: string,
    attachments: ReadonlyArray<IOpenCodeAttachment>
  ) => void

  /** Called when the user interrupts the run in progress. */
  readonly onAbort: () => void

  /** Called when the user picks a different agent. */
  readonly onAgentChanged: (agent: string | null) => void

  /** Called when the user picks a different model. */
  readonly onModelChanged: (model: IOpenCodeModelSelection | null) => void

  /** Called when the user picks a different variant. */
  readonly onVariantChanged: (variant: string | null) => void

  /** Searches the repository for files matching an `@` reference. */
  readonly onFindFiles: (query: string) => Promise<ReadonlyArray<string>>

  /** Reports a file that could not be attached, so the user isn't left guessing. */
  readonly onAttachmentError: (message: string) => void
}

interface IOpenCodePromptState {
  readonly text: string

  /** Files attached from disk, sent alongside the prompt. */
  readonly attachments: ReadonlyArray<IOpenCodeAttachment>

  /** Paths offered for the `@` reference being typed. */
  readonly fileSuggestions: ReadonlyArray<string>

  /** Index of the highlighted suggestion. */
  readonly suggestionIndex: number

  /** Whether we're currently optimizing the prompt. */
  readonly isOptimizing: boolean
}

/**
 * The prompt box at the bottom of the conversation: an auto-growing text area
 * with agent, model and variant pickers, file attachments and `@` file
 * references, matching OpenCode's submit behaviour (Enter sends, Shift+Enter
 * inserts a newline).
 */
export class OpenCodePrompt extends React.Component<
  IOpenCodePromptProps,
  IOpenCodePromptState
> {
  private readonly textAreaRef = React.createRef<HTMLTextAreaElement>()

  /** The pending debounced file search, if any. */
  private searchTimeoutId: number | null = null

  /** The start offset of the `@` reference the suggestions belong to. */
  private referenceStart: number | null = null

  /** Set once the component unmounts so in-flight searches are discarded. */
  private isUnmounted = false

  public constructor(props: IOpenCodePromptProps) {
    super(props)

    this.state = {
      text: '',
      attachments: [],
      fileSuggestions: [],
      suggestionIndex: 0,
      isOptimizing: false,
    }
  }

  public componentDidUpdate() {
    this.resizeTextArea()
  }

  public componentWillUnmount() {
    this.isUnmounted = true

    if (this.searchTimeoutId !== null) {
      window.clearTimeout(this.searchTimeoutId)
      this.searchTimeoutId = null
    }
  }

  /** Grows the text area to fit its content, up to {@link MaxPromptHeight}. */
  private resizeTextArea() {
    const textArea = this.textAreaRef.current

    if (textArea === null) {
      return
    }

    textArea.style.height = 'auto'
    textArea.style.height = `${Math.min(
      textArea.scrollHeight,
      MaxPromptHeight
    )}px`
  }

  private onTextChanged = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = event.currentTarget

    this.setState({ text: value })
    this.scheduleFileSearch(value, selectionStart ?? value.length)
  }

  /**
   * Looks for files matching the `@` reference at the caret, debounced so a
   * fast typist doesn't queue a request per keystroke.
   */
  private scheduleFileSearch(text: string, caret: number) {
    if (this.searchTimeoutId !== null) {
      window.clearTimeout(this.searchTimeoutId)
      this.searchTimeoutId = null
    }

    const reference = getFileReferenceQuery(text, caret)

    if (reference === null) {
      this.referenceStart = null
      this.setState({ fileSuggestions: [], suggestionIndex: 0 })
      return
    }

    this.referenceStart = reference.start

    this.searchTimeoutId = window.setTimeout(() => {
      this.searchTimeoutId = null

      this.props
        .onFindFiles(reference.query)
        .then(files => {
          // The caret may have left the reference while the search ran.
          if (this.isUnmounted || this.referenceStart !== reference.start) {
            return
          }

          this.setState({
            fileSuggestions: files.slice(0, MaxFileSuggestions),
            suggestionIndex: 0,
          })
        })
        .catch(e => log.warn('Failed to search files for @ reference', e))
    }, FileSearchDebounce)
  }

  /** Replaces the `@` reference at the caret with the chosen path. */
  private acceptSuggestion(path: string) {
    const start = this.referenceStart

    if (start === null) {
      return
    }

    const textArea = this.textAreaRef.current
    const caret = textArea?.selectionStart ?? this.state.text.length
    const { text } = this.state
    const updated = `${text.slice(0, start)}@${path} ${text.slice(caret)}`

    this.referenceStart = null
    this.setState(
      { text: updated, fileSuggestions: [], suggestionIndex: 0 },
      () => {
        const caretAfter = start + path.length + 2
        textArea?.focus()
        textArea?.setSelectionRange(caretAfter, caretAfter)
      }
    )
  }

  private onSuggestionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const { path } = event.currentTarget.dataset

    if (path !== undefined) {
      this.acceptSuggestion(path)
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { fileSuggestions, suggestionIndex } = this.state

    if (fileSuggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.setState({
          suggestionIndex: (suggestionIndex + 1) % fileSuggestions.length,
        })
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        this.setState({
          suggestionIndex:
            (suggestionIndex - 1 + fileSuggestions.length) %
            fileSuggestions.length,
        })
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        this.acceptSuggestion(fileSuggestions[suggestionIndex])
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        this.setState({ fileSuggestions: [], suggestionIndex: 0 })
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.submit()
    }

    // Ctrl+Shift+O (or Cmd+Shift+O on Mac) to optimize prompt
    const isShortcutKey = __DARWIN__ ? event.metaKey : event.ctrlKey
    const hasText = this.state.text.trim().length > 0
    if (
      isShortcutKey &&
      event.shiftKey &&
      event.key === 'O' &&
      !this.state.isOptimizing &&
      hasText
    ) {
      event.preventDefault()
      this.optimizePrompt()
    }
  }

  private onSubmitClick = () => {
    this.submit()
  }

  private onSteerClick = () => {
    this.submit(true)
  }

  private onAgentChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget
    this.props.onAgentChanged(value === '' ? null : value)
  }

  private onModelChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget
    this.props.onModelChanged(value === '' ? null : parseModelValue(value))
  }

  private onVariantChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget
    this.props.onVariantChanged(value === '' ? null : value)
  }

  private onAttachClick = async () => {
    const path = await showOpenDialog({
      properties: ['openFile'],
      defaultPath: this.props.repositoryPath,
    })

    if (path === null) {
      return
    }

    try {
      const attachment = await createFileAttachment(
        path,
        this.props.repositoryPath
      )

      if (!this.isUnmounted) {
        this.setState(state => ({
          attachments: [...state.attachments, attachment],
        }))
      }
    } catch (e) {
      log.error(`Failed to attach ${path}`, e)
      this.props.onAttachmentError(
        e instanceof Error ? e.message : `Failed to attach ${path}`
      )
    }
  }

  /** Handles pasted files and images from the clipboard. */
  private onPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData
    const items = clipboardData.items

    // Handle files pasted from file manager (e.g., copying a file in Explorer/Finder)
    const filePaths: string[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          // For files from clipboard, we need to read them via Electron's clipboard
          // The native clipboard API doesn't give us the file path directly
          // We'll use Electron's clipboard to get file paths
        }
      }
    }

    // Use Electron's clipboard to get file paths and images
    const filePathsFromClipboard = clipboard.readBuffer('Files')
    if (filePathsFromClipboard) {
      // On Windows/Linux, 'Files' format contains CF_HDROP data
      // On macOS, it's NSFilenamesPboardType
      // We need to parse the buffer to get file paths
      // For simplicity, we'll use the text/uri-list format which is more standard
    }

    // Get file paths from text/uri-list (works across platforms)
    const uriList = clipboard.read('text/uri-list')
    if (uriList) {
      const lines = uriList.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('file://')) {
          try {
            const filePath = new URL(trimmed).pathname
            // On Windows, the pathname starts with /C:/path, need to remove leading slash
            const normalizedPath = process.platform === 'win32' && filePath.startsWith('/')
              ? filePath.slice(1)
              : filePath
            filePaths.push(decodeURIComponent(normalizedPath))
          } catch {
            // Ignore invalid URLs
          }
        }
      }
    }

    // Also check for images in clipboard
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      // Save image to a temporary file and attach it
      await this.attachImageFromClipboard(image)
      return
    }

    // Process file paths
    for (const filePath of filePaths) {
      await this.attachFileFromPath(filePath)
    }
  }

  /** Attaches an image from the clipboard by saving it to a temp file. */
  private attachImageFromClipboard = async (image: Electron.NativeImage) => {
    const tempDir = os.tmpdir()
    const fileName = `pasted-image-${Date.now()}.png`
    const filePath = Path.join(tempDir, fileName)

    try {
      const pngBuffer = image.toPNG()
      await writeFile(filePath, pngBuffer)
      await this.attachFileFromPath(filePath)
    } catch (e) {
      log.error('Failed to save pasted image', e)
      this.props.onAttachmentError('Failed to attach pasted image')
    }
  }

  /** Attaches a file from a given path. */
  private attachFileFromPath = async (filePath: string) => {
    try {
      const attachment = await createFileAttachment(
        filePath,
        this.props.repositoryPath
      )

      if (!this.isUnmounted) {
        this.setState(state => ({
          attachments: [...state.attachments, attachment],
        }))
      }
    } catch (e) {
      log.error(`Failed to attach ${filePath}`, e)
      this.props.onAttachmentError(
        e instanceof Error ? e.message : `Failed to attach ${filePath}`
      )
    }
  }

  private onRemoveAttachment = (event: React.MouseEvent<HTMLButtonElement>) => {
    const { path } = event.currentTarget.dataset

    this.setState(state => ({
      attachments: state.attachments.filter(a => a.path !== path),
    }))
  }

  /**
   * Hands the prompt over, either as a normal submission (queued while the
   * agent works) or as a steer that reaches the run in progress.
   */
  private submit(steer: boolean = false) {
    const text = this.state.text.trim()

    if (text.length === 0) {
      return
    }

    const { attachments } = this.state

    if (steer) {
      this.props.onSteer(text, attachments)
    } else {
      this.props.onSubmit(text, attachments)
    }
    this.referenceStart = null
    this.setState({
      text: '',
      attachments: [],
      fileSuggestions: [],
      suggestionIndex: 0,
    })
  }

  /**
   * Optimizes the current prompt text using OpenCode.
   * Sends the current text to OpenCode with instructions to improve it,
   * then replaces the text with the optimized version.
   */
  private optimizePrompt = async () => {
    const text = this.state.text.trim()

    if (text.length === 0) {
      return
    }

    this.setState({ isOptimizing: true })

    try {
      const config = loadOpenCodeConfig()

      // Craft a prompt that asks OpenCode to optimize the user's prompt
      // The OpenCode runner expects JSON output, so we request JSON with an optimizedPrompt field
      const optimizationPrompt = `Optimize the following prompt for better results with an AI coding assistant. Return a JSON object with a single field "optimizedPrompt" containing the optimized prompt. No explanations, no markdown, just the JSON object.

Original prompt: ${text}`

      const requestId = crypto.randomUUID()

      const content = await invoke('opencode-run-prompt', {
        requestId,
        command: config.command,
        model: config.model,
        timeoutMs: config.timeoutMs,
        cwd: this.props.repositoryPath,
        prompt: optimizationPrompt,
      })

      // Parse the JSON response to get the optimized prompt
      let optimizedPrompt = text
      try {
        const parsed = JSON.parse(content.trim())
        if (parsed.optimizedPrompt && typeof parsed.optimizedPrompt === 'string') {
          optimizedPrompt = parsed.optimizedPrompt
        }
      } catch {
        // If parsing fails, use the raw content as the optimized prompt
        optimizedPrompt = content.trim()
      }

      this.setState({ text: optimizedPrompt })
    } catch (error) {
      console.error('Failed to optimize prompt:', error)
      // Could show an error toast here if desired
    } finally {
      this.setState({ isOptimizing: false })
    }
  }

  private renderAgentPicker(): JSX.Element | null {
    // Only primary agents can drive a conversation; subagents are invoked by
    // other agents and would fail if selected here.
    const agents = this.props.agents.filter(a => a.mode !== 'subagent')

    if (agents.length === 0) {
      return null
    }

    return (
      <Select
        className="opencode-agent-picker"
        value={this.props.selectedAgent ?? ''}
        onChange={this.onAgentChanged}
      >
        <option value="">Default agent</option>
        {agents.map(a => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
      </Select>
    )
  }

  private renderModelPicker(): JSX.Element | null {
    const { modelOptions, selectedModel } = this.props

    if (modelOptions.length === 0) {
      return null
    }

    // Models are grouped by provider, the way OpenCode's own picker shows them.
    const providers = new Map<string, Array<IOpenCodeModelOption>>()

    for (const option of modelOptions) {
      const group = providers.get(option.providerName) ?? []
      group.push(option)
      providers.set(option.providerName, group)
    }

    const value =
      selectedModel === null
        ? ''
        : formatModelValue(selectedModel.providerID, selectedModel.modelID)

    return (
      <Select
        className="opencode-model-picker"
        value={value}
        onChange={this.onModelChanged}
      >
        <option value="">Default model</option>
        {[...providers.entries()].map(([providerName, options]) => (
          <optgroup key={providerName} label={providerName}>
            {options.map(option => (
              <option
                key={formatModelValue(option.providerID, option.modelID)}
                value={formatModelValue(option.providerID, option.modelID)}
              >
                {option.modelName}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    )
  }

  private renderVariantPicker(): JSX.Element | null {
    const { modelOptions, selectedModel, selectedVariant } = this.props

    if (selectedModel === null) {
      return null
    }

    const option = modelOptions.find(
      o =>
        o.providerID === selectedModel.providerID &&
        o.modelID === selectedModel.modelID
    )

    // Most models have no reasoning presets; hiding the picker keeps the row
    // from showing a control with nothing to choose.
    if (option === undefined || option.variants.length === 0) {
      return null
    }

    return (
      <Select
        className="opencode-variant-picker"
        value={selectedVariant ?? ''}
        onChange={this.onVariantChanged}
      >
        <option value="">Default</option>
        {option.variants.map(variant => (
          <option key={variant} value={variant}>
            {variant}
          </option>
        ))}
      </Select>
    )
  }

  private renderAttachments(): JSX.Element | null {
    const { attachments } = this.state

    if (attachments.length === 0) {
      return null
    }

    return (
      <div className="opencode-attachments">
        {attachments.map(attachment => (
          <span key={attachment.path} className="opencode-attachment">
            <Octicon symbol={octicons.file} />
            <span className="opencode-attachment-name">{attachment.path}</span>
            <button
              className="opencode-attachment-remove"
              data-path={attachment.path}
              onClick={this.onRemoveAttachment}
              aria-label={`Remove ${attachment.path}`}
            >
              <Octicon symbol={octicons.x} />
            </button>
          </span>
        ))}
      </div>
    )
  }

  private renderFileSuggestions(): JSX.Element | null {
    const { fileSuggestions, suggestionIndex } = this.state

    if (fileSuggestions.length === 0) {
      return null
    }

    return (
      <div className="opencode-file-suggestions" role="listbox">
        {fileSuggestions.map((path, index) => (
          <button
            key={path}
            className={classNames('opencode-file-suggestion', {
              selected: index === suggestionIndex,
            })}
            data-path={path}
            onClick={this.onSuggestionClick}
            role="option"
            aria-selected={index === suggestionIndex}
          >
            <Octicon symbol={octicons.file} />
            {path}
          </button>
        ))}
      </div>
    )
  }

  public render() {
    const { isBusy, queuedCount } = this.props
    const hasText = this.state.text.trim().length > 0
    const { isOptimizing } = this.state

    return (
      <div className="opencode-prompt">
        {this.renderFileSuggestions()}
        {this.renderAttachments()}
        <textarea
          ref={this.textAreaRef}
          className="opencode-prompt-input"
          value={this.state.text}
          placeholder={
            isBusy
              ? 'Send to steer the agent, or queue a follow-up…'
              : 'Ask OpenCode about this repository… (@ to reference a file)'
          }
          aria-label="Message OpenCode"
          onChange={this.onTextChanged}
          onKeyDown={this.onKeyDown}
          onPaste={this.onPaste}
          rows={3}
        />
        <div className="opencode-prompt-actions">
          {this.renderAgentPicker()}
          {this.renderModelPicker()}
          {this.renderVariantPicker()}
          {queuedCount > 0 && (
            <span className="opencode-queue-count">{queuedCount} queued</span>
          )}
          <Button
            onClick={this.optimizePrompt}
            disabled={!hasText || isOptimizing || isBusy}
            tooltip={isOptimizing ? 'Optimizing prompt…' : 'Optimize prompt with AI (Ctrl+Shift+O)'}
          >
            <Octicon symbol={octicons.lightBulb} />
          </Button>
          <Button onClick={this.onAttachClick} tooltip="Attach a file">
            <Octicon symbol={octicons.paperclip} />
          </Button>
          {isBusy && (
            <>
              <Button
                onClick={this.onSteerClick}
                disabled={!hasText}
                tooltip="Send now, so the agent takes this into account in the turn it is working on"
              >
                <Octicon symbol={octicons.arrowRight} /> Steer
              </Button>
              <Button onClick={this.props.onAbort} tooltip="Stop the agent">
                <Octicon symbol={octicons.stop} /> Stop
              </Button>
            </>
          )}
          <Button
            type="submit"
            onClick={this.onSubmitClick}
            disabled={!hasText}
            tooltip={
              isBusy
                ? 'Queue this message (Enter)'
                : 'Send (Enter) — Shift+Enter for a new line'
            }
          >
            <Octicon symbol={octicons.paperAirplane} />{' '}
            {isBusy ? 'Queue' : 'Send'}
          </Button>
        </div>
      </div>
    )
  }
}
