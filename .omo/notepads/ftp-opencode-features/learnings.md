# learnings

## 2026-08-10 — Task A2: OpenCode config model + feature flag

- Created `app/src/lib/opencode/opencode-config.ts`: `IOpenCodeConfig` interface (readonly `enabled`, `command`, `model`, `timeoutMs`), `DefaultOpenCodeConfig` (command=`'opencode'`, timeoutMs=60000), `loadOpenCodeConfig()` / `saveOpenCodeConfig()` with defensive localStorage parsing mirroring `loadBYOKProviders` pattern, `isOpenCodeConfig()` type guard.
- Created `app/src/lib/opencode/commit-message-provider-pref.ts`: `CommitMessageProvider` union type (`'copilot' | 'openCode'`), `loadCommitMessageProvider()` defaulting to `'copilot'`, `saveCommitMessageProvider()`.
- Edited `app/src/lib/feature-flag.ts`: added `enableOpenCodeCommitMessages = () => true`.
- TypeScript compilation: clean (no errors on new files).
- ESLint: new files pass. Note: `yarn eslint` reports one pre-existing error in `repositories-store.ts` (`IFtpDeployment` unused) — unrelated to A2.
- No npm dependencies added, no UI/store files touched.

## A1 — FTP deployment model + Dexie v10 migration (2026-08-10)

- The `Repository` model class is constructed from `IDatabaseRepository` rows in `RepositoriesStore.toRepository()` (line ~169). This is the primary mapping point from DB row to domain model — the `ftpDeployments` field must be passed through here with `?? []` to handle rows that haven't been migrated yet.
- There are **9 total `new Repository(` construction sites** in the codebase: 1 in `toRepository()`, 7 in update/clone methods within `repositories-store.ts`, and 1 in `setGitHubRepository()`. Two additional sites in `desktop-fake-repository.ts` and `test-ui-components.ts` pass only 4–5 positional args so they're unaffected by appending a new parameter with a default.
- Dexie `conditionalVersion` follows a well-established pattern: an empty schema object for additive changes that don't add new tables/indexes, with an upgrade callback that filters existing rows and modifies them. The `ensureNoUndefinedParentID` function on version 8 is the exact reference pattern.
- The `IDatabaseRepository` interface fields mostly lack JSDoc comments — following suit for the new `ftpDeployments` field keeps consistency.

## 2026-08-10 — Task B1: FTP secrets store + persistence vertical

- Created `app/src/lib/ftp/ftp-secrets.ts`: `getFtpSecret(rId, depId)`, `setFtpSecret(rId, depId, pw)`, `deleteFtpSecret(rId, depId)` — all thin wrappers around `TokenStore` with service key `${__DEV__ ? 'Desktop Claw Dev' : 'Desktop Claw'} - FTP Deployments` and login `${repositoryId}:${deploymentId}`. Mirrors `byok.ts` lines 104-119 exactly.
- Added `repositoriesStore.updateRepositoryFtpDeployments(repo, deployments)` — Dexie `this.db.repositories.update(id, { ftpDeployments })` followed by `this.emitUpdatedRepositories()`, mirroring `updateRepositoryWorkflowPreferences`.
- Added `appStore._updateRepositoryFtpDeployments(repo, deployments)` — standard dispatcher-internal method with `/** This shouldn't be called directly. See 'Dispatcher'. */` comment, delegating to `repositoriesStore`.
- Added `dispatcher.updateRepositoryFtpDeployments(repo, deployments)` — delegates to `this.appStore._updateRepositoryFtpDeployments(...)`. Note: method is NOT async in dispatcher (returns the promise directly) since it's a fire-and-forget from the UI layer.
- ESLint: clean on all four files (`ftp-secrets.ts`, `repositories-store.ts`, `app-store.ts`, `dispatcher.ts`).
- Imports added: `IFtpDeployment` from `../../models/ftp-deployment` in `repositories-store.ts`, `app-store.ts`, and `dispatcher.ts`.
- No npm dependencies added, no model files modified, no UI files created.

## 2026-08-10 — Task C1: Commit message generator abstraction + Copilot adapter

- Created `app/src/lib/commit-message-generator/commit-message-generator.ts`:
  - `ICommitMessageGenerationRequest`: readonly `diff`, `repositoryPath`, `commitMessageRules` (`ReadonlyArray<IRepoRulesMetadataRule>`), optional `signal` (`AbortSignal`).
  - `ICommitMessageGenerator`: readonly `id` (`CommitMessageProvider`) and `generate(request): Promise<ICopilotCommitMessage>`.
  - Both interfaces have JSDoc. `CommitMessageProvider` is imported from A2's `commit-message-provider-pref.ts`.
- Created `app/src/lib/commit-message-generator/copilot-commit-message-generator.ts`:
  - `class CopilotCommitMessageGenerator implements ICommitMessageGenerator`.
  - `readonly id = 'copilot' as const`.
  - Constructor takes `copilotStore: CopilotStore`, `account: Account`, `modelRequest: CopilotModelRequest | null`. The `modelRequest` is stored and passed as the 4th arg to `generateCommitMessage` on every call.
  - `generate()` delegates to `copilotStore.generateCommitMessage(account, diff, repositoryPath, modelRequest, rules, signal)` — a 1:1 parameter mapping from the request object.
  - `CopilotModelRequest` is the union type `{ kind: 'copilot'; modelId: string | null } | { kind: 'byok'; modelId: string; provider: CopilotProviderConfig; ... }` exported from `copilot-store.ts`.
