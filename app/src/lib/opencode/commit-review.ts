import * as fs from 'fs'
import * as Path from 'path'

import { git } from '../git/core'
import { invoke } from '../ipc-renderer'
import { Repository } from '../../models/repository'
import { loadOpenCodeConfig } from './opencode-config'
import { buildOpenCodeMemoryContext } from './opencode-memory'

/**
 * Builds the prompt sent to the OpenCode CLI to generate a code review for a
 * commit. The prompt instructs the model to act as a senior code reviewer,
 * analyze the provided diff, and emit a Markdown review in Portuguese.
 *
 * @param diff - The raw git diff for the commit.
 * @param commitSha - The SHA of the commit being reviewed.
 * @param memoryContext - Optional custom instructions from the user's memory entries.
 * @returns The composed system + user prompt string.
 */
export function buildCommitReviewPrompt(
  diff: string,
  commitSha: string,
  memoryContext: string
): string {
  const system = `Você é um revisor de código sênior. Analise o diff do commit fornecido e escreva uma revisão em Markdown em português com as seguintes seções:

## Issues encontrados
## Caveats
## Melhorias
## Otimizações
## Sugestões

Cada item deve ser um bullet \`- **Severidade:** ...\` com contexto de arquivo/linha quando determinável. Termine com um curto \`## Resumo\`. Saída APENAS o markdown da revisão, sem preâmbulo, sem comentário final, não envolvido em um bloco de código.`

  const user = memoryContext.length > 0
    ? `${memoryContext}\n\n---\n\nCommit: ${commitSha}\n\n\`\`\`diff\n${diff}\n\`\`\``
    : `Commit: ${commitSha}\n\n\`\`\`diff\n${diff}\n\`\`\``

  return `${system}\n\n${user}`
}

/**
 * Generates a code review for the given commit by running the OpenCode CLI
 * through the main-process runner via typed IPC. The review is written to
 * `<repo-root>/.desktop-claw/review-<commit-sha>.md`.
 *
 * Returns `null` when OpenCode is disabled or commit review is not enabled, or
 * when the diff cannot be retrieved.
 *
 * @param repository - The repository containing the commit.
 * @param commitSha - The SHA of the commit to review.
 * @returns The absolute path to the written review file, or `null`.
 */
export async function generateCommitReview(
  repository: Repository,
  commitSha: string
): Promise<string | null> {
  const config = loadOpenCodeConfig()
  if (!config.enabled || !config.reviewOnCommit) {
    return null
  }

  const result = await git(
    ['show', '--no-color', '--format=', commitSha],
    repository.path,
    'generateCommitReview'
  )

  let diff = result.stdout
  if (diff.length > 120000) {
    diff = diff.slice(0, 120000)
  }

  const memoryContext = buildOpenCodeMemoryContext(config)
  const prompt = buildCommitReviewPrompt(diff, commitSha, memoryContext)

  const review = await invoke('opencode-run-prompt', {
    requestId: crypto.randomUUID(),
    command: config.command,
    model: config.model,
    timeoutMs: config.timeoutMs,
    cwd: repository.path,
    prompt,
  })

  const dir = Path.join(repository.path, '.desktop-claw')
  await fs.promises.mkdir(dir, { recursive: true })

  const filePath = Path.join(dir, `review-${commitSha}.md`)
  const content = `# Code Review — ${commitSha}\n\n${review}`
  await fs.promises.writeFile(filePath, content, 'utf8')

  return filePath
}
