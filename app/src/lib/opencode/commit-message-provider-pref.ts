/** The backend provider used to generate commit messages. */
export type CommitMessageProvider = 'copilot' | 'openCode'

const StorageKey = 'commit-message-provider'

/**
 * Loads the commit-message provider preference from local storage.
 * Defaults to `'copilot'` when nothing has been stored or the stored
 * value is unrecognised.
 */
export function loadCommitMessageProvider(): CommitMessageProvider {
  const raw = localStorage.getItem(StorageKey)
  if (raw === 'copilot' || raw === 'openCode') {
    return raw
  }
  return 'copilot'
}

/** Persists the commit-message provider preference to local storage. */
export function saveCommitMessageProvider(
  provider: CommitMessageProvider
): void {
  localStorage.setItem(StorageKey, provider)
}
