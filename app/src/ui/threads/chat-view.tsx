import * as React from 'react'
import { IMessage } from '../../models/thread'
import { ThreadStore } from '../../lib/stores/thread-store'
import { formatTimestamp } from '../../models/thread'
import { MessageInput } from './message-input'

interface IChatViewProps {
  readonly threadStore: ThreadStore
  readonly threadId: string
}

interface IChatViewState {
  readonly messages: readonly IMessage[]
  readonly isLoading: boolean
  readonly hasMore: boolean
  readonly error: string | null
}

export class ChatView extends React.Component<IChatViewProps, IChatViewState> {
  private messagesEndRef = React.createRef<HTMLDivElement>()
  private containerRef = React.createRef<HTMLDivElement>()

  public constructor(props: IChatViewProps) {
    super(props)
    this.state = {
      messages: [],
      isLoading: true,
      hasMore: true,
      error: null,
    }
  }

  public componentDidMount() {
    this.loadMessages()
  }

  public componentDidUpdate(prevProps: IChatViewProps) {
    if (prevProps.threadId !== this.props.threadId) {
      this.loadMessages()
    }
  }

  private async loadMessages() {
    this.setState({ isLoading: true, error: null })
    try {
      await this.props.threadStore.selectThread(this.props.threadId)
      const state = this.props.threadStore.getState()
      this.setState({
        messages: state.messages,
        isLoading: false,
        hasMore: state.hasMoreMessages,
      })
      this.scrollToBottom()
    } catch (error) {
      this.setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load messages',
      })
    }
  }

  private scrollToBottom() {
    this.messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  private loadOlderMessages = async () => {
    if (this.state.isLoading || !this.state.hasMore) return

    this.setState({ isLoading: true })
    try {
      await this.props.threadStore.loadOlderMessages()
      const state = this.props.threadStore.getState()
      this.setState({
        messages: state.messages,
        isLoading: false,
        hasMore: state.hasMoreMessages,
      })
    } catch (error) {
      this.setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load older messages',
      })
    }
  }

  private renderMessage(message: IMessage) {
    return (
      <div key={message.hash} className="chat-message">
        <div className="chat-message-header">
          <span className="chat-message-author">{message.author}</span>
          <span className="chat-message-time">{formatTimestamp(message.timestamp)}</span>
        </div>
        <div className="chat-message-content">{message.content}</div>
        {message.attachments.length > 0 && (
          <div className="chat-message-attachments">
            {message.attachments.map((attachment, index) => (
              <div key={index} className="chat-message-attachment">
                {attachment}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  private handleSendMessage = async (content: string, attachments: File[]) => {
    try {
      await this.props.threadStore.sendMessage(content, 'current-user')
      const state = this.props.threadStore.getState()
      this.setState({ messages: state.messages })
      this.scrollToBottom()
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Failed to send message',
      })
    }
  }

  public render() {
    const { messages, isLoading, hasMore, error } = this.state

    return (
      <div className="chat-view">
        {hasMore && (
          <button
            className="chat-load-more"
            onClick={this.loadOlderMessages}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        <div className="chat-messages" ref={this.containerRef}>
          {messages.map(message => this.renderMessage(message))}
          <div ref={this.messagesEndRef} />
        </div>

        {error && <div className="chat-error">{error}</div>}

        <MessageInput onSendMessage={this.handleSendMessage} />
      </div>
    )
  }
}
