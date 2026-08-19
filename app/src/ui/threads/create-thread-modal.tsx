import * as React from 'react'
import { ThreadStore } from '../../lib/stores/thread-store'

interface ICreateThreadModalProps {
  readonly threadStore: ThreadStore
  readonly onDismiss: () => void
}

interface ICreateThreadModalState {
  readonly title: string
  readonly tags: string
  readonly isCreating: boolean
}

export class CreateThreadModal extends React.Component<ICreateThreadModalProps, ICreateThreadModalState> {
  public constructor(props: ICreateThreadModalProps) {
    super(props)
    this.state = {
      title: '',
      tags: '',
      isCreating: false,
    }
  }

  private onTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ title: event.target.value })
  }

  private onTagsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ tags: event.target.value })
  }

  private onSubmit = async () => {
    const { title, tags } = this.state
    if (!title.trim() || this.state.isCreating) return

    this.setState({ isCreating: true })
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
      await this.props.threadStore.createThread(title.trim(), tagList, 'current-user')
      this.props.onDismiss()
    } catch (error) {
      console.error('Failed to create thread:', error)
    } finally {
      this.setState({ isCreating: false })
    }
  }

  private onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.props.onDismiss()
    }
  }

  public render() {
    const { title, tags, isCreating } = this.state

    return (
      <div className="create-thread-modal" onKeyDown={this.onKeyDown}>
        <div className="create-thread-modal-header">
          <h3>Create Thread</h3>
          <button className="create-thread-modal-close" onClick={this.props.onDismiss}>
            ×
          </button>
        </div>

        <div className="create-thread-modal-body">
          <div className="create-thread-field">
            <label htmlFor="thread-title">Title</label>
            <input
              id="thread-title"
              type="text"
              value={title}
              onChange={this.onTitleChange}
              placeholder="Thread title..."
              autoFocus
            />
          </div>

          <div className="create-thread-field">
            <label htmlFor="thread-tags">Tags (comma-separated)</label>
            <input
              id="thread-tags"
              type="text"
              value={tags}
              onChange={this.onTagsChange}
              placeholder="bug, discussion, help..."
            />
          </div>
        </div>

        <div className="create-thread-modal-footer">
          <button className="btn-cancel" onClick={this.props.onDismiss} disabled={isCreating}>
            Cancel
          </button>
          <button
            className="btn-create"
            onClick={this.onSubmit}
            disabled={!title.trim() || isCreating}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    )
  }
}
