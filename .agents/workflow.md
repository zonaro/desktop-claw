# Workflow de desenvolvimento

## Setup inicial

```sh
corepack enable   # instala yarn se necessário
yarn              # instala dependências (raiz + app via postinstall)
yarn build:dev    # build inicial de desenvolvimento
yarn start        # roda o app em dev com watch
```

- O primeiro start/build demora — é normal
- VSCode: `F5` também funciona (breakpoints no devtools do app, não no editor)
- Docs de setup por SO: `docs/documentation/contributing/setup.md`, `setup-linux.md`, `setup-macos.md`, `setup-windows.md`, `building-arm64.md`

## Loop de desenvolvimento

| Mudança | Para aplicar |
| --- | --- |
| Renderer (ui/) | Recarregar janela: `Ctrl+Alt+R` / `Cmd+Alt+R` |
| Main process (main-process/, lib/) | Rebuild: parar app e rodar `yarn build:dev` de novo |

## Build

```sh
yarn build:dev    # webpack dev (compile:dev) + build.ts
yarn build:prod   # produção (compile:prod usa NODE_OPTIONS=--max_old_space_size=4096)
yarn compile:dev  # só webpack dev
yarn compile:prod # só webpack prod
yarn package      # empacota distributivos (electron-builder/packager)
```

- Saída do webpack: `out/` na raiz
- `yarn clean-slate` = rimraf `out`, `node_modules`, `app/node_modules` + `yarn` do zero
- `yarn rebuild-hard:dev` / `rebuild-hard:prod` = clean-slate + build (último recurso para estado estranho)

## Testes

```sh
yarn test           # unitários (script/test.mjs → node --test + tsx)
yarn test:unit      # idem
yarn test:setup     # prepara ambiente de teste (ts-node script/test-setup.ts)
yarn test:docker    # unitários em Docker — RECOMENDADO (isola do git config global)
yarn test:e2e       # build + run e2e (packaged)
yarn test:e2e:build # só build (packaged ou :unpackaged)
yarn test:e2e:run   # só execução (packaged ou :unpackaged)
```

- Unit tests: `app/test/unit/**/*-test.ts`, usam `.test.env`, `app/test/globals.mts`, mock de IndexedDB (fake-indexeddb) e jsdom
- E2E: Playwright com mock de update server (`DESKTOP_E2E_UPDATES_URL=http://127.0.0.1:51789/update`)

## Lint e formatação

```sh
yarn lint           # prettier check + lint:src
yarn lint:src       # eslint + prettier (regras custom em eslint-rules/)
yarn lint:fix       # prettier --write + eslint --fix
yarn markdownlint   # docs
yarn check:eslint   # valida config eslint (tsc -P eslint-rules/)
yarn test:eslint    # testes das regras eslint custom
```

## CLI do app

```sh
yarn cli            # ts-node app/src/cli/main.ts (desktop-claw-cli)
```

## Release (raro)

```sh
yarn draft-release          # gera release a partir do changelog.json
yarn draft-release:format   # formata + valida changelog/app version
yarn draft-release:pr       # abre PR de release
yarn validate-changelog     # valida changelog.json
```

## Manutenção

```sh
yarn validate-electron-version   # confere electron vs node
yarn validate-macos-version
yarn generate-octicons           # regenera ícones octicons
yarn test:script                 # testes dos scripts de build
```

## Sincronização com upstream

Puxar commits novos do desktop-plus: **`.agents/upstream-sync.md`** (siga esse doc).
