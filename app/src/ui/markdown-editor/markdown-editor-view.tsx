import * as React from 'react'
import * as Path from 'path'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { showSaveDialog } from '../main-process-proxy'
import { writeFile, readFile } from 'fs/promises'
import { exportMarkdownToHtml, exportMarkdownToPdf } from './markdown-export'

// Import the TOAST UI Editor CSS
// eslint-disable-next-line import/first
require('@toast-ui/editor/dist/toastui-editor.css')

const markdownExtensions = new Set(['.md', '.markdown', '.mdx', '.mdown', '.mkd'])

/**
 * Returns true if the given file path looks like a markdown file based on its
 * extension. Used to decide whether to route a file open to the WYSIWYG editor.
 */
export function isMarkdownFilePath(filePath: string): boolean {
  const ext = Path.extname(filePath).toLowerCase()
  return markdownExtensions.has(ext)
}

/**
 * Minimal interface for the @toast-ui/editor instance.
 * We use require() to avoid TypeScript type resolution issues with the
 * package's own type declarations.
 */
interface IToastEditor {
  getMarkdown(): string
  setMarkdown(markdown: string, emitter?: { reset: boolean }): void
  getHTML(): string
  addHook(hook: string, handler: (...args: any[]) => any): void
  removeHook(hook: string): void
  exec(command: string, ...args: any[]): void
  focus(): void
  blur(): void
  destroy(): void
  getHeight(): string
  setHeight(height: string): void
  on(event: string, handler: (...args: any[]) => void): void
  off(event: string, handler: (...args: any[]) => void): void
  once(event: string, handler: (...args: any[]) => void): void
  addPlugin(pluginInfo: { plugin: any; options?: Record<string, any> }): void
}

interface IToastEditorOptions {
  el?: HTMLElement | string
  height?: string
  initialEditType?: 'markdown' | 'wysiwyg'
  previewStyle?: 'tab' | 'vertical'
  initialValue?: string
  usageStatistics?: boolean
  toolbarItems?: ReadonlyArray<ReadonlyArray<string>>
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Editor: { new (options: IToastEditorOptions): IToastEditor } = require('@toast-ui/editor')

interface IMarkdownEditorViewProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly filePath: string
  readonly onContentChanged: (dirty: boolean) => void
}

interface IMarkdownEditorViewState {
  readonly loading: boolean
  readonly error: string | null
}

/**
 * Wrapper around the @toast-ui/editor WYSIWYG markdown editor.
 * Handles loading the file content, tracking dirty state, saving back to disk,
 * and triggering HTML/PDF exports.
 */
export class MarkdownEditorView extends React.Component<
  IMarkdownEditorViewProps,
  IMarkdownEditorViewState
> {
  private editor: IToastEditor | null = null
  private editorContainerRef = React.createRef<HTMLDivElement>()
  private originalContent: string = ''
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  public constructor(props: IMarkdownEditorViewProps) {
    super(props)
    this.state = { loading: true, error: null }
  }

  public async componentDidMount() {
    await this.loadFile()
  }

  public componentWillUnmount() {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer)
    }
    this.editor?.destroy()
    this.editor = null
  }

  private async loadFile() {
    const { filePath } = this.props

    try {
      const content = await readFile(filePath, 'utf8')
      this.originalContent = content
      this.initEditor(content)
      this.setState({ loading: false })
    } catch (e) {
      this.setState({
        loading: false,
        error: `Failed to load file: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  private initEditor(initialValue: string) {
    const container = this.editorContainerRef.current
    if (container == null) {
      return
    }

    this.editor = new Editor({
      el: container,
      height: '500px',
      initialEditType: 'wysiwyg',
      previewStyle: 'vertical',
      initialValue,
      usageStatistics: false,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'image', 'link'],
        ['code', 'codeblock'],
      ],
    })

    this.editor.addHook('change', () => {
      this.onEditorContentChanged()
    })
  }

  private onEditorContentChanged() {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      const current = this.editor?.getMarkdown() ?? ''
      this.props.onContentChanged(current !== this.originalContent)
    }, 300)
  }

  /** Returns the current markdown content from the editor. */
  public getMarkdown(): string {
    return this.editor?.getMarkdown() ?? this.originalContent
  }

  /** Saves the current editor content back to the original file. */
  public async save(): Promise<void> {
    const { filePath } = this.props
    const content = this.getMarkdown()

    await writeFile(filePath, content, 'utf8')
    this.originalContent = content
    this.props.onContentChanged(false)
  }

  /** Exports the current content as a standalone HTML file. */
  public async exportToHTML(): Promise<void> {
    const { filePath } = this.props
    const markdown = this.getMarkdown()
    const html = exportMarkdownToHtml(markdown, Path.basename(filePath))

    const defaultName = Path.basename(filePath, Path.extname(filePath)) + '.html'
    const outputPath = await showSaveDialog({
      buttonLabel: 'Export',
      nameFieldLabel: 'Export as:',
      defaultPath: Path.join(Path.dirname(filePath), defaultName),
      filters: [
        { name: 'HTML', extensions: ['html'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (outputPath == null) {
      return
    }

    await writeFile(outputPath, html, 'utf8')
  }

  /** Exports the current content as a PDF file via the main process. */
  public async exportToPDF(): Promise<void> {
    const { filePath } = this.props
    const markdown = this.getMarkdown()
    const html = exportMarkdownToHtml(markdown, Path.basename(filePath))

    const defaultName = Path.basename(filePath, Path.extname(filePath)) + '.pdf'
    const outputPath = await showSaveDialog({
      buttonLabel: 'Export',
      nameFieldLabel: 'Export as:',
      defaultPath: Path.join(Path.dirname(filePath), defaultName),
      filters: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (outputPath == null) {
      return
    }

    await exportMarkdownToPdf(html, outputPath)
  }

  public render() {
    const { loading, error } = this.state

    if (error != null) {
      return (
        <div className="markdown-editor-view">
          <div className="markdown-editor-error">{error}</div>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="markdown-editor-view">
          <div className="markdown-editor-loading">Loading…</div>
        </div>
      )
    }

    return (
      <div className="markdown-editor-view">
        <div ref={this.editorContainerRef} className="markdown-editor-container" />
      </div>
    )
  }
}
