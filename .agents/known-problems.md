# Problemas conhecidos e gotchas

Problemas recorrentes/esperados, para não perder tempo debugando o que é normal ou já conhecido.

## Erros "normais" no dev

- **`UnhandledPromiseRejectionWarning: Error: Invalid header: Does not start with Cr24`** no start — esperado (extensão CRX), ignorar (README confirma)
- **Primeiro start/build lento** — esperado; não é trava
- **`UnhandledPromiseRejectionWarning` genéricos** no boot — às vezes benignos; verificar console real antes de investigar

## Build/dev

- **Node errado quebra o build de forma confusa** — usar Node 24.15.0 (`.nvmrc`). Checar com `yarn validate-electron-version`
- **Mudanças no main process não aparecem com reload** — precisa `yarn build:dev` (relo-car só vale para renderer)
- **Yarn moderno/npm não funcionam** — `.yarnrc` força `vendor/yarn-1.21.1.js` (yarn clássico 1.21.1); usar `yarn` via corepack ou o vendored
- **Estado estranho do build** (erros de cache/inconsistência) → `yarn rebuild-hard:dev`
- **`electron-installer-redhat` precisa de patch** — `patches/electron-installer-redhat+3.4.0.patch` via patch-package; não remova o patch sem validar build RPM

## Testes

- **Unit tests interferem com git config global** — por isso `yarn test:docker` é recomendado; sem Docker, rodar com `yarn test:setup` e cuidado com configs do usuário
- **E2E exige build de produção** — `yarn test:e2e:build` antes de `run`; usa mock update server na porta 51789
- Testes unitários dependem de `.test.env` e `app/test/globals.mts` (carregados automaticamente pelo `script/test.mjs`)

## Upstream / merge

- **`app/package.json` `version` NUNCA editado à mão** — nota `$NOTE` no arquivo; conflito de merge com upstream é resolvido mantendo o valor do upstream (a versão é setada por `env.APP_VERSION` no build)
- **`changelog.json` e `yarn.lock` são pontos frequentes de conflito** ao mergear upstream — resolver com calma; `yarn install` regenera o lock
- **Submódulos** (`gemoji`, `gitignore`, `choosealicense.com`): após puxar commits do upstream que mexam nos pointers, rodar `git submodule update --init --recursive`, senão recursos estáticos somem
- **`yarn.lock` pode acumular entradas stale** (já limpo em 258cae77ed) — não commitar "sujas"; rodar `yarn install` clássico para limpar

## Fork (desktop-claw)

- **Worktree API**: há mudança fork-only no construtor (`mainWorktreePath`) — manter compatível ao mergear upstream (commit 0901cca2b1 documenta o padrão)
- **FTP**: senhas só via keychain (service `"Desktop Claw - FTP Deployments"`); nunca gravar em DB/logs. Upload roda no main process com AbortSignal — não mover para renderer
- Features do fork pendentes: ver `.agents/fork-features.md` (tab FTP em Repository Settings e seção OpenCode nas Preferences ainda não implementadas)

## Plataformas

- **Flatpak**: hooks git rodam dentro do sandbox e não acessam ferramentas do sistema (version managers, linters) — comportamento esperado
- **Linux e2e/CI**: CI roda `ci.yml` (lint, unit, e2e, package); builds Linux usam electron-builder + scripts de empacotamento (`script/package-debian.ts`, `package-redhat.ts`, `package-electron-builder.ts`)

## Dicas de debug

- Logs do app: winston (transports de console/arquivo em `app/src/main-process/log.ts`)
- Erros de exceção não capturada: `show-uncaught-exception.ts` / `crash-window.ts`
- Problemas de IPC suspeitos: checar `trusted-ipc-sender` e `same-origin-filter` antes de culpar o handler
