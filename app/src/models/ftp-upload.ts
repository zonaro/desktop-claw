import type { IFtpDeployment } from './ftp-deployment'

/**
 * Parameters passed from the renderer to the main process to initiate an FTP
 * upload.
 */
export interface IFtpUploadRequest {
  /** Stable identifier for this upload operation (UUID). */
  readonly uploadId: string
  /** Absolute path to the repository root on disk. */
  readonly repositoryPath: string
  /** The FTP deployment configuration to upload to. */
  readonly deployment: IFtpDeployment
  /** The FTP password (retrieved from the OS keychain in the renderer). */
  readonly password: string
}

/**
 * Progress event sent from the main process to the renderer during an active
 * FTP upload.
 */
export interface IFtpUploadProgressEvent {
  /** Matches the uploadId from the initiating request. */
  readonly uploadId: string
  /** The name of the file currently being uploaded. */
  readonly fileName: string
  /** Number of files completed so far. */
  readonly filesCompleted: number
  /** Total number of files to upload. */
  readonly totalFiles: number
  /** Cumulative bytes transferred across all files so far. */
  readonly bytesOverall: number
}

/**
 * Result returned when testing an FTP connection. The renderer receives this
 * synchronously-style via an IPC invoke.
 */
export interface IFtpTestConnectionResult {
  /** Whether the connection succeeded. */
  readonly ok: boolean
  /** Human-readable error message when `ok` is false, or null on success. */
  readonly error: string | null
}

/**
 * Result of a completed FTP upload operation. Re-declared here so that
 * {@link app/src/lib/ipc-shared.ts} only imports from the models layer.
 */
export interface IFtpUploadResultData {
  /** Number of files successfully uploaded. */
  readonly uploadedFiles: number
  /** Number of files that were skipped (not transferred). */
  readonly skippedFiles: number
}
