import * as React from 'react'
import * as Path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

import {
  MarkdownEditorView,
  isMarkdownFilePath,
} from '../markdown-editor/markdown-editor-view'
import {
  exportMarkdownToHtml,
  exportMarkdownToPdf,
} from '../markdown-editor/markdown-export'
import { showSaveDialog } from '../main-process-proxy'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { highlight } from '../../lib/highlighter/worker'
import { ITokens } from '../../lib/highlighter/types'
import { getTokens } from '../diff/get-tokens'
import { syntaxHighlightLine } from '../diff/diff-helpers'

/** The maximum number of bytes we'll process for highlighting. */
const MaxHighlightContentLength = 1024 * 1024

/**
 * Matches a markdown task-list item (`- [ ] foo`, `* [x] bar`,
 * `1. [ ] baz`, indented lists included).
 */
const taskListItemPattern = /^(\s*)([-*+]|\d+[.)])\s+\[([ xX])\]\s+/

/**
 * Converts markdown to sanitized HTML for the read-only preview. marked v4
 * has no GFM task-list support, so task items are turned into checkboxes
 * carrying the source line number in a `data-task-line` attribute, allowing
 * a click on a checkbox to be mapped back to the originating line.
 */
function markdownToPreviewHtml(markdown: string): string {
  const lines = markdown.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(taskListItemPattern)
    if (match == null) {
      continue
    }

    const [, indent, marker, checked] = match
    const isChecked = checked.toLowerCase() === 'x'
    lines[i] =
      `${indent}${marker} <input type="checkbox" data-task-line="${i}"` +
      `${isChecked ? ' checked' : ''}> ` +
      lines[i].slice(match[0].length)
  }

  const rawHtml = marked(lines.join('\n'), { gfm: true, breaks: true })
  return DOMPurify.sanitize(rawHtml as string, { USE_PROFILES: { html: true } })
}

interface IWorktreeFilePreviewProps {
  readonly filePath: string | null
}

interface IWorktreeFilePreviewState {
  readonly loading: boolean
  readonly error: string | null
  readonly content: string
  readonly originalContent: string
  readonly isDirty: boolean
  /** Syntax tokens for the current file, or null when unavailable. */
  readonly tokens: ITokens | null
  /** Whether the plain-text editor is shown instead of the highlighted view. */
  readonly isEditing: boolean
}

/**
 * Preview / editor panel for the Worktree tab.
 *
 * - Markdown files are rendered as a read-only HTML preview (task-list
 *   checkboxes toggle their value and update the file); the Edit button
 *   switches to the WYSIWYG editor.
 * - Other text files are shown with syntax highlighting (via the shared
 *   highlighter worker); an Edit button switches to the inline text editor.
 * - Binary files show a placeholder message.
 */
export class WorktreeFilePreview extends React.Component<
  IWorktreeFilePreviewProps,
  IWorktreeFilePreviewState
