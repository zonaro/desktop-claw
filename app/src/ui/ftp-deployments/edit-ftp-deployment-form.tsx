import * as React from 'react'

import { Repository } from '../../models/repository'
import {
  IFtpDeployment,
  FtpProtocol,
  isFtpDeployment,
  createEmptyFtpDeployment,
} from '../../models/ftp-deployment'
import { setFtpSecret } from '../../lib/ftp/ftp-secrets'
import { DialogContent, DialogError } from '../dialog'
import { TextBox } from '../lib/text-box'
import { TextArea } from '../lib/text-area'
import { Select } from '../lib/select'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Row } from '../lib/row'

interface IEditFtpDeploymentFormProps {
  readonly repository: Repository

  /** The deployment to edit, or `null` when adding a new one. */
  readonly deployment: IFtpDeployment | null

  /**
   * Called with the updated deployment after it has been validated and any
   * newly typed password has been stored in the OS keychain. The parent is
   * responsible for persisting the deployment list.
   */
  readonly onSave: (deployment: IFtpDeployment) => void
}

interface IEditFtpDeploymentFormState {
  readonly name: string
  readonly protocol: FtpProtocol
  readonly host: string
  /** Kept as a string so the field can be empty while typing. */
  readonly port: string
  readonly username: string
  /**
   * The password as entered by the user. Write-only: it is never prefilled
   * from the keychain. An empty string while editing means "keep the current
   * password".
   */
  readonly password: string
  readonly remotePath: string
  /** The ignore patterns textarea content, one pattern per line. */
  readonly ignorePatternsText: string
  readonly active: boolean
  readonly errorMessage: string | null
}

/**
 * Form fields for adding or editing a single FTP deployment configuration.
 * Rendered without Dialog chrome or footer buttons so it can be embedded in
 * both the standalone edit dialog (which provides Dialog + OkCancelButtonGroup)
 * and the repository settings FTP tab (which provides its own buttons).
 *
 * The password is stored in the OS keychain and never persisted with the
 * deployment itself.
 */
export class EditFtpDeploymentForm extends React.Component<
  IEditFtpDeploymentFormProps,
  IEditFtpDeploymentFormState