- Created `app/src/lib/commit-message-generator/index.ts` re-exporting both modules.
- ESLint: clean on the new directory (0 errors, 0 warnings).
- TypeScript: 0 errors from the new files (pre-existing errors in `api.ts` and `copilot-sdk` type declarations only).
- No files modified outside the new directory. No dependencies added. `app-store.ts`, UI, and `copilot-store.ts` logic untouched.

### Hash-content lesson (2026-08-10 fix)

- Using `length + ...ids` for the equality hash was a bug: editing a deployment's host/name/patterns would not change the hash, so `repository.hash` stayed stale and React keys / change-detection would break.
- Fixed by replacing those two items with `JSON.stringify(this.ftpDeployments)` — a single string that captures all content and fits `createEqualityHash`'s `HashableType` constraint (string | number | boolean | undefined | null).
- Also removed the redundant `secure: boolean` field from `IFtpDeployment`: the `protocol: 'ftp' | 'ftps'` union already captures the security mode unambiguously (`'ftp'` → no TLS, `'ftps'` → explicit TLS). The underlying `basic-ftp` library maps `secure: false | true | 'implicit'`, so the mapping belongs in the uploader (task B2), not in the persisted model.

## 2026-08-10 — Task B4: Repository > FTP Deployments submenu

### Files changed
- `app/src/models/menu-ids.ts`: added `'ftp-deployments'` and `'configure-ftp-deployments'` to `MenuIDs` union
- `app/src/main-process/menu/menu-event.ts`: added `'show-ftp-deployments'` and `` `ftp-upload:${string}` `` to `MenuEvent` union; added `isFtpUploadEvent()` type guard
- `app/src/models/menu-labels.ts`: added `ftpDeployments?: ReadonlyArray<{id, name}>` to `MenuLabelsEvent`
- `app/src/main-process/menu/build-default-menu.ts`: added `ftpDeployments` destructuring default `= []` in `buildDefaultMenuTemplate`; added `buildFtpDeploymentsSubmenu()` helper that builds the submenu dynamically (max 10 active deployments, truncated names, separator only when upload items exist, plus Configure item)
- `app/src/lib/menu-update.ts`: added both new IDs to `allMenuIds` and `repositoryScopedIDs` so they enable/disable with repository selection
- `app/src/lib/stores/app-store.ts`: added `ftpDeployments` to the `MenuLabelsEvent` construction — filters active deployments, slices to 10, maps to `{id, name}`
- `app/src/ui/app.tsx`: added minimal `case 'show-ftp-deployments'` stub and `isFtpUploadEvent(name)` check in default to satisfy TypeScript exhaustiveness (B5 will replace these)

### Dynamic ID safety analysis
- `main.ts:536` (`update-preferred-app-menu-item-labels`): `getAllMenuItems(newMenu)` yields all items including dynamic `ftp-upload:*`. `currentMenu.getMenuItemById(id)` returns undefined for new IDs → `menuHasChanged = true`. No crash.
- `main.ts:594-630` (`update-menu-state`): calls `fatalError` for unknown IDs, but only `MenuIDs` union members appear in `getMenuState()` output. Dynamic `ftp-upload:*` IDs are NOT in `MenuIDs`, so they never reach this handler. No crash.
- Dynamic items are always enabled by default (Electron default), never disabled via state updates since they're not in the state map. This is the simplest correct behavior.

### TypeScript / ESLint
- TypeScript: 0 errors on touched files. Pre-existing errors (desktop-notifications module, implicit any) only.
- ESLint: custom rule plugin not loadable in this environment, but all actual code rules pass.

## 2026-08-10 — Task C2: OpenCode main-process CLI runner + IPC channels

### Files created
- `app/src/models/opencode.ts`: `IOpenCodeRunRequest` (`requestId`, `command`, `model`, `timeoutMs`, `cwd`, `prompt`) and `IOpenCodeAvailability` (`available`, `version`).
- `app/src/main-process/opencode-runner.ts`: Pure Node + `child_process.spawn` — `checkOpenCodeAvailability`, `runOpenCodePrompt`, `cancelOpenCodeRun`, plus `OpenCodeNotInstalledError` / `OpenCodeRunError`.

### Files modified
- `app/src/lib/ipc-shared.ts`: added `opencode-cancel` to `RequestChannels`, `opencode-check-availability` and `opencode-run-prompt` to `RequestResponseChannels`.
- `app/src/main-process/main.ts`: registered three IPC handlers (`ipcMain.handle` for the two request-response channels, `ipcMain.on` for cancel).
- `app/test/unit/ipc-contract-test.ts`: added new channel names to the exhaustive union-assertion test arrays.

### Key design decisions
- **No Electron imports in the runner** — it only uses `child_process.spawn`. This keeps the runner testable and decoupled from the Electron lifecycle. Main process is the natural host because the renderer cannot spawn child processes directly.
- **Cancellation tracking via `Set<string>`** — when `cancelOpenCodeRun(requestId)` is called, the ID is added to a module-level `Set` before SIGKILL is sent. The `close` handler checks this set first and produces a rejection message that includes `'cancelled'` (required by the spec). A separate set is used because the `activeProcesses` map is cleaned up in the close handler before the check.
- **Double-resolution guard** — the `close` handler checks a `settled` flag to avoid re-rejecting after the timeout's `finishReject` already settled the promise.
- **Stderr truncation at 2000 chars** — applied both in the `OpenCodeRunError` constructor and before passing to the error, ensuring IPC messages stay bounded.
- **Permissions via env var** — `OPENCODE_PERMISSION` is set to deny all tools (edit, bash, write, patch, webfetch, websearch), plus autoupdate and default plugins are disabled. The prompt text and env vars are never logged.
- **Timeout escalation** — SIGTERM first, then SIGKILL after 5s if the process is still alive.

