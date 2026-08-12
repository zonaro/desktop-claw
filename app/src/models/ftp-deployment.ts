/**
 * The protocol used for FTP deployments.
 * `ftp` = plain FTP, `ftps` = FTP over explicit TLS (AUTH TLS).
 */
export type FtpProtocol = 'ftp' | 'ftps'

/** A single FTP deployment configuration tied to a repository. */
export interface IFtpDeployment {
  /** Stable identifier (UUID). */
  readonly id: string
  /** Human-readable name shown in menus and dialogs. */
  readonly name: string
  /** The FTP protocol: plain (`ftp`) or explicit TLS (`ftps`). */
  readonly protocol: FtpProtocol
  /** Remote hostname or IP address. */
  readonly host: string
  /** Remote port (default: 21). */
  readonly port: number
  /** Login username. */
  readonly username: string
  /** Remote directory path where files are uploaded. */
  readonly remotePath: string
  /** .gitignore-style patterns of files/folders to exclude. */
  readonly ignorePatterns: ReadonlyArray<string>
  /** Whether this deployment is enabled for upload. */
  readonly active: boolean
}

/**
 * Type guard that validates every field on an unknown value conforms to
 * {@link IFtpDeployment}.
 */
export function isFtpDeployment(value: unknown): value is IFtpDeployment {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const d = value as Record<string, unknown>
  if (typeof d.id !== 'string') {
    return false
  }
  if (typeof d.name !== 'string') {
    return false
  }
  if (d.protocol !== 'ftp' && d.protocol !== 'ftps') {
    return false
  }
  if (typeof d.host !== 'string') {
    return false
  }
  if (typeof d.port !== 'number' || !Number.isFinite(d.port) || d.port <= 0) {
    return false
  }
  if (typeof d.username !== 'string') {
    return false
  }
  if (typeof d.remotePath !== 'string') {
    return false
  }
  if (!Array.isArray(d.ignorePatterns) || !d.ignorePatterns.every(p => typeof p === 'string')) {
    return false
  }
  if (typeof d.active !== 'boolean') {
    return false
  }
  return true
}

/**
 * Creates a new FTP deployment object with sensible default values.
 * The caller should replace the defaults with user-supplied values before
 * persisting.
 */
export function createEmptyFtpDeployment(): IFtpDeployment {
  return {
    id: crypto.randomUUID(),
    name: '',
    protocol: 'ftp',
    host: '',
    port: 21,
    username: '',
    remotePath: '/',
    ignorePatterns: [],
    active: true,
  }
}
