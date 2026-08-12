import * as React from 'react'
import classNames from 'classnames'

import { IFtpDeployment } from '../../models/ftp-deployment'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Loading } from '../lib/loading'
import { formatBytes } from '../lib/bytes'

/** The outcome of the last connection test for a deployment. */
export type FtpTestStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'password-missing' }

/** The outcome of the last upload to a deployment. */
export type FtpUploadStatus =
  | { readonly kind: 'completed'; readonly uploadedFiles: number }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'password-missing' }

/** Progress of the currently running upload, if any. */
export interface IActiveFtpUpload {
  /** Empty while the upload is still being set up (keychain lookup). */
  readonly uploadId: string
  readonly deploymentId: string
  readonly fileName: string
  readonly filesCompleted: number
  readonly totalFiles: number
  readonly bytesOverall: number
}

interface IFtpDeploymentListItemProps {
  readonly deployment: IFtpDeployment
  readonly uploadInProgress: boolean
  readonly testStatus: FtpTestStatus | undefined
  readonly activeUpload: IActiveFtpUpload | null
  readonly uploadStatus: FtpUploadStatus | undefined
  readonly isConfirmingDelete: boolean
  readonly onUpload: (deployment: IFtpDeployment) => void
  readonly onTest: (deployment: IFtpDeployment) => void
  readonly onEdit: (deployment: IFtpDeployment) => void
  readonly onDeleteClick: (deployment: IFtpDeployment) => void
  readonly onDeleteConfirm: (deployment: IFtpDeployment) => void
  readonly onDeleteCancel: () => void
  readonly onToggleActive: (deployment: IFtpDeployment) => void
  readonly onCancelUpload: () => void
}

/**
 * A single FTP deployment row in the FTP Deployments dialog: summary, active
 * toggle, upload/test/edit/delete actions and inline upload progress.
 */
export class FtpDeploymentListItem extends React.Component<
  IFtpDeploymentListItemProps,
  {}
> {
  private onUploadClick = () => {
    this.props.onUpload(this.props.deployment)
  }

  private onTestClick = () => {
    this.props.onTest(this.props.deployment)
  }

  private onEditClick = () => {
    this.props.onEdit(this.props.deployment)
  }

  private onDeleteClick = () => {
    this.props.onDeleteClick(this.props.deployment)
  }

  private onDeleteConfirmClick = () => {
    this.props.onDeleteConfirm(this.props.deployment)
  }

  private onToggleActiveClick = () => {
    this.props.onToggleActive(this.props.deployment)
  }

  private renderPasswordMissingHint() {
    return (
      <span className="ftp-row-status password-missing">
        FTP password not set.{' '}
        <LinkButton onClick={this.onEditClick}>Edit the deployment</LinkButton>{' '}
        to set the password.
      </span>
    )
  }

  private renderTestStatus() {
    const status = this.props.testStatus
    if (status === undefined) {
      return null
    }

    switch (status.kind) {
      case 'pending':
        return (
          <span className="ftp-row-status pending">
            <Loading /> Testing connection…
          </span>
        )
      case 'success':
        return (
          <span className="ftp-row-status success">Connection successful</span>
        )
      case 'error':
        return <span className="ftp-row-status error">{status.message}</span>
      case 'password-missing':
        return this.renderPasswordMissingHint()
    }
  }

  private renderUploadArea() {
    const activeUpload = this.props.activeUpload

    if (activeUpload !== null && activeUpload.deploymentId === this.props.deployment.id) {
      return (
        <div className="ftp-upload-progress">
          <span className="ftp-upload-file">
            {activeUpload.fileName === ''
              ? 'Preparing upload…'
              : activeUpload.fileName}
          </span>
          <span className="ftp-upload-count">
            {activeUpload.filesCompleted}/{activeUpload.totalFiles} files
          </span>
          <span className="ftp-upload-bytes">
            {formatBytes(activeUpload.bytesOverall)}
          </span>
          <Button
            size="small"
            onClick={this.props.onCancelUpload}
            disabled={activeUpload.uploadId === ''}
          >
            Cancel
          </Button>
        </div>
      )
    }

    const status = this.props.uploadStatus
    if (status === undefined) {
      return null
    }

    switch (status.kind) {
      case 'completed':
        return (
          <span className="ftp-row-status success">
            Upload completed: {status.uploadedFiles} files
          </span>
        )
      case 'cancelled':
        return <span className="ftp-row-status">Upload cancelled</span>
      case 'error':
        return <span className="ftp-row-status error">{status.message}</span>
      case 'password-missing':
        return this.renderPasswordMissingHint()
    }
  }

  private renderDeleteConfirmation() {
    return (
      <div className="ftp-delete-confirmation">
        <span>Delete this deployment?</span>
        <Button
          size="small"
          className="destructive"
          onClick={this.onDeleteConfirmClick}
        >
          Delete
        </Button>
        <Button size="small" onClick={this.props.onDeleteCancel}>
          Cancel
        </Button>
      </div>
    )
  }

  private getDeploymentSummary(deployment: IFtpDeployment): string {
    const remotePath = deployment.remotePath.startsWith('/')
      ? deployment.remotePath
      : `/${deployment.remotePath}`
    return `${deployment.protocol}://${deployment.host}:${deployment.port}${remotePath}`
  }

  public render() {
    const { deployment, uploadInProgress, testStatus, isConfirmingDelete } =
      this.props

    return (
      <li className="ftp-deployment-row">
        <div className="ftp-deployment-info">
          <div className="ftp-deployment-title">
            <span className="name">{deployment.name}</span>
            <Button
              className={classNames('ftp-active-toggle', {
                active: deployment.active,
              })}
              tooltip={
                deployment.active
                  ? 'Active — click to deactivate'
                  : 'Inactive — click to activate'
              }
              onClick={this.onToggleActiveClick}
            >
              {deployment.active ? 'Active' : 'Inactive'}
            </Button>
          </div>
          <div className="ftp-deployment-summary">
            {this.getDeploymentSummary(deployment)}
          </div>
          {this.renderUploadArea()}
          {this.renderTestStatus()}
        </div>
        {isConfirmingDelete ? (
          this.renderDeleteConfirmation()
        ) : (
          <div className="ftp-deployment-actions">
            <Button
              size="small"
              disabled={uploadInProgress || !deployment.active}
              tooltip={
                deployment.active
                  ? `Upload to "${deployment.name}"`
                  : 'This deployment is inactive'
              }
              ariaLabel={`Upload to ${deployment.name}`}
              onClick={this.onUploadClick}
            >
              <Octicon symbol={octicons.upload} className="mr" />
              Upload
            </Button>
            <Button
              size="small"
              disabled={testStatus?.kind === 'pending'}
              tooltip={`Test the connection to "${deployment.name}"`}
              ariaLabel={`Test ${deployment.name}`}
              onClick={this.onTestClick}
            >
              <Octicon symbol={octicons.plug} className="mr" />
              Test
            </Button>
            <Button
              size="small"
              tooltip={`Edit "${deployment.name}"`}
              ariaLabel={`Edit ${deployment.name}`}
              onClick={this.onEditClick}
            >
              <Octicon symbol={octicons.pencil} className="mr" />
              Edit
            </Button>
            <Button
              size="small"
              tooltip={`Delete "${deployment.name}"`}
              ariaLabel={`Delete ${deployment.name}`}
              onClick={this.onDeleteClick}
            >
              <Octicon symbol={octicons.trash} className="mr" />
              Delete
            </Button>
          </div>
        )}
      </li>
    )
  }
}
