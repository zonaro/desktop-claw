import * as Fs from 'fs'
import * as Path from 'path'
import { app } from 'electron'
import type { IMemoryEntry } from '../lib/opencode/opencode-config'

/**
 * The directory where Desktop Claw stores the OpenCode settings it owns.
 * Memory entries live in the `memory` subdirectory, one Markdown file each.
 */
function getOpenCodeSettingsDirectory(): string {
  return Path.join(app.getPath('userData'), 'opencode')
}

/** The directory holding one Markdown file per OpenCode memory entry. */
export async function getOpenCodeMemoryDirectory(): Promise<string> {
  return Path.join(getOpenCodeSettingsDirectory(), 'memory')
}

/**
 * Turns a memory title into a filesystem-safe slug used in the file name:
 * lower-case, accents stripped, non-alphanumeric runs replaced with a dash.
 */
function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug.length > 0 ? slug : 'untitled'
}

/**
 * Serializes a memory entry to Markdown with a small YAML-ish frontmatter
 * block carrying the metadata that can't live in the file name (the title
 * slug is lossy, and the timestamps aren't recoverable at all).
 */
function serializeMemoryFile(entry: IMemoryEntry): string {
  const title = entry.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  return (
    '---\n' +
    `id: "${entry.id}"\n` +
    `title: "${title}"\n` +
    `createdAt: ${entry.createdAt}\n` +
    `updatedAt: ${entry.updatedAt}\n` +
    '---\n\n' +
    entry.content.trimEnd() +
    '\n'
  )
}

/**
 * Parses a memory file written by {@link serializeMemoryFile}, or returns
 * null when the file doesn't carry valid frontmatter (e.g. it's a plain
 * Markdown file some other tool dropped in the directory).
 */
function parseMemoryFile(content: string): IMemoryEntry | null {
  const lines = content.split('\n')

  if (lines.length < 2 || lines[0].trim() !== '---') {
    return null
  }

  const meta = new Map<string, string>()
  let index = 1
  let closed = false

  for (; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim() === '---') {
      closed = true
      index++
      break
    }

    const separator = line.indexOf(':')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    meta.set(key, value)
  }

  if (!closed) {
    return null
  }

  const id = meta.get('id') ?? ''
  const title = meta.get('title') ?? ''
  const createdAt = Number(meta.get('createdAt'))
  const updatedAt = Number(meta.get('updatedAt'))

  if (
    id.length === 0 ||
    title.length === 0 ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt)
  ) {
    return null
  }

  const body = lines.slice(index).join('\n').replace(/^\n+/, '')

  return { id, title, content: body, createdAt, updatedAt }
}

/**
 * Reads every memory entry stored in the OpenCode memory directory. Files
 * that can't be parsed (or read) are skipped so a stray Markdown file never
 * breaks the preferences UI.
 */
export async function readOpenCodeMemoryFiles(): Promise<
  ReadonlyArray<IMemoryEntry>
> {
  const dir = await getOpenCodeMemoryDirectory()
  await Fs.promises.mkdir(dir, { recursive: true })

  const names = await Fs.promises.readdir(dir)
  const entries = new Array<IMemoryEntry>()

  for (const name of names) {
    if (!name.endsWith('.md')) {
      continue
    }

    try {
      const content = await Fs.promises.readFile(Path.join(dir, name), 'utf8')
      const entry = parseMemoryFile(content)
      if (entry !== null) {
        entries.push(entry)
      }
    } catch {
      // Skip unreadable files — the rest of the directory still loads.
    }
  }

  // Most recently updated first.
  entries.sort((a, b) => b.updatedAt - a.updatedAt)

  return entries
}

/**
 * Persists a single memory entry to its own Markdown file. Any previously
 * written file for the same id is removed first so a title change doesn't
 * leave a stale copy behind.
 */
export async function writeOpenCodeMemoryFile(
  entry: IMemoryEntry
): Promise<void> {
  const dir = await getOpenCodeMemoryDirectory()
  await Fs.promises.mkdir(dir, { recursive: true })

  await deleteOpenCodeMemoryFile(entry.id)

  const fileName = `${entry.id}-${slugifyTitle(entry.title)}.md`
  await Fs.promises.writeFile(
    Path.join(dir, fileName),
    serializeMemoryFile(entry),
    'utf8'
  )
}

/**
 * Deletes the Markdown file backing the memory entry with the given id. Safe
 * to call for ids that don't exist anymore — missing directories and files
 * are treated as a no-op.
 */
export async function deleteOpenCodeMemoryFile(id: string): Promise<void> {
  const dir = await getOpenCodeMemoryDirectory()

  let names: ReadonlyArray<string>
  try {
    names = await Fs.promises.readdir(dir)
  } catch {
    return
  }

  const prefix = `${id}-`
  for (const name of names) {
    if (name.startsWith(prefix) && name.endsWith('.md')) {
      try {
        await Fs.promises.unlink(Path.join(dir, name))
      } catch {
        // The file is already gone or locked — nothing more to do.
      }
      return
    }
  }
}
