import * as React from 'react'

import { Repository } from '../../models/repository'
import { IFtpDeployment } from '../../models/ftp-deployment'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  startFtpUpload,
  cancelFtpUpload,
  testFtpConnectionForDeployment,
} from '../../lib/ftp/ftp-client'
import { deleteFtpSecret } from '../../lib/ftp/ftp-secrets'
import { FtpUploadCancelledError } from '../../lib/ftp/ftp-uploader'
import { EditFtpDeploymentForm } from './edit-ftp-deployment-form'
import {
  FtpDeploymentListItem,
  FtpTestStatus,
  FtpUploadStatus,
  IActiveFtpUpload,
} from './ftp-deployment-list-item'

interface IFtpDeploymentsManagerProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /**
   * When provided, the upload for the deployment with this id is started
   * automatically when the component mounts (if the deployment exists and is
   * active).
   */
  readonly initialUploadDeploymentId?: string
}

interface IFtpDeploymentsManagerState {
  /**
   * `undefined` shows the deployment list, `null` shows the add form and an
   * `IFtpDeployment` shows the edit form for that deployment.
   */
  readonly editing: IFtpDeployment | null | undefined
  readonly activeUpload: IActiveFtpUpload | null
  readonly uploadStatuses: Readonly<Record<string, FtpUploadStatus>>
  readonly testStatuses: Readonly<Record<string, FtpTestStatus>>
  /** The deployment awaiting inline delete confirmation, if any. */
  readonly confirmDeleteId: string | null
  readonly isSaving: boolean
}

/**
 * Reusable FTP deployments management UI: listing, adding, editing, deleting,
 * testing connections and uploading with inline progress. Rendered without
 * Dialog chrome so it can be embedded in both the standalone dialog and the
 * repository settings FTP tab.
 */
export class FtpDeploymentsManager extends React.Component<
  IFtpDeploymentsManagerProps,
  IFtpDeploymentsManagerState
