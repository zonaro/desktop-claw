import * as Path from 'path'
import { Repository } from '../models/repository'
import { Branch } from '../models/branch'
import {
    IThread,
    IMessage,
    IThreadIndex,
    IThreadWithMessages,
    IThreadUnreadState,
    createThread,
    createThreadIndex,
    threadFromIndex,
    createMessage,
    computeMessageHash,
    parseMessageJSONL,
    serializeMessageJSONL,
    getDailyFilename
} from '../models/thread'
import { git } from './git/core'
import { getBranches } from './git/for-each-ref'

/** Branch name for threads */
export const THREADS_BRANCH = 'desktop-claw-threads'

/** Threads folder name in the repository */
export const THREADS_FOLDER = 'threads'

/**
 * Service for managing threads - handles all file system and Git operations.
 * Threads are stored in a dedicated branch (desktop-claw-threads) with the following structure:
 *
 * desktop-claw-threads/
 * ├── {thread-id}-{slug}/
 * │   ├── index.json          # Thread metadata
 * │   ├── YYYY-MM-DD.jsonl    # Daily messages (JSON Lines)
 * │   └── attachments/
 * │       └── {timestamp}/    # Attachments per message
 * │           └── {file.ext}
 */
export class ThreadService {
  private readonly repository: Repository
  private readonly repoPath: string
  private readonly threadsBranchPath: string

  constructor(repository: Repository) {
    this.repository = repository
    this.repoPath = repository.path
    this.threadsBranchPath = Path.join(this.repoPath, THREADS_FOLDER)
  }

  /**
   * Ensures the threads branch exists and is checked out.
   * Creates it as an orphan branch if it doesn't exist.
   */
  async ensureThreadsBranch(): Promise<void> {
    try {
      // Check if branch exists locally
      const branches = await getBranches(this.repository)
      const hasThreadsBranch = branches.some((b: Branch) => b.name === THREADS_BRANCH)

      if (!hasThreadsBranch) {
        log.info(`Creating threads branch: ${THREADS_BRANCH}`)
        // Create orphan branch
        await git(['checkout', '--orphan', THREADS_BRANCH], this.repoPath, 'checkout-orphan-threads')
        // Create initial commit with empty threads folder
        await git(['commit', '--allow-empty', '-m', 'Initialize threads branch'], this.repoPath, 'commit-threads-init')
        // Git --orphan leaves HEAD detached; caller should restore their branch
      }
    } catch (error) {
      log.error('Failed to ensure threads branch', error as Error)
      throw error
    }
  }

