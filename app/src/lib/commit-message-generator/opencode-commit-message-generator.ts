import type {
  ICommitMessageGenerator,
  ICommitMessageGenerationRequest,
} from './commit-message-generator'
import type { ICopilotCommitMessage } from '../copilot-commit-message'
import { parseCopilotCommitMessage } from '../copilot-commit-message'
import {
  CommitMessageGenerationCancelledError,
  generateCommitMessagePromptTags,
  getCleanedEnforcedRuleDescriptions,
  buildCommitMessageSystemPrompt,
  buildCommitMessageUserPrompt,
} from '../stores/copilot-store'
import { loadOpenCodeConfig } from '../opencode/opencode-config'
import { invoke, send } from '../ipc-renderer'
import type { IOpenCodeAvailability } from '../../models/opencode'

/**
 * A {@link ICommitMessageGenerator} that generates commit messages by
 * invoking the OpenCode CLI through the main-process runner via typed IPC.
 */
export class OpenCodeCommitMessageGenerator
  implements ICommitMessageGenerator
{
  public readonly id = 'openCode' as const

  /**
   * Generate a commit message by composing a system+user prompt, sending
   * it to the OpenCode CLI runner, and parsing the JSON response.
   *
   * @param request - The diff, repository path, rules, and optional signal.
   * @returns A parsed commit message with title and description.
   * @throws CommitMessageGenerationCancelledError when the request
   *   is cancelled via its abort signal or the runner reports cancellation.
   */
  public async generate(
    request: ICommitMessageGenerationRequest
  ): Promise<ICopilotCommitMessage> {
    const config = loadOpenCodeConfig()
    const tags = generateCommitMessagePromptTags()
    const rules = getCleanedEnforcedRuleDescriptions(
      request.commitMessageRules
    )
    const prompt =
      buildCommitMessageSystemPrompt(rules.length > 0, tags) +
      '\n\n' +
      buildCommitMessageUserPrompt(request.diff, tags, rules)

    const requestId = crypto.randomUUID()

    if (request.signal) {
      request.signal.addEventListener(
        'abort',
        () => {
          send('opencode-cancel', requestId)
        },
        { once: true }
      )
    }

    try {
      const content = await invoke('opencode-run-prompt', {
        requestId,
        command: config.command,
        model: config.model,
        timeoutMs: config.timeoutMs,
        cwd: request.repositoryPath,
        prompt,
      })

      return parseCopilotCommitMessage(content)
    } catch (e) {
      if (
        request.signal?.aborted ||
        (e instanceof Error && e.message.includes('cancelled'))
      ) {
        throw new CommitMessageGenerationCancelledError()
      }

      throw e
    }
  }
}

/**
 * Check whether the given OpenCode CLI command is available on the
 * system by delegating to the main-process runner via IPC.
 *
 * @param command - The OpenCode CLI binary name or path to probe.
 * @returns An availability result with version info when the CLI runs.
 */
export async function checkOpenCodeCliAvailability(
  command: string
): Promise<IOpenCodeAvailability> {
  return invoke('opencode-check-availability', command)
}
