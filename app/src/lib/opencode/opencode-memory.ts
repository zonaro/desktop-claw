import { invoke } from '../ipc-renderer'
import {
  IMemoryEntry,
  IOpenCodeConfig,
  loadOpenCodeConfig,
  saveOpenCodeConfig,
} from './opencode-config'

/**
 * Generates a timestamp-based unique id for a memory entry. The leading
 * timestamp keeps entries sortable by creation order; the random suffix
 * guards against collisions when two entries are created in the same
 * millisecond.
 */
export function createMemoryId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

/** The absolute path of the OpenCode memory directory (via the main process). */
export function getOpenCodeMemoryDirectory(): Promise<string> {
  return invoke('opencode-get-memory-dir')
}

/** Reads every memory entry persisted as a Markdown file in the memory dir. */
export function loadOpenCodeMemory(): Promise<ReadonlyArray<IMemoryEntry>> {
  return invoke('opencode-read-memory-files')
}

/** Persists a single memory entry to its Markdown file in the memory dir. */
export function writeOpenCodeMemoryEntry(entry: IMemoryEntry): Promise<void> {
  return invoke('opencode-write-memory-file', entry)
}

/** Deletes the Markdown file backing the memory entry with the given id. */
export function deleteOpenCodeMemoryEntry(id: string): Promise<void> {
  return invoke('opencode-delete-memory-file', id)
}

/**
 * Refreshes the memory entries stored in the OpenCode configuration from the
 * memory directory on disk. The Markdown files are the source of truth, so
 * entries added or edited by other tools are picked up on startup.
 *
 * Should be called at app startup and whenever the OpenCode preferences are
 * shown.
 */
export async function loadOpenCodeMemoryIntoConfig(): Promise<void> {
  const config = loadOpenCodeConfig()
  const memory = await loadOpenCodeMemory()
  saveOpenCodeConfig({ ...config, memory })
}

/**
 * Builds the "custom instructions" section of an OpenCode prompt from the
 * configured memory entries. Returns an empty string when there is nothing
 * to include.
 *
 * @param config - The current OpenCode configuration.
 */
export function buildOpenCodeMemoryContext(config: IOpenCodeConfig): string {
  if (config.memory.length === 0) {
    return ''
  }

  const sections = config.memory.map(
    entry => `### ${entry.title}\n\n${entry.content}`
  )

  return (
    '## Custom instructions\n\n' +
    'The user configured the following custom instructions. Follow them ' +
    'when performing the requested task.\n\n' +
    sections.join('\n\n')
  )
}