  /**
   * Lists all threads from the threads branch.
   */
  async listThreads(): Promise<readonly IThread[]> {
    await this.ensureThreadsBranch()

    try {
      // Get the tree of the threads branch
      const tree = await git(
        ['ls-tree', '-r', '--name-only', THREADS_BRANCH],
        this.repoPath,
        'ls-tree-threads'
      )

      const lines = tree.stdout.trim().split('\n').filter(Boolean)
      const threadFolders = new Set<string>()

      // Extract thread folder names (first path component)
      for (const line of lines) {
        const parts = line.split('/')
        if (parts.length >= 1 && parts[0]) {
          threadFolders.add(parts[0])
        }
      }

      const threads: IThread[] = []

      for (const folder of threadFolders) {
        const thread = await this.loadThread(folder)
        if (thread) {
          threads.push(thread)
        }
      }

      // Sort by updatedAt descending (most recent first)
      return threads.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch (error) {
      log.error('Failed to list threads', error as Error)
      return []
    }
  }

  /**
   * Loads a single thread by its folder name.
   */
  async loadThread(folderName: string): Promise<IThread | null> {
    try {
      const indexPath = Path.join(folderName, 'index.json')
      const result = await git(
        ['show', `${THREADS_BRANCH}:${indexPath}`],
        this.repoPath,
        'show-thread-index'
      )

      const index = JSON.parse(result.stdout) as IThreadIndex
      return threadFromIndex(index)
    } catch (error) {
      log.warn(`Failed to load thread ${folderName}`, error as Error)
      return null
    }
  }

  /**
   * Gets messages for a thread on a specific date.
   */
  async getMessagesForDate(
    threadId: string,
    date: Date = new Date()
  ): Promise<readonly IMessage[]> {
    const thread = await this.getThreadById(threadId)
    if (!thread) return []

    const filename = getDailyFilename(date)
    const filePath = Path.join(thread.folderPath, filename)

    try {
      const result = await git(
        ['show', `${THREADS_BRANCH}:${filePath}`],
        this.repoPath,
        'show-thread-messages'
      )

      return this.parseJSONL(result.stdout, date.toISOString().split('T')[0])
    } catch {
      // File doesn't exist yet - return empty array
      return []
    }
  }

  /**
   * Gets messages for a thread across multiple dates (for infinite scroll).
   */
  async getMessages(
    threadId: string,
    options: {
      limit?: number
      beforeDate?: Date
      afterDate?: Date
    } = {}
  ): Promise<IThreadWithMessages> {
    const thread = await this.getThreadById(threadId)
    if (!thread) {
      return { thread: null as unknown as IThread, messages: [], hasMore: false }
    }

    const { limit = 100, beforeDate, afterDate } = options
    const allMessages: IMessage[] = []
    let hasMore = false

    // Get list of all JSONL files for this thread
    const treeResult = await git(
      ['ls-tree', '-r', '--name-only', THREADS_BRANCH, thread.folderPath],
      this.repoPath,
      'ls-tree-thread-files'
    )

    const files = treeResult.stdout.trim().split('\n').filter(Boolean)
    const jsonlFiles = files
      .filter((f: string) => f.endsWith('.jsonl'))
      .map((f: string) => Path.basename(f))
      .sort()
      .reverse() // Newest first

    let count = 0
    for (const filename of jsonlFiles) {
      const dateStr = filename.replace('.jsonl', '')
      const fileDate = new Date(dateStr + 'T00:00:00.000Z')

      if (beforeDate && fileDate > beforeDate) continue
      if (afterDate && fileDate < afterDate) continue

      const filePath = Path.join(thread.folderPath, filename)
      try {
        const result = await git(
          ['show', `${THREADS_BRANCH}:${filePath}`],
          this.repoPath,
          'show-thread-messages'
        )
        const messages = this.parseJSONL(result.stdout, dateStr)
        allMessages.push(...messages)
        count += messages.length

        if (count >= limit) {
          hasMore = true
          break
        }
      } catch {
        // Skip missing files
      }
    }

    // Sort messages by timestamp ascending (oldest first for display)
    allMessages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    return {
      thread,
      messages: allMessages.slice(-limit), // Return last N messages
      hasMore,
      oldestDate: allMessages[0]?.timestamp,
      newestDate: allMessages[allMessages.length - 1]?.timestamp,
    }
  }

  /**
   * Parses JSONL content into messages.
   */
  private parseJSONL(content: string, date: string): IMessage[] {
    const lines = content.trim().split('\n').filter(Boolean)
    const messages: IMessage[] = []

    for (const line of lines) {
      const message = parseMessageJSONL(line, date)
      if (message) {
        messages.push(message)
      }
    }

    return messages
  }

  /**
   * Gets a thread by its ID.
   */
  async getThreadById(threadId: string): Promise<IThread | null> {
    const threads = await this.listThreads()
    return threads.find(t => t.id === threadId) ?? null
  }

  /**
   * Creates a new thread.
   */
  async createThread(
    title: string,
    tags: readonly string[],
    author: string
  ): Promise<IThread> {
    await this.ensureThreadsBranch()

    const thread = createThread(title, tags, author)
    const index = createThreadIndex(thread)

    // Write index.json to the working tree
    const indexPath = Path.join(this.threadsBranchPath, thread.folderPath, 'index.json')
    await this.writeFile(indexPath, JSON.stringify(index, null, 2))

    // Commit and push
    await this.commitAndPush(
      `Create thread ${thread.id} - ${thread.title}`,
      [Path.join(THREADS_FOLDER, thread.folderPath, 'index.json')]
    )

    return thread
  }

  /**
   * Sends a new message to a thread.
   */
  async sendMessage(
    threadId: string,
    author: string,
    content: string,
    attachments: readonly string[] = [],
    replyTo?: string
  ): Promise<IMessage> {
    const thread = await this.getThreadById(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }

    const message = createMessage(author, content, attachments, replyTo)
    const date = new Date(message.timestamp)
    const filename = getDailyFilename(date)
    const filePath = Path.join(thread.folderPath, filename)

    // Read existing messages for the day
    let existingContent = ''
    try {
      const result = await git(
        ['show', `${THREADS_BRANCH}:${filePath}`],
        this.repoPath,
        'show-thread-messages'
      )
      existingContent = result.stdout
    } catch {
      // File doesn't exist yet
    }

    // Append new message
    const newLine = serializeMessageJSONL(message)
    const updatedContent = existingContent
      ? `${existingContent}\n${newLine}`
      : newLine

    // Write to working tree
    const fullPath = Path.join(this.threadsBranchPath, filePath)
    await this.writeFile(fullPath, updatedContent)

    // Update thread index (increment message count, update updatedAt)
    await this.updateThreadIndex(thread, {
      message_count: thread.messageCount + 1,
      updated_at: message.timestamp,
    })

    // Commit and push
    await this.commitAndPush(
      `Update thread ${threadId} - ${message.timestamp}`,
      [
        Path.join(THREADS_FOLDER, filePath),
        Path.join(THREADS_FOLDER, thread.folderPath, 'index.json'),
      ]
    )

    return message
  }

  /**
   * Edits an existing message.
   */
  async editMessage(
    threadId: string,
    messageHash: string,
    newContent: string
  ): Promise<void> {
    const thread = await this.getThreadById(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }

    // Find the message across all daily files
    const treeResult = await git(
      ['ls-tree', '-r', '--name-only', THREADS_BRANCH, thread.folderPath],
      this.repoPath,
      'ls-tree-thread-files'
    )

    const files = treeResult.stdout.trim().split('\n').filter(Boolean)
    const jsonlFiles = files.filter((f: string) => f.endsWith('.jsonl'))

    let found = false
    let updatedFilePath = ''

    for (const filename of jsonlFiles) {
      const filePath = Path.join(thread.folderPath, filename)
      try {
        const result = await git(
          ['show', `${THREADS_BRANCH}:${filePath}`],
          this.repoPath,
          'show-thread-messages'
        )

        const lines = result.stdout.trim().split('\n').filter(Boolean)
        const updatedLines = lines.map((line: string) => {
          const msg = parseMessageJSONL(line, filename.replace('.jsonl', ''))
          if (msg && msg.hash === messageHash) {
            found = true
            const updatedMsg = { ...msg, content: newContent, hash: computeMessageHash(newContent, msg.timestamp, msg.author) }
            return serializeMessageJSONL(updatedMsg)
          }
          return line
        })

        if (found) {
          updatedFilePath = filePath
          const fullPath = Path.join(this.threadsBranchPath, filePath)
          await this.writeFile(fullPath, updatedLines.join('\n'))
          break
        }
      } catch {
        // Skip
      }
    }

    if (!found) {
      throw new Error(`Message ${messageHash} not found`)
    }

    // Commit and push
    await this.commitAndPush(
      `Edit message ${messageHash} from thread ${threadId} - ${new Date().toISOString()}`,
      [
        Path.join(THREADS_FOLDER, updatedFilePath),
        Path.join(THREADS_FOLDER, thread.folderPath, 'index.json'),
      ]
    )
  }

  /**
   * Deletes a message.
   */
  async deleteMessage(
    threadId: string,
    messageHash: string
  ): Promise<void> {
    const thread = await this.getThreadById(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }

    // Find and remove the message
    const treeResult = await git(
      ['ls-tree', '-r', '--name-only', THREADS_BRANCH, thread.folderPath],
      this.repoPath,
      'ls-tree-thread-files'
    )

    const files = treeResult.stdout.trim().split('\n').filter(Boolean)
    const jsonlFiles = files.filter((f: string) => f.endsWith('.jsonl'))

    let found = false
    let updatedFilePath = ''

    for (const filename of jsonlFiles) {
      const filePath = Path.join(thread.folderPath, filename)
      try {
        const result = await git(
          ['show', `${THREADS_BRANCH}:${filePath}`],
          this.repoPath,
          'show-thread-messages'
        )

        const lines = result.stdout.trim().split('\n').filter(Boolean)
        const updatedLines = lines.filter((line: string) => {
          const msg = parseMessageJSONL(line, filename.replace('.jsonl', ''))
          return !(msg && msg.hash === messageHash)
        })

        if (lines.length !== updatedLines.length) {
          found = true
          updatedFilePath = filePath
          const fullPath = Path.join(this.threadsBranchPath, filePath)
          await this.writeFile(fullPath, updatedLines.join('\n'))
          break
        }
      } catch {
        // Skip
      }
    }

    if (!found) {
      throw new Error(`Message ${messageHash} not found`)
    }

    // Update thread index (decrement message count)
    await this.updateThreadIndex(thread, {
      message_count: thread.messageCount - 1,
      updated_at: new Date().toISOString(),
    })

    // Commit and push
    await this.commitAndPush(
      `Delete message ${messageHash} from thread ${threadId} - ${new Date().toISOString()}`,
      [
        Path.join(THREADS_FOLDER, updatedFilePath),
        Path.join(THREADS_FOLDER, thread.folderPath, 'index.json'),
      ]
    )
  }

  /**
   * Adds an attachment to a message.
   */
  async addAttachment(
    threadId: string,
    messageHash: string,
    fileName: string,
    fileContent: Buffer
  ): Promise<string> {
    const thread = await this.getThreadById(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const attachmentDir = Path.join(thread.folderPath, 'attachments', timestamp)
    const attachmentPath = Path.join(attachmentDir, fileName)

    // Write attachment to working tree
    const fullPath = Path.join(this.threadsBranchPath, attachmentPath)
    await this.writeFile(fullPath, fileContent)

    // Find the message and update its attachments array
    const treeResult = await git(
      ['ls-tree', '-r', '--name-only', THREADS_BRANCH, thread.folderPath],
      this.repoPath,
      'ls-tree-thread-files'
    )

    const files = treeResult.stdout.trim().split('\n').filter(Boolean)
    const jsonlFiles = files.filter((f: string) => f.endsWith('.jsonl'))

    let found = false
    let updatedFilePath = ''

    for (const filename of jsonlFiles) {
      const filePath = Path.join(thread.folderPath, filename)
      try {
        const result = await git(
          ['show', `${THREADS_BRANCH}:${filePath}`],
          this.repoPath,
          'show-thread-messages'
        )

        const lines = result.stdout.trim().split('\n').filter(Boolean)
        const updatedLines = lines.map((line: string) => {
          const msg = parseMessageJSONL(line, filename.replace('.jsonl', ''))
          if (msg && msg.hash === messageHash) {
            found = true
            const updatedMsg = {
              ...msg,
              attachments: [...msg.attachments, attachmentPath],
            }
            return serializeMessageJSONL(updatedMsg)
          }
          return line
        })

        if (found) {
          updatedFilePath = filePath
          const fullPath = Path.join(this.threadsBranchPath, filePath)
          await this.writeFile(fullPath, updatedLines.join('\n'))
          break
        }
      } catch {
        // Skip
      }
    }

    if (!found) {
      throw new Error(`Message ${messageHash} not found`)
    }

    // Commit and push
    await this.commitAndPush(
      `Update thread ${threadId} - ${new Date().toISOString()}`,
      [
        Path.join(THREADS_FOLDER, attachmentPath),
        Path.join(THREADS_FOLDER, updatedFilePath),
        Path.join(THREADS_FOLDER, thread.folderPath, 'index.json'),
      ]
    )

    return attachmentPath
  }

  /**
   * Updates the thread index.json.
   */
  private async updateThreadIndex(
    thread: IThread,
    updates: Partial<Pick<IThreadIndex, 'message_count' | 'updated_at'>>
  ): Promise<void> {
    const index = createThreadIndex(thread)
    const updatedIndex = { ...index, ...updates }
    const indexPath = Path.join(this.threadsBranchPath, thread.folderPath, 'index.json')
    await this.writeFile(indexPath, JSON.stringify(updatedIndex, null, 2))
  }

  /**
   * Commits and pushes changes to the threads branch.
   */
  private async commitAndPush(
    message: string,
    files: readonly string[]
  ): Promise<void> {
    // Add files
    for (const file of files) {
      await git(['add', file], this.repoPath, 'git-add')
    }

    // Commit
    await git(['commit', '-m', message], this.repoPath, 'git-commit')

    // Push to origin
    try {
      await git(['push', 'origin', THREADS_BRANCH], this.repoPath, 'git-push')
    } catch (error) {
      log.warn('Failed to push threads branch', error as Error)
      // Don't throw - local commit is fine
    }
  }

  /**
   * Writes a file to the filesystem, creating directories as needed.
   */
  private async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    const fs = await import('fs/promises')
    const dir = Path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, content)
  }

