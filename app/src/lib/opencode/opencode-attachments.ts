import { readFile, stat } from 'fs/promises'
import * as Path from 'path'
import { pathToFileURL } from 'url'

import { IOpenCodeAttachment } from '../../models/opencode-session'

/**
 * The largest file that may be attached. Attachments are base64-encoded into
 * the request body, so a big one would bloat the prompt and blow the model's
 * context long before it was useful.
 */
export const MaxAttachmentBytes = 10 * 1024 * 1024

/** Thrown when a picked file is too large to attach. */
export class AttachmentTooLargeError extends Error {
  public constructor(filePath: string, size: number) {
    super(
      `${filePath} is ${Math.round(size / 1024 / 1024)} MB; attachments are ` +
        `limited to ${MaxAttachmentBytes / 1024 / 1024} MB.`
    )
    this.name = 'AttachmentTooLargeError'
  }
}

/** MIME types for the extensions OpenCode handles specially. */
const MimeTypesByExtension: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml'],
  ['.pdf', 'application/pdf'],
  ['.json', 'application/json'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.css', 'text/css'],
  ['.csv', 'text/csv'],
  ['.xml', 'text/xml'],
])

/**
 * The MIME type to send for a file, guessed from its extension. Anything
 * unrecognised is treated as plain text, which is what source files are.
 */
export function getAttachmentMimeType(filePath: string): string {
  const extension = Path.extname(filePath).toLowerCase()

  return MimeTypesByExtension.get(extension) ?? 'text/plain'
}

/**
 * Renders a path for display: relative to the repository when the file is
 * inside it, absolute otherwise.
 */
export function getDisplayPath(
  filePath: string,
  repositoryPath: string
): string {
  const relative = Path.relative(repositoryPath, filePath)

  return relative.length > 0 && !relative.startsWith('..') ? relative : filePath
}

/**
 * Builds an attachment for a file picked from disk, embedding its content as a
 * data URL.
 *
 * Files are embedded rather than referenced by path because an attachment may
 * live outside the repository, where the server wouldn't read it.
 */
export async function createFileAttachment(
  filePath: string,
  repositoryPath: string
): Promise<IOpenCodeAttachment> {
  const { size } = await stat(filePath)

  if (size > MaxAttachmentBytes) {
    throw new AttachmentTooLargeError(filePath, size)
  }

  const content = await readFile(filePath)
  const mime = getAttachmentMimeType(filePath)

  return {
    path: getDisplayPath(filePath, repositoryPath),
    filename: Path.basename(filePath),
    mime,
    url: `data:${mime};base64,${content.toString('base64')}`,
    isReference: false,
  }
}

/**
 * Builds an attachment for an `@path` reference. The server reads the file
 * itself, so only its location is sent.
 *
 * @param relativePath - The path as typed, relative to the repository root.
 */
export function createFileReference(
  relativePath: string,
  repositoryPath: string
): IOpenCodeAttachment {
  const absolutePath = Path.isAbsolute(relativePath)
    ? relativePath
    : Path.join(repositoryPath, relativePath)

  return {
    path: relativePath,
    filename: Path.basename(relativePath),
    mime: getAttachmentMimeType(relativePath),
    url: pathToFileURL(absolutePath).toString(),
    isReference: true,
  }
}
