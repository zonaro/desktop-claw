import * as React from 'react'

import { IOpenCodeAgent } from '../../models/opencode-session'
import { Button } from '../lib/button'
import { Select } from '../lib/select'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

/** The tallest the prompt box grows before it starts scrolling. */
const MaxPromptHeight = 220

interface IOpenCodePromptProps {
  /** The agents that can be picked for the next prompt. */
  readonly agents: ReadonlyArray<IOpenCodeAgent>

  /** The currently selected agent name, or null for OpenCode's default. */
  readonly selectedAgent: string | null

  /** Whether the session is currently producing a response. */
  readonly isBusy: boolean

  /** Called with the prompt text when the user submits. */
  readonly onSubmit: (text: string) => void

  /** Called when the user interrupts the run in progress. */
  readonly onAbort: () => void

  /** Called when the user picks a different agent. */
  readonly onAgentChanged: (agent: string | null) => void
}

interface IOpenCodePromptState {
  readonly text: string
}

/**
 * The prompt box at the bottom of the conversation: an auto-growing text area
 * with an agent picker, matching OpenCode's own submit behaviour (Enter sends,
 * Shift+Enter inserts a newline).
 */
export class OpenCodePrompt extends React.Component<
  IOpenCodePromptProps,
  IOpenCodePromptState
> {
  private readonly textAreaRef = React.createRef<HTMLTextAreaElement>()

  public constructor(props: IOpenCodePromptProps) {
    super(props)

    this.state = { text: '' }
  }

  public componentDidUpdate() {
    this.resizeTextArea()
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
    this.setState({ text: event.currentTarget.value })
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.submit()
    }
  }

  private onSubmitClick = () => {
    this.submit()
  }

  private onAgentChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget
    this.props.onAgentChanged(value === '' ? null : value)
  }

  private submit() {
    const text = this.state.text.trim()

    if (text.length === 0 || this.props.isBusy) {
      return
    }

    this.props.onSubmit(text)
    this.setState({ text: '' })
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

  public render() {
    const { isBusy } = this.props
    const canSubmit = !isBusy && this.state.text.trim().length > 0

    return (
      <div className="opencode-prompt">
        <textarea
          ref={this.textAreaRef}
          className="opencode-prompt-input"
          value={this.state.text}
          placeholder="Ask OpenCode about this repository…"
          aria-label="Message OpenCode"
          onChange={this.onTextChanged}
          onKeyDown={this.onKeyDown}
          rows={1}
        />
        <div className="opencode-prompt-actions">
          {this.renderAgentPicker()}
          {isBusy ? (
            <Button onClick={this.props.onAbort} tooltip="Stop the agent">
              <Octicon symbol={octicons.stop} /> Stop
            </Button>
          ) : (
            <Button
              type="submit"
              onClick={this.onSubmitClick}
              disabled={!canSubmit}
              tooltip="Send (Enter)"
            >
              <Octicon symbol={octicons.paperAirplane} /> Send
            </Button>
          )}
        </div>
      </div>
    )
  }
}