  /**
   * Fetches the latest changes from the remote threads branch.
   */
  async fetchRemote(): Promise<void> {
    try {
      await git(['fetch', 'origin', THREADS_BRANCH], this.repoPath, 'git-fetch')
    } catch (error) {
      log.warn('Failed to fetch threads branch', error as Error)
    }
  }

  /**
   * Pulls the latest changes from the remote threads branch.
   * Handles merge conflicts in JSONL files by concatenating and deduplicating.
   */
  async pullChanges(): Promise<void> {
    try {
      await git(['pull', 'origin', THREADS_BRANCH], this.repoPath, 'git-pull')
    } catch (error) {
      log.warn('Failed to pull threads branch, attempting merge', error as Error)
      // Try to resolve conflicts
      await this.resolveConflicts()
    }
  }

  /**
   * Resolves merge conflicts in JSONL files by concatenating and deduplicating by hash.
   */
  private async resolveConflicts(): Promise<void> {
    // Get conflicted files
    const statusResult = await git(['status', '--porcelain'], this.repoPath, 'git-status')
    const conflictedFiles = statusResult.stdout
      .split('\n')
      .filter((line: string) => line.startsWith('UU'))
      .map((line: string) => line.substring(3).trim())

    for (const file of conflictedFiles) {
      if (file.endsWith('.jsonl')) {
        await this.resolveJSONLConflict(file)
      }
    }

    // Commit the merge
    await git(['commit', '-m', `Merge thread conflicts - ${new Date().toISOString()}`], this.repoPath, 'git-commit')
    await git(['push', 'origin', THREADS_BRANCH], this.repoPath, 'git-push')
  }

