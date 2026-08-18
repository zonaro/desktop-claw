import * as React from 'react'
import * as Path from 'path'
import { readFile } from 'fs/promises'
import { clipboard } from 'electron'

import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { openFile } from '../lib/open-file'
import { getAvailableEditors } from '../../lib/editors/lookup'
import { launchExternalEditor } from '../../lib/editors/launch'
import { PopupType } from '../../models/popup'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher/dispatcher'
import { isLikelyBinary } from '../worktree/worktree-file-tree'

/**
 * Options for the file context menu.
 */
export interface IFileContextMenuOptions {
  /** The repository the file belongs to. */
  repository: Repository
  /** The dispatcher used to act on the repository. */
  dispatcher: Dispatcher
  /** The file path relative to the repository root. */
  filePath: string
  /** Whether the file is in the working directory (Changes tab) or worktree (Files tab). */
  isWorkingDirectory?: boolean
  /** Whether the file is deleted. */
  isDeleted?: boolean
  /** Whether we're in a rebase conflict state. */
  isRebaseConflict?: boolean
  /** Callback to add file to current chat. */
  onAddToCurrentChat?: (filePath: string) => void
  /** Callback to add file to new chat. */
  onAddToNewChat?: (filePath: string) => void
}

/**
 * Shows the shared file context menu.
 */
export async function showFileContextMenu(
  options: IFileContextMenuOptions,
  event: React.MouseEvent<HTMLElement>
): Promise<void> {
  event.preventDefault()
  event.stopPropagation()

  const { repository, dispatcher, filePath, isWorkingDirectory = false, isDeleted = false, isRebaseConflict = false, onAddToCurrentChat, onAddToNewChat } = options
  const fullPath = Path.join(repository.path, filePath)

  const showMenu = async () => {
    const editors = await getAvailableEditors().catch(() => [])
    const vsCode = editors.find(
      editor => editor.editor === 'Visual Studio Code'
    )

    const items: IMenuItem[] = []

    // Open actions
    if (!isRebaseConflict) {
      items.push(
        {
          label: 'Open File',
          action: () => openFile(fullPath, dispatcher),
        },
        {
          label: 'Open in VS Code',
          enabled: vsCode !== undefined,
          action: () => {
            if (vsCode !== undefined) {
              launchExternalEditor(fullPath, vsCode)
            }
          },
        },
        { type: 'separator' }
      )
    }

    // Copy actions
    items.push(
      {
        label: 'Copy Path',
        action: () => dispatcher.copyPathToClipboard(fullPath),
      },
      {
        label: 'Copy Content',
        enabled: !isDeleted && !isLikelyBinary(fullPath),
        action: async () => {
          try {
            const content = await readFile(fullPath, 'utf8')
            clipboard.writeText(content)
          } catch (e) {
            log.error('Failed to copy file content', e)
          }
        },
      }
    )

    // Add to chat actions
    if (onAddToCurrentChat || onAddToNewChat) {
      items.push({ type: 'separator' })
      if (onAddToCurrentChat) {
        items.push({
          label: 'Add to Current Chat',
          action: () => onAddToCurrentChat(filePath),
        })
      }
      if (onAddToNewChat) {
        items.push({
          label: 'Add to New Chat',
          action: () => onAddToNewChat(filePath),
        })
      }
    }

    // Delete action (only for working directory files, not in rebase)
    if (isWorkingDirectory && !isRebaseConflict) {
      items.push(
        { type: 'separator' },
        {
          label: 'Delete',
          action: () =>
            dispatcher.showPopup({
              type: PopupType.ConfirmDeleteFile,
              repository,
              filePath,
            }),
        }
      )
    }

    // Reveal in file manager and open with default program (for non-rebase)
    if (!isRebaseConflict) {
      const enabled = !isDeleted
      const extension = Path.extname(filePath)
      const isSafeExtension = isSafeFileExtension(extension)

      items.push(
        { type: 'separator' },
        {
          label: 'Reveal in File Manager',
          action: () => revealInFileManager(repository, filePath),
          enabled,
        },
        {
          label: 'Open with Default Program',
          action: () => openFile(fullPath, dispatcher),
          enabled: enabled && isSafeExtension,
        }
      )
    }

    showContextualMenu(items)
  }

  showMenu().catch(e => {
    log.error('Failed to show file context menu', e)
  })
}

/**
 * Checks if a file extension is safe to open with the default program.
 */
function isSafeFileExtension(extension: string): boolean {
  const safeExtensions = new Set([
    '.txt',
    '.md',
    '.markdown',
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.py',
    '.json',
    '.css',
    '.html',
    '.htm',
    '.xml',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.log',
    '.csv',
    '.sql',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.bat',
    '.cmd',
    '.dockerfile',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.eslintrc',
    '.prettierrc',
    '.babelrc',
    '.nvmrc',
    '.env',
    '.env.example',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
  ])

  return safeExtensions.has(extension.toLowerCase())
}

/**
 * Reveals a file in the system file manager.
 */
function revealInFileManager(repository: Repository, filePath: string) {
  const { revealInFileManager } = require('../../lib/app-shell')
  revealInFileManager(repository, filePath)
}