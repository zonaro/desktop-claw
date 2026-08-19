import * as React from 'react'

interface IMessageInputProps {
  readonly onSendMessage: (content: string, attachments: File[]) => Promise<void>
}

interface IMessageInputState {
  readonly content: string
  readonly isSending: boolean
}

export class MessageInput extends React.Component<IMessageInputProps, IMessageInputState> {
  private textareaRef = React.createRef<HTMLTextAreaElement>()

  public constructor(props: IMessageInputProps) {
    super(props)
    this.state = {
      content: '',
      isSending: false,
    }
  }

  private onKeyDown = async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      await this.send()
    }
  }

  private onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ content: event.target.value })
  }

  private async send() {
    const { content } = this.state
    if (!content.trim() || this.state.isSending) return

    this.setState({ isSending: true })
    try {
      await this.props.onSendMessage(content, [])
      this.setState({ content: '', isSending: false })
    } catch {
      this.setState({ isSending: false })
    }
  }

  public render() {
    const { content, isSending } = this.state

    return (
      <div className="message-input">
        <textarea
          ref={this.textareaRef}
          value={content}
          onChange={this.onChange}
          onKeyDown={this.onKeyDown}
          placeholder="Type a message..."
          rows={3}
          disabled={isSending}
        />
        <div className="message-input-actions">
          <button
            className="message-input-send"
            onClick={() => this.send()}
            disabled={!content.trim() || isSending}
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    )
  }
}
