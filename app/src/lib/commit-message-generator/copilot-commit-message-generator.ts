import type { Account } from '../../models/account'
import type { CopilotStore, CopilotModelRequest } from '../stores/copilot-store'
import type {
  ICommitMessageGenerator,
  ICommitMessageGenerationRequest,
} from './commit-message-generator'
import type { ICopilotCommitMessage } from '../copilot-commit-message'

/**
 * A {@link ICommitMessageGenerator} that delegates commit-message
 * generation to the existing Copilot SDK integration provided by
 * {@link CopilotStore}.
 */
export class CopilotCommitMessageGenerator implements ICommitMessageGenerator {
  public readonly id = 'copilot' as const

  public constructor(
    private readonly copilotStore: CopilotStore,
    private readonly account: Account,
    private readonly modelRequest: CopilotModelRequest | null
  ) {}

  /**
   * Generate a commit message by forwarding the request to the
   * {@link CopilotStore} SDk integration.
   */
  public async generate(
    request: ICommitMessageGenerationRequest
  ): Promise<ICopilotCommitMessage> {
    return this.copilotStore.generateCommitMessage(
      this.account,
      request.diff,
      request.repositoryPath,
      this.modelRequest,
      request.commitMessageRules,
      request.signal
    )
  }
}
