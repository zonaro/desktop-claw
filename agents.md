# agents.md — Technical documentation index

This repository is **desktop-claw**, a fork of [desktop-plus](https://github.com/desktop-plus/desktop-plus) (which is itself a fork of GitHub Desktop) — an Electron desktop Git client.

All consultable technical documentation lives in [`.agents/`](.agents/). This file is the index: read it first to know where each piece of information lives.

## Documents

| Document | Content |
| --- | --- |
| [.agents/stack.md](.agents/stack.md) | Languages, frameworks, versions and toolchain (Node, Electron, React, Webpack, dugite, Dexie...) |
| [.agents/architecture.md](.agents/architecture.md) | Architecture: Electron processes, webpack bundles, data flow (dispatcher → stores → git/API/DB), git layer, Dexie, IPC |
| [.agents/code-patterns.md](.agents/code-patterns.md) | Code patterns and conventions (named exports, `I`-prefixed interfaces, readonly, custom eslint rules, UI structure) |
| [.agents/workflow.md](.agents/workflow.md) | Dev/build/test/lint commands and day-to-day workflows |
| [.agents/known-problems.md](.agents/known-problems.md) | Known problems, gotchas and pitfalls already encountered |
| [.agents/fork-features.md](.agents/fork-features.md) | Features exclusive to this fork: FTP Deployments and OpenCode (file map, IPC, integration, pending items) |
| [.agents/upstream-sync.md](.agents/upstream-sync.md) | How to sync with the original desktop-plus repository (pull new commits) |

## Golden rules (summary)

1. **Software and documentation are always in English.** Code, comments, commit messages, docs and any project artifact must be written in English.
2. **Node 24.15.0** is mandatory (`.nvmrc`/`.node-version`/`.tool-versions`).
3. **Classic Yarn 1.x** via `yarn-path` (`.yarnrc` points to `vendor/yarn-1.21.1.js`). Do not use npm/modern yarn.
4. **Never edit the `version` field in `app/package.json`** — it causes merge conflicts with upstream and is ignored at build time. The real version is stamped from the UTC date/time of the build, in the `{YY}.{dayOfYear}.{HHMM}` format (e.g. `26.225.1942`), defined in [`script/calendar-version.ts`](script/calendar-version.ts). `env.APP_VERSION` overrides it, and that's how CI uses a single version across all platforms.
5. **Main process code changes require a rebuild** (`yarn build:dev`); renderer changes only need a reload (`Ctrl+Alt+R`).
6. **`Invalid header: Does not start with Cr24` error on start is normal** — ignore it.
7. **Credentials never go to Dexie/localStorage/logs** — always OS keychain via `TokenStore` (keytar).
8. To pull new commits from desktop-plus, follow [.agents/upstream-sync.md](.agents/upstream-sync.md).
9. **Distribution is GitHub Releases only** — no Winget, Homebrew, APT, DNF, AUR or Flathub, and there is no auto-update (the app has a manual "Help > Check for Updates" that queries the GitHub releases API and opens the release page). Push to `main` (or workflow_dispatch) builds and publishes; see [docs/documentation/process/releases.md](docs/documentation/process/releases.md).

## Quick shortcuts

```sh
yarn            # install deps (corepack enable first if needed)
yarn build:dev  # development build
yarn start      # run app with watch
yarn test       # unit tests (node --test + tsx)
yarn test:docker# unit tests isolated in Docker (recommended)
yarn lint:src   # eslint + prettier
yarn version:calendar  # prints the version a build made now would get
```

## Maintaining this documentation

- When you discover a new problem or pitfall, record it in `known-problems.md`.
- When touching a fork feature, update `fork-features.md`.
- When changing the stack/versions, update `stack.md`.
- Work history lives in `.omo/` (plans/notepads) — do not delete.