import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher/dispatcher'
import { DialogContent, DialogFooter, Dialog } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IConfirmDeleteFileProps {
  readonly repository: Repository
  readonly filePath: string
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

export class ConfirmDeleteFileDialog extends React.Component<
  IConfirmDeleteFileProps,
  {}
> {
  private onSubmit = (): void => {
    this.props.dispatcher.deleteFile(this.props.repository, this.props.filePath)
    this.props.onDismissed()
  }

  public render() {
    const title = `Delete ${this.props.filePath}`

    return (
      <Dialog
        id="confirm-delete-file"
        type="warning"
        role="alertdialog"
        title={title}
        ariaDescribedBy="confirm-delete-file-message"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p id="confirm-delete-file-message">
            The file <strong>{this.props.filePath}</strong> will be permanently
            deleted from the repository. This action cannot be undone.
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText="Delete"
            onOkButtonClick={this.onSubmit}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
