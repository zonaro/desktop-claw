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

    this.state = { filterText: '' }
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

    const items: ReadonlyArray<IMenuItem> = [
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
      </div>
    )
  }
}
