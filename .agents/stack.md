# Stack Tecnológica

App Electron (cliente Git desktop). TypeScript em todo o código do app. Build via Webpack 5 com Yarn clássico.

## Versões pinadas (arquivos de versão na raiz)

| Ferramenta | Versão | Onde |
| --- | --- | --- |
| Node.js | **24.15.0** | `.nvmrc`, `.node-version`, `.tool-versions` |
| Python | 3.9.5 | `.python-version` (usado pela toolchain de build) |
| Yarn | 1.22.22 (clássico) | `package.json` `packageManager`; `.yarnrc` força `yarn-path ./vendor/yarn-1.21.1.js` |
| Electron | 42.4.0 | `package.json` (devDependencies raiz) |
| TypeScript | 5.8.2 | `package.json` raiz |
| React | 16.8.4 (class components) | `app/package.json` |

> Node errado quebra o build de formas confusas. Use `nvm use` / asdf com as versões pinadas.

## Dependências de runtime (`app/package.json`)

O app tem `package.json` próprio (`app/`), separado das deps de build na raiz.

- **Git**: `dugite` 3.2.2 (executa git embutido; wrapper em `app/src/lib/git/core.ts`)
- **Persistência**: `dexie` 3.2.3 (IndexedDB); `keytar` 7.8 (keychain do SO — credenciais)
- **UI**: `react`/`react-dom` 16.8, `classnames`, `focus-trap-react`, `react-transition-group`, `react-css-transition-replace`, `react-virtualized`, `react-confetti`, `@floating-ui/react-dom` (popovers/tooltips), `fuzzaldrin-plus` (busca), `memoize-one`
- **Editor/terminal**: `codemirror` 5 (+modes elixir/luau/zig), `@xterm/xterm` (terminal embutido), `textarea-caret`
- **Markdown/sanitização**: `marked` 4, `dompurify`
- **GitHub integrations**: `@github/alive-client` (notificações/eventos), `@github/copilot-sdk` (Copilot)
- **Fork (claw)**: `basic-ftp` 6.2 (FTP Deployments — ver `.agents/fork-features.md`), `ignore` 7 (padrões .gitignore para upload)
- **Logs**: `winston` + `triple-beam`, `split2`, `byline`
- **Vendor local**: `desktop-notifications`, `desktop-trampoline`, `printenvz`, `windows-argv-parser` (ver `vendor/`; instalados como `file:../vendor/...`)
- **Ícones**: `@primer/octicons` (na raiz, gerados via `yarn generate-octicons`)

## Toolchain de build (raiz `package.json`)

- Webpack 5: `webpack`, `ts-loader`, `sass`/`sass-loader`/`style-loader`/`mini-css-extract-plugin`, `css-loader`, `html-webpack-plugin`, `webpack-dev-middleware` + `webpack-hot-middleware` (dev)
- Bootstrap TS: `ts-node` 7 (scripts em `script/`) + `tsx` (testes)
- Empacotamento: `electron-builder` 25, `@electron/packager` 18, `electron-winstaller` 5, `electron-installer-debian`/`redhat` (optionalDependencies)
- Patching de deps: `patch-package` (patch em `patches/electron-installer-redhat+3.4.0.patch`)
- CLI do app: `ts-node app/src/cli/main.ts` (`yarn cli`)

## Testes

- **Unitários**: `node --test` + `tsx` + `jsdom`/`global-jsdom` + `fake-indexeddb`; `@testing-library/react` 12; runner em `script/test.mjs`; testes em `app/test/unit/**/*-test.ts` (espelham `app/src`)
- **E2E**: Playwright 1.60 (`app/test/e2e/playwright.config.ts`), com mock de update server (`mock-update-server.ts`) e `DESKTOP_E2E_UPDATES_URL`
- **Docker**: `script/testing-docker/run.sh` — rodada unitária isolada/reprodutível
- **Lint**: ESLint 8 + regras custom (`eslint-rules/`, ver `.agents/code-patterns.md`), Prettier 2, markdownlint (`@github/markdownlint-github`)

## Submódulos git

`.gitmodules`: `gemoji` (emoji), `app/static/common/gitignore`, `app/static/common/choosealicense.com`. Após sync com upstream, rodar `git submodule update --init --recursive`.

## Referência de docs upstream (em `docs/`)

`docs/documentation/technical/` (rebase-flow, feature-flagging, oauth, pull-requests, dialogs, e2e-smoke-tests...), `docs/documentation/contributing/` (setup, styleguide, linting, tooling...), `docs/documentation/process/` (releases, testing...), `docs/documentation/known-issues.md`, `docs/documentation/cli.md`. Úteis para consulta antes de mexer em área desconhecida.
