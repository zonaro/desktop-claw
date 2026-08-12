import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { MarkdownEditorView } from './markdown-editor-view'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IMarkdownEditorProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly filePath: string
  readonly onDismissed: () => void
}

interface IMarkdownEditorState {
  readonly isDirty: boolean
  readonly isSaving: boolean
}

/**
 * Dialog that hosts the WYSIWYG markdown editor for a specific file.
 * Provides save, export HTML, and export PDF actions.
 */
export class MarkdownEditor extends React.Component<
  IMarkdownEditorProps,
  IMarkdownEditorState
> {
  private editorViewRef = React.createRef<MarkdownEditorView>()

  public constructor(props: IMarkdownEditorProps) {
    super(props)
    this.state = { isDirty: false, isSaving: false }
  }

  private onContentChanged = (dirty: boolean) => {
    this.setState({ isDirty: dirty })
  }

  private onSave = async () => {
    const view = this.editorViewRef.current
    if (view == null) {
      return
    }

    this.setState({ isSaving: true })

    try {
      await view.save()
      this.setState({ isDirty: false })
    } catch (e) {
      log.error('Failed to save markdown file', e)
    } finally {
      this.setState({ isSaving: false })
    }
  }

  private onExportHTML = () => {
    this.editorViewRef.current?.exportToHTML()
  }

  private onExportPDF = () => {
    this.editorViewRef.current?.exportToPDF()
  }

  public render() {
    const { filePath } = this.props
    const fileName = filePath.split('/').pop() ?? filePath

    return (
      <Dialog
        id="markdown-editor"
        className="markdown-editor-dialog"
        title={`Edit ${fileName}`}
        onDismissed={this.props.onDismissed}
        disabled={this.state.isSaving}
      >
        <DialogContent>
          <MarkdownEditorView
            ref={this.editorViewRef}
            dispatcher={this.props.dispatcher}
            repository={this.props.repository}
            filePath={filePath}
            onContentChanged={this.onContentChanged}
          />
        </DialogContent>
        <DialogFooter>
          <button
            type="button"
            className="button"
            onClick={this.onExportHTML}
            disabled={this.state.isSaving}
          >
            Export HTML
          </button>
          <button
            type="button"
            className="button"
            onClick={this.onExportPDF}
            disabled={this.state.isSaving}
          >
            Export PDF
          </button>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Save' : 'Save'}
            okButtonDisabled={!this.state.isDirty || this.state.isSaving}
            onOkButtonClick={this.onSave}
            onCancelButtonClick={this.props.onDismissed}
            cancelButtonText="Close"
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
