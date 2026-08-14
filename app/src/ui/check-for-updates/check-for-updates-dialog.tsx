import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { LinkButton } from '../lib/link-button'
import { Loading } from '../lib/loading'
import { IGitHubReleaseInfo } from '../../models/github-release'
import {
  DesktopClawReleasesUrl,
  getLatestGitHubRelease,
  isUpdateAvailable,
} from '../../lib/github-releases'
import { getVersion } from '../lib/app-proxy'
import { formatDate } from '../../lib/format-date'
import { assertNever } from '../../lib/fatal-error'
import { openExternal } from '../main-process-proxy'

type CheckForUpdatesState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'update-available'; readonly release: IGitHubReleaseInfo }
  | { readonly kind: 'up-to-date' }
  | { readonly kind: 'error' }

interface ICheckForUpdatesDialogProps {
  readonly onDismissed: () => void
}

interface ICheckForUpdatesDialogState {
  readonly state: CheckForUpdatesState
}

/**
 * A dialog that checks the GitHub Releases API for a newer version of Desktop
 * Claw and lets the user download it from the release page.
 */
export class CheckForUpdatesDialog extends React.Component<
  ICheckForUpdatesDialogProps,
  ICheckForUpdatesDialogState
> {
  public state: ICheckForUpdatesDialogState = { state: { kind: 'checking' } }

  public componentDidMount() {
    this.performCheck()
  }

  private async performCheck() {
    const release = await getLatestGitHubRelease()
    const currentVersion = getVersion()

    if (release === null) {
      this.setState({ state: { kind: 'error' } })
      return
    }

    if (isUpdateAvailable(currentVersion, release.tagName)) {
      this.setState({ state: { kind: 'update-available', release } })
    } else {
      this.setState({ state: { kind: 'up-to-date' } })
    }
  }

  private onSubmit = () => {
    const { state } = this.state

    switch (state.kind) {
      case 'update-available':
        openExternal(state.release.htmlUrl).catch(err =>
          log.error('Failed opening release page', err)
        )
        this.props.onDismissed()
        break
      case 'up-to-date':
      case 'error':
        this.props.onDismissed()
        break
      case 'checking':
        break
      default:
        return assertNever(state, `Unknown check for updates state: ${state}`)
    }
  }

  private renderContent() {
    const { state } = this.state

    switch (state.kind) {
      case 'checking':
        return (
          <div className="check-for-updates-status">
            <Loading />
            <span>Checking for updates…</span>
          </div>
        )
      case 'update-available':
        return (
          <div>
            <p>
              A new version of Desktop Claw is available:{' '}
              <strong>{state.release.tagName}</strong>.
            </p>
            <p className="no-padding">
              Published on{' '}
              {formatDate(new Date(state.release.publishedAt), {
                dateStyle: 'full',
              })}
              .{' '}
              <LinkButton uri={state.release.htmlUrl}>
                View release notes
              </LinkButton>
            </p>
          </div>
        )
      case 'up-to-date':
        return (
          <p>
            You're up to date. You have the latest version of Desktop Claw (v
            {getVersion()}).
          </p>
        )
      case 'error':
        return (
          <p>
            We couldn't check for updates right now. Please visit the{' '}
            <LinkButton uri={DesktopClawReleasesUrl}>releases page</LinkButton>{' '}
            to see if a new version is available.
          </p>
        )
      default:
        return assertNever(state, `Unknown check for updates state: ${state}`)
    }
  }

  private renderFooter() {
    const { state } = this.state

    switch (state.kind) {
      case 'checking':
        return null
      case 'update-available':
        return (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="Download"
              cancelButtonText="Close"
            />
          </DialogFooter>
        )
      case 'up-to-date':
      case 'error':
        return (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText="OK"
              cancelButtonVisible={false}
            />
          </DialogFooter>
        )
      default:
        return assertNever(state, `Unknown check for updates state: ${state}`)
    }
  }

  public render() {
    return (
      <Dialog
        id="check-for-updates"
        title="Check for Updates"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>{this.renderContent()}</DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }
}
