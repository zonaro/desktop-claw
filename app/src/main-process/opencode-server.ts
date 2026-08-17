import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { homedir } from 'os'
import { IOpenCodeServerStatus } from '../models/opencode-session'
import { resolveOpenCodeCommand } from './opencode-command'

/** How long to wait for the server to report the port it's listening on. */
const StartTimeout = 30000

/** Matches the `opencode server listening on http://127.0.0.1:1234` banner. */
const ListeningPattern = /listening on (https?:\/\/[^\s]+)/i

/**
 * Extracts the base URL from the server's startup banner, or returns null when
 * the chunk isn't the banner (warnings and log lines share the stream).
 */
export function parseListeningUrl(output: string): string | null {
  const match = output.match(ListeningPattern)

  return match === null ? null : match[1].replace(/\/+$/, '')
}

/** The running server child process, or null when the server is stopped. */
let serverProcess: ChildProcess | null = null

/** The status of the running server, or null when the server is stopped. */
let serverStatus: IOpenCodeServerStatus | null = null

/** The in-flight start attempt, so concurrent callers share one server. */
let startPromise: Promise<IOpenCodeServerStatus> | null = null

/** Builds a failed status carrying the given reason. */
function failure(error: string): IOpenCodeServerStatus {
  return { running: false, baseUrl: null, password: null, error }
}

/**
 * Starts the headless OpenCode server, or returns the already running one.
 *
 * A single server serves every repository: callers scope requests to a
 * repository by passing its path as the `directory` query parameter. The
 * server binds to loopback on a random port and is protected with a random
 * password (HTTP basic auth) so other local processes can't drive it.
 *
 * Never rejects — failures are reported through the returned status so the
 * renderer can show them inline.
 *
 * @param command - The OpenCode CLI binary name or absolute path.
 */
export async function ensureOpenCodeServer(
  command: string
): Promise<IOpenCodeServerStatus> {
  if (serverStatus !== null && serverStatus.running) {
    return serverStatus
  }

  if (startPromise !== null) {
    return startPromise
  }

  startPromise = startServer(command).finally(() => {
    startPromise = null
  })

  return startPromise
}

/** Spawns the server and resolves once it reports its listening URL. */
async function startServer(command: string): Promise<IOpenCodeServerStatus> {
  // The app is usually launched from a desktop entry, whose PATH doesn't
  // include the directories the OpenCode installer adds to the shell profile.
  const executable = await resolveOpenCodeCommand(command)

  return new Promise<IOpenCodeServerStatus>(resolve => {
    const password = randomBytes(32).toString('hex')

    let child: ChildProcess

    try {
      child = spawn(
        executable,
        ['serve', '--port', '0', '--hostname', '127.0.0.1'],
        {
          // Spawning in the home directory keeps the server from registering the
          // app's install directory as an OpenCode project.
          cwd: homedir(),
          env: {
            ...process.env,
            OPENCODE_SERVER_PASSWORD: password,
            OPENCODE_DISABLE_AUTOUPDATE: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
    } catch (e) {
      resolve(failure(`Failed to start the OpenCode server: ${e}`))
      return
    }

    serverProcess = child

    let settled = false
    let stderrBuf = ''

    const settle = (status: IOpenCodeServerStatus) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)

      if (status.running) {
        serverStatus = status
      } else {
        stopOpenCodeServer()
      }

      resolve(status)
    }

    const timeoutId = setTimeout(
      () =>
        settle(failure('Timed out waiting for the OpenCode server to start')),
      StartTimeout
    )

    // The banner is written to stdout, but warnings (and the banner on some
    // versions) go to stderr, so both streams are scanned for it.
    const onOutput = (chunk: Buffer) => {
      const baseUrl = parseListeningUrl(chunk.toString('utf8'))

      if (baseUrl !== null) {
        settle({ running: true, baseUrl, password, error: null })
      }
    }

    child.stdout?.on('data', onOutput)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8')
      onOutput(chunk)
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      const message =
        err.code === 'ENOENT'
          ? `OpenCode CLI not found: ${command}`
          : `Failed to start the OpenCode server: ${err.message}`

      settle(failure(message))
    })

    child.on('close', code => {
      // The server exited: drop the cached status so the next call retries.
      if (serverProcess === child) {
        serverProcess = null
        serverStatus = null
      }

      settle(
        failure(
          `The OpenCode server exited with code ${code ?? 'null'}${
            stderrBuf.length > 0 ? `\n\n${stderrBuf.slice(0, 2000)}` : ''
          }`
        )
      )
    })
  })
}

/** Terminates the running server, if any. Safe to call when stopped. */
export function stopOpenCodeServer(): void {
  const child = serverProcess

  serverProcess = null
  serverStatus = null

  if (child !== null) {
    child.removeAllListeners()
    child.kill()
  }
}
