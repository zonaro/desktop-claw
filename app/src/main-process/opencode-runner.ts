import { spawn, ChildProcess } from 'child_process'
import { IOpenCodeAvailability, IOpenCodeRunRequest } from '../models/opencode'

/** Maximum stderr captured before truncation. */
const MaxStderrLength = 2000

/**
 * Thrown when the configured OpenCode CLI command cannot be found on the
 * system PATH (ENOENT from the child_process spawn).
 */
export class OpenCodeNotInstalledError extends Error {
  public constructor(command: string) {
    super(`OpenCode CLI not found: ${command}`)
    this.name = 'OpenCodeNotInstalledError'
  }
}

/**
 * Thrown when the OpenCode CLI exits with a non-zero code or is killed by
 * a timeout / cancellation.
 */
export class OpenCodeRunError extends Error {
  /** The process exit code, or null when terminated by signal / timeout. */
  public readonly exitCode: number | null
  /** The stderr output captured before the process exited (truncated). */
  public readonly stderr: string

  public constructor(message: string, exitCode: number | null, stderr: string) {
    // Truncate stderr to keep IPC messages bounded.
    const truncatedStderr =
      stderr.length > MaxStderrLength ? stderr.slice(0, MaxStderrLength) : stderr

    // Include stderr in the message so it survives Electron IPC serialization,
    // which only preserves message, name, and stack on Error objects.
    const fullMessage =
      truncatedStderr.length > 0
        ? `${message}\n\nstderr:\n${truncatedStderr}`
        : message

    super(fullMessage)
    this.name = 'OpenCodeRunError'
    this.exitCode = exitCode
    this.stderr = truncatedStderr
  }
}

/** Permissions file content used to deny all tools. */
const OpenCodePermission = JSON.stringify({
  edit: 'deny',
  bash: 'deny',
  write: 'deny',
  patch: 'deny',
  webfetch: 'deny',
  websearch: 'deny',
})

/**
 * Tracks in-flight child processes by requestId so they can be force-killed
 * via {@link cancelOpenCodeRun}.
 */
const activeProcesses = new Map<string, ChildProcess>()

/** Request IDs that have been explicitly cancelled via {@link cancelOpenCodeRun}. */
const cancelledRequestIds = new Set<string>()

/**
 * Probe whether an OpenCode CLI binary is available on the system.
 *
 * Spawns `<command> --version` with a 10-second timeout. Resolves with
 * the availability status and, when successful, the trimmed first line
 * of stdout as the version string.
 *
 * @param command - The CLI binary name or absolute path to test.
 */
export async function checkOpenCodeAvailability(
  command: string
): Promise<IOpenCodeAvailability> {
  return new Promise<IOpenCodeAvailability>(resolve => {
    const child = spawn(command, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let settled = false

    const finish = (available: boolean, version: string | null) => {
      if (settled) {
        return
      }
      settled = true
      child.removeAllListeners()
      child.kill()
      resolve({ available, version })
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.on('error', err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        finish(false, null)
      } else {
        finish(false, null)
      }
    })

    child.on('close', code => {
      if (code === 0) {
        const firstLine = stdout.split('\n')[0]?.trim() ?? ''
        finish(true, firstLine || null)
      } else {
        finish(false, null)
      }
    })

    // Safety timeout: 10 seconds
    setTimeout(() => finish(false, null), 10000)
  })
}

/**
 * Run a single OpenCode prompt as a child process, returning its stdout on
 * success. The prompt is written to the child's stdin. The process runs
 * under a permission set that denies all tool access.
 *
 * @throws OpenCodeNotInstalledError when the binary cannot be found.
 * @throws OpenCodeRunError on non-zero exit or timeout.
 */
