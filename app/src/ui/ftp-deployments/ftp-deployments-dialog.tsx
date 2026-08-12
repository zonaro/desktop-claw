import * as React from 'react'

import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog } from '../dialog'
import { FtpDeploymentsManager } from './ftp-deployments-manager'

interface IFtpDeploymentsDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /**
   * When provided, the upload for the deployment with this id is started
   * automatically when the dialog mounts (if the deployment exists and is
   * active).
   */
  readonly initialUploadDeploymentId?: string

  readonly onDismissed: () => void
}

/**
 * Dialog for managing the FTP deployments of a repository. Wraps the
 * reusable {@link FtpDeploymentsManager} in Dialog chrome.
 */
export class FtpDeploymentsDialog extends React.Component<
  IFtpDeploymentsDialogProps,
  {}
> {
  public render() {
    return (
      <Dialog
        id="ftp-deployments"
        className="ftp-deployments-dialog"
        title={__DARWIN__ ? 'FTP Deployments' : 'FTP deployments'}
        onDismissed={this.props.onDismissed}
      >
        <FtpDeploymentsManager
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          initialUploadDeploymentId={this.props.initialUploadDeploymentId}
        />
      </Dialog>
    )
  }
}
