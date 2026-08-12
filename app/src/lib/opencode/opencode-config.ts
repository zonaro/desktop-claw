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
}

/** The default OpenCode configuration. */
export const DefaultOpenCodeConfig: IOpenCodeConfig = {
  enabled: false,
  command: 'opencode',
  model: null,
  timeoutMs: 60000,
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
    return parsed
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
  return true
}