export async function runOpenCodePrompt(
  request: IOpenCodeRunRequest
): Promise<string> {
  const args = [
    'run',
    ...(request.model !== null ? ['--model', request.model] : []),
    'Follow the instructions provided via stdin. Output only the requested JSON object.',
  ]

  return new Promise<string>((resolve, reject) => {
    const child = spawn(request.command, args, {
      cwd: request.cwd,
      env: {
        ...process.env,
        OPENCODE_PERMISSION: OpenCodePermission,
        OPENCODE_DISABLE_AUTOUPDATE: '1',
        OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Register for cancellation.
    activeProcesses.set(request.requestId, child)

    let stdout = ''
    let stderrBuf = ''
    let settled = false

    const cleanup = () => {
      activeProcesses.delete(request.requestId)
      cancelledRequestIds.delete(request.requestId)
    }

    const finishReject = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      child.removeAllListeners()
      child.kill()
      reject(error)
    }

    // ---- Timeout handling ----
    const timeoutId = setTimeout(() => {
      // SIGTERM first — polite shutdown.
      child.kill('SIGTERM')

      // Escalate to SIGKILL after 5 seconds if still alive.
      const killTimeoutId = setTimeout(() => {
        child.kill('SIGKILL')
      }, 5000)

      child.on('close', () => {
        clearTimeout(killTimeoutId)
      })

      finishReject(
        new OpenCodeRunError(
          `OpenCode prompt timed out after ${request.timeoutMs}ms`,
          null,
          stderrBuf
        )
      )
    }, request.timeoutMs)

    // ---- stdout / stderr collection ----
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
    })

    // ---- lifecycle events ----
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeoutId)
      if (err.code === 'ENOENT') {
        finishReject(new OpenCodeNotInstalledError(request.command))
      } else {
        finishReject(err)
      }
    })

    child.on('close', code => {
      clearTimeout(timeoutId)

      if (settled) {
        return
      }
      settled = true

      // Snapshot whether this request was cancelled before cleanup
      // removes the tracking entry.
      const wasCancelled = cancelledRequestIds.has(request.requestId)
      cleanup()

      if (wasCancelled) {
        reject(
          new OpenCodeRunError(
            'OpenCode prompt execution was cancelled',
            null,
            stderrBuf
          )
        )
        return
      }

      if (code === 0) {
        resolve(stdout)
      } else {
        reject(
          new OpenCodeRunError(
            `OpenCode CLI exited with code ${code ?? 'null'}`,
            code ?? null,
            stderrBuf
          )
        )
      }
    })

    // Write the prompt to stdin and close it.
    child.stdin?.write(request.prompt, 'utf8')
    child.stdin?.end()
  })
}

/**
 * Force-kill the child process associated with the given requestId.
 * The runPromise will reject with an OpenCodeRunError whose message
 * includes the word 'cancelled'.
 *
 * @param requestId - The opaque identifier from {@link IOpenCodeRunRequest}.
 */
export function cancelOpenCodeRun(requestId: string): void {
  const child = activeProcesses.get(requestId)
  if (child !== undefined) {
    cancelledRequestIds.add(requestId)
    child.kill('SIGKILL')
    activeProcesses.delete(requestId)
  }
}

/**
 * List available models by running `opencode models`.
 *
 * Spawns `<command> models` with a 30-second timeout. Resolves with
 * the list of model identifiers (in `provider/model` format) parsed
 * from stdout, one per line.
 *
 * @param command - The CLI binary name or absolute path to use.
 * @throws OpenCodeNotInstalledError when the binary cannot be found.
 * @throws OpenCodeRunError on non-zero exit or timeout.
 */
export async function listOpenCodeModels(
  command: string
): Promise<ReadonlyArray<string>> {
  const truncateStderr = (raw: string): string =>
    raw.length > MaxStderrLength ? raw.slice(0, MaxStderrLength) : raw

  return new Promise<ReadonlyArray<string>>((resolve, reject) => {
    const child = spawn(command, ['models'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderrBuf = ''
    let settled = false

    const finishReject = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      child.removeAllListeners()
      child.kill()
      reject(error)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        finishReject(new OpenCodeNotInstalledError(command))
      } else {
        finishReject(err)
      }
    })

    // Safety timeout: 30 seconds
    const timeoutId = setTimeout(() => {
      finishReject(
        new OpenCodeRunError(
          'OpenCode models command timed out',
          null,
          truncateStderr(stderrBuf)
        )
      )
    }, 30000)

    child.on('close', code => {
      clearTimeout(timeoutId)
      if (settled) {
        return
      }
      settled = true

      if (code === 0) {
        const models = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
        resolve(models)
      } else {
        finishReject(
          new OpenCodeRunError(
            `OpenCode models command exited with code ${code ?? 'null'}`,
            code ?? null,
            truncateStderr(stderrBuf)
          )
        )
      }
    })
  })
}
