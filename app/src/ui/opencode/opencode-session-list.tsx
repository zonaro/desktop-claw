import * as React from 'react'
import classNames from 'classnames'

import { IOpenCodeState } from '../../lib/app-state'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { IOpenCodeSession } from '../../models/opencode-session'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher/dispatcher'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'
import { TextBox } from '../lib/text-box'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { RelativeTime } from '../relative-time'

interface IOpenCodeSessionListProps {
  /** The repository whose sessions are listed. */
  readonly repository: Repository

  /** The OpenCode state of the repository. */
  readonly state: IOpenCodeState

  /** The dispatcher used to act on the session list. */
  readonly dispatcher: Dispatcher
}

interface IOpenCodeSessionListState {
  /** The text used to filter the session list. */
  readonly filterText: string
  /** The session being renamed, or null. */
  readonly renamingSessionId: string | null
  /** The new title for the session being renamed. */
  readonly renameTitle: string
  /** Whether we're generating a title with AI. */
  readonly isGeneratingTitle: boolean
}

/** The title shown for a session OpenCode hasn't named yet. */
const UntitledSessionLabel = 'New session'

/**
 * The sidebar of the OpenCode tab: every conversation recorded for the current
 * repository, most recently updated first.
 */
export class OpenCodeSessionList extends React.Component<
  IOpenCodeSessionListProps,
  IOpenCodeSessionListState
