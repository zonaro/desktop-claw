# Known problems and gotchas

Recurring/expected problems, so you don't waste time debugging what is normal or already known.

## "Normal" dev errors

- **`UnhandledPromiseRejectionWarning: Error: Invalid header: Does not start with Cr24`** on start — expected (CRX extension), ignore (README confirms)
- **Slow first start/build** — expected; not a hang
- **Generic `UnhandledPromiseRejectionWarning`s** at boot — sometimes benign; check the real console before investigating

## Build/dev

- **Wrong Node breaks the build in confusing ways** — use Node 24.15.0 (`.nvmrc`). Check with `yarn validate-electron-version`
- **Main process changes don't show up with reload** — needs `yarn build:dev` (reload only applies to the renderer)
- **Modern yarn/npm don't work** — `.yarnrc` forces `vendor/yarn-1.21.1.js` (classic yarn 1.21.1); use `yarn` via corepack or the vendored one
- **Weird build state** (cache/inconsistency errors) → `yarn rebuild-hard:dev`

## Tests

- **Unit tests interfere with the global git config** — that's why `yarn test:docker` is recommended; without Docker, run with `yarn test:setup` and be careful with user configs
- **E2E requires a production build** — `yarn test:e2e:build` before `run`; uses mock update server on port 51789
- Unit tests depend on `.test.env` and `app/test/globals.mts` (loaded automatically by `script/test.mjs`)

## Upstream / merge

- **`app/package.json` `version` NEVER edited by hand** — `$NOTE` in the file; merge conflicts with upstream are resolved keeping the upstream value (the version is set by `env.APP_VERSION` at build)
- **`changelog.json` and `yarn.lock` are frequent conflict points** when merging upstream — resolve calmly; `yarn install` regenerates the lock
- **Submodules** (`gemoji`, `gitignore`, `choosealicense.com`): after pulling upstream commits that touch the pointers, run `git submodule update --init --recursive`, otherwise static assets disappear
- **`yarn.lock` can accumulate stale entries** (already cleaned in 258cae77ed) — don't commit "dirty" ones; run classic `yarn install` to clean

## Fork (desktop-claw)

- **Worktree API**: there is a fork-only change in the constructor (`mainWorktreePath`) — keep it compatible when merging upstream (commit 0901cca2b1 documents the pattern)
- **FTP**: passwords only via keychain (service `"Desktop Claw - FTP Deployments"`); never write to DB/logs. Upload runs in the main process with AbortSignal — don't move it to the renderer
- **Check for Updates**: queries the public GitHub API (`repos/zonaro/desktop-claw/releases/latest`) without auth — subject to rate limit (60 req/h per IP); failure becomes the `error` state in the dialog. There is no auto-updater; the Download button opens the release page in the browser
- **OpenCode tab**: one `opencode serve` process serves every repository — requests are scoped with `directory=<repo path>`, so never restart the server to switch repository. The tab's sidebar shows the server error inline when the CLI is missing
- **The CLI is not on the graphical session's PATH**: the OpenCode installer appends `~/.opencode/bin` to the user's *shell* profile (`.bashrc`/`.zshrc`), but the app is launched from a `.desktop` entry by `systemd --user`, which never reads it — so a bare `spawn('opencode')` fails with ENOENT even though `which opencode` works in a terminal. `opencode-command.ts` resolves the binary against PATH *and* the known install directories; keep every OpenCode spawn going through `resolveOpenCodeCommand`. Same trap applies to any other CLI the app shells out to
- **Dev builds can't be driven by Playwright**: the packaged *dev* build's `renderer.bundle.js` needs the webpack dev server, and fails with `TypeError: object null is not iterable` when launched standalone. Use `yarn test:e2e:build:unpackaged` + `DESKTOP_E2E_APP_MODE=unpackaged` (or a production build) for any automated UI check
- Pending fork features: see `.agents/fork-features.md` (FTP tab in Repository Settings and OpenCode section in Preferences not implemented yet)

## Platforms

- **AppImage**: registers no URL handler, so sign-in needs manual setup (`.desktop` + MIME `x-scheme-handler/x-github-desktop-auth`); prefer the tarball install (`docs/install.sh`), which sets it up
- **Linux e2e/CI**: CI runs `ci.yml` (lint, unit, e2e, package); Linux builds use `script/package-electron-builder.ts` (AppImage) and `script/package-tarball.ts` (tar.gz)

## Debug tips

- App logs: winston (console/file transports in `app/src/main-process/log.ts`)
- Uncaught exception errors: `show-uncaught-exception.ts` / `crash-window.ts`
- Suspected IPC issues: check `trusted-ipc-sender` and `same-origin-filter` before blaming the handler