> {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private textAreaRef = React.createRef<HTMLTextAreaElement>()
  private editorViewRef = React.createRef<MarkdownEditorView>()
  private markdownContentRef = React.createRef<HTMLDivElement>()

  public constructor(props: IWorktreeFilePreviewProps) {
    super(props)
    this.state = {
      loading: false,
      error: null,
      content: '',
      originalContent: '',
      isDirty: false,
      tokens: null,
      isEditing: false,
    }
  }

  public componentDidUpdate(prevProps: IWorktreeFilePreviewProps) {
    if (prevProps.filePath !== this.props.filePath) {
      this.loadFile()
    }
  }

  public componentDidMount() {
    this.loadFile()
  }

  public componentWillUnmount() {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer)
    }
  }

  private async loadFile() {
    const { filePath } = this.props

    if (filePath == null) {
      this.setState({
        loading: false,
        error: null,
        content: '',
        originalContent: '',
        isDirty: false,
        tokens: null,
        isEditing: false,
      })
      return
    }

    this.setState({
      loading: true,
      error: null,
      content: '',
      originalContent: '',
      isDirty: false,
      tokens: null,
      isEditing: false,
    })

    try {
      const content = await readFile(filePath, 'utf8')
      this.setState({
        loading: false,
        content,
        originalContent: content,
      })

      this.highlightContent(content)
    } catch (e) {
      this.setState({
        loading: false,
        error: `Failed to load file: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private async highlightContent(content: string) {
    const { filePath } = this.props

    // Don't waste time tokenizing files that are too large (or empty).
    if (
      filePath == null ||
      content.length > MaxHighlightContentLength ||
      content.length === 0
    ) {
      return
    }

    try {
      const contentLines = content.split('\n')
      const tokens = await highlight(
        contentLines,
        Path.basename(filePath),
        Path.extname(filePath),
        4,
        contentLines.map((_, i) => i)
      )

      // The file may have changed while we were tokenizing.
      if (this.props.filePath === filePath) {
        this.setState({ tokens })
      }
    } catch (e) {
      log.error('Failed to highlight file content', e)
    }
  }

  private onTextChanged = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value
    this.setState({ content, isDirty: content !== this.state.originalContent })
  }

  private onSave = async () => {
    const { filePath } = this.props
    if (filePath == null) {
      return
    }

    try {
      await writeFile(filePath, this.state.content, 'utf8')
      this.setState({
        isDirty: false,
        originalContent: this.state.content,
      })
    } catch (e) {
      this.setState({
        error: `Failed to save file: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private isBinaryFile(filePath: string): boolean {
    const binaryExtensions = new Set([
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
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

  private onSaveMarkdown = async () => {
    try {
      await this.editorViewRef.current?.save()
      this.setState({ isDirty: false })
    } catch (e) {
      this.setState({
        error: `Failed to save file: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private onExportHTML = async () => {
    try {
      await this.editorViewRef.current?.exportToHTML()
    } catch (e) {
      this.setState({
        error: `Failed to export HTML: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private onExportPDF = async () => {
    try {
      await this.editorViewRef.current?.exportToPDF()
    } catch (e) {
      this.setState({
        error: `Failed to export PDF: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private onEditorContentChanged = (dirty: boolean) => {
    this.setState({ isDirty: dirty })
  }

  private onToggleEditing = () => {
    this.setState({ isEditing: !this.state.isEditing })
  }

  private onExitMarkdownEditing = () => {
    this.setState({ isEditing: false }, () => {
      // Re-read the file so the rendered preview shows the saved content.
      this.loadFile()
    })
  }

  private onMarkdownContentClick = async (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    const target = e.target as HTMLElement
    const input = target.closest(
      'input[data-task-line]'
    ) as HTMLInputElement | null
    if (input == null) {
      return
    }

    const line = Number.parseInt(input.dataset.taskLine ?? '', 10)
    if (Number.isNaN(line)) {
      return
    }

    const { filePath } = this.props
    if (filePath == null) {
      return
    }

    const lines = this.state.content.split('\n')
    if (line < 0 || line >= lines.length) {
      return
    }

    const match = lines[line].match(taskListItemPattern)
    if (match == null) {
      return
    }

    const [, indent, marker, checked] = match
    const isChecked = checked.toLowerCase() === 'x'
    lines[line] =
      `${indent}${marker} [${isChecked ? ' ' : 'x'}] ` +
      lines[line].slice(match[0].length)

    const newContent = lines.join('\n')
    const scrollTop = this.markdownContentRef.current?.scrollTop ?? 0

    this.setState({ content: newContent }, () => {
      const el = this.markdownContentRef.current
      if (el != null) {
        el.scrollTop = scrollTop
      }
    })

    try {
      await writeFile(filePath, newContent, 'utf8')
    } catch (err) {
      this.setState({
        error: `Failed to update file: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    }
  }

  private async exportMarkdownPreview(toPdf: boolean): Promise<void> {
    const { filePath } = this.props
    if (filePath == null) {
      return
    }

    const html = exportMarkdownToHtml(
      this.state.content,
      Path.basename(filePath)
    )
    const ext = toPdf ? 'pdf' : 'html'
    const defaultName =
      Path.basename(filePath, Path.extname(filePath)) + '.' + ext
    const outputPath = await showSaveDialog({
      buttonLabel: 'Export',
      nameFieldLabel: 'Export as:',
      defaultPath: Path.join(Path.dirname(filePath), defaultName),
      filters: [
        { name: ext.toUpperCase(), extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (outputPath == null) {
      return
    }

    if (toPdf) {
      await exportMarkdownToPdf(html, outputPath)
    } else {
      await writeFile(outputPath, html, 'utf8')
    }
  }

  private onExportPreviewHTML = () => {
    this.exportMarkdownPreview(false).catch(err =>
      this.setState({
        error: `Failed to export HTML: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    )
  }

  private onExportPreviewPDF = () => {
    this.exportMarkdownPreview(true).catch(err =>
      this.setState({
        error: `Failed to export PDF: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    )
  }

  public render() {
    const { filePath } = this.props
    const { loading, error, content, isDirty, tokens, isEditing } = this.state

    if (filePath == null) {
      return (
        <div className="worktree-file-preview worktree-file-preview-empty">
          <Octicon symbol={octicons.file} />
          <span>Select a file to preview</span>
        </div>
      )
    }

    // Markdown files → read-only rendered preview with interactive task
    // checkboxes; Edit switches to the WYSIWYG editor.
    if (isMarkdownFilePath(filePath)) {
      if (error != null) {
        return (
          <div className="worktree-file-preview">
            <div className="worktree-file-preview-error">{error}</div>
          </div>
        )
      }

      if (loading) {
        return (
          <div className="worktree-file-preview">
            <div className="worktree-file-preview-loading">Loading…</div>
          </div>
        )
      }

      if (isEditing) {
        return (
          <div className="worktree-file-preview">
            <div className="worktree-file-preview-header">
              <span className="worktree-file-preview-filename">
                {Path.basename(filePath)}
              </span>
              <div className="worktree-file-preview-actions">
                <Button size="small" onClick={this.onExitMarkdownEditing}>
                  <Octicon symbol={octicons.eye} className="mr" />
                  Preview
                </Button>
                {isDirty && (
                  <Button size="small" onClick={this.onSaveMarkdown}>
                    <Octicon symbol={octicons.check} className="mr" />
                    Save
                  </Button>
                )}
                <Button size="small" onClick={this.onExportHTML}>
                  <Octicon symbol={octicons.fileCode} className="mr" />
                  Export HTML
                </Button>
                <Button size="small" onClick={this.onExportPDF}>
                  <Octicon symbol={octicons.download} className="mr" />
                  Export PDF
                </Button>
              </div>
            </div>
            <MarkdownEditorView
              ref={this.editorViewRef}
              filePath={filePath}
              onContentChanged={this.onEditorContentChanged}
            />
          </div>
        )
      }

      return (
        <div className="worktree-file-preview">
          <div className="worktree-file-preview-header">
            <span className="worktree-file-preview-filename">
              {Path.basename(filePath)}
            </span>
            <div className="worktree-file-preview-actions">
              <Button size="small" onClick={this.onToggleEditing}>
                <Octicon symbol={octicons.pencil} className="mr" />
                Edit
              </Button>
              <Button size="small" onClick={this.onExportPreviewHTML}>
                <Octicon symbol={octicons.fileCode} className="mr" />
                Export HTML
              </Button>
              <Button size="small" onClick={this.onExportPreviewPDF}>
                <Octicon symbol={octicons.download} className="mr" />
                Export PDF
              </Button>
            </div>
          </div>
          {/* The interactive elements here are the native checkboxes emitted
              by the markdown renderer; this div merely delegates their click
              events (keyboard toggling of a checkbox fires click too). */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            ref={this.markdownContentRef}
            className="worktree-file-preview-markdown"
            onClick={this.onMarkdownContentClick}
            dangerouslySetInnerHTML={{
              __html: markdownToPreviewHtml(content),
            }}
          />
        </div>
      )
    }

    // Binary files → placeholder
    if (this.isBinaryFile(filePath)) {
      return (
        <div className="worktree-file-preview worktree-file-preview-binary">
          <Octicon symbol={octicons.fileBinary} />
          <span>Binary file: {Path.basename(filePath)}</span>
        </div>
      )
    }

    // Text files → syntax-highlighted view, editable via the Edit button
    if (error != null) {
      return (
        <div className="worktree-file-preview">
          <div className="worktree-file-preview-error">{error}</div>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="worktree-file-preview">
          <div className="worktree-file-preview-loading">Loading…</div>
        </div>
      )
    }

    if (isEditing) {
      return (
        <div className="worktree-file-preview">
          <div className="worktree-file-preview-header">
            <span className="worktree-file-preview-filename">
              {Path.basename(filePath)}
            </span>
            <div className="worktree-file-preview-actions">
              <Button size="small" onClick={this.onToggleEditing}>
                <Octicon symbol={octicons.eye} className="mr" />
                Preview
              </Button>
              {isDirty && (
                <Button size="small" onClick={this.onSave}>
                  <Octicon symbol={octicons.check} className="mr" />
                  Save
                </Button>
              )}
            </div>
          </div>
          <textarea
            ref={this.textAreaRef}
            className="worktree-file-preview-textarea"
            value={content}
            onChange={this.onTextChanged}
            spellCheck={false}
          />
        </div>
      )
    }

    return (
      <div className="worktree-file-preview cm-s-default">
        <div className="worktree-file-preview-header">
          <span className="worktree-file-preview-filename">
            {Path.basename(filePath)}
          </span>
          <div className="worktree-file-preview-actions">
            <Button size="small" onClick={this.onToggleEditing}>
              <Octicon symbol={octicons.pencil} className="mr" />
              Edit
            </Button>
          </div>
        </div>
        <pre className="worktree-file-preview-code">
          {content.split('\n').map((line, i) => {
            const lineTokens = getTokens(i + 1, tokens ?? undefined)
            return (
              <div key={i}>
                {syntaxHighlightLine(
                  line,
                  lineTokens != null ? [lineTokens] : []
                )}
              </div>
            )
          })}
        </pre>
      </div>
    )
  }
}
