# Arquitetura

## Visão geral

App Electron com 5 bundles Webpack definidos em `app/webpack.common.ts` (saída em `out/` na raiz do repo):

| Bundle | Entry | Função |
| --- | --- | --- |
| `main` | `app/src/main-process/main.ts` | Processo principal (janelas, IPC, menu, updates) |
| `renderer` | `app/src/ui/index.tsx` | UI (React) |
| `crash` | `app/src/crash/index.tsx` | Janela de crash |
| `cli` | `app/src/cli/main.ts` | CLI `desktop-claw-cli` (abrir/clonar repos) |
| `highlighter` | `app/src/highlighter/index.ts` | Worker de syntax highlighting |

## Processo principal (`app/src/main-process/`)

- `main.ts` — bootstrap: cria app windows, inicializa menu/updater/notificações
- `app-window.ts` — criação/gerenciamento de janelas
- `menu/` — menu da aplicação; `build-default-menu.ts` (inclusive submenu dinâmico de FTP do fork) e `menu-event.ts` (union de eventos `MenuEvent`)
- `ipc-main.ts` — registro tipado de handlers IPC (`registerIpcMainHandler`), `ipc-webcontents.ts` (IPC via webContents), `trusted-ipc-sender.ts` (validação de remetente)
- `notifications.ts` — notificações do SO; `shell.ts` — abertura de URLs/apps externos
- `squirrel-updater.ts` — auto-update (Windows/Squirrel)
- `log.ts` + `desktop-console-transport.ts`/`desktop-file-transport.ts` — logging (winston)
- `exception-reporting.ts`, `crash-window.ts`, `show-uncaught-exception.ts` — tratamento de erros
- `migrate-config-dir.ts`, `alive-origin-filter.ts`, `ordered-webrequest.ts`, `same-origin-filter.ts`, `authenticated-image-filter.ts` — infra
- **Fork**: `opencode-runner.ts` — runner CLI do OpenCode atrás de IPC tipado (ver `.agents/fork-features.md`)

## Renderer (`app/src/ui/`)

- Entrada `index.tsx` → componente raiz `app.tsx` (roteamento de popups, menu events, janelas)
- **Uma pasta por feature** (`changes/`, `branches/`, `history/`, `diff/`, `preferences/`, ...), com dialog(s) + styles SCSS co-localizados
- Popups registrados como `PopupType` em `app/src/models/popup.ts` e renderizados via `app.tsx` (`renderPopup`)
- Ações de UI passam pelo **dispatcher** (`app/src/ui/dispatcher/dispatcher.ts`) — nunca chamar stores diretamente de componentes
- `app/src/ui/main-process-proxy.ts` — ponte tipada renderer→main (IPC)

## Fluxo de dados

```
Componente React → dispatcher (ui/dispatcher) → Store (lib/stores) → camada de baixo nível
                                                          ↑
UI se inscreve via subscribe() ← event-kit ← Store emite update
```

- Stores em `app/src/lib/stores/` (`app-store.ts` — store central; `git-store.ts` — estado git por repo; `repositories-store.ts`, `accounts-store.ts`, `sign-in-store.ts`, `token-store.ts` (keytar), `pull-request-store.ts`, `copilot-store.ts`, `git-store-cache.ts`, `repository-state-cache.ts`...)
- Stores estendem `BaseStore` (`base-store.ts`) e usam event-kit para notificar mudanças
- Camada de baixo nível:
  - **git**: `app/src/lib/git/*` (dugite)
  - **API remota**: `app/src/lib/api.ts` — GitHub, GitHub Enterprise, Bitbucket, GitLab, Codeberg, Forgejo, Gitea (multi-account)
  - **DB**: `app/src/lib/databases/` (Dexie)
  - **IPC main** para tudo que exige o processo principal

## Camada git (`app/src/lib/git/`)

- `core.ts` — wrapper tipado sobre `dugite` (`GitProcess.exec`), com `successExitCodes`, tratamento de erros esperados e parsing; é o único lugar que executa git
- Um módulo por operação: `commit.ts`, `branch.ts`, `diff.ts`, `log.ts`, `fetch.ts`, `pull.ts`, `push.ts`, `rebase.ts`, `merge.ts`, `stash.ts`, `worktree.ts`, `lfs.ts`, `clone.ts`, `cherry-pick.ts`, `checkout.ts`, `refs.ts`, `config.ts`, `environment.ts`, `credential.ts`, `diff-check.ts`, `diff-index.ts`, `for-each-ref.ts`, `interpret-trailers.ts`, `merge-tree.ts`, `format-patch.ts`, `gitignore.ts`, `init.ts`, `apply.ts`, `clean.ts`, `reflog.ts`, `authentication.ts`, `description.ts`, `coerce-to-*`, `git-delimiter-parser.ts` (parse de saída delimitada)
- Índice em `index.ts`

## Persistência (`app/src/lib/databases/`)

- `repositories-database.ts` — repos e dados relacionados (schema ~v10+); o registro `Repository` inclui campos do fork: `ftpDeployments: ReadonlyArray<IFtpDeployment>` e `commitMessageProvider` (ver `.agents/fork-features.md`)
- `github-user-database.ts` (contas), `issues-database.ts`, `pull-request-database.ts`
- Migrations: padrão em `base-database.ts` — cada bump de `schemaVersion` tem upgrade callback; nunca quebrar migração antiga
- **Credenciais/senhas NUNCA no Dexie** — só `TokenStore` (keytar). Fork adiciona `ftp-secrets.ts` com service `"Desktop Claw - FTP Deployments"`

## IPC

- Tipos/canais compartilhados: `app/src/lib/ipc-shared.ts` (mapa de canais tipados; só importa do layer `models/`)
- Main registra com `registerIpcMainHandler`/`registerIpcMainHandlerOnce` (`ipc-main.ts`)
- Segurança: `trusted-ipc-sender.ts`, regra eslint `no-loosely-typed-webcontents-ipc`, `same-origin-filter.ts` (proteção contra canais de origem errada)
- Canais do fork: `ftp-test-connection`, `ftp-upload`, `ftp-cancel-upload`, `ftp-upload-progress` (+ opencode) — ver `.agents/fork-features.md`

## Models (`app/src/models/`)

Classes/registros puros sem lógica de IO: `repository.ts`, `commit.ts`, `branch.ts`, `account.ts`, `app-menu.ts`, `diff/`, `preferences.ts`, `opencode.ts` (fork), `ftp-deployment.ts`/`ftp-upload.ts` (fork), etc.

## CLI (`app/src/cli/`)

`main.ts` — comando `desktop-claw-cli`; entry webpack próprio. Uso documentado em `docs/cli.md`.
