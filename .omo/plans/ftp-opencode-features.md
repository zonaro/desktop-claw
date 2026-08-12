# FTP Deployments + OpenCode Commit Messages

## Goal

1. **FTP nos repositorios**: cada repositorio pode ter uma ou mais configuracoes de FTP para subir os arquivos do repositorio. Suporte a ignore de pastas/arquivos via wildcards (sintaxe .gitignore). Acesso via **submenu no menu Repository** + **tela de configuracoes exclusiva** (dialog dedicado) + tab nas Repository Settings.
2. **OpenCode como alternativa ao Copilot** para gerar mensagens de commit: provider abstrato, selecao global nas Preferences com override por repositorio.

## Locked Decisions

- FTP library: `basic-ftp` (pure JS, FTP + FTPS explicito/implicito). Sem SFTP na v1. Somente a task B2 adiciona a dep em `app/package.json`.
- Senhas FTP: OS keychain via `TokenStore` (keytar), service "Desktop Claw - FTP Deployments". NUNCA em DB/localStorage/logs.
- Configs FTP: persistidas por repositorio no Dexie (`IDatabaseRepository.ftpDeployments`), schema bump para v10.
- Ignore patterns: sintaxe .gitignore via pacote `ignore` (ja e dependencia), por deployment.
- Upload: roda no **main process** (`app/src/main-process/ftp-uploader.ts`), com progresso via IPC e cancelamento via AbortSignal.
- Menu: `Repository > FTP Deployments > [Upload to <name>...]xN + separator + Configure FTP Deployments...`. Items dinamicos via `MenuLabelsEvent` estendido com `ftpDeployments: ReadonlyArray<{id, name}>`. Evento dinamico: template literal `ftp-upload:${string}` adicionado ao union `MenuEvent`.
- OpenCode: CLI executado no **main process** atras de IPC tipado duplex. Reusar `buildCommitMessageSystemPrompt`/`buildCommitMessageUserPrompt` (de copilot-store) e `parseCopilotCommitMessage`.
- Provider de commit message: abstracao `ICommitMessageGenerator` em `app/src/lib/commit-message-generator/`. Selecao: override do repositorio (`Repository.commitMessageProvider?: 'copilot' | 'openCode' | null`) > config global (localStorage `commit-message-provider`) > padrao Copilot.
- UI OpenCode: secao no tab Copilot das Preferences com radio `GitHub Copilot | OpenCode` + sub-form (command, model, timeout, botao Test).
- Code style: named exports, interfaces com prefixo I, union types em vez de enums novos, readonly props, curly braces sempre.

## TODOs

### Phase A - Foundation
- [x] A1: FTP deployment model + Dexie v10 migration + Repository field
- [x] A2: OpenCode config model + feature flag

### Phase B - FTP
- [x] B1: FTP secrets store (TokenStore wrappers) + model validation
- [x] B2: FTP upload engine no main process (basic-ftp, walk com ignore, progresso, cancel)
- [x] B3: IPC channels (ipc-shared) + handlers no main (test-connection, start/cancel, progress)
- [x] B4: Menu Repository > FTP Deployments (submenu dinamico) + MenuLabelsEvent + MenuEvent + menu-update
- [x] B5: Popup routing: PopupType.FtpDeployments + app.tsx (onMenuEvent cases + renderPopup)
- [x] B6: FTP dialogs UI (manage/list, edit form com ignore patterns, progress dialog)
- [x] B7: Repository Settings FTP tab
- [x] B8: FTP styles (SCSS) - done as part of B6
- [x] B9: FTP unit tests

### Phase C - OpenCode
- [x] C1: Commit message generator abstraction + Copilot adapter
- [x] C2: OpenCode main-process CLI runner + IPC channel
- [x] C3: OpenCode generator adapter (renderer side)
- [x] C4: AppStore refactor: provider selection (repo override > global > copilot default)
- [x] C5: Preferences UI: provider picker + OpenCode settings section
- [x] C6: OpenCode unit tests

### Final Verification Wave
- [x] F1: Goal/constraint verification (Oracle) - APPROVED
- [x] F2: Code quality review (Oracle) - APPROVED, blockers fixed
- [x] F3: Build + lint + unit tests green - 31/31 tests, 0 eslint errors
- [x] F4: Security review - PASS + IPC guards added

## Dependencies

- A1 blocks: B1, B4, B5
- A2 blocks: C2, C5
- B1 blocks: B2, B6
- B2 blocks: B3, B9
- B3 blocks: B6
- B4 blocks: B5
- B5 blocks: B6
- B6 blocks: B7, B8
- C1 blocks: C3, C4
- C2 blocks: C3
- C3 blocks: C4, C6
- C4 blocks: C5

## Verification

- `yarn lint:src` exit 0
- `yarn test` (unit) all pass
- `yarn compile:dev` exit 0