> {
  public constructor(props: IEditFtpDeploymentFormProps) {
    super(props)

    const deployment = props.deployment

    this.state = {
      name: deployment?.name ?? '',
      protocol: deployment?.protocol ?? 'ftp',
      host: deployment?.host ?? '',
      port: deployment !== null ? String(deployment.port) : '21',
      username: deployment?.username ?? '',
      password: '',
      remotePath: deployment?.remotePath ?? '/',
      ignorePatternsText: deployment?.ignorePatterns.join('\n') ?? '',
      active: deployment?.active ?? true,
      errorMessage: null,
    }
  }

  public render() {
    const isEditing = this.props.deployment !== null

    return (
      <>
        {this.state.errorMessage !== null && (
          <DialogError>{this.state.errorMessage}</DialogError>
        )}
        <DialogContent>
          <Row>
            <TextBox
              label="Name"
              value={this.state.name}
              onValueChanged={this.onNameChanged}
              placeholder="Production server"
              required={true}
              autoFocus={true}
            />
          </Row>
          <Row>
            <Select
              label="Protocol"
              value={this.state.protocol}
              onChange={this.onProtocolChanged}
            >
              <option value="ftp">FTP (plain)</option>
              <option value="ftps">FTPS (explicit TLS)</option>
            </Select>
          </Row>
          <Row className="ftp-host-port-row">
            <TextBox
              label="Host"
              className="ftp-host-field"
              value={this.state.host}
              onValueChanged={this.onHostChanged}
              placeholder="ftp.example.com"
              required={true}
            />
            <TextBox
              label="Port"
              className="ftp-port-field"
              value={this.state.port}
              onValueChanged={this.onPortChanged}
              placeholder="21"
              required={true}
            />
          </Row>
          <Row>
            <TextBox
              label="Username"
              value={this.state.username}
              onValueChanged={this.onUsernameChanged}
            />
          </Row>
          <Row>
            <TextBox
              label="Password"
              type="password"
              value={this.state.password}
              onValueChanged={this.onPasswordChanged}
              placeholder="Stored in OS keychain"
            />
          </Row>
          {isEditing && (
            <Row>
              <p className="ftp-helper-text">
                Leave blank to keep the current password.
              </p>
            </Row>
          )}
          <Row>
            <TextBox
              label={__DARWIN__ ? 'Remote Path' : 'Remote path'}
              value={this.state.remotePath}
              onValueChanged={this.onRemotePathChanged}
              placeholder="/"
            />
          </Row>
          <Row>
            <TextArea
              label="Ignore patterns"
              value={this.state.ignorePatternsText}
              onValueChanged={this.onIgnorePatternsChanged}
              placeholder={'dist/\n*.log'}
              rows={4}
            />
          </Row>
          <Row>
            <p className="ftp-helper-text">
              One pattern per line, .gitignore syntax. Examples:{' '}
              <code>dist/</code>, <code>*.log</code>
            </p>
          </Row>
          <Row>
            <Checkbox
              label="Active (available for upload)"
              value={
                this.state.active ? CheckboxValue.On : CheckboxValue.Off
              }
              onChange={this.onActiveChanged}
            />
          </Row>
        </DialogContent>
      </>
    )
  }

  private onNameChanged = (name: string) => this.setState({ name })

  private onProtocolChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({ protocol: event.currentTarget.value as FtpProtocol })
  }

  private onHostChanged = (host: string) => this.setState({ host })

  private onPortChanged = (port: string) => this.setState({ port })

  private onUsernameChanged = (username: string) =>
    this.setState({ username })

  private onPasswordChanged = (password: string) =>
    this.setState({ password })

  private onRemotePathChanged = (remotePath: string) =>
    this.setState({ remotePath })

  private onIgnorePatternsChanged = (ignorePatternsText: string) =>
    this.setState({ ignorePatternsText })

  private onActiveChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ active: event.currentTarget.checked })
  }

  /**
   * Validates and saves the deployment. Returns true if the form was
   * submitted successfully (password stored, onSave called), false if
   * validation or keychain storage failed.
   */
  public submit = async (): Promise<boolean> => {
    const validationError = this.validate()
    if (validationError !== null) {
      this.setState({ errorMessage: validationError })
      return false
    }

    const base = this.props.deployment ?? createEmptyFtpDeployment()
    const trimmedRemotePath = this.state.remotePath.trim()
    const ignorePatterns = this.state.ignorePatternsText
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)

    const deployment: IFtpDeployment = {
      ...base,
      name: this.state.name.trim(),
      protocol: this.state.protocol,
      host: this.state.host.trim(),
      port: Number(this.state.port.trim()),
      username: this.state.username.trim(),
      remotePath: trimmedRemotePath === '' ? '/' : trimmedRemotePath,
      ignorePatterns,
      active: this.state.active,
    }

    if (!isFtpDeployment(deployment)) {
      this.setState({
        errorMessage: 'The deployment configuration is invalid.',
      })
      return false
    }

    this.setState({ errorMessage: null })

    try {
      // Only store a password when the user actually typed one. An empty
      // field while editing means "keep the current password".
      if (this.state.password.length > 0) {
        await setFtpSecret(
          this.props.repository.id,
          deployment.id,
          this.state.password
        )
      }
    } catch (e) {
      this.setState({
        errorMessage:
          e instanceof Error
            ? `Could not store the password: ${e.message}`
            : 'Could not store the password.',
      })
      return false
    }

    this.props.onSave(deployment)
    return true
  }

  private validate(): string | null {
    if (this.state.name.trim() === '') {
      return 'Please enter a name.'
    }

    if (this.state.host.trim() === '') {
      return 'Please enter a host.'
    }

    const trimmedPort = this.state.port.trim()
    const port = Number(trimmedPort)
    if (
      trimmedPort === '' ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      return 'Port must be an integer between 1 and 65535.'
    }

    return null
  }
}