> {
  private editFormRef = React.createRef<EditFtpDeploymentForm>()

  public constructor(props: IFtpDeploymentsManagerProps) {
    super(props)

    this.state = {
      editing: undefined,
      activeUpload: null,
      uploadStatuses: {},
      testStatuses: {},
      confirmDeleteId: null,
      isSaving: false,
    }
  }

  public componentDidMount() {
    const initialId = this.props.initialUploadDeploymentId
    if (initialId === undefined) {
      return
    }

    const deployment = this.props.repository.ftpDeployments.find(
      d => d.id === initialId
    )

    if (deployment === undefined || !deployment.active) {
      return
    }

    // The upload flow surfaces the "password not set" hint inline if no
    // password has been stored for the deployment yet.
    this.onUpload(deployment)
  }

  private onAddDeployment = () => {
    this.setState({ editing: null })
  }

  private onEditDeployment = (deployment: IFtpDeployment) => {
    this.setState({ editing: deployment })
  }

  private onEditDismissed = () => {
    this.setState({ editing: undefined, isSaving: false })
  }

  private onDeploymentSaved = (deployment: IFtpDeployment) => {
    const deployments = this.props.repository.ftpDeployments
    const index = deployments.findIndex(d => d.id === deployment.id)
    const newList =
      index >= 0
        ? deployments.map(d => (d.id === deployment.id ? deployment : d))
        : [...deployments, deployment]

    this.props.dispatcher.updateRepositoryFtpDeployments(
      this.props.repository,
      newList
    )

    this.setState({ editing: undefined, isSaving: false })
  }

  private onToggleActive = (deployment: IFtpDeployment) => {
    const newList = this.props.repository.ftpDeployments.map(d =>
      d.id === deployment.id ? { ...d, active: !d.active } : d
    )

    this.props.dispatcher.updateRepositoryFtpDeployments(
      this.props.repository,
      newList
    )
  }

  private onDeleteClick = (deployment: IFtpDeployment) => {
    this.setState({ confirmDeleteId: deployment.id })
  }

  private onDeleteCancel = () => {
    this.setState({ confirmDeleteId: null })
  }

  private onDeleteConfirm = async (deployment: IFtpDeployment) => {
    this.setState({ confirmDeleteId: null })

    const newList = this.props.repository.ftpDeployments.filter(
      d => d.id !== deployment.id
    )

    try {
      await deleteFtpSecret(this.props.repository.id, deployment.id)
    } catch (e) {
      // A keychain failure shouldn't block removing the configuration.
      this.props.dispatcher.postError(e)
    }

    this.props.dispatcher.updateRepositoryFtpDeployments(
      this.props.repository,
      newList
    )
  }

  private onTest = async (deployment: IFtpDeployment) => {
    this.setTestStatus(deployment.id, { kind: 'pending' })

    let status: FtpTestStatus
    try {
      const result = await testFtpConnectionForDeployment(
        this.props.repository.id,
        deployment
      )
      status = result.ok
        ? { kind: 'success' }
        : { kind: 'error', message: result.error ?? 'Connection failed' }
    } catch (e) {
      status = this.getPasswordMissingStatus(e) ?? {
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      }
    }

    this.setTestStatus(deployment.id, status)
  }

  private onUpload = async (deployment: IFtpDeployment) => {
    if (this.state.activeUpload !== null) {
      return
    }

    this.setState(state => {
      const uploadStatuses = { ...state.uploadStatuses }
      delete uploadStatuses[deployment.id]
      return {
        uploadStatuses,
        activeUpload: {
          uploadId: '',
          deploymentId: deployment.id,
          fileName: '',
          filesCompleted: 0,
          totalFiles: 0,
          bytesOverall: 0,
        },
      }
    })

    try {
      const handle = await startFtpUpload({
        repositoryId: this.props.repository.id,
        repositoryPath: this.props.repository.path,
        deployment,
        onProgress: progress => {
          this.setState({
            activeUpload: {
              uploadId: progress.uploadId,
              deploymentId: deployment.id,
              fileName: progress.fileName,
              filesCompleted: progress.filesCompleted,
              totalFiles: progress.totalFiles,
              bytesOverall: progress.bytesOverall,
            },
          })
        },
      })

      const result = await handle.promise

      this.setState(state => ({
        activeUpload: null,
        uploadStatuses: {
          ...state.uploadStatuses,
          [deployment.id]: {
            kind: 'completed',
            uploadedFiles: result.uploadedFiles,
          },
        },
      }))
    } catch (e) {
      const status: FtpUploadStatus =
        e instanceof FtpUploadCancelledError
          ? { kind: 'cancelled' }
          : this.getPasswordMissingStatus(e) ?? {
              kind: 'error',
              message: e instanceof Error ? e.message : String(e),
            }

      this.setState(state => ({
        activeUpload: null,
        uploadStatuses: { ...state.uploadStatuses, [deployment.id]: status },
      }))
    }
  }

  private onCancelUpload = () => {
    const activeUpload = this.state.activeUpload
    if (activeUpload !== null && activeUpload.uploadId !== '') {
      cancelFtpUpload(activeUpload.uploadId)
    }
  }

  private submitEditForm = async () => {
    const form = this.editFormRef.current
    if (form === null) {
      return
    }

    this.setState({ isSaving: true })
    const success = await form.submit()
    if (!success) {
      this.setState({ isSaving: false })
    }
  }

  private onEditFormSubmit = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Prevent the form submit event from propagating to the Dialog's onSubmit
    // handler. In the settings tab context, Save should persist the FTP
    // deployment, not trigger the repository settings save.
    event.preventDefault()
    this.submitEditForm()
  }

  private onEditFormCancel = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Prevent the form reset event from propagating to the Dialog's onDismiss
    // handler. In the settings tab context, Cancel should return to the list
    // view, not close the entire repository settings dialog.
    event.preventDefault()
    this.onEditDismissed()
  }

  private setTestStatus(deploymentId: string, status: FtpTestStatus) {
    this.setState(state => ({
      testStatuses: { ...state.testStatuses, [deploymentId]: status },
    }))
  }

  /** Maps the "FTP password not set" error to an inline-hint status. */
  private getPasswordMissingStatus(
    e: unknown
  ): { readonly kind: 'password-missing' } | null {
    return e instanceof Error && e.message === 'FTP password not set'
      ? { kind: 'password-missing' }
      : null
  }

  private renderDeploymentList() {
    const deployments = this.props.repository.ftpDeployments

    if (deployments.length === 0) {
      return (
        <div className="ftp-deployments-empty">
          <p>No FTP deployments configured for this repository.</p>
          <p className="secondary-text">
            Add a deployment to upload your repository files to an FTP or FTPS
            server.
          </p>
          <Button onClick={this.onAddDeployment}>
            <Octicon symbol={octicons.plus} className="mr" />
            {__DARWIN__ ? 'Add Deployment' : 'Add deployment'}
          </Button>
        </div>
      )
    }

    return (
      <>
        <ul className="ftp-deployment-list">
          {deployments.map(deployment => (
            <FtpDeploymentListItem
              key={deployment.id}
              deployment={deployment}
              uploadInProgress={this.state.activeUpload !== null}
              testStatus={this.state.testStatuses[deployment.id]}
              activeUpload={this.state.activeUpload}
              uploadStatus={this.state.uploadStatuses[deployment.id]}
              isConfirmingDelete={this.state.confirmDeleteId === deployment.id}
              onUpload={this.onUpload}
              onTest={this.onTest}
              onEdit={this.onEditDeployment}
              onDeleteClick={this.onDeleteClick}
              onDeleteConfirm={this.onDeleteConfirm}
              onDeleteCancel={this.onDeleteCancel}
              onToggleActive={this.onToggleActive}
              onCancelUpload={this.onCancelUpload}
            />
          ))}
        </ul>
        <DialogFooter>
          <div className="ftp-deployments-footer">
            <Button onClick={this.onAddDeployment}>
              <Octicon symbol={octicons.plus} className="mr" />
              {__DARWIN__ ? 'Add Deployment' : 'Add deployment'}
            </Button>
          </div>
        </DialogFooter>
      </>
    )
  }

  private renderEditForm() {
    const isEditing = this.state.editing !== null
    const editing = this.state.editing ?? null

    return (
      <>
        <EditFtpDeploymentForm
          ref={this.editFormRef}
          repository={this.props.repository}
          deployment={editing}
          onSave={this.onDeploymentSaved}
        />
        <DialogFooter>
          <div className="ftp-deployments-footer">
            <OkCancelButtonGroup
              okButtonText={isEditing ? 'Save' : 'Add'}
              okButtonDisabled={this.state.isSaving}
              onOkButtonClick={this.onEditFormSubmit}
              onCancelButtonClick={this.onEditFormCancel}
            />
          </div>
        </DialogFooter>
      </>
    )
  }

  public render() {
    if (this.state.editing !== undefined) {
      return this.renderEditForm()
    }

    return this.renderDeploymentList()
  }
}
