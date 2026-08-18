import * as React from 'react'
import * as Path from 'path'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { showFileContextMenu } from '../lib/file-context-menu'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher/dispatcher'

/**
 * A node in the file tree. Directories have `children`; files do not.
 * Internal mutable version used during tree construction.
 */
interface IFileTreeNode {
  name: string
  path: string
  isFile: boolean
  children: IFileTreeNode[]
}

/**
 * Returns whether a file should be treated as binary based on its extension.
 */
export function isLikelyBinary(filePath: string): boolean {
  const binaryExtensions = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.webp',
    '.bmp',
    '.tiff',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.dat',
  ])
  const ext = Path.extname(filePath).toLowerCase()
  return binaryExtensions.has(ext)
}

interface IWorktreeFileTreeProps {
  /** All tracked file paths (relative to repo root). */
  readonly files: ReadonlyArray<string>
  /** Currently selected file path, or null. */
  readonly selectedFile: string | null
  /** The repository whose files are shown in this tree. */
  readonly repository: Repository
  /** The dispatcher used to act on the repository. */
  readonly dispatcher: Dispatcher
  /** Called when a file is clicked. */
  readonly onFileSelected: (filePath: string) => void
  /** Whether to show hidden/untracked files. */
  readonly showHiddenFiles: boolean
  /** Called when the showHiddenFiles toggle is changed. */
  readonly onToggleHiddenFiles: () => void
  /** The current search filter text. */
  readonly filterText: string
  /** Called when the filter text changes. */
  readonly onFilterTextChanged: (text: string) => void
}

interface IWorktreeFileTreeState {
  /** Set of expanded directory paths. */
  readonly expandedDirs: ReadonlySet<string>
}

/**
 * Builds a tree structure from a flat list of file paths.
 */
function buildTree(files: ReadonlyArray<string>): IFileTreeNode {
  const root: IFileTreeNode = {
    name: '',
    path: '',
    isFile: false,
    children: [],
  }

  for (const filePath of files) {
    const parts = filePath.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')

      let child = current.children.find(c => c.name === part)
      if (child === undefined) {
        child = {
          name: part,
          path,
          isFile,
          children: [],
        }
        current.children = [...current.children, child]
      }
      current = child
    }
  }

  return root
}

/**
 * Filters a tree to only include nodes matching the search text.
 */
function filterTree(tree: IFileTreeNode, filterText: string): IFileTreeNode | null {
  if (!filterText.trim()) {
    return tree
  }

  const lowerFilter = filterText.toLowerCase()

  function filterNode(node: IFileTreeNode): IFileTreeNode | null {
    const nameMatches = node.name.toLowerCase().includes(lowerFilter)
    const pathMatches = node.path.toLowerCase().includes(lowerFilter)
    const matches = nameMatches || pathMatches

    if (node.isFile) {
      return matches ? node : null
    }

    const filteredChildren = node.children
      .map(filterNode)
      .filter((child): child is IFileTreeNode => child !== null)

    // Show directory if it matches or if any children match
    if (matches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      }
    }

    return null
  }

  const filtered = filterNode(tree)
  return filtered
}

/**
 * Returns the appropriate Octicon symbol for a given file name.
 */
function getFileIcon(fileName: string): typeof octicons.file {
  const ext = Path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.py':
    case '.java':
    case '.c':
    case '.cpp':
    case '.h':
    case '.hpp':
    case '.cs':
    case '.go':
    case '.rs':
    case '.php':
    case '.rb':
    case '.swift':
    case '.kt':
    case '.scala':
    case '.sh':
    case '.bash':
    case '.zsh':
      return octicons.fileCode
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.svg':
    case '.ico':
    case '.webp':
    case '.bmp':
    case '.tiff':
      return octicons.fileMedia
    case '.zip':
    case '.tar':
    case '.gz':
    case '.rar':
    case '.7z':
      return octicons.fileZip
    case '.pdf':
    case '.doc':
    case '.docx':
    case '.xls':
    case '.xlsx':
    case '.ppt':
    case '.pptx':
      return octicons.fileBinary
    default:
      return octicons.file
  }
}

/**
 * Recursive component for rendering a single tree node.
 */
class FileTreeNode extends React.Component<
  {
    node: IFileTreeNode
    depth: number
    selectedFile: string | null
    expandedDirs: ReadonlySet<string>
    onFileSelected: (filePath: string) => void
    onToggleDir: (dirPath: string) => void
    onFileContextMenu: (
      filePath: string,
      event: React.MouseEvent<HTMLDivElement>
    ) => void
  },
  {}
