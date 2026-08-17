import * as React from 'react'
import classNames from 'classnames'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

import {
  getOpenCodeErrorText,
  IOpenCodeMessage,
  IOpenCodeToolPart,
  OpenCodePart,
} from '../../models/opencode-session'
import {
  getToolSummary,
  truncateToolOutput,
} from '../../lib/opencode/opencode-session-helpers'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

/** Converts assistant markdown to sanitized HTML. */
function markdownToHtml(markdown: string): string {
  const rawHtml = marked(markdown, { gfm: true, breaks: true })
  return DOMPurify.sanitize(rawHtml as string, { USE_PROFILES: { html: true } })
}

interface ICollapsibleProps {
  /** The always-visible header of the block. */
  readonly header: JSX.Element

  /** The class name applied to the outer element. */
  readonly className: string

  /** The content revealed when the block is expanded. */
  readonly children: React.ReactNode
}

interface ICollapsibleState {
  readonly isExpanded: boolean
}

/** A block whose body is hidden until the user clicks its header. */
class Collapsible extends React.Component<
  ICollapsibleProps,
  ICollapsibleState
> {
  public constructor(props: ICollapsibleProps) {
    super(props)

    this.state = { isExpanded: false }
  }

  private onToggle = () => {
    this.setState({ isExpanded: !this.state.isExpanded })
  }

  public render() {
    const { isExpanded } = this.state

    return (
      <div className={this.props.className}>
        <button
          className="opencode-collapsible-header"
          onClick={this.onToggle}
          aria-expanded={isExpanded}
        >
          <Octicon
            symbol={isExpanded ? octicons.chevronDown : octicons.chevronRight}
          />
          {this.props.header}
        </button>
        {isExpanded && (
          <div className="opencode-collapsible-body">{this.props.children}</div>
        )}
      </div>
    )
  }
}

interface IOpenCodeMessageProps {
  /** The message to render, with all of its parts. */
  readonly message: IOpenCodeMessage
}

/**
 * A single message in an OpenCode conversation: the user's prompt, or the
 * assistant's reply with its reasoning and tool calls.
 */
export class OpenCodeMessageView extends React.Component<
  IOpenCodeMessageProps,
  {}
> {
  private renderToolPart(part: IOpenCodeToolPart): JSX.Element {
    const { status, input, output, error } = part.state
    const summary = getToolSummary(part)

    const header = (
      <>
        <Octicon symbol={octicons.tools} />
        <span className="opencode-tool-name">{part.tool}</span>
        {summary !== null && (
          <span className="opencode-tool-summary">{summary}</span>
        )}
        {(status === 'pending' || status === 'running') && (
          <span className="opencode-tool-status">running…</span>
        )}
      </>
    )

    return (
      <Collapsible
        key={part.id}
        className={classNames('opencode-tool', `opencode-tool-${status}`)}
        header={header}
      >
        {input !== undefined && (
          <pre className="opencode-tool-input">
            {JSON.stringify(input, null, 2)}
          </pre>
        )}
        {output !== undefined && output.length > 0 && (
          <pre className="opencode-tool-output">
            {truncateToolOutput(output)}
          </pre>
        )}
        {error !== undefined && error.length > 0 && (
          <pre className="opencode-tool-error">{error}</pre>
        )}
      </Collapsible>
    )
  }

  private renderPart(part: OpenCodePart): JSX.Element | null {
    switch (part.type) {
      case 'text': {
        const { text } = part as { text: string }

        if (text.trim().length === 0) {
          return null
        }

        // User prompts are shown verbatim; only the assistant writes markdown.
        if (this.props.message.info.role === 'user') {
          return (
            <div key={part.id} className="opencode-text">
              {text}
            </div>
          )
        }

        return (
          <div
            key={part.id}
            className="opencode-text opencode-markdown"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}
          />
        )
      }

      case 'reasoning': {
        const { text } = part as { text: string }

        if (text.trim().length === 0) {
          return null
        }

        return (
          <Collapsible
            key={part.id}
            className="opencode-reasoning"
            header={
              <>
                <Octicon symbol={octicons.lightBulb} />
                <span className="opencode-tool-name">Thinking</span>
              </>
            }
          >
            <div className="opencode-reasoning-text">{text}</div>
          </Collapsible>
        )
      }

      case 'tool':
        return this.renderToolPart(part as IOpenCodeToolPart)

      case 'file': {
        const { filename } = part as { filename?: string }

        return (
          <div key={part.id} className="opencode-file-part">
            <Octicon symbol={octicons.file} />
            {filename ?? 'Attached file'}
          </div>
        )
      }

      // step-start / step-finish and any future part kind carry no content
      // worth rendering on their own.
      default:
        return null
    }
  }

  public render() {
    const { info, parts } = this.props.message
    const isUser = info.role === 'user'
    const errorText = getOpenCodeErrorText(info.error)

    const renderedParts = parts
      .map(part => this.renderPart(part))
      .filter(part => part !== null)

    // A message with nothing to show yet (an assistant turn that has only
    // emitted step markers so far) would render as an empty bubble.
    if (renderedParts.length === 0 && errorText === null) {
      return null
    }

    return (
      <div
        className={classNames(
          'opencode-message',
          isUser ? 'opencode-message-user' : 'opencode-message-assistant'
        )}
      >
        <div className="opencode-message-header">
          <Octicon symbol={isUser ? octicons.person : octicons.commentAi} />
          <span className="opencode-message-author">
            {isUser ? 'You' : info.agent ?? 'OpenCode'}
          </span>
          {!isUser && info.modelID !== undefined && (
            <span className="opencode-message-model">{info.modelID}</span>
          )}
        </div>
        <div className="opencode-message-body">
          {renderedParts}
          {errorText !== null && (
            <div className="opencode-message-error">
              <Octicon symbol={octicons.alert} />
              {errorText}
            </div>
          )}
        </div>
      </div>
    )
  }
}
