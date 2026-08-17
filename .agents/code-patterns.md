# Code patterns

Conventions followed by the code (some enforced by custom eslint rules in `eslint-rules/`).

## TypeScript

- **Named exports** always (no default exports)
- **`I`-prefixed interfaces** for data types (`IFtpDeployment`, `IRepository` where applicable)
- **Union types instead of new enums** (convention of this fork)
- **Readonly props and state**: `public readonly foo: Foo` — enforced by `react-readonly-props-and-state`
- Types shared between processes live in the `models/` layer; `ipc-shared.ts` only imports from `models/`

## React (16.8, class components)

- Components are classes (React 16 — don't port to hooks without need)
- Correct, well-formed lifecycle methods — rule `react-proper-lifecycle-methods`
- Dispatcher props must be bound (arrow functions/bound methods) — rule `react-no-unbound-dispatcher-props`
- UI organized **by feature**: `app/src/ui/<feature>/` with components, dialogs (`*-dialog.tsx`) and co-located SCSS styles
- Popups: register in `PopupType` (`app/src/models/popup.ts`) and route via `app.tsx`
- Classnames via the `classnames` package

## State flow

- Components **never** call stores directly; every action goes through the dispatcher (`app/src/ui/dispatcher/dispatcher.ts`)
- Stores inherit `BaseStore` and notify via event-kit; UI subscribes with `subscribe()`
- Repository state is cached (`git-store-cache.ts`, `repository-state-cache.ts`) — respect the existing pattern before creating a new cache

## Git

- New git commands: own file in `app/src/lib/git/<operation>.ts` using the `core.ts` wrapper (dugite)
- Never run git outside `lib/git/`
- Delimited output parsing via `git-delimiter-parser.ts`

## IPC

- A new channel goes into the typed map in `app/src/lib/ipc-shared.ts`
- Handler registered with `registerIpcMainHandler` (`ipc-main.ts`), with sender validation (`trusted-ipc-sender`)
- Renderer calls main via the typed proxy (`ui/main-process-proxy.ts`) — don't use raw `ipcRenderer`
- Never accept an untrusted webContents channel — rule `no-loosely-typed-webcontents-ipc`

## Security

- Never `Math.random()` for cryptography/sensitive IDs — rule `insecure-random` (use proper crypto)
- Passwords/credentials: OS keychain only via `TokenStore` (keytar). Nothing in DB/localStorage/logs
- Sanitize HTML with `dompurify` (there is `marked` usage)

## Tests

- Unit: `app/test/unit/<module>-test.ts` mirroring `app/src`; run with `node --test` + tsx (see `.agents/workflow.md`)
- E2E: `app/test/e2e/*.e2e.ts` (Playwright)
- CI and tests use `.test.env`; unit tests need `yarn test:setup` (or Docker)

## Repo housekeeping

- User-visible changes go into `changelog.json` (validated by `validate-changelog`)
- **Never edit `version` in `app/package.json`** — it comes from `env.APP_VERSION` (`$NOTE` in the file itself)
- Prettier + ESLint mandatory (`yarn lint:src`); markdownlint for docs
- Full upstream styleguide: `docs/documentation/contributing/styleguide.md`

## Custom eslint rules (`eslint-rules/`)

`insecure-random.js`, `no-loosely-typed-webcontents-ipc.js`, `react-no-unbound-dispatcher-props.js`, `react-proper-lifecycle-methods.js`, `react-readonly-props-and-state.js`