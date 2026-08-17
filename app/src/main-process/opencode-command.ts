import { access } from 'fs/promises'
import { constants } from 'fs'
import { homedir } from 'os'
import * as Path from 'path'

/**
 * File name suffixes to try on Windows, where the CLI may be installed as an
 * executable, a shim script, or (rarely) an extension-less binary.
 */
const WindowsExtensions: ReadonlyArray<string> = ['.exe', '.cmd', '.bat', '']

/**
 * Directories the OpenCode installers put the CLI in, tried after `PATH`.
 *
 * The app is normally launched from a desktop entry, so it inherits the
 * graphical session's `PATH` — which doesn't include the directories that the
 * OpenCode install script appends to the user's shell profile. Without this
 * fallback the CLI is only found when the app is started from a terminal.
 */
function getWellKnownDirectories(): ReadonlyArray<string> {
  const home = homedir()

  if (__WIN32__) {
    return [
      Path.join(home, '.opencode', 'bin'),
      Path.join(home, '.bun', 'bin'),
      Path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps'),
    ]
  }

  return [
    Path.join(home, '.opencode', 'bin'),
    Path.join(home, '.bun', 'bin'),
    Path.join(home, '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
  ]
}

/**
 * Whether the configured command already points at a file rather than naming a
 * binary to look up. Such a command is passed through untouched so the user
 * keeps full control over which executable runs.
 */
export function isExplicitPath(command: string): boolean {
  return command.includes('/') || (__WIN32__ && command.includes('\\'))
}

/**
 * The directories to search for the CLI, in priority order: everything on
 * `PATH` first, so an install the user put there wins, then the well-known
 * install locations.
 *
 * @param env - The environment to read `PATH` from. Injectable for testing.
 */
export function getOpenCodeSearchDirectories(
  env: NodeJS.ProcessEnv = process.env
): ReadonlyArray<string> {
  const pathValue = env.PATH ?? env.Path ?? ''
  const pathDirectories = pathValue
    .split(Path.delimiter)
    .map(directory => directory.trim())
    .filter(directory => directory.length > 0)

  const seen = new Set<string>()

  return [...pathDirectories, ...getWellKnownDirectories()].filter(
    directory => {
      if (seen.has(directory)) {
        return false
      }

      seen.add(directory)
      return true
    }
  )
}

/** Whether the given path exists and can be executed. */
async function isExecutable(candidate: string): Promise<boolean> {
  try {
    // The execute bit is meaningless on Windows, where existence is enough.
    await access(candidate, __WIN32__ ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the OpenCode CLI to an absolute path.
 *
 * Returns the command unchanged when it already is a path, and also when
 * nothing matches — so the resulting spawn fails with an ENOENT naming the
 * command the user configured, rather than a path they never typed.
 *
 * @param command - The configured CLI binary name or path.
 * @param env - The environment to read `PATH` from. Injectable for testing.
 */
export async function resolveOpenCodeCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const trimmed = command.trim()

  if (trimmed.length === 0 || isExplicitPath(trimmed)) {
    return command
  }

  const names = __WIN32__
    ? WindowsExtensions.map(extension => `${trimmed}${extension}`)
    : [trimmed]

  for (const directory of getOpenCodeSearchDirectories(env)) {
    for (const name of names) {
      const candidate = Path.join(directory, name)

      if (await isExecutable(candidate)) {
        return candidate
      }
    }
  }

  return command
}