> {
  private onItemClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const { node, onFileSelected, onToggleDir } = this.props

    if (node.isFile) {
      onFileSelected(node.path)
    } else {
      onToggleDir(node.path)
    }
  }

  private onItemKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const { node, onFileSelected, onToggleDir } = this.props

    if (node.isFile) {
      onFileSelected(node.path)
    } else {
      onToggleDir(node.path)
    }
  }

  private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    this.props.onFileContextMenu(this.props.node.path, e)
  }

  public render() {
    const { node, depth, selectedFile, expandedDirs } = this.props
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = selectedFile === node.path
    const paddingLeft = depth * 16 + 8

    if (node.isFile) {
      return (
        <div
          className={`worktree-file-tree-item worktree-file-tree-item-file ${
            isSelected ? 'selected' : ''
          }`}
          style={{ paddingLeft }}
          role="button"
          tabIndex={0}
          onClick={this.onItemClick}
          onKeyDown={this.onItemKeyDown}
          onContextMenu={this.onContextMenu}
        >
          <Octicon
            symbol={getFileIcon(node.name)}
            className="worktree-file-tree-icon"
          />
          <span className="worktree-file-tree-label">{node.name}</span>
        </div>
      )
    }

    const hasChildren = node.children.length > 0
    const icon = isExpanded
      ? octicons.fileDirectoryOpenFill
      : octicons.fileDirectory

    return (
      <div className="worktree-file-tree-item">
        <div
          className="worktree-file-tree-dir-header"
          style={{ paddingLeft }}
          role="button"
          tabIndex={0}
          onClick={this.onItemClick}
          onKeyDown={this.onItemKeyDown}
        >
          <Octicon symbol={icon} className="worktree-file-tree-icon" />
          <span className="worktree-file-tree-label">{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="worktree-file-tree-children">
            {node.children.map(child => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFile={selectedFile}
                expandedDirs={expandedDirs}
                onFileSelected={this.props.onFileSelected}
                onToggleDir={this.props.onToggleDir}
                onFileContextMenu={this.props.onFileContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    )
  }
}

/**
 * Sidebar component that renders a file tree of all tracked files in the
 * repository. Clicking a file calls `onFileSelected` with the relative path.
 */
export class WorktreeFileTree extends React.Component<
  IWorktreeFileTreeProps,
  IWorktreeFileTreeState
> {
  public constructor(props: IWorktreeFileTreeProps) {
    super(props)
    this.state = { expandedDirs: new Set<string>() }
  }

  public componentDidUpdate(prevProps: IWorktreeFileTreeProps) {
    // When the selection changes (e.g. restored after a refresh or set from
    // elsewhere), expand the ancestor directories so the selected file is
    // visible in the tree.
    if (prevProps.selectedFile !== this.props.selectedFile) {
      const { selectedFile } = this.props
      if (selectedFile != null) {
        const parts = selectedFile.split('/')
        parts.pop() // drop the file name itself
        if (parts.length > 0) {
          const ancestors: string[] = []
          for (let i = 1; i <= parts.length; i++) {
            ancestors.push(parts.slice(0, i).join('/'))
          }
          this.setState(state => {
            const newExpanded = new Set(state.expandedDirs)
            let changed = false
            for (const dir of ancestors) {
              if (!newExpanded.has(dir)) {
                newExpanded.add(dir)
                changed = true
              }
            }
            return changed ? { expandedDirs: newExpanded } : null
          })
        }
      }
    }
  }

  private onToggleDir = (dirPath: string) => {
    const { expandedDirs } = this.state
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath)
    } else {
      newExpanded.add(dirPath)
    }
    this.setState({ expandedDirs: newExpanded })
  }

  private onFileContextMenu = (
    filePath: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const { repository, dispatcher } = this.props

    showFileContextMenu(
      {
        repository,
        dispatcher,
        filePath,
        isWorkingDirectory: false,
        onAddToCurrentChat: this.onAddToCurrentChat,
        onAddToNewChat: this.onAddToNewChat,
      },
      event
    )
  }

  private onAddToCurrentChat = (filePath: string) => {
    this.props.dispatcher.addFileToCurrentChat(this.props.repository, filePath)
  }

  private onAddToNewChat = (filePath: string) => {
    this.props.dispatcher.addFileToNewChat(this.props.repository, filePath)
  }

  public render() {
    const { files, selectedFile, onFileSelected, showHiddenFiles, onToggleHiddenFiles, filterText, onFilterTextChanged } = this.props

    const tree = buildTree(files)
    const filteredTree = filterTree(tree, filterText)

    const hasFiles = filteredTree !== null && filteredTree.children.length > 0

    return (
      <div className="worktree-file-tree-container">
        <div className="worktree-file-tree-header">
          <div className="worktree-file-tree-search">
            <TextBox
              type="search"
              placeholder="Search files"
              ariaLabel="Search files"
              value={filterText}
              onValueChanged={onFilterTextChanged}
              displayClearButton={true}
            />
          </div>
          <div className="worktree-file-tree-actions">
            <Button
              onClick={this.onNewFile}
              tooltip="New File"
              ariaLabel="New File"
              size="small"
            >
              <Octicon symbol={octicons.fileAdded} />
            </Button>
            <Button
              onClick={this.onNewFolder}
              tooltip="New Folder"
              ariaLabel="New Folder"
              size="small"
            >
              <Octicon symbol={octicons.fileDirectory} />
            </Button>
            <Checkbox
              value={showHiddenFiles ? CheckboxValue.On : CheckboxValue.Off}
              onChange={onToggleHiddenFiles}
              label="Show hidden files"
            />
          </div>
        </div>
        {hasFiles ? (
          <div className="worktree-file-tree">
            {filteredTree!.children.map(child => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={0}
                selectedFile={selectedFile}
                expandedDirs={this.state.expandedDirs}
                onFileSelected={onFileSelected}
                onToggleDir={this.onToggleDir}
                onFileContextMenu={this.onFileContextMenu}
              />
            ))}
          </div>
        ) : (
          <div className="worktree-file-tree-empty">
            {filterText ? 'No files match your search.' : 'No files found in this repository.'}
          </div>
        )}
      </div>
    )
  }

  private onNewFile = () => {
    // TODO: Implement new file creation
    console.log('New file')
  }

  private onNewFolder = () => {
    // TODO: Implement new folder creation
    console.log('New folder')
  }
}
