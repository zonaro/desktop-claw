import * as React from 'react'
import { Repository } from '../../models/repository'
import { IThread } from '../../models/thread'
import { ThreadStore } from '../../lib/stores/thread-store'

interface IThreadListProps {
  readonly repository: Repository
  readonly threadStore: ThreadStore
  readonly selectedThreadId: string | null
  readonly onThreadSelected: (threadId: string) => void
}

interface IThreadListState {
  readonly threads: readonly IThread[]
  readonly isLoading: boolean
  readonly error: string | null
  readonly searchQuery: string
}

export class ThreadList extends React.Component<IThreadListProps, IThreadListState> {
  public constructor(props: IThreadListProps) {
    super(props)
    this.state = {
      threads: [],
      isLoading: true,
      error: null,
      searchQuery: '',
    }
  }

  public componentDidMount() {
    this.loadThreads()
  }

  private async loadThreads() {
    this.setState({ isLoading: true, error: null })
    try {
      await this.props.threadStore.loadThreads()
      const state = this.props.threadStore.getState()
      this.setState({
        threads: state.threads,
        isLoading: false,
      })
    } catch (error) {
      this.setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load threads',
      })
    }
  }

  private onSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ searchQuery: event.target.value })
  }

  private onNewThread = async () => {
    const title = this.state.searchQuery.trim()
    if (!title) return

    try {
      await this.props.threadStore.createThread(title, [], 'current-user')
      await this.loadThreads()
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : 'Failed to create thread',
      })
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      this.onNewThread()
    }
  }

  private renderThread(thread: IThread) {
    const isSelected = thread.id === this.props.selectedThreadId
    const lastUpdated = new Date(thread.updatedAt).toLocaleDateString()

    return (
      <div
        key={thread.id}
        className={`thread-list-item ${isSelected ? 'selected' : ''}`}
        onClick={() => this.props.onThreadSelected(thread.id)}
      >
        <div className="thread-list-item-title">{thread.title}</div>
        <div className="thread-list-item-meta">
          <span>{thread.messageCount} messages</span>
          <span>{lastUpdated}</span>
        </div>
        {thread.tags.length > 0 && (
          <div className="thread-list-item-tags">
            {thread.tags.map(tag => (
              <span key={tag} className="thread-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    )
  }

  public render() {
    const { threads, isLoading, error, searchQuery } = this.state

    return (
      <div className="thread-list">
        <div className="thread-list-header">
          <h3>Threads</h3>
          <button className="thread-new-button" onClick={this.onNewThread}>
            +
          </button>
        </div>

        <div className="thread-list-search">
          <input
            type="text"
            placeholder="Search or create thread..."
            value={searchQuery}
            onChange={this.onSearchChange}
            onKeyDown={this.onKeyDown}
          />
        </div>

        <div className="thread-list-content">
          {isLoading && <div className="thread-list-loading">Loading threads...</div>}
          {error && <div className="thread-list-error">{error}</div>}
          {!isLoading && !error && threads.length === 0 && (
            <div className="thread-list-empty">
              <p>No threads yet</p>
              <p>Create a thread to start a discussion</p>
            </div>
          )}
          {!isLoading && !error && threads.map(thread => this.renderThread(thread))}
        </div>
      </div>
    )
  }
}
