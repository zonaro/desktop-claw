import { Repository } from '../../models/repository'
import { ThreadService } from '../thread-service'
import { IThread, IMessage, IThreadPollingConfig, DEFAULT_THREAD_POLLING_CONFIG } from '../../models/thread'

/** State for the ThreadStore */
export interface IThreadState {
  /** All threads in the repository */
  readonly threads: readonly IThread[]
  /** Currently selected thread ID */
  readonly selectedThreadId: string | null
  /** Messages for the selected thread */
  readonly messages: readonly IMessage[]
  /** Whether we're currently loading threads */
  readonly isLoading: boolean
  /** Whether we're loading more messages (infinite scroll) */
  readonly isLoadingMore: boolean
  /** Whether there are more messages to load */
  readonly hasMoreMessages: boolean
  /** Error message if any */
  readonly error: string | null
  /** Polling configuration */
  readonly pollingConfig: IThreadPollingConfig
  /** Unread counts per thread */
  readonly unreadCounts: Map<string, number>
}

/** Default thread state */
const defaultThreadState: IThreadState = {
  threads: [],
  selectedThreadId: null,
  messages: [],
  isLoading: false,
  isLoadingMore: false,
  hasMoreMessages: false,
  error: null,
  pollingConfig: DEFAULT_THREAD_POLLING_CONFIG,
  unreadCounts: new Map(),
}

/**
 * Store for managing threads in a repository.
 * Handles loading, creating, and syncing threads.
 */
export class ThreadStore {
  private readonly threadService: ThreadService
  private pollingInterval: ReturnType<typeof setInterval> | null = null
  private isPolling = false

  private _state: IThreadState = { ...defaultThreadState }

  public constructor(repository: Repository) {
    this.threadService = new ThreadService(repository)
  }

  /** Gets the current state (shallow snapshot). */
  public getState(): IThreadState {
    return this._state
  }

  /** Updates the internal state. */
  private setState(partial: Partial<IThreadState>): void {
    this._state = { ...this._state, ...partial }
  }

  /** Loads all threads for the repository */
  async loadThreads(): Promise<void> {
    this.setState({ isLoading: true, error: null })

    try {
      const threads = await this.threadService.listThreads()
      this.setState({ threads, isLoading: false })

      // Load unread counts
      await this.loadUnreadCounts(threads)
    } catch (error) {
      log.error('Failed to load threads', error as Error)
      this.setState({ isLoading: false, error: 'Failed to load threads' })
    }
  }

  /** Loads unread counts for all threads */
  private async loadUnreadCounts(threads: readonly IThread[]): Promise<void> {
    const unreadCounts = new Map<string, number>()

    for (const thread of threads) {
      const count = await this.threadService.getUnreadCount(thread.id)
      unreadCounts.set(thread.id, count)
    }

    this.setState({ unreadCounts })
  }

  /** Selects a thread and loads its messages */
  async selectThread(threadId: string): Promise<void> {
    const thread = this._state.threads.find((t: IThread) => t.id === threadId)
    if (!thread) return

    this.setState({
      selectedThreadId: threadId,
      messages: [],
      isLoadingMore: false,
      hasMoreMessages: true,
    })

    await this.loadMessages(threadId)
  }

  /** Loads messages for the selected thread */
  async loadMessages(
    threadId: string,
    options: { limit?: number; beforeDate?: Date } = {}
  ): Promise<void> {
    const { limit = 100, beforeDate } = options

    try {
      const result = await this.threadService.getMessages(threadId, {
        limit,
        beforeDate,
      })

      if (beforeDate) {
        // Prepend older messages (for infinite scroll up)
        this.setState({
          messages: [...result.messages, ...this._state.messages],
          hasMoreMessages: result.hasMore,
        })
      } else {
        // Replace with newest messages
        this.setState({
          messages: result.messages,
          hasMoreMessages: result.hasMore,
        })
      }

      // Mark as read
      this.markAsRead(threadId)
    } catch (error) {
      log.error('Failed to load messages', error as Error)
    }
  }

  /** Loads older messages (infinite scroll) */
  async loadOlderMessages(): Promise<void> {
    const { selectedThreadId, messages, isLoadingMore, hasMoreMessages } =
      this._state
    if (!selectedThreadId || isLoadingMore || !hasMoreMessages) return

    const oldestMessage = messages[0]
    if (!oldestMessage) return

    this.setState({ isLoadingMore: true })
    await this.loadMessages(selectedThreadId, {
      beforeDate: new Date(oldestMessage.timestamp),
    })
    this.setState({ isLoadingMore: false })
  }

