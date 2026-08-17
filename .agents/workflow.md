# Development workflow

## Initial setup

```sh
corepack enable   # installs yarn if needed
yarn              # installs dependencies (root + app via postinstall)
yarn build:dev    # initial development build
yarn start        # runs the app in dev with watch
```

- The first start/build takes a while — that's normal
- VSCode: `F5` also works (breakpoints in the app's devtools, not the editor)
- Per-OS setup docs: `docs/documentation/contributing/setup.md`, `setup-linux.md`, `setup-macos.md`, `setup-windows.md`, `building-arm64.md`

## Development loop

| Change | To apply |
| --- | --- |
| Renderer (ui/) | Reload the window: `Ctrl+Alt+R` / `Cmd+Alt+R` |
| Main process (main-process/, lib/) | Rebuild: stop the app and run `yarn build:dev` again |

## Build

```sh
yarn build:dev    # webpack dev (compile:dev) + build.ts
yarn build:prod   # production (compile:prod uses NODE_OPTIONS=--max_old_space_size=4096)
yarn compile:dev  # webpack dev only
yarn compile:prod # webpack prod only
yarn package      # packages distributables (electron-builder/packager)
```

- The version is stamped from the build's UTC date/time (`{YY}.{dayOfYear}.{HHMM}`). `build` and `package` are
  separate processes: to package a release locally, export `APP_VERSION` first, otherwise each
  step stamps its own time and they diverge if the minute rolls over.

```sh
export APP_VERSION=$(yarn --silent version:calendar)
yarn build:prod && yarn package
```

- Webpack output: `out/` at the root
- `yarn clean-slate` = rimraf `out`, `node_modules`, `app/node_modules` + `yarn` from scratch
- `yarn rebuild-hard:dev` / `rebuild-hard:prod` = clean-slate + build (last resort for weird state)

## Tests

```sh
yarn test           # unit (script/test.mjs → node --test + tsx)
yarn test:unit      # same
yarn test:setup     # prepares the test environment (ts-node script/test-setup.ts)
yarn test:docker    # unit tests in Docker — RECOMMENDED (isolates from global git config)
yarn test:e2e       # build + run e2e (packaged)
yarn test:e2e:build # build only (packaged or :unpackaged)
yarn test:e2e:run   # run only (packaged or :unpackaged)
```

- Unit tests: `app/test/unit/**/*-test.ts`, use `.test.env`, `app/test/globals.mts`, IndexedDB mock (fake-indexeddb) and jsdom
- E2E: Playwright with mock update server (`DESKTOP_E2E_UPDATES_URL=http://127.0.0.1:51789/update`)

## Lint and formatting

```sh
yarn lint           # prettier check + lint:src
yarn lint:src       # eslint + prettier (custom rules in eslint-rules/)
yarn lint:fix       # prettier --write + eslint --fix
yarn markdownlint   # docs
yarn check:eslint   # validates eslint config (tsc -P eslint-rules/)
yarn test:eslint    # tests for the custom eslint rules
```

## App CLI

```sh
yarn cli            # ts-node app/src/cli/main.ts (desktop-claw-cli)
```

## Release

Distribution is **GitHub Releases only** (no Winget/Homebrew/APT/DNF/AUR/Flathub, no auto-update).
`ci.yml` builds the 6 combinations (win/mac/linux × x64/arm64) and publishes on push to `main`
or manual trigger (workflow_dispatch), creating the `v{version}` tag on the commit. Details in
[docs/documentation/process/releases.md](../docs/documentation/process/releases.md).

Published artifacts: `.exe`, `.msi`, `.zip` (macOS), `.tar.gz` + `.AppImage` (Linux).

```sh
yarn version:calendar       # version a build made now would get
yarn validate-changelog     # validates changelog.json
```

The release body comes from `.github/desktop-claw-release-notes.md`; the title is generated from the version.

The `yarn draft-release*` scripts belong to the upstream flow (manual versions via changelog.json) and are
not part of this fork's release.

## Maintenance

```sh
yarn validate-electron-version   # checks electron vs node
yarn validate-macos-version
yarn generate-octicons           # regenerates octicons
yarn test:script                 # tests for the build scripts
```

## Upstream sync

Pull new commits from desktop-plus: **`.agents/upstream-sync.md`** (follow that doc).