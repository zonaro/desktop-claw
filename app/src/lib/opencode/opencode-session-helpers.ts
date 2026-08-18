import {
  IOpenCodeMessage,
  IOpenCodeModelOption,
  IOpenCodeModelSelection,
  IOpenCodeProvider,
  IOpenCodeSession,
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

/**
 * Flattens the provider list into the entries the model picker renders,
 * sorted by provider and then by model name so the grouped list is stable.
 */
export function getModelOptions(
  providers: ReadonlyArray<IOpenCodeProvider>
): ReadonlyArray<IOpenCodeModelOption> {
  const options = new Array<IOpenCodeModelOption>()

  for (const provider of providers) {
    const providerName = provider.name ?? provider.id

    for (const [modelID, model] of Object.entries(provider.models ?? {})) {
      options.push({
        providerID: provider.id,
        providerName,
        modelID,
        modelName: model.name ?? modelID,
        variants: Object.keys(model.variants ?? {}),
      })
    }
  }

  return options.sort(
    (x, y) =>
      x.providerName.localeCompare(y.providerName) ||
      x.modelName.localeCompare(y.modelName)
  )
}

/** Serializes a model selection into a single value usable as an option key. */
export function formatModelValue(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`
}

/**
 * Parses a value produced by {@link formatModelValue}. Model ids may contain
 * slashes, so only the first segment is treated as the provider.
 */
export function parseModelValue(
  value: string
): { readonly providerID: string; readonly modelID: string } | null {
  const separatorIndex = value.indexOf('/')

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null
  }

  return {
    providerID: value.slice(0, separatorIndex),
    modelID: value.slice(separatorIndex + 1),
  }
}

/**
 * The `@` reference being typed at the caret, or null when the caret isn't in
 * one. Used to drive the file autocompletion popup.
 *
 * A reference starts at an `@` that follows whitespace (or the start of the
 * text) and runs until the next whitespace, so an email address or a decorator
 * mid-word doesn't open the popup.
 */
export function getFileReferenceQuery(
  text: string,
  caret: number
): { readonly query: string; readonly start: number } | null {
  const before = text.slice(0, caret)
  const atIndex = before.lastIndexOf('@')

  if (atIndex === -1) {
    return null
  }

  if (atIndex > 0 && !/\s/.test(before[atIndex - 1])) {
    return null
  }

  const query = before.slice(atIndex + 1)

  if (/\s/.test(query)) {
    return null
  }

  return { query, start: atIndex }
}

/** Extracts the `@path` references present in a prompt. */
export function getFileReferences(text: string): ReadonlyArray<string> {
  const references = new Array<string>()
  const pattern = /(^|\s)@(\S+)/g

  let match = pattern.exec(text)

  while (match !== null) {
    references.push(match[2])
    match = pattern.exec(text)
  }

  return references
}

/**
 * The model and variant a session last ran with, in the shape the pickers use.
 *
 * A session that has never run carries no model, which is what makes a new
 * conversation start on the default again.
 */
export function getSessionModelSelection(
  session: IOpenCodeSession | undefined
): {
  readonly model: IOpenCodeModelSelection | null
  readonly variant: string | null
} {
  const model = session?.model

  if (model === undefined) {
    return { model: null, variant: null }
  }

  return {
    model: { providerID: model.providerID, modelID: model.id },
    // The server writes 'default' instead of leaving the variant out.
    variant:
      model.variant === undefined || model.variant === 'default'
        ? null
        : model.variant,
  }
}