  /** Creates a new thread */
  async createThread(
    title: string,
    tags: readonly string[],
    author: string
  ): Promise<IThread | null> {
    try {
      const thread = await this.threadService.createThread(title, tags, author)
      this.setState({ threads: [thread, ...this._state.threads] })
      return thread
    } catch (error) {
      log.error('Failed to create thread', error as Error)
      this.setState({ error: 'Failed to create thread' })
      return null
    }
  }

  /** Sends a message to the selected thread */
  async sendMessage(
    content: string,
    author: string,
    attachments: readonly string[] = [],
    replyTo?: string
  ): Promise<IMessage | null> {
    const { selectedThreadId } = this._state
    if (!selectedThreadId) return null

    try {
      const message = await this.threadService.sendMessage(
        selectedThreadId,
        author,
        content,
        attachments,
        replyTo
      )

      // Optimistically add to messages
      this.setState({
        messages: [...this._state.messages, message],
      })

      return message
    } catch (error) {
      log.error('Failed to send message', error as Error)
      this.setState({ error: 'Failed to send message' })
      return null
    }
  }

  /** Edits a message */
  async editMessage(
    messageHash: string,
    newContent: string
  ): Promise<void> {
    const { selectedThreadId } = this._state
    if (!selectedThreadId) return

    try {
      await this.threadService.editMessage(
        selectedThreadId,
        messageHash,
        newContent
      )

      // Update message in state
      this.setState({
        messages: this._state.messages.map((m: IMessage) =>
          m.hash === messageHash ? { ...m, content: newContent } : m
        ),
      })
    } catch (error) {
      log.error('Failed to edit message', error as Error)
      this.setState({ error: 'Failed to edit message' })
    }
  }

  /** Deletes a message */
  async deleteMessage(messageHash: string): Promise<void> {
    const { selectedThreadId } = this._state
    if (!selectedThreadId) return

    try {
      await this.threadService.deleteMessage(selectedThreadId, messageHash)

      // Remove from state
      this.setState({
        messages: this._state.messages.filter(
          (m: IMessage) => m.hash !== messageHash
        ),
      })
    } catch (error) {
      log.error('Failed to delete message', error as Error)
      this.setState({ error: 'Failed to delete message' })
    }
  }

  /** Adds an attachment to a message */
  async addAttachment(
    messageHash: string,
    fileName: string,
    fileContent: Buffer
  ): Promise<string | null> {
    const { selectedThreadId } = this._state
    if (!selectedThreadId) return null

    try {
      const attachmentPath = await this.threadService.addAttachment(
        selectedThreadId,
        messageHash,
        fileName,
        fileContent
      )
      return attachmentPath
    } catch (error) {
      log.error('Failed to add attachment', error as Error)
      this.setState({ error: 'Failed to add attachment' })
      return null
    }
  }

  /** Marks the selected thread as read */
  markAsRead(threadId: string): void {
    const { messages } = this._state
    if (messages.length === 0) return

    const lastMessage = messages[messages.length - 1]
    this.threadService.setUnreadState(threadId, {
      lastReadHash: lastMessage.hash,
      lastReadAt: new Date().toISOString(),
    })

    const unreadCounts = new Map(this._state.unreadCounts)
    unreadCounts.set(threadId, 0)
    this.setState({ unreadCounts })
  }

  /** Starts polling for new messages */
  startPolling(): void {
    if (this.pollingInterval) return

    const poll = async () => {
      if (this.isPolling) return
      this.isPolling = true

      try {
        await this.threadService.fetchRemote()
        await this.threadService.pullChanges()
        await this.refreshThreads()
      } catch (error) {
        log.warn('Polling failed', error as Error)
      } finally {
        this.isPolling = false
      }
    }

    // Initial poll
    poll()

    // Set up interval
    this.pollingInterval = setInterval(poll, this._state.pollingConfig.intervalMs)
  }

  /** Stops polling */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /** Updates polling configuration */
  setPollingConfig(config: Partial<IThreadPollingConfig>): void {
    this.setState({
      pollingConfig: { ...this._state.pollingConfig, ...config },
    })

    // Restart polling with new interval
    if (this.pollingInterval) {
      this.stopPolling()
      this.startPolling()
    }
  }

  /** Refreshes threads and messages */
  async refreshThreads(): Promise<void> {
    const { selectedThreadId } = this._state
    await this.loadThreads()

    if (selectedThreadId) {
      const thread = this._state.threads.find(
        (t: IThread) => t.id === selectedThreadId
      )
      if (thread) {
        await this.selectThread(selectedThreadId)
      }
    }
  }

  /** Gets the thread service instance */
  getThreadService(): ThreadService {
    return this.threadService
  }

  /** Disposes the store */
  dispose(): void {
    this.stopPolling()
  }
}
