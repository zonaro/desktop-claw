import * as React from 'react'
import * as Path from 'path'
import Quill from 'quill'
import TurndownService from 'turndown'

import { showSaveDialog } from '../main-process-proxy'
import { writeFile, readFile } from 'fs/promises'
import { exportMarkdownToHtml, exportMarkdownToPdf } from './markdown-export'
import { marked } from 'marked'

// Import the Quill snow theme styles
require('quill/dist/quill.snow.css')

const markdownExtensions = new Set([
  '.md',
  '.markdown',
  '.mdx',
  '.mdown',
  '.mkd',
])

/**
 * Returns true if the given file path looks like a markdown file based on its
 * extension. Used to decide whether to route a file open to the WYSIWYG editor.
 */
export function isMarkdownFilePath(filePath: string): boolean {
  const ext = Path.extname(filePath).toLowerCase()
  return markdownExtensions.has(ext)
}

/**
 * Converts markdown to HTML for the WYSIWYG editor. The editor renders this
 * HTML through Quill's clipboard, which normalizes it into Quill's own
 * delta-based content model.
 */
function markdownToHtml(markdown: string): string {
  return marked(markdown, { gfm: true, breaks: true }) as string
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
})

/**
 * Normalizes whitespace at the end of a markdown document so that trailing
 * newlines (which turndown doesn't emit) don't cause a spurious dirty state.
 */
function normalizeMarkdown(content: string): string {
  return content.replace(/\s+$/, '')
}

interface IMarkdownEditorViewProps {
  readonly filePath: string
  readonly onContentChanged: (dirty: boolean) => void
}

interface IMarkdownEditorViewState {
  readonly loading: boolean
  readonly error: string | null
}

/**
 * Wrapper around the Quill WYSIWYG editor for markdown files.
 *
 * The file's markdown is rendered to HTML (via `marked`) and loaded into
 * Quill. Edits are converted back to markdown (via `turndown`) for saving
 * and for the HTML/PDF export actions.
 */
export class MarkdownEditorView extends React.Component<
  IMarkdownEditorViewProps,
  IMarkdownEditorViewState
> {
  private editor: Quill | null = null
  private editorContainerEl: HTMLElement | null = null
  private originalContent: string = ''
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** Markdown waiting to be loaded once the editor container is mounted. */
  private pendingMarkdown: string | null = null

  public constructor(props: IMarkdownEditorViewProps) {
    super(props)
    this.state = { loading: true, error: null }
  }

  public async componentDidMount() {
    await this.loadFile()
  }

  public componentDidUpdate(prevProps: IMarkdownEditorViewProps) {
    if (prevProps.filePath !== this.props.filePath) {
      this.loadFile()
    }
  }

  public componentWillUnmount() {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer)
    }
    this.destroyEditor()
  }

  private destroyEditor() {
    this.editor = null

    // Quill has no public teardown API (destroy was removed in v1.0), so
    // strip the DOM it created and let garbage collection reclaim the
    // instance. Without this, re-initializing into the same container
    // would double-wrap it with a second ql-editor.
    const container = this.editorContainerEl
    if (container != null) {
      const toolbar = container.previousElementSibling
      if (
        toolbar instanceof HTMLElement &&
        toolbar.classList.contains('ql-toolbar')
      ) {
        toolbar.remove()
      }
      container.className = 'markdown-editor-container'
      container.innerHTML = ''
    }
  }

  /**
   * Ref callback for the editor container. React invokes this synchronously
   * with the DOM commit, so initializing the editor here is immune to the
   * async race between `loadFile`'s `await readFile` and the actual mount.
   */
  private onEditorContainerRef = (el: HTMLDivElement | null) => {
    this.editorContainerEl = el

    if (el == null) {
      this.destroyEditor()
      return
    }

    if (this.pendingMarkdown != null) {
      const markdown = this.pendingMarkdown
      this.pendingMarkdown = null
      this.initEditor(el, markdown)
    }
  }

  private async loadFile() {
    const { filePath } = this.props

    this.setState({ loading: true, error: null })

    try {
      const content = await readFile(filePath, 'utf8')
      this.originalContent = content

      const container = this.editorContainerEl
      if (container != null) {
        this.initEditor(container, content)
      } else {
        // The container isn't mounted yet — the ref callback will consume
        // the markdown as soon as the container commits to the DOM.
        this.pendingMarkdown = content
      }

      this.setState({ loading: false })
    } catch (e) {
      this.destroyEditor()
      this.setState({
        loading: false,
        error: `Failed to load file: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private initEditor(container: HTMLElement, initialMarkdown: string) {
    this.destroyEditor()

    try {
      const editor = new Quill(container, {
        theme: 'snow',
        placeholder: 'Write something…',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'strike', 'code'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'code-block'],
            ['link'],
            ['clean'],
          ],
        },
      })

      editor.clipboard.dangerouslyPasteHTML(markdownToHtml(initialMarkdown))
      editor.on('text-change', () => {
        this.onEditorContentChanged()
      })

      this.editor = editor
    } catch (e) {
      this.destroyEditor()
      this.setState({
        error: `Failed to initialize editor: ${
          e instanceof Error ? e.message : String(e)
        }`,
      })
    }
  }

  private onEditorContentChanged() {
    if (this.debounceTimer != null) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      const current = this.getMarkdown()
      this.props.onContentChanged(
        normalizeMarkdown(current) !== normalizeMarkdown(this.originalContent)
      )
    }, 300)
  }

  /** Returns the current markdown content from the editor. */
  public getMarkdown(): string {
    if (this.editor == null) {
      return this.originalContent
    }

    const html = this.editor.getSemanticHTML()
    return turndownService.turndown(html)
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

    const defaultName =
      Path.basename(filePath, Path.extname(filePath)) + '.html'
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
        <div
          ref={this.onEditorContainerRef}
          className="markdown-editor-container"
        />
      </div>
    )
  }
}
