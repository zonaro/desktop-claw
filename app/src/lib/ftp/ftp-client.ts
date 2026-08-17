import { invoke, send, on, removeListener } from '../ipc-renderer'
import type { IpcRendererEvent } from 'electron'
import type { IFtpDeployment } from '../../models/ftp-deployment'
import type {
  IFtpTestConnectionResult,
  IFtpUploadProgressEvent,
  IFtpUploadResultData,
} from '../../models/ftp-upload'
import { getFtpSecret } from './ftp-secrets'
import { FtpUploadCancelledError } from './ftp-uploader'

/**
 * Handle returned by {@link startFtpUpload}. The caller can await the promise
 * for the final upload result and cancel the upload via
 * {@link cancelFtpUpload}.
 */
export interface IFtpUploadHandle {
  /** Stable identifier for this upload operation (UUID). */
  readonly uploadId: string
  /** Resolves with the final upload result or rejects on error/cancellation. */
  readonly promise: Promise<IFtpUploadResultData>
}

/**
 * Tests whether an FTP connection can be established for the given deployment.
 * If `password` is not provided it is resolved from the OS keychain via
 * {@link getFtpSecret}.
 *
 * @param repositoryId  Numeric repository ID for keychain lookup.
 * @param deployment     FTP deployment configuration.
 * @param password       Optional explicit password (skips keychain lookup).
 * @returns A result indicating success or the error message.
 */
export async function testFtpConnectionForDeployment(
  repositoryId: number,
  deployment: IFtpDeployment,
  password?: string
): Promise<IFtpTestConnectionResult> {
  const resolvedPassword =
    password !== undefined
      ? password
      : await getFtpSecret(repositoryId, deployment.id)

  if (resolvedPassword === null) {
    throw new Error('FTP password not set')
  }

  return invoke('ftp-test-connection', deployment, resolvedPassword)
}

/**
 * Starts an FTP upload to the configured deployment.  The password is resolved
 * from the OS keychain unless provided explicitly.
 *
 * Progress events are delivered through the optional `onProgress` callback.
 * The returned handle can be cancelled via {@link cancelFtpUpload}.
 *
 * @param args.repositoryId   Numeric repository ID for keychain lookup.
 * @param args.repositoryPath Absolute path to the repository root on disk.
 * @param args.deployment      FTP deployment configuration.
 * @param args.onProgress      Optional callback receiving progress updates.
 * @returns A handle containing the upload ID and a promise for the final result.
 */
export async function startFtpUpload(args: {
  readonly repositoryId: number
  readonly repositoryPath: string
  readonly deployment: IFtpDeployment
  readonly onProgress?: (progress: IFtpUploadProgressEvent) => void
}): Promise<IFtpUploadHandle> {
  const { repositoryId, repositoryPath, deployment, onProgress } = args

  const password = await getFtpSecret(repositoryId, deployment.id)
  if (password === null) {
    throw new Error('FTP password not set')
  }

  const uploadId = crypto.randomUUID()

  const progressListener = (
    _event: IpcRendererEvent,
    progress: IFtpUploadProgressEvent
  ) => {
    if (progress.uploadId === uploadId) {
      onProgress?.(progress)
    }
  }

  on('ftp-upload-progress', progressListener)

  const promise = invoke('ftp-upload', {
    uploadId,
    repositoryPath,
    deployment,
    password,
  })
    .catch(e => {
      if (e instanceof Error && e.message.includes('cancelled')) {
        throw new FtpUploadCancelledError()
      }
      throw e
    })
    .finally(() => {
      removeListener('ftp-upload-progress', progressListener)
    })

  return { uploadId, promise }
}

/**
 * Cancels an active FTP upload identified by its `uploadId`.  If the upload
 * has already completed or does not exist this is a no-op.
 *
 * @param uploadId  The UUID returned by {@link startFtpUpload}.
 */
export function cancelFtpUpload(uploadId: string): void {
  send('ftp-cancel-upload', uploadId)
}
