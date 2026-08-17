import * as React from 'react'

import { IOpenCodeState } from '../../lib/app-state'
import { OpenCodeClient } from '../../lib/opencode/opencode-client'
import { isSessionBusy } from '../../lib/opencode/opencode-session-helpers'
import {
  IOpenCodeAgent,
  IOpenCodeEvent,
  IOpenCodeMessage,
  IOpenCodeMessageInfo,
  IOpenCodePermissionRequest,
  OpenCodePart,
  OpenCodePermissionResponse,
} from '../../models/opencode-session'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher/dispatcher'
import { Loading } from '../lib/loading'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { OpenCodeMessageView } from './opencode-message'
import { OpenCodePrompt } from './opencode-prompt'

/** How close to the bottom counts as "scrolled to the bottom", in pixels. */
const ScrollPinThreshold = 40

/**
 * How long to wait before reloading the session list after a session event.
 * A running agent updates the session (title, token counts) continuously, and
 * every reload round-trips to the server and re-renders the app.
 */
const SessionRefreshDelay = 2000

/** How long to wait before reopening an event stream that dropped. */
const ReconnectDelay = 3000

interface IOpenCodeConversationProps {
  /** The repository the conversation belongs to. */
  readonly repository: Repository

  /** The OpenCode state of the repository. */
  readonly state: IOpenCodeState

  /** The dispatcher used to keep the session list in sync. */
  readonly dispatcher: Dispatcher
}

interface IOpenCodeConversationState {
  /** The messages of the selected session, oldest first. */
  readonly messages: ReadonlyArray<IOpenCodeMessage>

  /** Whether the message history is being loaded. */
  readonly isLoading: boolean

  /** Whether the agent is currently working on a reply. */
  readonly isBusy: boolean

  /** The agents available in this repository. */
  readonly agents: ReadonlyArray<IOpenCodeAgent>

  /** The agent picked for the next prompt, or null for OpenCode's default. */
  readonly selectedAgent: string | null

  /** Permissions the agent is waiting on, in the order they were asked. */
  readonly pendingPermissions: ReadonlyArray<IOpenCodePermissionRequest>

  /** The last conversation-level error, or null. */
  readonly error: string | null
}

/**
 * The main area of the OpenCode tab: the conversation of the selected session,
 * kept live through the server's event stream, plus the prompt box.
 */
export class OpenCodeConversation extends React.Component<
  IOpenCodeConversationProps,
  IOpenCodeConversationState
