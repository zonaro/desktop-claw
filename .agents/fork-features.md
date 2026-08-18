# Fork-exclusive features (desktop-claw)

Features added on top of desktop-plus. Original plan (with execution history) in `.omo/plans/ftp-opencode-features.md`.

## 1. FTP Deployments

Deploy repository files via FTP/FTPS with per-repository configuration, ignore patterns (.gitignore syntax) and a submenu in the Repository menu.

### File map

| Layer | Files |
| --- | --- |
| Models | `app/src/models/ftp-deployment.ts` (IFtpDeployment), `app/src/models/ftp-upload.ts` (IFtpUploadRequest, progress, result) |
| FTP logic | `app/src/lib/ftp/ftp-client.ts` (basic-ftp client), `app/src/lib/ftp/ftp-secrets.ts` (TokenStore/keytar, service `"Desktop Claw - FTP Deployments"`), `app/src/lib/ftp/ftp-uploader.ts` (upload engine, main process) |
| IPC | Channels in `app/src/lib/ipc-shared.ts`: `ftp-test-connection`, `ftp-upload`, `ftp-cancel-upload`, `ftp-upload-progress` |
| Main process | handlers registered in `ipc-main.ts` (upload runs in the main process with `AbortSignal` for cancellation) |
| Menu | `app/src/main-process/menu/build-default-menu.ts` — `Repository > FTP Deployments` submenu (up to 10 dynamic items `ftp-upload:<id>` + `Configure FTP Deployments...`); `app/src/main-process/menu/menu-event.ts` — `show-ftp-deployments`, `ftp-upload:<id>` events |
| UI | `app/src/ui/ftp-deployments/` — `ftp-deployments-dialog.tsx` (list/manage), `edit-ftp-deployment-dialog.tsx` (form with ignore patterns), `ftp-deployment-list-item.tsx` |
| Routing | `PopupType.FtpDeployments` in `app/src/models/popup.ts`; render in `app/src/ui/app.tsx` (`showFtpDeployments`, `show-ftp-deployments`/`ftp-upload:` cases in `onMenuEvent`) |
| Persistence | `Repository.ftpDeployments: ReadonlyArray<IFtpDeployment>` field in `app/src/models/repository.ts` + Dexie schema (`app/src/lib/databases/repositories-database.ts`) |
| Deps | `basic-ftp` (FTP + explicit/implicit FTPS; no SFTP in v1), `ignore` (.gitignore patterns) |

### Locked rules

- Passwords only in the OS keychain (TokenStore); never in DB/localStorage/logs
- Upload in the main process; progress via IPC (`ftp-upload-progress`); cancellation via AbortSignal
- Ignore patterns per deployment, .gitignore syntax (`ignore` package)
- Access: submenu in the Repository menu + dedicated dialog

### Status

Implemented: models, Dexie schema, secrets, upload engine, IPC, menu, dialogs, popup routing, unit tests (B9).
**Pending**: FTP tab in Repository Settings (`app/src/ui/repository-settings/`) — verify before assuming it exists.

## 2. OpenCode as commit message generator (Copilot alternative)

Commit message generation via the OpenCode CLI, with a selectable abstract provider.

### File map

| Layer | Files |
| --- | --- |
| Abstraction | `app/src/lib/commit-message-generator/` — `commit-message-generator.ts` (`ICommitMessageGenerator` interface), `index.ts`, `copilot-commit-message-generator.ts` (Copilot adapter), `opencode-commit-message-generator.ts` (OpenCode adapter) |
| Runner (main process) | `app/src/main-process/opencode-runner.ts` — runs the OpenCode CLI behind typed IPC; resolves the binary via `opencode-command.ts` |
| Config | `app/src/lib/opencode/opencode-config.ts`; model `app/src/models/opencode.ts` |
| Provider selection | `Repository.commitMessageProvider: 'copilot' \| 'openCode' \| null` (per-repo override) > global config (localStorage) > Copilot default |
| UI (partial) | references in `app/src/ui/changes/commit-message.tsx`, `changes/sidebar.tsx`, `changes/filter-changes-list.tsx`, `app/src/ui/app.tsx`, `app/src/ui/dispatcher/dispatcher.ts` |

### Locked rules

- Reuses `buildCommitMessageSystemPrompt`/`buildCommitMessageUserPrompt` (from copilot-store) and `parseCopilotCommitMessage`
- CLI runs in the main process with typed duplex IPC
- Provider: repo override > global > Copilot