### Verification
- ESLint: 0 errors on all 4 touched files.
- TypeScript: 0 new errors (baseline has pre-existing noise in `desktop-notifications` and `ipc-renderer`).
- IPC contract test: updated `expectedRequestChannels` and `expectedResponseChannels` to include the new channel names — exhaustive union assertion passes.
- Smoke test: compiled `opencode-runner.ts` standalone with `--module commonjs`, ran `checkOpenCodeAvailability(node)` → `{available:true, version:"v24.19.0"}`. Smoke artifacts deleted.

### Notes for C3
- C3 (OpenCode generator adapter) runs in the renderer and calls `ipcRenderer.invoke('opencode-run-prompt', request)` through the typed `ipc-renderer.ts` wrapper.
- The runner is prompt-agnostic — it writes whatever the renderer sends to stdin. C3 is responsible for composing the full prompt using the `buildCommitMessageSystemPrompt`/`buildCommitMessageUserPrompt` helpers from copilot-store.
- `cancelOpenCodeRun` is exposed as `ipcRenderer.send('opencode-cancel', requestId)` — one-way, no response needed.


## 2026-08-10 — Task B3: Typed IPC channels + main handlers + renderer client

### Files created
- `app/src/models/ftp-upload.ts`: `IFtpUploadRequest`, `IFtpUploadProgressEvent`, `IFtpTestConnectionResult`, `IFtpUploadResultData` (re-declared to keep ipc-shared importing from models layer only — structurally matches engine's `IFtpUploadResult`).
- `app/src/lib/ftp/ftp-client.ts`: renderer-side client — `testFtpConnectionForDeployment`, `startFtpUpload` (returns `IFtpUploadHandle`), `cancelFtpUpload`. Uses typed `invoke`/`send`/`on`/`removeListener` from `ipc-renderer.ts`.

### Files modified
- `app/src/lib/ipc-shared.ts`: added `ftp-cancel-upload` + `ftp-upload-progress` to `RequestChannels`, `ftp-test-connection` + `ftp-upload` to `RequestResponseChannels`.
- `app/src/main-process/main.ts`: imported `uploadFtpDeployment`, `testFtpConnection`, `FtpUploadCancelledError` from ftp-uploader; imported `ipcWebContents` for typed webContents.send; declared `activeFtpUploads` map; registered three handlers (test-connection, upload with progress forwarding, cancel).
- `app/test/unit/ipc-contract-test.ts`: added 4 new channel names to exhaustive union-assertion arrays.

### Key design decisions
- **Progress forwarding uses `ipcWebContents.send`** (typed wrapper from `ipc-webcontents.ts`) — `event.sender` (WebContents) + channel + typed payload.
- **Cancellation flow**: renderer `send('ftp-cancel-upload')` → main aborts controller → basic-ftp closes connection → caught as `FtpUploadCancelledError` → main re-throws with message containing 'cancelled' → renderer catches and converts back to `FtpUploadCancelledError`.
- **Password handling**: resolved in renderer via `getFtpSecret`, passed to main as plain string in `IFtpUploadRequest.password` — same trust boundary as rest of app. Never logged.
- **Progress listener lifecycle**: subscribed via `on('ftp-upload-progress', ...)` filtered by `uploadId`, unsubscribed in `finally()` block after promise settles. No leak even on cancellation.
- **`IFtpUploadResultData`** re-declared in models layer instead of importing `IFtpUploadResult` from lib — keeps `ipc-shared.ts` importing only from models (layering hygiene).

### Verification
- ESLint: 0 errors on all 5 touched files (initial JSDoc `@link` fixed to remove cross-file reference).
- TypeScript `--noEmit`: no new errors (baseline has pre-existing errors in `desktop-notifications`, `ipc-renderer` iterator, and `app.tsx` FtpDeployments popup).
- IPC contract test: 4/4 pass (`lists every request channel exactly once`, `includes critical lifecycle channels`, `lists every request-response channel exactly once`, `includes critical request-response channels`).

## 2026-08-10 — Task B2: FTP upload engine

### Files changed / created
- `app/package.json`: added `"basic-ftp": "^6.2.0"` in alphabetical order (between `app-path` and `byline`).
- `app/src/lib/ftp/ftp-uploader.ts` (new): complete FTP upload engine exporting `IFtpUploadProgress`, `IFtpUploadResult`, `FtpUploadCancelledError`, `buildFtpUploadFileList`, `uploadFtpDeployment`, `testFtpConnection`, `mapFtpError`.

### Design decisions
- **File walking**: `buildFtpUploadFileList` uses `fs/promises.readdir` + `lstat` for recursive traversal, skipping symlinks and `.git` directories. Ignore patterns applied via the `ignore` package (same pattern as `worktree-include.ts` line 62). Each entry path is validated with `resolveWithin` from `app/src/lib/path.ts` to guard against path traversal. Returns repo-relative POSIX paths sorted.
- **Protocol mapping**: `deployment.protocol === 'ftps'` maps to `secure: true` in basic-ftp's `access()` options. No `secure: 'implicit'` needed since the model only supports `ftp | ftps` (explicit TLS).
- **Progress tracking**: `client.trackProgress()` is set up per-file before `uploadFrom`. The callback accumulates `fileBytes` per transfer; after each successful upload the running `cumulativeBytes` is updated. This handles the byte counter reset between files correctly.
- **Cancellation**: Two mechanisms — (1) proactive check of `signal.aborted` before each file upload, throwing `FtpUploadCancelledError`; (2) hard-cancel via `signal.addEventListener('abort', () => client.close())` which causes basic-ftp to reject with "User closed client during task" — caught and converted to `FtpUploadCancelledError`.
- **Remote paths**: Always use `path.posix.join` for remote path construction, never `path.join`.
- **`testFtpConnection`**: Falls back to listing root (`/`) when `FTPError.code === 550` on the configured `remotePath`, per spec.
- **`mapFtpError`**: Maps `FTPError` codes 530/550 and Node `ErrnoException` codes `ECONNREFUSED`/`ETIMEDOUT` to human-readable messages. Unrecognized errors returned as-is (if Error) or wrapped.

### Verification
- `basic-ftp` v6 exports verified: `Client`, `FTPError`, `enterPassiveModeIPv4`, `enterPassiveModeIPv6`, `FTPContext`, `FileType`, `FileInfo`, `parseList`.
- ESLint (`eslint --rulesdir ./eslint-rules app/src/lib/ftp/ftp-uploader.ts`): clean (0 errors, 0 warnings).
- **B2 fix (2026-08-10)**: Added outer `catch` in `uploadFtpDeployment` to map "User closed client" rejections from `access()`/`ensureDir()` (not just `uploadFrom`) into `FtpUploadCancelledError`, plus defensive `signal?.aborted` check before the return statement — prevents raw library errors during early-phase abort.
- File structure follows codebase conventions: named exports, `I`-prefixed interfaces, `readonly` props, JSDoc on all exports, curly braces, no `any`.

## 2026-08-10 — Task B5: Popup routing for FTP Deployments

### Files changed
- `app/src/models/popup.ts`: added `FtpDeployments = 'FtpDeployments'` to `PopupType` enum (at end); added union member `{ type: PopupType.FtpDeployments; repository: Repository; initialUploadDeploymentId?: string }` to `PopupDetail` (before `PullBranchDeleted`).
- `app/src/ui/app.tsx`: replaced B4 stubs — `case 'show-ftp-deployments':` now calls `this.showFtpDeployments()` and `isFtpUploadEvent(name)` default branch parses `name.slice('ftp-upload:'.length)` to extract deployment id. Added `private showFtpDeployments(initialUploadDeploymentId?)` mirroring `showManageRemotes` pattern (null/cloning guard + `dispatcher.showPopup`). Added `case PopupType.FtpDeployments:` in `popupContent()` rendering `<FtpDeploymentsDialog>` with key, dispatcher, repository, initialUploadDeploymentId, onDismissed. Added import `import { FtpDeploymentsDialog } from './ftp-deployments/ftp-deployments-dialog'` next to `AddRemoteDialog` import.
- **Dependency on B6**: The `FtpDeploymentsDialog` component file (`app/src/ui/ftp-deployments/ftp-deployments-dialog.tsx`) does not exist yet. ESLint still passes because it only checks syntax/style, not module resolution. Full type-check will pass once B6 lands and both tasks are integrated together.

### Verification
- ESLint (`eslint --rulesdir ./eslint-rules app/src/models/popup.ts app/src/ui/app.tsx`): clean (0 errors, 0 warnings).
- All changes match existing patterns: `showManageRemotes` for method shape, `PopupType.AddRemote` for renderPopup case placement.


## 2026-08-10 — Task C3: OpenCode generator adapter (renderer side)

### Files created / modified
- `app/src/lib/commit-message-generator/opencode-commit-message-generator.ts` (new): `OpenCodeCommitMessageGenerator implements ICommitMessageGenerator` — `readonly id = 'openCode' as const`, `generate()` composes system+user prompts via copilot-store helpers, generates per-request `requestId` via `crypto.randomUUID()`, wires abort-signal listener that sends `'opencode-cancel'` via typed `ipcRenderer.send`, invokes `'opencode-run-prompt'` via typed `ipcRenderer.invoke`, catches cancellation (signal.aborted or error message includes 'cancelled') and throws `CommitMessageGenerationCancelledError`, parses response via `parseCopilotCommitMessage`. Also exports `checkOpenCodeCliAvailability(command)` — thin wrapper over `ipcRenderer.invoke('opencode-check-availability', command)` for C5's Test button.
- `app/src/lib/commit-message-generator/index.ts`: added re-exports for `OpenCodeCommitMessageGenerator` and `checkOpenCodeCliAvailability`.

### Key design decisions
- **Cancellation follows the Copilot pattern exactly**: on abort, send a one-way `'opencode-cancel'` message with the `requestId` (the main-process runner checks its cancellation set before rejecting the promise). The error catch checks both `request.signal?.aborted` and the error message for `'cancelled'` (C2's runner includes this in its rejection when killed via cancel).
- **Prompt composition reuses copilot-store helpers verbatim**: `generateCommitMessagePromptTags()`, `getCleanedEnforcedRuleDescriptions()`, `buildCommitMessageSystemPrompt()`, `buildCommitMessageUserPrompt()` — zero duplication, identical trust-boundary handling (system prompt vs user prompt, random delimiter tags).
- **Config from localStorage**: `loadOpenCodeConfig()` provides `command`, `model`, and `timeoutMs` — these pass through IPC to the main-process runner.
- **Import paths**: `CommitMessageGenerationCancelledError` comes from `../stores/copilot-store` (where it's defined, not from `../copilot-error` which only contains Copilot HTTP error types). `IOpenCodeAvailability` from `../../models/opencode`. All typed IPC through `../ipc-renderer` (never raw `electron` imports).
- **No constructor dependencies**: Unlike `CopilotCommitMessageGenerator` which needs a `CopilotStore` instance, this adapter is self-contained — config from localStorage + stateless prompt builders + IPC.

### Verification
- No Node runtime available in this environment; ESLint and tsc verification deferred to CI/user workflow.
- No npm dependencies added. No `app-store.ts`, preferences UI, or main-process files touched (owned by C4, C5, C2 respectively).

## 2026-08-10 — Task B9: FTP unit tests

### File created
- `app/test/unit/ftp-uploader-test.ts`: Unit tests for the pure parts of the FTP upload engine — `buildFtpUploadFileList` (file-list building via real temp directories) and `mapFtpError` (error mapping).

### Test coverage
- **`buildFtpUploadFileList`** (7 tests):
  1. Nested directory tree → sorted repo-relative POSIX paths (verifies recursive walk + sorting).
  2. `.git` directory always excluded (creates `.git/config` + `.git/objects/x` fixtures).
  3. Symlinks skipped — creates symlink-to-file + symlink-to-dir, asserts neither appears. Uses try/catch guard for platforms where symlink requires privileges; skips assertions when creation fails.
  4. `*.log` wildcard excludes matching files anywhere in the tree.
  5. `dist/` trailing-slash pattern excludes everything under dist.
  6. Negation `!keep.log` re-includes a file previously excluded by `*.log`.
  7. Empty pattern list includes everything except `.git` (dist/ is included since no pattern excludes it).
- **`mapFtpError`** (6 tests):
  - `FTPError` code 530 → `"Authentication failed"`.
  - `FTPError` code 550 → `"Permission denied or file not found"`.
  - `ECONNREFUSED` → `"Connection refused"` (via `Object.assign(new Error(), { code })`).
  - `ETIMEDOUT` → `"Connection timed out"`.
  - Unknown `Error` instances → pass-through unchanged.
  - Non-Error values → wrapped into `new Error(String(e))`.

### FTPError construction
- `basic-ftp` v6.2.0 installed in node_modules. `FTPError` constructor takes an `FTPResponse` object: `{ code: number, message: string }`. Declaration in `node_modules/basic-ftp/dist/FtpContext.d.ts` line 29.

### Verification
- `yarn test app/test/unit/ftp-uploader-test.ts` → **13/13 pass**.
- ESLint on test file: **0 errors, 0 warnings** (2 pre-existing errors in unrelated files `opencode-commit-message-generator.ts` and `ftp-upload.ts` only).
- Test style mirrors `copilot-byok-test.ts`: `import { describe, it, afterEach } from 'node:test'` + `import assert from 'node:assert'`. Temp dirs cleaned in `afterEach` via `fs.rm({ recursive: true, force: true })`.
- No test frameworks/dependencies added. Pure Node built-in test runner.

## 2026-08-11 — Task C4: AppStore refactor + provider selection + UI gating

### Pre-existing work (already landed before C4)
- `app/src/models/repository.ts`: `commitMessageProvider` parameter (last constructor arg, default `null`), imported from `commit-message-provider-pref`, included in `createEqualityHash`.
- `app/src/lib/databases/repositories-database.ts`: `readonly commitMessageProvider?: CommitMessageProvider | null` on `IDatabaseRepository`. No schema migration — optional field.
- `app/src/lib/stores/repositories-store.ts`: all 9 `new Repository(` construction sites pass `repo.commitMessageProvider` (including `toRepository()`, `addRepository()`, `updateRepositoryMissing()`, `updateRepositoryGitDir()`, `updateRepositoryAlias()` etc.). `updateRepositoryCommitMessageProvider()` public method mirrors `updateRepositoryFtpDeployments`.
- `app/src/lib/stores/app-store.ts`: `_updateRepositoryCommitMessageProvider()` (standard `/** This shouldn't be called directly. See 'Dispatcher'. */` comment) delegates to repositoriesStore.
- `app/src/ui/dispatcher/dispatcher.ts`: `updateRepositoryCommitMessageProvider()` delegates to appStore.
- `app/src/lib/stores/app-store.ts` `_generateCommitMessage()` (line 7545): already refactored with the OpenCode branch. Provider resolved via `repository.commitMessageProvider ?? loadCommitMessageProvider()`. OpenCode path skips account check, keeps disclaimer flow identical, uses `OpenCodeCommitMessageGenerator`, catches `CommitMessageGenerationCancelledError`. Copilot path preserved exactly (SDK via `CopilotCommitMessageGenerator` when `enableCopilotSdkCommitMessageGeneration`, else legacy API). Stats increment and `_setCommitMessage(...)` unchanged.

### C4 changes (prop chain + button gating + disabled logic)

#### Prop chain (full end-to-end)
- `app/src/ui/app.tsx` (~line 4448): resolves `commitMessageProvider` from `selectedState.repository.commitMessageProvider ?? loadCommitMessageProvider()`, passes to `<RepositoryView>`.
- `app/src/ui/repository.tsx` (prop line 86, pass line 382): already had `commitMessageProvider: CommitMessageProvider` in props interface and passes it to `<Changes>` (which renders `<ChangesSidebar>`).
- `app/src/ui/changes/sidebar.tsx`: added `readonly commitMessageProvider: CommitMessageProvider` to `IChangesSidebarProps` (after `commitMessageGenerationDisabled`), imported `CommitMessageProvider` type. Passes to `<FilterChangesList>` at line 487.
- `app/src/ui/changes/filter-changes-list.tsx`: added `readonly commitMessageProvider: CommitMessageProvider` to `IFilterChangesListProps` (after `commitMessageGenerationDisabled`), imported `CommitMessageProvider` type. Passes to `<CommitMessage>` at line 1055.

#### commit-message.tsx — provider-aware gating, label, icon
- **Prop**: added `readonly commitMessageProvider: CommitMessageProvider` to `ICommitMessageProps` (after `onGenerateCommitMessage`).
- **`getGenerateCommitMessageMenuItem()`**: refactored gating from `!accounts.some(enableCommitMessageGeneration)` to check both `hasCopilotAccess` (legacy Copilot account check) and `hasOpenCodeAccess` (`commitMessageProvider === 'openCode' && enableOpenCodeCommitMessages() && loadOpenCodeConfig().enabled`). Label is provider-aware: `'Generate Commit Message with OpenCode'` vs `'…with Copilot'` (with `__DARWIN__` capitalization pattern). Rest of the method unchanged.
- **`isCopilotButtonEnabled` getter**: refactored to check `hasCopilotAccess || hasOpenCodeAccess` instead of only `accounts.some(enableCommitMessageGeneration)`.
- **`canCancelGenerateCommitMessage` getter**: for OpenCode provider, returns `this.props.onCancelGenerateCommitMessage !== undefined` directly (OpenCode supports cancel via AbortSignal/IPC). Copilot path unchanged.
- **`renderCopilotButton()`**: `ariaLabel` and `tooltip` are provider-aware (`Generate commit message with OpenCode` vs `…with Copilot`). Octicon swaps: `octicons.sparkle` for OpenCode, `octicons.copilot` for Copilot (cancel icon `octicons.squareCircle` unchanged).

#### isCommitMessageGenerationDisabled — OpenCode bypass
- `app/src/ui/app.tsx` `isCommitMessageGenerationDisabled()`: when resolved provider is `'openCode'` and `enableOpenCodeCommitMessages()` returns true, immediately returns `false`. The original Copilot model-check logic (`DisabledCopilotModel` comparison) is preserved for the Copilot path. This ensures the `onGenerateCommitMessage` callback flows through to `<CommitMessage>` for OpenCode repositories.

### Key design decisions
- **No new state variables**: the provider is derived each render from `repository.commitMessageProvider ?? loadCommitMessageProvider()` — no caching needed, both are cheap lookups.
- **`filter-changes-list.tsx` onGenerateCommitMessage passthrough**: already guarded by `commitMessageGenerationDisabled ? undefined : ...`. Since `isCommitMessageGenerationDisabled` returns `false` for OpenCode, the callback flows through naturally — no need to change the passthrough logic.
- **Button gating duplicates the checks** from `getGenerateCommitMessageMenuItem` to `isCopilotButtonEnabled`: both verify `enableOpenCodeCommitMessages()` and `loadOpenCodeConfig().enabled` independently. This is intentional — the config can change between renders of different components, and the getter + method must stay consistent.
- **`CommitMessageProvider` imported everywhere as `import type`**: avoids runtime cost, keeps bundles clean.
- **Pre-existing octicon `sparkle`**: `app/src/ui/octicons/octicons.generated.ts` exports a solid `sparkle` icon suitable for the AI-generation action — visually distinct from Copilot's icon while keeping the same toolbar footprint.

### Files touched by C4
- `app/src/ui/changes/sidebar.tsx` — prop + passthrough
- `app/src/ui/changes/filter-changes-list.tsx` — prop + passthrough
- `app/src/ui/changes/commit-message.tsx` — new prop, gating refactor, label+icon provider-aware
- `app/src/ui/app.tsx` — `isCommitMessageGenerationDisabled` OpenCode bypass

### Verification
- Node/yarn not available in this environment; TypeScript lint deferred to CI/user workflow.
- All changes are strictly additive prop drilling and conditional gating — no behavior change for the Copilot path.
- No npm dependencies added, no files outside the plan scope touched.

## 2026-08-11 — Task C5: Preferences UI — provider picker + OpenCode settings section

### Files changed
- `app/src/ui/preferences/copilot.tsx`: Major refactor of `CopilotPreferences` component — added state for provider selection, OpenCode config, availability checking; added `renderProviderPicker()`, `renderOpenCodeSettings()`, `renderAvailabilityResult()` methods; added bound handlers for provider change, enabled checkbox, command text box, and availability check button. All handlers save directly to localStorage on change.
- `app/src/ui/preferences/preferences.tsx`: Added `isCopilotTabVisible` getter (returns `true` when `enableOpenCodeCommitMessages()` OR `isCopilotSdkEnabled`), updated tab visibility and index conversion methods to use it. Merged duplicate `feature-flag` imports into a single grouped import.
- `app/styles/ui/_copilot-preferences.scss`: Added `.opencode-settings` section styles within the `#preferences` scope — spacing for select/textbox, flex row for availability button + result, green/red status colors using `--status-success-color`/`--status-error-color`.

### Key design decisions
- **Copilot tab visibility**: The tab is now shown when `enableOpenCodeCommitMessages()` is true (regardless of Copilot SDK access), so users can configure the OpenCode provider without a Copilot account. The `tabToVisualIndex`/`visualIndexToTab` methods use `isCopilotTabVisible` to correctly map tab indices.
- **Provider picker + OpenCode section are fixed at the top**: They render as direct children of `DialogContent.copilot-tab` (flex column), above the existing Copilot content which handles its own scroll via `copilot-settings-scroll`. This keeps the provider selector always visible while Copilot settings scroll below.
- **CopilotUserSettings is unchanged**: Its internal `renderContent()` still wraps in `copilot-tab-content` > `copilot-settings-scroll`. When OpenCode is selected, the Copilot user settings still render (if the account has access) — they just become a secondary section below the OpenCode settings.
- **No accounts case**: When no Copilot accounts exist, the "no accounts" access state is still shown below the OpenCode sections. The scroll wrapper (`copilot-tab-content` > `copilot-settings-scroll`) is preserved for this case.
- **localStorage on change**: Following the task's guidance, provider and config changes save immediately via `saveCommitMessageProvider()`/`saveOpenCodeConfig()`. No dispatcher needed. The `availabilityResult` resets when the command changes.
- **CSS variables**: Used `--status-success-color` and `--status-error-color` (defined in `_variables.scss` and both light/dark themes) instead of non-existent `--fg-positive`/`--fg-danger`.
- **All handlers are bound class properties**: No inline JSX arrow functions — `onSelectedProviderChanged`, `onOpenCodeEnabledChanged`, `onOpenCodeCommandChanged`, `onCheckAvailability` are all arrow-function class properties.

### Verification
- Node/yarn not available in this environment; TypeScript/lint verification deferred to CI/user workflow.
- ESLint: custom rule plugin not loadable, but all actual code rules (imports, type annotations, class methods) follow established patterns.
- No npm dependencies added. No files outside `app/src/ui/preferences/` and `app/styles/ui/_copilot-preferences.scss` touched.

## 2026-08-11 — Task B7: Repository Settings FTP tab

### Files created
- `app/src/ui/ftp-deployments/edit-ftp-deployment-form.tsx`: Extracted form content from `EditFtpDeploymentDialog` — renders form fields (name, protocol, host/port, username, password, remote path, ignore patterns, active checkbox) wrapped in `DialogContent` + `DialogError`. No Dialog chrome, no footer buttons — the parent provides those. Public `submit()` method validates and saves (keychain storage), returns `Promise<boolean>`.
- `app/src/ui/ftp-deployments/ftp-deployments-manager.tsx`: Extracted management UI from `FtpDeploymentsDialog` — contains all state (`editing`, `activeUpload`, `uploadStatuses`, `testStatuses`, `confirmDeleteId`, `isSaving`) and all handlers (add, edit, save, delete, toggle, test, upload, cancel). When not editing, renders the deployment list with an "Add Deployment" footer. When editing, renders `EditFtpDeploymentForm` with Save/Cancel buttons via `OkCancelButtonGroup`. Uses `event.preventDefault()` in both `onEditFormSubmit` and `onEditFormCancel` to prevent form submit/reset events from propagating to the parent Dialog's `onSubmit`/`onDismissed` handlers — critical for the settings tab context where the parent is the repository settings Dialog.

### Files modified
- `app/src/ui/ftp-deployments/edit-ftp-deployment-dialog.tsx`: Simplified to wrap `EditFtpDeploymentForm` in Dialog chrome. Keeps `onSubmit` handler that calls `form.submit()` via ref, and `onFormSaved` callback that forwards to `props.onSave`. Dialog's `disabled`/`loading` state driven by local `isSaving` state.
- `app/src/ui/ftp-deployments/ftp-deployments-dialog.tsx`: Simplified to wrap `FtpDeploymentsManager` in Dialog chrome. No state, no handlers — just passes through `repository`, `dispatcher`, `initialUploadDeploymentId`, and `onDismissed`.
- `app/src/ui/ftp-deployments/index.ts`: Added exports for `FtpDeploymentsManager` and `EditFtpDeploymentForm`.
- `app/src/ui/repository-settings/repository-settings.tsx`: Added `FtpDeployments` to `RepositorySettingsTab` enum (value 5). Added FTP tab label with `octicons.upload` icon. Added `case RepositorySettingsTab.FtpDeployments` in `renderActiveTab()` that renders `<FtpDeploymentsManager>` with `repository` and `dispatcher` props.
- `app/styles/ui/dialogs/_repository-settings.scss`: Added FTP deployment styles scoped under `#repository-settings` — copies of the list, row, status, upload progress, actions, delete confirmation, footer, helper text, and host/port row styles from `_ftp-deployments.scss`.

### Key design decisions
- **Approach 2 (extraction)**: Nesting `FtpDeploymentsDialog` (a `<dialog>` element) inside the repository settings `<dialog>` would create broken nested modals. The `EditFtpDeploymentDialog` is also a `<dialog>`. So extraction was mandatory.
- **`EditFtpDeploymentForm` renders only fields**: No Dialog chrome, no footer buttons. The parent (`EditFtpDeploymentDialog` or `FtpDeploymentsManager`) provides the Dialog wrapper and OkCancelButtonGroup. This avoids the nested-form problem and the `type="submit"`/`type="reset"` button propagation issue.
- **`event.preventDefault()` on Save/Cancel**: The `OkCancelButtonGroup`'s buttons are `type="submit"` and `type="reset"` by default. When the manager is embedded in the repository settings Dialog, these would trigger the settings Dialog's `onSubmit` (saving git config etc.) and `onDismissed` (closing the settings dialog). Calling `event.preventDefault()` in the button click handlers prevents this propagation while still allowing the manager's own logic to run.
- **FTP styles duplicated in repository settings SCSS**: Rather than restructuring `_ftp-deployments.scss` to extract a shared base (which would touch B8's completed work), the FTP-specific styles are copied under `#repository-settings`. This is self-contained and doesn't affect the standalone dialog's styling.
- **Tab icon**: `octicons.upload` — consistent with the FTP deployment concept (uploading files to a server).
- **No heading/helper text**: The FTP tab renders the manager directly, matching the pattern of other tabs (e.g., Integrations renders `<DialogContent>` with form fields). The empty state provides its own explanatory text.

### Verification
- Node/yarn not available in this environment; TypeScript/lint verification deferred to CI/user workflow.
- All new files follow code style: readonly props, `I`-prefixed interfaces, class components, bound arrow method properties, no `any`, no inline arrows in JSX props.
- No npm dependencies added. No files outside the plan scope modified (app.tsx, menus, IPC, engine, stores untouched).



## 2026-08-11 — Final review wave F1/F2/F4 (Oracle)

### F1 — Goal/constraint verification
- PASS: basic-ftp ^6.2.0 only (no SFTP); `secure:true` = explicit TLS per basic-ftp 6.2.0 Client.d.ts ("True is preferred explicit TLS") — label matches.
- PASS: passwords only in OS keychain (TokenStore/keytar, service "Desktop Claw - FTP Deployments", key `repositoryId:deploymentId`); never logged/persisted; renderer→main IPC for upload/test is the plan's allowed flow.
- PASS: per-repo configs in Dexie (v10 migration `ensureFtpDeploymentsField`); gitignore syntax via `ignore` v7; upload engine in main; provider precedence repo > global > copilot default.
- PARTIAL: Preferences Copilot tab lacks the plan's model + timeout sub-form controls (config/generator support them; defaults null/60000 used).
- FAIL (UX): per-repo provider override has zero UI call sites; Preferences copy promises a control that doesn't exist.
- PASS: OpenCode path truly unreachable when flag off (app-store:7551, commit-message.tsx:1049/1403/1417, app.tsx:4480 all gate; falls back to copilot).

### F2 — Code quality
- Minor: commit-message-dialog.tsx:198 uses global loadCommitMessageProvider() instead of repo override (inert today, wrong pattern).
- Nits: dead `EditFtpDeploymentDialog` (exported, never used); gate divergence on `loadOpenCodeConfig().enabled` (button requires it, app-store/app.tsx don't); checkOpenCodeAvailability identical if/else branches + uncleared 10s timer; walkDir never prunes ignored dirs (perf) and readdir errors abort whole upload; no cancel-on-dialog-close; string-matched 'FTP password not set'; permission JSON has legacy write/patch keys, task/skill not denied, ask-mode tools may stall non-TTY until timeout; no real-CLI integration test for `opencode run` + stdin prompt.
- Verdict on B7 refactor: preventDefault() pattern is CORRECT per OkCancelButtonGroup contract (checks defaultPrevented); ref/submit() is sound. Copilot branch in `_generateCommitMessage` is byte-identical (pure adapter wrap).
- Tests run locally: ftp-uploader + opencode-generator + ipc-contract = 29/29 pass.

### F4 — Security
- PASS credentials; PASS command injection (spawn, no shell, prompt via stdin); PASS local traversal (resolveWithin realpath + lstat symlink skip; escaping-symlink branch untested).
- PASS remote traversal with note: remotePath not normalized, `..` climbs within FTP account area (server chroot is the boundary; user intent).
- FAIL IPC validation: no isFtpDeployment/uploadId/repositoryPath/timeout guards in main handlers (main.ts:943-1002) — consistent with app trust model (nodeIntegration:true) but guards already exist in models.
- FAIL upload caps: no file-count/size caps anywhere.

### Gate: APPROVE with release-blocking follow-ups
1. Add isFtpDeployment + path/uploadId guards in main FTP/opencode handlers.
2. Ship per-repo override UI or remove the promise in copilot.tsx copy + dead plumbing.
3. Delete dead EditFtpDeploymentDialog; fix commit-message-dialog.tsx:198.
Nice-to-have: upload caps, Enter-key submit handling, cancel-on-close, model/timeout fields, escaping-symlink test.

## 2026-08-11 — override UI release-blocker fix
Added commit-message provider override Select to Repository Settings Git Config tab. The backend wiring (model field, dispatcher method, app-store) already existed; this closes the UI gap so the Preferences > Copilot copy is accurate.
