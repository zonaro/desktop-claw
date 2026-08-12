import * as Fs from 'fs/promises'
import * as Path from 'path'
import ignore from 'ignore'
import { Client, FTPError } from 'basic-ftp'
import type { IFtpDeployment } from '../../models/ftp-deployment'
import { resolveWithin } from '../path'

/** Progress information for an ongoing FTP upload. */
export interface IFtpUploadProgress {
  /** The name of the file currently being uploaded. */
  readonly fileName: string
  /** Number of files completed so far. */
  readonly filesCompleted: number
  /** Total number of files to upload. */
  readonly totalFiles: number
  /** Cumulative bytes transferred across all files so far. */
  readonly bytesOverall: number
}

/** Result of a completed FTP upload operation. */
export interface IFtpUploadResult {
  /** Number of files successfully uploaded. */
  readonly uploadedFiles: number
  /** Number of files that were skipped (not transferred). */
  readonly skippedFiles: number
}

/** Thrown when an FTP upload is cancelled by the caller via AbortSignal. */
export class FtpUploadCancelledError extends Error {
  public constructor() {
    super('FTP upload was cancelled')
    this.name = 'FtpUploadCancelledError'
  }
}

/**
 * Recursively walks the given repository directory and returns a sorted list of
 * file paths (relative to repositoryPath, using POSIX forward-slash separators)
 * that should be uploaded.
 *
 * Symlinks are skipped entirely. The `.git` directory is always excluded.
 * Additional exclusion patterns use `.gitignore` syntax via the `ignore`
 * package.
 *
 * This function is pure with respect to the filesystem — it only reads, never
 * writes — making it straightforward to unit-test.
 *
 * @param repositoryPath  Absolute path to the repository root on disk.
 * @param ignorePatterns   `.gitignore`-style patterns to exclude files.
 * @returns Sorted array of repo-relative POSIX paths of files to upload.
 */
export async function buildFtpUploadFileList(
  repositoryPath: string,
  ignorePatterns: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  // Validate the repository path itself
  const validatedRoot = await resolveWithin(repositoryPath, '.')
  if (validatedRoot === null) {
    throw new Error(`Invalid repository path: ${repositoryPath}`)
  }

  const ig = ignore().add(ignorePatterns)
  const results: string[] = []
  await walkDir(validatedRoot, '', ig, results)
  return results.sort()
}

/**
 * Internal recursive directory walker. Accumulates relative POSIX paths of
 * regular files that pass the ignore filter into `results`.
 */
async function walkDir(
  rootPath: string,
  currentRelative: string,
  ig: ReturnType<typeof ignore>,
  results: string[]
): Promise<void> {
  const currentAbsolute = Path.resolve(rootPath, currentRelative)
  const names = await Fs.readdir(currentAbsolute)

  for (const name of names) {
    const entryRelativePosix =
      currentRelative.length === 0
        ? name
        : Path.posix.join(currentRelative, name)

    // Security guard: verify the entry lives underneath the repository root
    const segments =
      currentRelative.length === 0
        ? [name]
        : [...currentRelative.split(Path.posix.sep), name]
    const validated = await resolveWithin(rootPath, ...segments)
    if (validated === null) {
      continue
    }

    const absolutePath = Path.resolve(rootPath, entryRelativePosix)
    const stat = await Fs.lstat(absolutePath)

    if (stat.isSymbolicLink()) {
      continue
    }

    if (stat.isDirectory()) {
      if (name === '.git') {
        continue
      }
      await walkDir(rootPath, entryRelativePosix, ig, results)
    } else if (stat.isFile()) {
      if (!ig.ignores(entryRelativePosix)) {
        results.push(entryRelativePosix)
      }
    }
  }
}

/**
 * Uploads the repository files to the configured FTP deployment.
 *
 * Progress is reported via the optional `onProgress` callback. The upload can
 * be cancelled at any time by firing the provided `AbortSignal`.
 *
 * @param options.repositoryPath  Absolute path to the repository root.
 * @param options.deployment      FTP deployment configuration.
 * @param options.password        FTP password (never logged).
 * @param options.signal          Optional AbortSignal for cancellation.
 * @param options.onProgress      Optional callback receiving progress updates.
 * @returns Final upload result with counts of uploaded and skipped files.
 */
