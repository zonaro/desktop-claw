# Architecture

## Overview

Electron app with 5 Webpack bundles defined in `app/webpack.common.ts` (output in `out/` at the repo root):

| Bundle | Entry | Purpose |
| --- | --- | --- |
| `main` | `app/src/main-process/main.ts` | Main process (windows, IPC, menu, updates) |
| `renderer` | `app/src/ui/index.tsx` | UI (React) |
| `crash` | `app/src/crash/index.tsx` | Crash window |
| `cli` | `app/src/cli/main.ts` | `desktop-claw-cli` CLI (open/clone repos) |
| `highlighter` | `app/src/highlighter/index.ts` | Syntax highlighting worker |

## Main process (`app/src/main-process/`)

- `main.ts` — bootstrap: creates app windows, initializes menu/updater/notifications
- `app-window.ts` — window creation/management
- `menu/` — application menu; `build-default-menu.ts` (including the fork's dynamic FTP submenu) and `menu-event.ts` (union of `MenuEvent` events)
- `ipc-main.ts` — typed registration of IPC handlers (`registerIpcMainHandler`), `ipc-webcontents.ts` (IPC via webContents), `trusted-ipc-sender.ts` (sender validation)
- `notifications.ts` — OS notifications; `shell.ts` — opening external URLs/apps
- `squirrel-updater.ts` — auto-update (Windows/Squirrel)
- `log.ts` + `desktop-console-transport.ts`/`desktop-file-transport.ts` — logging (winston)
- `exception-reporting.ts`, `crash-window.ts`, `show-uncaught-exception.ts` — error handling
- `migrate-config-dir.ts`, `alive-origin-filter.ts`, `ordered-webrequest.ts`, `same-origin-filter.ts`, `authenticated-image-filter.ts` — infra
- **Fork**: `opencode-runner.ts` — OpenCode CLI runner behind typed IPC; `opencode-server.ts` — lifecycle of the single headless `opencode serve` process backing the OpenCode tab (see `.agents/fork-features.md`)

## Renderer (`app/src/ui/`)

- Entry `index.tsx` → root component `app.tsx` (popup routing, menu events, windows)
- **One folder per feature** (`changes/`, `branches/`, `history/`, `diff/`, `preferences/`, ...), with co-located dialog(s) + SCSS styles
- Popups registered as `PopupType` in `app/src/models/popup.ts` and rendered via `app.tsx` (`renderPopup`)
- UI actions go through the **dispatcher** (`app/src/ui/dispatcher/dispatcher.ts`) — never call stores directly from components
- `app/src/ui/main-process-proxy.ts` — typed renderer→main bridge (IPC)

## Data flow

```
React component → dispatcher (ui/dispatcher) → Store (lib/stores) → low-level layer
                                                          ↑
UI subscribes via subscribe() ← event-kit ← Store emits update
```

- Stores in `app/src/lib/stores/` (`app-store.ts` — central store; `git-store.ts` — per-repo git state; `repositories-store.ts`, `accounts-store.ts`, `sign-in-store.ts`, `token-store.ts` (keytar), `pull-request-store.ts`, `copilot-store.ts`, `git-store-cache.ts`, `repository-state-cache.ts`...)
- Stores extend `BaseStore` (`base-store.ts`) and use event-kit to notify changes
- Low-level layer:
  - **git**: `app/src/lib/git/*` (dugite)
  - **Remote API**: `app/src/lib/api.ts` — GitHub, GitHub Enterprise, Bitbucket, GitLab, Codeberg, Forgejo, Gitea (multi-account)
  - **DB**: `app/src/lib/databases/` (Dexie)
  - **Main IPC** for everything that requires the main process

## Git layer (`app/src/lib/git/`)

- `core.ts` — typed wrapper over `dugite` (`GitProcess.exec`), with `successExitCodes`, handling of expected errors and parsing; it's the only place that executes git
- One module per operation: `commit.ts`, `branch.ts`, `diff.ts`, `log.ts`, `fetch.ts`, `pull.ts`, `push.ts`, `rebase.ts`, `merge.ts`, `stash.ts`, `worktree.ts`, `lfs.ts`, `clone.ts`, `cherry-pick.ts`, `checkout.ts`, `refs.ts`, `config.ts`, `environment.ts`, `credential.ts`, `diff-check.ts`, `diff-index.ts`, `for-each-ref.ts`, `interpret-trailers.ts`, `merge-tree.ts`, `format-patch.ts`, `gitignore.ts`, `init.ts`, `apply.ts`, `clean.ts`, `reflog.ts`, `authentication.ts`, `description.ts`, `coerce-to-*`, `git-delimiter-parser.ts` (delimited output parsing)
- Index in `index.ts`

## Persistence (`app/src/lib/databases/`)

- `repositories-database.ts` — repos and related data (schema ~v10+); the `Repository` record includes fork fields: `ftpDeployments: ReadonlyArray<IFtpDeployment>` and `commitMessageProvider` (see `.agents/fork-features.md`)
- `github-user-database.ts` (accounts), `issues-database.ts`, `pull-request-database.ts`
- Migrations: pattern in `base-database.ts` — every `schemaVersion` bump has an upgrade callback; never break an old migration
- **Credentials/passwords NEVER in Dexie** — only `TokenStore` (keytar). The fork adds `ftp-secrets.ts` with service `"Desktop Claw - FTP Deployments"`

## IPC

- Shared types/channels: `app/src/lib/ipc-shared.ts` (typed channel map; only imports from the `models/` layer)
- Main registers with `registerIpcMainHandler`/`registerIpcMainHandlerOnce` (`ipc-main.ts`)
- Security: `trusted-ipc-sender.ts`, eslint rule `no-loosely-typed-webcontents-ipc`, `same-origin-filter.ts` (protection against wrong-origin channels)
- Fork channels: `ftp-test-connection`, `ftp-upload`, `ftp-cancel-upload`, `ftp-upload-progress` (+ opencode) — see `.agents/fork-features.md`

## Models (`app/src/models/`)

Pure classes/records without IO logic: `repository.ts`, `commit.ts`, `branch.ts`, `account.ts`, `app-menu.ts`, `diff/`, `preferences.ts`, `opencode.ts` (fork), `ftp-deployment.ts`/`ftp-upload.ts` (fork), etc.

## CLI (`app/src/cli/`)

`main.ts` — `desktop-claw-cli` command; its own webpack entry. Usage documented in `docs/documentation/cli.md`.