import {
  IOpenCodeMessage,
  IOpenCodeToolPart,
} from '../../models/opencode-session'

/** Tool output longer than this is truncated in the expanded view. */
export const MaxToolOutputLength = 4000

/**
 * The input keys, in priority order, that describe what a tool call is doing.
 * The first one present becomes the tool's one line summary.
 */
const ToolSummaryKeys: ReadonlyArray<string> = [
  'command',
  'filePath',
  'path',
  'pattern',
  'query',
  'description',
  'url',
]

/**
 * Builds the one line summary shown next to a tool name — the file it touched,
 * the command it ran, or the pattern it searched for. Returns null when the
 * call carries nothing worth summarising.
 */
export function getToolSummary(part: IOpenCodeToolPart): string | null {
  const { title, input } = part.state

  if (typeof title === 'string' && title.length > 0) {
    return title
  }

  if (input === undefined) {
    return null
  }

  for (const key of ToolSummaryKeys) {
    const value = input[key]

    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

/** Truncates long tool output, noting how much was dropped. */
export function truncateToolOutput(output: string): string {
  if (output.length <= MaxToolOutputLength) {
    return output
  }

  const dropped = output.length - MaxToolOutputLength

  return `${output.slice(
    0,
    MaxToolOutputLength
  )}\n\n… ${dropped} more characters`
}

/**
 * Whether the agent is still working, i.e. the history ends with an assistant
 * message that has neither completed nor failed.
 *
 * Used to restore the "working" indicator when a conversation is opened while
 * a run started elsewhere (the TUI, another window) is still going.
 */
export function isSessionBusy(
  messages: ReadonlyArray<IOpenCodeMessage>
): boolean {
  const last = messages[messages.length - 1]

  return (
    last !== undefined &&
    last.info.role === 'assistant' &&
    last.info.time.completed === undefined &&
    last.info.error === undefined
  )
}
