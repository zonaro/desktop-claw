import * as React from 'react'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { MarkdownEditorView } from './markdown-editor-view'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IMarkdownEditorProps {
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
            filePath={filePath}
            onContentChanged={this.onContentChanged}
          />
        </DialogContent>
        <DialogFooter>
          <Button onClick={this.onExportHTML} disabled={this.state.isSaving}>
            <Octicon symbol={octicons.fileCode} className="mr" />
            Export HTML
          </Button>
          <Button onClick={this.onExportPDF} disabled={this.state.isSaving}>
            <Octicon symbol={octicons.download} className="mr" />
            Export PDF
          </Button>
          <OkCancelButtonGroup
            okButtonText="Save"
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