export async function uploadFtpDeployment(options: {
  readonly repositoryPath: string
  readonly deployment: IFtpDeployment
  readonly password: string
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: IFtpUploadProgress) => void
}): Promise<IFtpUploadResult> {
  const { repositoryPath, deployment, password, signal, onProgress } = options

  const fileList = await buildFtpUploadFileList(
    repositoryPath,
    deployment.ignorePatterns
  )

  // Collect unique parent directories from the file list
  const dirSet = new Set<string>()
  for (const file of fileList) {
    const dir = Path.posix.dirname(file)
    if (dir !== '.') {
      dirSet.add(dir)
    }
  }
  const directories = Array.from(dirSet).sort()

  const client = new Client(30000)
  let uploadedFiles = 0
  let cumulativeBytes = 0

  // Hard-cancel: close the client immediately when the signal fires
  if (signal !== undefined) {
    signal.addEventListener('abort', () => {
      client.close()
    })
  }

  try {
    await client.access({
      host: deployment.host,
      port: deployment.port,
      user: deployment.username,
      password,
      secure: deployment.protocol === 'ftps',
    })

    // Create remote directories before uploading files
    for (const dir of directories) {
      const remoteDir = Path.posix.join(deployment.remotePath, dir)
      await client.ensureDir(remoteDir)
    }

    // Upload each file, checking for cancellation before each transfer
    for (const file of fileList) {
      if (signal?.aborted === true) {
        throw new FtpUploadCancelledError()
      }

      const absLocal = Path.resolve(repositoryPath, file)
      const remotePosixPath = Path.posix.join(deployment.remotePath, file)

      let fileBytes = 0
      client.trackProgress(info => {
        fileBytes = info.bytesOverall
        onProgress?.({
          fileName: file,
          filesCompleted: uploadedFiles,
          totalFiles: fileList.length,
          bytesOverall: cumulativeBytes + fileBytes,
        })
      })

      try {
        await client.uploadFrom(absLocal, remotePosixPath)
      } catch (e) {
        if (
          e instanceof Error &&
          e.message.includes('User closed client')
        ) {
          throw new FtpUploadCancelledError()
        }
        throw e
      }

      cumulativeBytes += fileBytes
      uploadedFiles++
    }

    if (signal?.aborted === true) {
      throw new FtpUploadCancelledError()
    }

    return {
      uploadedFiles,
      skippedFiles: 0,
    }
  } catch (e) {
    if (e instanceof FtpUploadCancelledError) {
      throw e
    }
    if (
      e instanceof Error &&
      e.message.includes('User closed client')
    ) {
      throw new FtpUploadCancelledError()
    }
    throw e
  } finally {
    client.trackProgress()
    client.close()
  }
}

/**
 * Tests whether a connection to the FTP server can be established and the
 * remote directory can be listed.  If listing the configured `remotePath`
 * fails with code 550, the function falls back to listing the server root.
 *
 * @param deployment  FTP deployment configuration.
 * @param password    FTP password (never logged).
 */
export async function testFtpConnection(
  deployment: IFtpDeployment,
  password: string
): Promise<void> {
  const client = new Client(30000)

  try {
    await client.access({
      host: deployment.host,
      port: deployment.port,
      user: deployment.username,
      password,
      secure: deployment.protocol === 'ftps',
    })

    try {
      await client.list(deployment.remotePath)
    } catch (e) {
      if (e instanceof FTPError && e.code === 550) {
        // Remote path not found — fall back to listing root
        await client.list('/')
      } else {
        throw e
      }
    }
  } catch (e) {
    throw mapFtpError(e)
  } finally {
    client.close()
  }
}

/**
 * Maps low-level FTP and network errors into human-readable messages suitable
 * for display in the UI. Unrecognised errors are returned unchanged when they
 * are already an `Error` instance; otherwise they are wrapped.
 *
 * @param e  The error to map.
 * @returns A user-facing Error with a descriptive message.
 */
export function mapFtpError(e: unknown): Error {
  if (e instanceof FTPError && e.code === 530) {
    return new Error('Authentication failed')
  }
  if (e instanceof FTPError && e.code === 550) {
    return new Error('Permission denied or file not found')
  }

  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ECONNREFUSED') {
      return new Error('Connection refused')
    }
    if (code === 'ETIMEDOUT') {
      return new Error('Connection timed out')
    }
    return e
  }

  return new Error(String(e))
}