  /**
   * Resolves a conflict in a JSONL file by combining both versions and deduplicating by hash.
   */
  private async resolveJSONLConflict(filePath: string): Promise<void> {
    const fullPath = Path.join(this.repoPath, filePath)
    const fs = await import('fs/promises')

    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      // Parse conflict markers and combine
      const lines = content.split('\n')
      const messages = new Map<string, string>()

      for (const line of lines) {
        if (line.startsWith('<<<<<<<') || line.startsWith('=======') || line.startsWith('>>>>>>>')) {
          continue
        }
        if (line.trim()) {
          const msg = parseMessageJSONL(line, '')
          if (msg) {
            messages.set(msg.hash, line)
          }
        }
      }

      // Write resolved content
      const resolved = Array.from(messages.values()).join('\n')
      await fs.writeFile(fullPath, resolved)
      await git(['add', filePath], this.repoPath, 'git-add-resolved')
    } catch (error) {
      log.error(`Failed to resolve conflict in ${filePath}`, error as Error)
    }
  }

  /**
   * Gets the unread state for a thread from localStorage.
   */
  getUnreadState(threadId: string): IThreadUnreadState | null {
    try {
      const stored = localStorage.getItem(`thread-unread-${threadId}`)
      return stored ? JSON.parse(stored) as IThreadUnreadState : null
    } catch {
      return null
    }
  }

  /**
   * Updates the unread state for a thread.
   */
  setUnreadState(threadId: string, state: IThreadUnreadState): void {
    try {
      localStorage.setItem(`thread-unread-${threadId}`, JSON.stringify(state))
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Gets the count of unread messages for a thread.
   */
  async getUnreadCount(threadId: string): Promise<number> {
    const thread = await this.getThreadById(threadId)
    if (!thread) return 0

    const unreadState = this.getUnreadState(threadId)
    if (!unreadState) return thread.messageCount

    // Get all messages and count those after lastReadHash
    const { messages } = await this.getMessages(threadId, { limit: 10000 })
    const lastReadIndex = messages.findIndex(m => m.hash === unreadState.lastReadHash)
    if (lastReadIndex === -1) return messages.length
    return messages.length - lastReadIndex - 1
  }
}
