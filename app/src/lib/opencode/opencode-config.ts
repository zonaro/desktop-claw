/**
 * A single custom instruction ("memory") entry that is persisted as a
 * Markdown file inside the OpenCode memory directory. The memory entries
 * are included in the prompts Desktop Claw sends to OpenCode so the AI
 * can follow the user's standing instructions.
 */
export interface IMemoryEntry {
  /** Timestamp-based unique id. */
  readonly id: string
  /** User-provided title. */
  readonly title: string
  /** Markdown content. */
  readonly content: string
  /** When the entry was first created (ms since epoch). */
  readonly createdAt: number
  /** When the entry was last modified (ms since epoch). */
  readonly updatedAt: number
}

/**
 * The shape of the OpenCode CLI configuration persisted to local storage.
 */
export interface IOpenCodeConfig {
  /** Whether the OpenCode commit-message provider is enabled. */
  readonly enabled: boolean
  /** The OpenCode CLI binary name or path. */
  readonly command: string
  /** The model override to pass, or null to use OpenCode's default. */
  readonly model: string | null
  /** Maximum time (ms) the CLI may run before being killed. */
  readonly timeoutMs: number
  /** Whether to generate a code review after each successful commit. */
  readonly reviewOnCommit: boolean
  /**
   * Host of an OpenCode server to connect to instead of starting one, or null
   * to start a local server from the CLI.
   */
  readonly serverHost: string | null
  /** Port of the server named by `serverHost`, or null. */
  readonly serverPort: number | null
  /** User for basic auth against the server named by `serverHost`, or null. */
  readonly serverUser: string | null
  /** Password for basic auth against the server named by `serverHost`, or null. */
  readonly serverPassword: string | null
  /** How the AI should address the user, or null to fall back to the account name. */
  readonly userName: string | null
  /** Custom instruction entries loaded from the memory directory. */
  readonly memory: ReadonlyArray<IMemoryEntry>
}

/** The default OpenCode configuration. */
export const DefaultOpenCodeConfig: IOpenCodeConfig = {
  enabled: false,
  command: 'opencode',
  model: null,
  timeoutMs: 60000,
  reviewOnCommit: false,
  serverHost: null,
  serverPort: null,
  serverUser: null,
  serverPassword: null,
  userName: null,
  memory: [],
}

/**
 * The base URL of the externally managed OpenCode server, or null when the app
 * should start its own.
 *
 * Both a host and a port are required: half a target can't be connected to, and
 * silently guessing the other half would connect somewhere the user didn't ask
 * for.
 */
export function getOpenCodeServerUrl(config: IOpenCodeConfig): string | null {
  const host = config.serverHost?.trim() ?? ''

  if (host.length === 0 || config.serverPort === null) {
    return null
  }

  // A host given with a scheme (or as a full URL) is used as-is, so https and
  // reverse-proxied setups work.
  const withScheme = /^https?:\/\//i.test(host) ? host : `http://${host}`

  return `${withScheme.replace(/\/+$/, '')}:${config.serverPort}`
}

const StorageKey = 'opencode-config'

/**
 * Loads the OpenCode configuration from local storage. Returns the defaults
 * when nothing has been stored or the stored value is malformed.
 */
export function loadOpenCodeConfig(): IOpenCodeConfig {
  const raw = localStorage.getItem(StorageKey)
  if (raw === null) {
    return { ...DefaultOpenCodeConfig }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isOpenCodeConfig(parsed)) {
      return { ...DefaultOpenCodeConfig }
    }

    // Fields added after a config was written are absent from it; merging over
    // the defaults keeps the settings the user already had.
    return { ...DefaultOpenCodeConfig, ...parsed }
  } catch {
    return { ...DefaultOpenCodeConfig }
  }
}

/** Persists the OpenCode configuration to local storage. */
export function saveOpenCodeConfig(config: IOpenCodeConfig): void {
  localStorage.setItem(StorageKey, JSON.stringify(config))
}

/** Type guard confirming the value shapes an IOpenCodeConfig. */
export function isOpenCodeConfig(value: unknown): value is IOpenCodeConfig {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const v = value as Record<string, unknown>
  if (typeof v.enabled !== 'boolean') {
    return false
  }
  if (typeof v.command !== 'string') {
    return false
  }
  if (v.model !== null && typeof v.model !== 'string') {
    return false
  }
  if (
    typeof v.timeoutMs !== 'number' ||
    !Number.isFinite(v.timeoutMs) ||
    v.timeoutMs <= 0
  ) {
    return false
  }
  if (typeof v.reviewOnCommit !== 'boolean') {
    return false
  }
  // The server fields were added later, so a config written before them is
  // still valid — `loadOpenCodeConfig` fills them in from the defaults.
  if (
    v.serverHost !== null &&
    v.serverHost !== undefined &&
    typeof v.serverHost !== 'string'
  ) {
    return false
  }
  if (
    v.serverPort !== null &&
    v.serverPort !== undefined &&
    (typeof v.serverPort !== 'number' ||
      !Number.isInteger(v.serverPort) ||
      v.serverPort <= 0 ||
      v.serverPort > 65535)
  ) {
    return false
  }
  if (
    v.serverUser !== null &&
    v.serverUser !== undefined &&
    typeof v.serverUser !== 'string'
  ) {
    return false
  }
  if (
    v.serverPassword !== null &&
    v.serverPassword !== undefined &&
    typeof v.serverPassword !== 'string'
  ) {
    return false
  }
  if (
    v.userName !== null &&
    v.userName !== undefined &&
    typeof v.userName !== 'string'
  ) {
    return false
  }
  // The memory field was added later; a config written before it is still
  // valid — `loadOpenCodeConfig` fills it in from the defaults.
  if (
    v.memory !== undefined &&
    !Array.isArray(v.memory)
  ) {
    return false
  }
  if (Array.isArray(v.memory)) {
    for (const entry of v.memory) {
      if (!isMemoryEntry(entry)) {
        return false
      }
    }
  }
  return true
}

/** Type guard confirming the value shapes an IMemoryEntry. */
export function isMemoryEntry(value: unknown): value is IMemoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.content === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.updatedAt === 'number'
  )
}