> {
  public constructor(props: IOpenCodeSessionListProps) {
    super(props)

    this.state = { filterText: '', renamingSessionId: null, renameTitle: '', isGeneratingTitle: false }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onNewSession = () => {
    this.props.dispatcher.createOpenCodeSession(this.props.repository)
  }

  private onRetry = () => {
    this.props.dispatcher.refreshOpenCodeSessions(this.props.repository)
  }

  private onSessionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const { sessionId } = event.currentTarget.dataset

    if (sessionId !== undefined) {
      this.props.dispatcher.setSelectedOpenCodeSession(
        this.props.repository,
        sessionId
      )
    }
  }

  private onSessionContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()

    const { sessionId } = event.currentTarget.dataset

    if (sessionId === undefined) {
      return
    }

    const session = this.props.state.sessions?.find(s => s.id === sessionId)
    const currentTitle = session?.title ?? UntitledSessionLabel

    const items: ReadonlyArray<IMenuItem> = [
      {
        label: 'Rename Session…',
        action: () => this.startRenaming(sessionId, currentTitle),
      },
      { type: 'separator' },
      {
        label: 'Delete Session',
        action: () =>
          this.props.dispatcher.deleteOpenCodeSession(
            this.props.repository,
            sessionId
          ),
      },
    ]

    showContextualMenu(items)
  }

  private startRenaming = (sessionId: string, currentTitle: string) => {
    this.setState({
      renamingSessionId: sessionId,
      renameTitle: currentTitle === UntitledSessionLabel ? '' : currentTitle,
      isGeneratingTitle: false,
    })
  }

  private cancelRenaming = () => {
    this.setState({ renamingSessionId: null, renameTitle: '', isGeneratingTitle: false })
  }

  private confirmRenaming = async () => {
    const { renamingSessionId, renameTitle } = this.state
    if (renamingSessionId === null || renameTitle.trim() === '') {
      return
    }

    try {
      await this.props.dispatcher.renameOpenCodeSession(
        this.props.repository,
        renamingSessionId,
        renameTitle.trim()
      )
    } catch (e) {
      log.error('Failed to rename session', e)
    } finally {
      this.cancelRenaming()
    }
  }

  private onRenameTitleChange = (title: string) => {
    this.setState({ renameTitle: title })
  }

  private generateTitleWithAI = async (sessionId: string) => {
    this.setState({ isGeneratingTitle: true })

    try {
      const server = this.props.state.server
      if (!server?.running || !server.baseUrl) {
        return
      }

      const { OpenCodeClient } = await import('../../lib/opencode/opencode-client')
      const client = OpenCodeClient.fromStatus(server)
      if (!client) {
        return
      }

      // Get the session messages to generate a title from
      const messages = await client.getMessages(this.props.repository.path, sessionId)
      if (messages.length === 0) {
        return
      }

      // Use the title agent to generate a title
      // We'll send a prompt to the title agent
      await client.sendPrompt(this.props.repository.path, sessionId, 
        'Generate a short, descriptive title for this conversation based on the messages so far. Return only the title, no extra text.',
        { agent: 'title' }
      )

      // Wait a bit for the response, then refresh sessions to get the new title
      setTimeout(async () => {
        await this.props.dispatcher.refreshOpenCodeSessions(this.props.repository)
        this.setState({ isGeneratingTitle: false })
      }, 2000)
    } catch (e) {
      log.error('Failed to generate title with AI', e)
      this.setState({ isGeneratingTitle: false })
    }
  }

  /** Filters sessions by title, case insensitively. */
  private getVisibleSessions(): ReadonlyArray<IOpenCodeSession> {
    const sessions = this.props.state.sessions ?? []
    const filter = this.state.filterText.trim().toLowerCase()

    if (filter.length === 0) {
      return sessions
    }

    return sessions.filter(s =>
      (s.title ?? UntitledSessionLabel).toLowerCase().includes(filter)
    )
  }

  private renderSession(session: IOpenCodeSession): JSX.Element {
    const isSelected = session.id === this.props.state.selectedSessionID

    const className = classNames('opencode-session-list-item', {
      selected: isSelected,
    })

    return (
      <button
        key={session.id}
        className={className}
        data-session-id={session.id}
        onClick={this.onSessionClick}
        onContextMenu={this.onSessionContextMenu}
        aria-current={isSelected}
      >
        <div className="opencode-session-title">
          {session.title ?? UntitledSessionLabel}
        </div>
        <div className="opencode-session-meta">
          {session.agent !== undefined && (
            <span className="opencode-session-agent">{session.agent}</span>
          )}
          <RelativeTime
            date={new Date(session.time.updated)}
            onlyRelative={true}
          />
        </div>
      </button>
    )
  }

  private renderContents(): JSX.Element {
    const { isStartingServer, server, sessions, error } = this.props.state

    if (isStartingServer) {
      return (
        <div className="opencode-session-list-message">
          <Loading /> Starting the OpenCode server…
        </div>
      )
    }

    // A server that never came up is almost always a missing or misconfigured
    // CLI, so point at the setting that fixes it.
    if (server !== null && !server.running) {
      return (
        <div className="opencode-session-list-message">
          <Octicon symbol={octicons.alert} />
          <p>{server.error ?? 'The OpenCode server could not be started.'}</p>
          <p className="opencode-session-list-hint">
            Check the OpenCode command in Preferences, then try again.
          </p>
          <Button onClick={this.onRetry}>Retry</Button>
        </div>
      )
    }

    if (error !== null) {
      return (
        <div className="opencode-session-list-message">
          <Octicon symbol={octicons.alert} />
          <p>{error}</p>
          <Button onClick={this.onRetry}>Retry</Button>
        </div>
      )
    }

    if (sessions === null) {
      return (
        <div className="opencode-session-list-message">
          <Loading /> Loading sessions…
        </div>
      )
    }

    const visibleSessions = this.getVisibleSessions()

    if (visibleSessions.length === 0) {
      return (
        <div className="opencode-session-list-message">
          {sessions.length === 0
            ? 'No OpenCode sessions for this repository yet.'
            : 'No sessions match your filter.'}
        </div>
      )
    }

    return (
      <div className="opencode-session-list-contents">
        {visibleSessions.map(s => this.renderSession(s))}
      </div>
    )
  }

  public render() {
    const isServerAvailable = this.props.state.server?.running === true
    const { renamingSessionId, renameTitle, isGeneratingTitle } = this.state

    return (
      <div className="opencode-session-list" id="opencode-session-list">
        <div className="opencode-session-list-header">
          <TextBox
            type="search"
            placeholder="Filter sessions"
            ariaLabel="Filter sessions"
            value={this.state.filterText}
            onValueChanged={this.onFilterTextChanged}
          />
          <Button
            onClick={this.onNewSession}
            disabled={!isServerAvailable}
            tooltip="Start a new OpenCode session"
            ariaLabel="New session"
          >
            <Octicon symbol={octicons.plus} />
          </Button>
        </div>
        {this.renderContents()}
        {renamingSessionId !== null && (
          <div className="opencode-rename-dialog-overlay" onClick={this.cancelRenaming}>
            <div className="opencode-rename-dialog" onClick={e => e.stopPropagation()}>
              <h3>Rename Session</h3>
              <TextBox
                value={renameTitle}
                onValueChanged={this.onRenameTitleChange}
                placeholder="Enter new title"
                autoFocus={true}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    this.confirmRenaming()
                  } else if (e.key === 'Escape') {
                    this.cancelRenaming()
                  }
                }}
              />
              <div className="opencode-rename-dialog-actions">
                <Button
                  onClick={() => this.generateTitleWithAI(renamingSessionId!)}
                  disabled={isGeneratingTitle}
                  size="small"
                >
                  {isGeneratingTitle ? (
                    <>
                      <Loading /> Generating…
                    </>
                  ) : (
                    <>
                      <Octicon symbol={octicons.sparkle} /> Generate with AI
                    </>
                  )}
                </Button>
                <Button
                  onClick={this.cancelRenaming}
                  size="small"
                >
                  Cancel
                </Button>
                <Button
                  onClick={this.confirmRenaming}
                  size="small"
                  className="primary"
                >
                  Rename
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
}