### Status

Implemented: provider abstraction, adapters, OpenCode runner, IPC. Feature flag/model ok.
**Pending**: OpenCode section in Preferences (`app/src/ui/preferences/` — Copilot|OpenCode radio + command/model/timeout sub-form/Test button) and OpenCode unit tests — verify before assuming they exist.

## 3. Agent tab (repository view)

An "Agent" tab after "Files" in the repository tab bar: the sidebar lists the OpenCode sessions of the current repository, the main area shows the selected conversation with a prompt box — the same shape as OpenCode's own web UI, built with desktop-claw components. User turns are aligned right, the agent's left.

### How it talks to OpenCode

By default the main process spawns **one** headless `opencode serve --port 0 --hostname 127.0.0.1` for the whole app, on demand. When `serverHost` **and** `serverPort` are set in the OpenCode config the app connects to that server instead and starts nothing (`getOpenCodeServerUrl`); changing either setting calls `dispatcher.resetOpenCodeServer()` so the cached connection is re-read. Every request is scoped to a repository with the `directory=<repo path>` query parameter, which is how a single server serves all open repositories. The renderer talks HTTP to it directly (loopback), authenticating with HTTP basic auth using a per-run random password passed to the server via `OPENCODE_SERVER_PASSWORD`.

Streaming uses `GET /event` consumed through `fetch` + a `ReadableStream` reader (not `EventSource`, which can't send an `Authorization` header). Prompts go through `POST /session/{id}/prompt_async`, which returns 204 immediately; the reply arrives as `message.updated` / `message.part.updated` events.

### File map

| Layer | Files |
| --- | --- |
| Models | `app/src/models/opencode-session.ts` (`IOpenCodeServerStatus`, `IOpenCodeSession`, `IOpenCodeMessage`, parts, `IOpenCodePermissionRequest`, `getOpenCodeErrorText`) |
| Server (main process) | `app/src/main-process/opencode-server.ts` — `ensureOpenCodeServer` / `stopOpenCodeServer` / `parseListeningUrl`; killed on `app.on('will-quit')` in `main.ts` |
| CLI lookup (main process) | `app/src/main-process/opencode-command.ts` — `resolveOpenCodeCommand` resolves the binary against PATH and the known install directories (`~/.opencode/bin`, `~/.bun/bin`, `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`). Shared with the commit-message runner |
| IPC | `opencode-server-start` in `app/src/lib/ipc-shared.ts`, handler in `main.ts` |
| HTTP client (renderer) | `app/src/lib/opencode/opencode-client.ts` — `OpenCodeClient` (sessions, messages, prompts, abort, agents, permissions, providers, revert/unrevert, file search, SSE) + `parseEventFrame` |
| Helpers | `app/src/lib/opencode/opencode-session-helpers.ts` — `getToolSummary`, `truncateToolOutput`, `isSessionBusy`, `getModelOptions`, `formatModelValue`/`parseModelValue`, `getFileReferenceQuery`, `getFileReferences` |
| Attachments | `app/src/lib/opencode/opencode-attachments.ts` — `createFileAttachment` (data URL), `createFileReference` (`file://` for `@path`), `getAttachmentMimeType` |
| Config | `app/src/lib/opencode/opencode-config.ts` — adds `serverHost`/`serverPort` + `getOpenCodeServerUrl`; fields are merged over the defaults on load so older configs survive |
| State | `IOpenCodeState` in `app/src/lib/app-state.ts` (+ `RepositorySectionTab.OpenCode`), initial value in `repository-state-cache.ts`, `_refreshOpenCodeSessions` / `_setSelectedOpenCodeSession` / `_createOpenCodeSession` / `_deleteOpenCodeSession` in `app-store.ts`, matching methods on the dispatcher |
| UI | `app/src/ui/opencode/` — `opencode-session-list.tsx` (sidebar), `opencode-conversation.tsx` (main area + event stream), `opencode-message.tsx` (markdown/reasoning/tool rendering), `opencode-prompt.tsx` (prompt box + agent picker); styles in `app/styles/ui/_opencode.scss` |
| Routing | Tab in `app/src/ui/repository.tsx`; `View > Show OpenCode` (Ctrl+5) in `build-default-menu.ts`, `show-opencode` in `menu-event.ts`/`menu-ids.ts`, handled in `app.tsx` |
| Tests | `app/test/unit/opencode-client-test.ts`, `opencode-session-helpers-test.ts`, `opencode-server-test.ts`, `opencode-command-test.ts`, `opencode-attachments-test.ts`, `opencode-config-test.ts` |

### Locked rules

- One server process for the whole app; the repository is selected per request with `directory=`, never by restarting the server
- Every OpenCode spawn goes through `resolveOpenCodeCommand` — a desktop-entry launch doesn't inherit the shell profile's PATH (see `.agents/known-problems.md`)
- The server binds to loopback with a random password; the renderer sends it as basic auth. Never expose the port or password outside the app
- The server child process must be killed on `will-quit` or it outlives the app
- Session list and selection live in the app store (low frequency); the streaming conversation lives in the conversation component's own state, because part deltas would otherwise re-render the whole app
- The CLI command comes from the existing `IOpenCodeConfig.command` (`opencode-config.ts`), shared with the commit-message generator

### Conversation controls

- **Queue vs steer**: `Enter` while the agent works queues the prompt (client side — the server has no queue); it is sent on `session.idle`. The **Steer** button posts it immediately so it reaches the turn in progress. Queued entries are listed above the prompt and can be dropped individually
- **Revert**: the clock button on a user message calls `POST /session/{id}/revert`; a banner offers `unrevert` afterwards
- **Model/variant**: `GET /config/providers` fills a picker grouped by provider; the variant picker only appears for models that declare `variants` (`low`/`high`/`max`…) and resets when the model changes. The pick is restored per conversation from the session's recorded `model` (`getSessionModelSelection`), with an in-memory per-session map covering a pick made before the first prompt — only a brand new conversation starts on the default
- **Files**: the paperclip embeds a file as a data URL (works outside the repository); `@path` autocompletes from `GET /find/file` and is sent as a `file://` part so the server reads it

### Status

Implemented: server lifecycle (local or configured host/port), IPC, HTTP/SSE client, app-store/dispatcher wiring, session list (filter, create, delete via context menu), conversation with markdown, collapsible reasoning and tool calls, inline permission prompts, agent/model/variant pickers, attachments and `@` references, message queue, steering, revert/unrevert, abort, menu item and unit tests.
**Not implemented**: subagent (child session) drill-down, `question.asked` prompts.

## 4. Check for Updates (Help > Check for Updates)

Manual check for new versions via the GitHub Releases API. There is no auto-updater — the app queries the API and opens the release page for the user to download.

### File map

| Layer | Files |
| --- | --- |
| Model | `app/src/models/github-release.ts` (`IGitHubReleaseInfo`) |
| Logic | `app/src/lib/github-releases.ts` — `getLatestGitHubRelease()` (fetch on the `repos/zonaro/desktop-claw/releases/latest` API), `isUpdateAvailable()` (semver), constants `GitHubReleasesOwner`/`GitHubReleasesRepo`/`DesktopClawReleasesUrl` |
| UI | `app/src/ui/check-for-updates/check-for-updates-dialog.tsx` (dialog with checking/update-available/up-to-date/error states); `app/styles/ui/_check-for-updates.scss` |
| Menu | `app/src/main-process/menu/build-default-menu.ts` — `Help > Check for Updates…` item (id `check-for-updates`); `app/src/main-process/menu/menu-event.ts` — `check-for-updates` event |
| Routing | `PopupType.CheckForUpdates` in `app/src/models/popup.ts`; render in `app/src/ui/app.tsx` (`checkForUpdates`, `check-for-updates` case in `onMenuEvent`) |
| Tests | `app/test/unit/github-releases-test.ts` (`isUpdateAvailable`) |

### Locked rules

- No auto-updater: `getUpdatesURL()` keeps returning `''`; the check is manual and opens the release page in the browser
- Queries the public GitHub API (no auth) — subject to rate limit; failure becomes the `error` state in the dialog
- Fixed owner/repo: `zonaro`/`desktop-claw` (don't use the desktop-plus upstream)

### Status

Implemented: model, logic, dialog, menu, routing, unit tests.

## AppStore integration

Provider selection and FTP upload go through `app/src/lib/stores/app-store.ts` and the dispatcher (`app/src/ui/dispatcher/dispatcher.ts`) — search for `ftp`/`opencode`/`commitMessageProvider` when touching the flow.

## References

- Full plan with locked decisions and dependencies: `.omo/plans/ftp-opencode-features.md`
- Notepads from previous sessions: `.omo/notepads/ftp-opencode-features`