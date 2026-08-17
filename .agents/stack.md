# Technology Stack

Electron app (desktop Git client). TypeScript throughout the app code. Built with Webpack 5 and classic Yarn.

## Pinned versions (version files at the repo root)

| Tool | Version | Where |
| --- | --- | --- |
| Node.js | **24.15.0** | `.nvmrc`, `.node-version`, `.tool-versions` |
| Python | 3.9.5 | `.python-version` (used by the build toolchain) |
| Yarn | 1.22.22 (classic) | `package.json` `packageManager`; `.yarnrc` forces `yarn-path ./vendor/yarn-1.21.1.js` |
| Electron | 42.4.0 | `package.json` (root devDependencies) |
| TypeScript | 5.8.2 | root `package.json` |
| React | 16.8.4 (class components) | `app/package.json` |

> The wrong Node breaks the build in confusing ways. Use `nvm use` / asdf with the pinned versions.

## Runtime dependencies (`app/package.json`)

The app has its own `package.json` (`app/`), separate from the build deps at the root.

- **Git**: `dugite` 3.2.2 (runs embedded git; wrapper in `app/src/lib/git/core.ts`)
- **Persistence**: `dexie` 3.2.3 (IndexedDB); `keytar` 7.8 (OS keychain — credentials)
- **UI**: `react`/`react-dom` 16.8, `classnames`, `focus-trap-react`, `react-transition-group`, `react-css-transition-replace`, `react-virtualized`, `react-confetti`, `@floating-ui/react-dom` (popovers/tooltips), `fuzzaldrin-plus` (search), `memoize-one`
- **Editor/terminal**: `codemirror` 5 (+elixir/luau/zig modes), `@xterm/xterm` (embedded terminal), `textarea-caret`
- **Markdown/sanitization**: `marked` 4, `dompurify`
- **GitHub integrations**: `@github/alive-client` (notifications/events), `@github/copilot-sdk` (Copilot)
- **Fork (claw)**: `basic-ftp` 6.2 (FTP Deployments — see `.agents/fork-features.md`), `ignore` 7 (.gitignore patterns for upload)
- **Logs**: `winston` + `triple-beam`, `split2`, `byline`
- **Local vendor**: `desktop-notifications`, `desktop-trampoline`, `printenvz`, `windows-argv-parser` (see `vendor/`; installed as `file:../vendor/...`)
- **Icons**: `@primer/octicons` (at the root, generated via `yarn generate-octicons`)

## Build toolchain (root `package.json`)

- Webpack 5: `webpack`, `ts-loader`, `sass`/`sass-loader`/`style-loader`/`mini-css-extract-plugin`, `css-loader`, `html-webpack-plugin`, `webpack-dev-middleware` + `webpack-hot-middleware` (dev)
- TS bootstrap: `ts-node` 7 (scripts in `script/`) + `tsx` (tests)
- Packaging: `electron-builder` 25 (AppImage), `@electron/packager` 18, `electron-winstaller` 5 (optionalDependency); Linux tarball built by `script/package-tarball.ts` with plain `tar`
- Dep patching: `patch-package` (no patches currently applied)
- App CLI: `ts-node app/src/cli/main.ts` (`yarn cli`)

## Tests

- **Unit**: `node --test` + `tsx` + `jsdom`/`global-jsdom` + `fake-indexeddb`; `@testing-library/react` 12; runner in `script/test.mjs`; tests in `app/test/unit/**/*-test.ts` (mirror `app/src`)
- **E2E**: Playwright 1.60 (`app/test/e2e/playwright.config.ts`), with a mock update server (`mock-update-server.ts`) and `DESKTOP_E2E_UPDATES_URL`
- **Docker**: `script/testing-docker/run.sh` — isolated/reproducible unit run
- **Lint**: ESLint 8 + custom rules (`eslint-rules/`, see `.agents/code-patterns.md`), Prettier 2, markdownlint (`@github/markdownlint-github`)

## Git submodules

`.gitmodules`: `gemoji` (emoji), `app/static/common/gitignore`, `app/static/common/choosealicense.com`. After syncing with upstream, run `git submodule update --init --recursive`.

## Upstream docs reference (in `docs/`)

`docs/documentation/technical/` (rebase-flow, feature-flagging, oauth, pull-requests, dialogs, e2e-smoke-tests...), `docs/documentation/contributing/` (setup, styleguide, linting, tooling...), `docs/documentation/process/` (releases, testing...), `docs/documentation/known-issues.md`, `docs/documentation/cli.md`. Useful to consult before touching an unfamiliar area.