import { randomUUID } from 'crypto'

/**
 * Represents a discussion thread in the desktop-claw-threads branch.
 * Each thread is a folder at the root of the branch with an index.json and daily JSONL message files.
 */
export interface IThread {
  /** Unique identifier for the thread (UUID v4) */
  readonly id: string

  /** Human-readable title of the thread */
  readonly title: string

  /** URL-friendly slug derived from title */
  readonly slug: string

  /** Tags associated with the thread for filtering */
  readonly tags: readonly string[]

  /** ISO 8601 timestamp when the thread was created */
  readonly createdAt: string

  /** ISO 8601 timestamp when the thread was last updated */
  readonly updatedAt: string

  /** Author who created the thread */
  readonly author: string

  /** Total number of messages in the thread */
  readonly messageCount: number

  /** Path to the thread folder relative to branch root (e.g., "abc123-my-thread") */
  readonly folderPath: string
}

/**
 * Represents a single message within a thread.
 * Messages are stored as JSONL lines in daily files (YYYY-MM-DD.jsonl).
 */
export interface IMessage {
  /** Author of the message */
  readonly author: string

  /** ISO 8601 timestamp of the message */
  readonly timestamp: string

  /** Message content in GitHub Flavored Markdown */
  readonly content: string

  /** SHA256 hash of the message content for integrity verification */
  readonly hash: string

  /** Relative paths to attached files */
  readonly attachments: readonly string[]

  /** Optional: ID of the message this is a reply to */
  readonly replyTo?: string
}

/**
 * Index file (index.json) at the root of each thread folder.
 * Contains metadata about the thread.
 */
export interface IThreadIndex {
  readonly id: string
  readonly title: string
  readonly slug: string
  readonly tags: readonly string[]
  readonly created_at: string
  readonly updated_at: string
  readonly author: string
  readonly message_count: number
}

/**
 * Raw JSONL line as stored in the daily message files.
 */
export interface IMessageJSONL {
  readonly author: string
  readonly timestamp: string
  readonly content: string
  readonly hash: string
  readonly attachments: readonly string[]
  readonly reply_to?: string
}

/**
 * Result of parsing a JSONL file.
 */
export interface IParsedMessages {
  readonly messages: readonly IMessage[]
  readonly date: string // YYYY-MM-DD
}

/**
 * Thread with its messages loaded for a specific date range.
 */
export interface IThreadWithMessages {
  readonly thread: IThread
  readonly messages: readonly IMessage[]
  readonly hasMore: boolean
  readonly oldestDate?: string
  readonly newestDate?: string
}

/**
 * Unread message tracking per thread.
 * Stored in localStorage keyed by thread ID.
 */
export interface IThreadUnreadState {
  /** Hash of the last read message */
  readonly lastReadHash: string
  /** Timestamp of last read */
  readonly lastReadAt: string
}

/**
 * Configuration for thread polling.
 */
export interface IThreadPollingConfig {
  /** Polling interval in milliseconds */
  readonly intervalMs: number
  /** Whether to auto-fetch when tab gains focus */
  readonly autoFetchOnFocus: boolean
  /** Whether to show absolute timestamps */
  readonly showAbsoluteTimestamps: boolean
  /** Compact mode for denser messages */
  readonly compactMode: boolean
}

/**
 * Default polling configuration.
 */
export const DEFAULT_THREAD_POLLING_CONFIG: IThreadPollingConfig = {
  intervalMs: 30_000, // 30 seconds
  autoFetchOnFocus: true,
  showAbsoluteTimestamps: true,
  compactMode: false,
}

/**
 * Polling interval options for settings UI.
 */
export const POLLING_INTERVAL_OPTIONS = [
  { value: 5_000, label: '5 seconds' },
  { value: 10_000, label: '10 seconds' },
  { value: 30_000, label: '30 seconds' },
  { value: 60_000, label: '1 minute' },
] as const

/**
 * Creates a new thread with the given title and tags.
 */
export function createThread(
  title: string,
  tags: readonly string[],
  author: string
): IThread {
  const now = new Date().toISOString()
  const slug = slugify(title)
  const id = randomUUID()
  const folderPath = `${id}-${slug}`

  return {
    id,
    title,
    slug,
    tags,
    createdAt: now,
    updatedAt: now,
    author,
    messageCount: 0,
    folderPath,
  }
}

/**
 * Creates a thread index from a thread.
 */
export function createThreadIndex(thread: IThread): IThreadIndex {
  return {
    id: thread.id,
    title: thread.title,
    slug: thread.slug,
    tags: thread.tags,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
    author: thread.author,
    message_count: thread.messageCount,
  }
}

/**
 * Converts a thread index to a thread.
 */
export function threadFromIndex(index: IThreadIndex): IThread {
  return {
    id: index.id,
    title: index.title,
    slug: index.slug,
    tags: index.tags,
    createdAt: index.created_at,
    updatedAt: index.updated_at,
    author: index.author,
    messageCount: index.message_count,
    folderPath: `${index.id}-${index.slug}`,
  }
}

/**
 * Creates a new message.
 */
export function createMessage(
  author: string,
  content: string,
  attachments: readonly string[] = [],
  replyTo?: string
): IMessage {
  const timestamp = new Date().toISOString()
  const hash = computeMessageHash(content, timestamp, author)

  return {
    author,
    timestamp,
    content,
    hash,
    attachments,
    replyTo,
  }
}

/**
 * Computes SHA256 hash of a message for integrity verification.
 */
export function computeMessageHash(
  content: string,
  timestamp: string,
  author: string
): string {
  const data = `${author}|${timestamp}|${content}`
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(64, '0')
}

/**
 * Slugifies a string for use in folder names.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

/**
 * Parses a JSONL line into a message.
 */
export function parseMessageJSONL(line: string, date: string): IMessage | null {
  try {
    const parsed = JSON.parse(line) as IMessageJSONL
    return {
      author: parsed.author,
      timestamp: parsed.timestamp,
      content: parsed.content,
      hash: parsed.hash,
      attachments: parsed.attachments ?? [],
      replyTo: parsed.reply_to,
    }
  } catch {
    return null
  }
}

/**
 * Serializes a message to JSONL format.
 */
export function serializeMessageJSONL(message: IMessage): string {
  return JSON.stringify({
    author: message.author,
    timestamp: message.timestamp,
    content: message.content,
    hash: message.hash,
    attachments: message.attachments,
    reply_to: message.replyTo,
  })
}

/**
 * Gets the daily JSONL filename for a given date.
 */
export function getDailyFilename(date: Date = new Date()): string {
  return date.toISOString().split('T')[0] + '.jsonl'
}

/**
 * Parses a date string (YYYY-MM-DD) to a Date object.
 */
export function parseDateString(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00.000Z')
}

/**
 * Formats a timestamp for display.
 */
export function formatTimestamp(
  timestamp: string,
  absolute: boolean = true
): string {
  const date = new Date(timestamp)
  if (absolute) {
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  // Relative time
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('pt-BR')
}
