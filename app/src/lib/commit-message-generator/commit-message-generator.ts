import type { CommitMessageProvider } from '../opencode/commit-message-provider-pref'
import type { ICopilotCommitMessage } from '../copilot-commit-message'
import type { IRepoRulesMetadataRule } from '../../models/repo-rules'

/** Inputs required to generate a commit message for a diff. */
export interface ICommitMessageGenerationRequest {
  /** The full diff to generate a commit message from. */
  readonly diff: string

  /** Absolute path to the repository whose changes are being committed. */
  readonly repositoryPath: string

  /** Optional repo-level rules that constrain the generated message. */
  readonly commitMessageRules: ReadonlyArray<IRepoRulesMetadataRule>

  /**
   * Optional abort signal. When triggered the provider should cancel
   * in-flight work and throw an appropriate error.
   */
  readonly signal?: AbortSignal
}

/**
 * A provider-agnostic generator that can produce commit messages from a
 * diff. Implementations wrap backend-specific logic (e.g. Copilot SDK,
 * OpenCode CLI) behind a uniform interface.
 */
export interface ICommitMessageGenerator {
  /** Identifies which backend this generator wraps. */
  readonly id: CommitMessageProvider

  /**
   * Generate a commit title and description for the given diff.
   *
   * @param request - The diff, repository path, rules, and optional signal.
   * @returns A parsed commit message with title and description.
   * @throws If generation is cancelled or the backend returns an error.
   */
  generate(
    request: ICommitMessageGenerationRequest
  ): Promise<ICopilotCommitMessage>
}
