# Features exclusivas do fork (desktop-claw)

Duas features adicionadas sobre o desktop-plus. Plano original (com histórico de execução) em `.omo/plans/ftp-opencode-features.md`.

## 1. FTP Deployments

Deploy dos arquivos do repositório via FTP/FTPS por configuração por repositório, com ignore patterns (sintaxe .gitignore) e submenu no menu Repository.

### Mapa de arquivos

| Camada | Arquivos |
| --- | --- |
| Models | `app/src/models/ftp-deployment.ts` (IFtpDeployment), `app/src/models/ftp-upload.ts` (IFtpUploadRequest, progress, result) |
| Lógica FTP | `app/src/lib/ftp/ftp-client.ts` (cliente basic-ftp), `app/src/lib/ftp/ftp-secrets.ts` (TokenStore/keytar, service `"Desktop Claw - FTP Deployments"`), `app/src/lib/ftp/ftp-uploader.ts` (motor de upload, main process) |
| IPC | Canais em `app/src/lib/ipc-shared.ts`: `ftp-test-connection`, `ftp-upload`, `ftp-cancel-upload`, `ftp-upload-progress` |
| Main process | handlers registrados em `ipc-main.ts` (upload roda no main process com `AbortSignal` para cancelamento) |
| Menu | `app/src/main-process/menu/build-default-menu.ts` — submenu `Repository > FTP Deployments` (até 10 itens dinâmicos `ftp-upload:<id>` + `Configure FTP Deployments...`); `app/src/main-process/menu/menu-event.ts` — eventos `show-ftp-deployments`, `ftp-upload:<id>` |
| UI | `app/src/ui/ftp-deployments/` — `ftp-deployments-dialog.tsx` (lista/gerenciar), `edit-ftp-deployment-dialog.tsx` (form com ignore patterns), `ftp-deployment-list-item.tsx` |
| Roteamento | `PopupType.FtpDeployments` em `app/src/models/popup.ts`; render em `app/src/ui/app.tsx` (`showFtpDeployments`, cases `show-ftp-deployments`/`ftp-upload:` no `onMenuEvent`) |
| Persistência | Campo `Repository.ftpDeployments: ReadonlyArray<IFtpDeployment>` em `app/src/models/repository.ts` + schema Dexie (`app/src/lib/databases/repositories-database.ts`) |
| Deps | `basic-ftp` (FTP + FTPS explícito/implícito; sem SFTP na v1), `ignore` (padrões .gitignore) |

### Regras travadas

- Senhas só no OS keychain (TokenStore); nunca em DB/localStorage/logs
- Upload no main process; progresso via IPC (`ftp-upload-progress`); cancelamento via AbortSignal
- Ignore patterns por deployment, sintaxe .gitignore (pacote `ignore`)
- Acesso: submenu no menu Repository + dialog dedicado

### Estado

Implementado: models, schema Dexie, secrets, motor de upload, IPC, menu, dialogs, roteamento de popup, testes unitários (B9).
**Pendente**: tab FTP em Repository Settings (`app/src/ui/repository-settings/`) — verificar antes de assumir que existe.

## 2. OpenCode como gerador de commit message (alternativa ao Copilot)

Geração de mensagens de commit via CLI do OpenCode, com provider abstrato selecionável.

### Mapa de arquivos

| Camada | Arquivos |
| --- | --- |
| Abstração | `app/src/lib/commit-message-generator/` — `commit-message-generator.ts` (interface `ICommitMessageGenerator`), `index.ts`, `copilot-commit-message-generator.ts` (adapter Copilot), `opencode-commit-message-generator.ts` (adapter OpenCode) |
| Runner (main process) | `app/src/main-process/opencode-runner.ts` — executa CLI do OpenCode atrás de IPC tipado |
| Config | `app/src/lib/opencode/opencode-config.ts`; model `app/src/models/opencode.ts` |
| Seleção de provider | `Repository.commitMessageProvider: 'copilot' \| 'openCode' \| null` (override por repo) > config global (localStorage) > padrão Copilot |
| UI (parcial) | referências em `app/src/ui/changes/commit-message.tsx`, `changes/sidebar.tsx`, `changes/filter-changes-list.tsx`, `app/src/ui/app.tsx`, `app/src/ui/dispatcher/dispatcher.ts` |

### Regras travadas

- Reusa `buildCommitMessageSystemPrompt`/`buildCommitMessageUserPrompt` (de copilot-store) e `parseCopilotCommitMessage`
- CLI executado no main process com IPC duplex tipado
- Provider: repo override > global > Copilot

### Estado

Implementado: abstração de provider, adapters, runner OpenCode, IPC. Feature flag/model ok.
**Pendente**: seção OpenCode nas Preferences (`app/src/ui/preferences/` — radio Copilot|OpenCode + sub-form command/model/timeout/botão Test) e testes unitários do OpenCode — verificar antes de assumir que existem.

## Integração no AppStore

Provider selection e upload FTP passam por `app/src/lib/stores/app-store.ts` e dispatcher (`app/src/ui/dispatcher/dispatcher.ts`) — procurar por `ftp`/`opencode`/`commitMessageProvider` ao mexer no fluxo.

## Referências

- Plano completo com decisões travadas e dependências: `.omo/plans/ftp-opencode-features.md`
- Notepads de sessões anteriores: `.omo/notepads/ftp-opencode-features`