> {
  private readonly scrollRef = React.createRef<HTMLDivElement>()

  /** Closes the event stream subscription; null when not subscribed. */
  private unsubscribe: (() => void) | null = null

  /** The directory the current subscription is scoped to. */
  private subscribedDirectory: string | null = null

  /** Whether the message list is scrolled to the bottom. */
  private isPinnedToBottom = true

  /** Set once the component unmounts so in-flight loads are discarded. */
  private isUnmounted = false

  /** The pending throttled session list reload, if any. */
  private sessionRefreshTimeoutId: number | null = null

  /** The pending event stream reconnection, if any. */
  private reconnectTimeoutId: number | null = null

  public constructor(props: IOpenCodeConversationProps) {
    super(props)

    this.state = {
      messages: [],
      isLoading: false,
      isBusy: false,
      agents: [],
      selectedAgent: null,
      pendingPermissions: [],
      error: null,
    }
  }

  public componentDidMount() {
    this.subscribeToEvents()
    this.loadAgents()
    this.loadMessages()
  }

  public componentDidUpdate(prevProps: IOpenCodeConversationProps) {
    const { repository, state } = this.props

    if (
      prevProps.repository.path !== repository.path ||
      prevProps.state.server !== state.server
    ) {
      this.subscribeToEvents()
      this.loadAgents()
    }

    if (
      prevProps.state.selectedSessionID !== state.selectedSessionID ||
      prevProps.repository.path !== repository.path
    ) {
      this.loadMessages()
    }

    this.scrollToBottomIfPinned()
  }

  public componentWillUnmount() {
    this.isUnmounted = true
    this.unsubscribe?.()
    this.unsubscribe = null

    if (this.sessionRefreshTimeoutId !== null) {
      window.clearTimeout(this.sessionRefreshTimeoutId)
      this.sessionRefreshTimeoutId = null
    }

    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }

  /** The client for the running server, or null when it isn't running. */
  private getClient(): OpenCodeClient | null {
    return OpenCodeClient.fromStatus(this.props.state.server)
  }

  /** (Re)subscribes to the event stream for the current repository. */
  private subscribeToEvents() {
    const client = this.getClient()
    const directory = this.props.repository.path

    if (client === null) {
      return
    }

    if (this.unsubscribe !== null && this.subscribedDirectory === directory) {
      return
    }

    this.unsubscribe?.()
    this.subscribedDirectory = directory
    this.unsubscribe = client.subscribeToEvents(
      directory,
      this.onServerEvent,
      this.onEventStreamEnded
    )
  }

  /**
   * Reopens the event stream after it drops, so the conversation doesn't go
   * silently stale when the server restarts or the connection is cut. Only
   * runs while the tab is open — leaving it unmounts the component.
   */
  private onEventStreamEnded = (error: Error) => {
    log.warn('The OpenCode event stream ended', error)

    this.unsubscribe = null

    if (this.isUnmounted || this.reconnectTimeoutId !== null) {
      return
    }

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.reconnectTimeoutId = null

      if (!this.isUnmounted) {
        this.subscribeToEvents()
      }
    }, ReconnectDelay)
  }

  /**
   * Reloads the session list, at most once every {@link SessionRefreshDelay}
   * milliseconds.
   */
  private scheduleSessionRefresh() {
    if (this.sessionRefreshTimeoutId !== null) {
      return
    }

    this.sessionRefreshTimeoutId = window.setTimeout(() => {
      this.sessionRefreshTimeoutId = null

      if (!this.isUnmounted) {
        this.props.dispatcher.refreshOpenCodeSessions(this.props.repository)
      }
    }, SessionRefreshDelay)
  }

  private loadAgents() {
    const client = this.getClient()

    if (client === null) {
      return
    }

    client
      .listAgents(this.props.repository.path)
      .then(agents => {
        if (!this.isUnmounted) {
          this.setState({ agents })
        }
      })
      .catch(e => log.warn('Failed to list OpenCode agents', e))
  }

  private loadMessages() {
    const client = this.getClient()
    const sessionID = this.props.state.selectedSessionID

    if (client === null || sessionID === null) {
      this.setState({ messages: [], isBusy: false, pendingPermissions: [] })
      return
    }

    this.setState({ isLoading: true, error: null })
    this.isPinnedToBottom = true

    Promise.all([
      client.getMessages(this.props.repository.path, sessionID),
      client.listPendingPermissions(this.props.repository.path),
    ])
      .then(([messages, permissions]) => {
        // The selection may have changed while the request was in flight.
        if (
          this.isUnmounted ||
          this.props.state.selectedSessionID !== sessionID
        ) {
          return
        }

        this.setState({
          messages,
          isLoading: false,
          isBusy: isSessionBusy(messages),
          pendingPermissions: permissions.filter(
            p => p.sessionID === sessionID
          ),
        })
      })
      .catch(e => {
        if (this.isUnmounted) {
          return
        }

        log.error('Failed to load the OpenCode conversation', e)
        this.setState({
          isLoading: false,
          error: e instanceof Error ? e.message : String(e),
        })
      })
  }

  /** Applies a server event to the conversation. */
  private onServerEvent = (event: IOpenCodeEvent) => {
    const sessionID = this.props.state.selectedSessionID
    const { properties } = event

    // Session-level events change titles and ordering in the sidebar.
    if (
      event.type === 'session.created' ||
      event.type === 'session.updated' ||
      event.type === 'session.deleted'
    ) {
      this.scheduleSessionRefresh()
      return
    }

    if (sessionID === null) {
      return
    }

    switch (event.type) {
      case 'message.updated': {
        const info = properties.info as IOpenCodeMessageInfo | undefined

        if (info?.sessionID === sessionID) {
          this.upsertMessage(info)
        }
        break
      }

      case 'message.part.updated': {
        const part = properties.part as
          | (OpenCodePart & { messageID: string; sessionID: string })
          | undefined

        if (part?.sessionID === sessionID) {
          this.upsertPart(part.messageID, part)
        }
        break
      }

      case 'message.removed': {
        if (properties.sessionID === sessionID) {
          const messageID = properties.messageID as string
          this.setState(state => ({
            messages: state.messages.filter(m => m.info.id !== messageID),
          }))
        }
        break
      }

      case 'session.idle': {
        if (properties.sessionID === sessionID) {
          this.setState({ isBusy: false })
        }
        break
      }

      case 'session.error': {
        if (properties.sessionID === sessionID) {
          this.setState({ isBusy: false })
        }
        break
      }

      case 'permission.asked': {
        const permission = properties as unknown as IOpenCodePermissionRequest

        if (permission.sessionID === sessionID) {
          this.setState(state => ({
            // The same permission can be re-announced when the stream
            // reconnects, so don't queue it twice.
            pendingPermissions: [
              ...state.pendingPermissions.filter(p => p.id !== permission.id),
              permission,
            ],
          }))
        }
        break
      }

      case 'permission.replied': {
        const permissionID = properties.permissionID ?? properties.id
        this.setState(state => ({
          pendingPermissions: state.pendingPermissions.filter(
            p => p.id !== permissionID
          ),
        }))
        break
      }
    }
  }

  /** Inserts or replaces a message envelope, preserving its parts. */
  private upsertMessage(info: IOpenCodeMessageInfo) {
    this.setState(state => {
      const { messages } = state
      const index = messages.findIndex(m => m.info.id === info.id)

      if (index === -1) {
        return { messages: [...messages, { info, parts: [] }] }
      }

      const updated = [...messages]
      updated[index] = { info, parts: messages[index].parts }

      return { messages: updated }
    })
  }

  /** Inserts or replaces a part of a message. */
  private upsertPart(messageID: string, part: OpenCodePart) {
    this.setState(state => {
      const { messages } = state
      const messageIndex = messages.findIndex(m => m.info.id === messageID)

      if (messageIndex === -1) {
        // The part arrived before its message envelope; it will be picked up
        // by the message.updated event that follows.
        return null
      }

      const message = messages[messageIndex]
      const partIndex = message.parts.findIndex(p => p.id === part.id)

      const parts =
        partIndex === -1
          ? [...message.parts, part]
          : message.parts.map((p, i) => (i === partIndex ? part : p))

      const updated = [...messages]
      updated[messageIndex] = { info: message.info, parts }

      return { messages: updated }
    })
  }

  private onScroll = () => {
    const scroller = this.scrollRef.current

    if (scroller === null) {
      return
    }

    const distanceToBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight

    this.isPinnedToBottom = distanceToBottom <= ScrollPinThreshold
  }

  /** Keeps the newest message in view while the user is at the bottom. */
  private scrollToBottomIfPinned() {
    const scroller = this.scrollRef.current

    if (scroller !== null && this.isPinnedToBottom) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }

  private onSubmit = (text: string) => {
    const client = this.getClient()
    const sessionID = this.props.state.selectedSessionID

    if (client === null || sessionID === null) {
      return
    }

    this.isPinnedToBottom = true
    this.setState({ isBusy: true, error: null })

    client
      .sendPrompt(
        this.props.repository.path,
        sessionID,
        text,
        this.state.selectedAgent ?? undefined
      )
      .catch(e => {
        if (this.isUnmounted) {
          return
        }

        log.error('Failed to send an OpenCode prompt', e)
        this.setState({
          isBusy: false,
          error: e instanceof Error ? e.message : String(e),
        })
      })
  }

  private onAbort = () => {
    const client = this.getClient()
    const sessionID = this.props.state.selectedSessionID

    if (client === null || sessionID === null) {
      return
    }

    client
      .abortSession(this.props.repository.path, sessionID)
      .catch(e => log.error('Failed to abort the OpenCode session', e))
  }

  private onAgentChanged = (selectedAgent: string | null) => {
    this.setState({ selectedAgent })
  }

  /**
   * Answers the permission request identified by the clicked button's data
   * attributes. The identifiers travel through the DOM so the buttons can be
   * rendered without an inline closure per permission.
   */
  private onPermissionResponse = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    const { permissionId, response } = event.currentTarget.dataset
    const client = this.getClient()

    if (client === null || permissionId === undefined) {
      return
    }

    const permission = this.state.pendingPermissions.find(
      p => p.id === permissionId
    )

    if (permission === undefined) {
      return
    }

    // Drop it from the queue immediately; the server confirms with a
    // permission.replied event we'd otherwise wait on.
    this.setState(state => ({
      pendingPermissions: state.pendingPermissions.filter(
        p => p.id !== permission.id
      ),
    }))

    client
      .respondToPermission(
        this.props.repository.path,
        permission.sessionID,
        permission.id,
        response as OpenCodePermissionResponse
      )
      .catch(e => log.error('Failed to answer an OpenCode permission', e))
  }

  private renderPermission(
    permission: IOpenCodePermissionRequest
  ): JSX.Element {
    const patterns = permission.patterns ?? []

    const renderAction = (
      response: OpenCodePermissionResponse,
      label: string
    ) => (
      <button
        className="button-component"
        data-permission-id={permission.id}
        data-response={response}
        onClick={this.onPermissionResponse}
      >
        {label}
      </button>
    )

    return (
      <div key={permission.id} className="opencode-permission">
        <div className="opencode-permission-header">
          <Octicon symbol={octicons.alert} />
          <span>
            OpenCode wants to use <strong>{permission.permission}</strong>
          </span>
        </div>
        {patterns.length > 0 && (
          <pre className="opencode-permission-patterns">
            {patterns.join('\n')}
          </pre>
        )}
        <div className="opencode-permission-actions">
          {renderAction('once', 'Allow once')}
          {renderAction('always', 'Always allow')}
          {renderAction('reject', 'Reject')}
        </div>
      </div>
    )
  }

  private renderMessages(): JSX.Element {
    const { isLoading, messages } = this.state

    if (isLoading) {
      return (
        <div className="opencode-conversation-message">
          <Loading /> Loading conversation…
        </div>
      )
    }

    if (messages.length === 0) {
      return (
        <div className="opencode-conversation-message">
          <Octicon symbol={octicons.commentAi} />
          <p>Ask OpenCode anything about this repository.</p>
        </div>
      )
    }

    return (
      <>
        {messages.map(message => (
          <OpenCodeMessageView key={message.info.id} message={message} />
        ))}
      </>
    )
  }

  public render() {
    const { server, selectedSessionID } = this.props.state
    const { isBusy, error, pendingPermissions } = this.state

    if (server === null || !server.running) {
      return (
        <div className="opencode-conversation">
          <div className="opencode-conversation-message">
            <Octicon symbol={octicons.commentAi} />
            <p>OpenCode isn't running.</p>
          </div>
        </div>
      )
    }

    if (selectedSessionID === null) {
      return (
        <div className="opencode-conversation">
          <div className="opencode-conversation-message">
            <Octicon symbol={octicons.commentAi} />
            <p>Select a session, or start a new one.</p>
          </div>
        </div>
      )
    }

    return (
      <div className="opencode-conversation">
        <div
          className="opencode-conversation-scroller"
          ref={this.scrollRef}
          onScroll={this.onScroll}
        >
          {this.renderMessages()}
          {pendingPermissions.map(p => this.renderPermission(p))}
          {isBusy && (
            <div className="opencode-conversation-busy">
              <Loading /> OpenCode is working…
            </div>
          )}
          {error !== null && (
            <div className="opencode-conversation-error">
              <Octicon symbol={octicons.alert} />
              {error}
            </div>
          )}
        </div>
        <OpenCodePrompt
          agents={this.state.agents}
          selectedAgent={this.state.selectedAgent}
          isBusy={isBusy}
          onSubmit={this.onSubmit}
          onAbort={this.onAbort}
          onAgentChanged={this.onAgentChanged}
        />
      </div>
    )
  }
}
